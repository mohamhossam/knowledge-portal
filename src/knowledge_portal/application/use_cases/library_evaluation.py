"""Score the reference library's retrieval against a labelled golden set (RAG review, E1).

The golden set names a small corpus of library documents and, for each query, the passages a
knowledge admin would expect among the first answers. The corpus is seeded through the same
path the worker takes for a real upload (submit, read, review, approve, index), so the chunks
scored are the chunks the portal would serve. The queries then go through the same search
requirement-portal's evidence comes from.

What is scored, over the first `k` chunks of each answer (`k` is 10 by default, the most
`ReferenceKnowledge.retrieve` ever hands to requirement work):
- recall@k: of the passages each case expects, the share found, averaged over the cases;
- mean reciprocal rank: 1 over the rank of the first expected passage, 0 when none is found,
  averaged over the cases;
- the zero-hit share: the share of cases whose first `k` chunks hold no expected passage.

A case whose search fails (a provider that answers unusably, a query the search refuses) scores
as a miss and is counted as a failure, so one bad answer never stops the run.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from knowledge_portal.application.errors import (
    KnowledgeGenerationError,
    ModelTransportError,
    UnsupportedDocumentError,
)
from knowledge_portal.application.ports.reference_index import ReferenceChunk
from knowledge_portal.application.use_cases.document_library import (
    CHUNKING_POLICY,
    DocumentLibrary,
)
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.application.use_cases.reference_knowledge import ReferenceKnowledge
from knowledge_portal.domain.document.library import IngestionStage, ReviewedPassage
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile

EVALUATOR = ActorProfile(
    ActorId("library-golden-set-evaluation"),
    "Library evaluation",
    roles=frozenset({"knowledge_admin"}),
)
DEFAULT_K = 10


class LibraryEvaluationError(Exception):
    """The golden corpus could not be put in service."""


@dataclass(frozen=True)
class LibraryGoldenDocument:
    """One document of the golden corpus, uploaded as its file would be."""

    id: str
    title: str
    filename: str
    mime_type: str
    text: str
    # Published, then withdrawn: it must never be among the answers.
    withdrawn: bool = False


@dataclass(frozen=True)
class ExpectedHit:
    """A passage a case expects: the document's title, and either the passage's text (the
    chunk must contain it) or its block label (the chunk must carry it)."""

    document_title: str
    passage: str | None = None
    label: str | None = None

    def matches(self, chunk: ReferenceChunk) -> bool:
        if chunk.document_title != self.document_title:
            return False
        if self.label is not None and chunk.location != self.label:
            return False
        return self.passage is None or _folded(self.passage) in _folded(chunk.original_text)


@dataclass(frozen=True)
class LibraryGoldenCase:
    id: str
    text: str
    expected: tuple[ExpectedHit, ...]
    # Shares few or no words with its passages, so a lexical or hashed match is not enough.
    semantic: bool = False
    note: str | None = None


@dataclass(frozen=True)
class LibraryGoldenSet:
    version: int
    documents: tuple[LibraryGoldenDocument, ...]
    cases: tuple[LibraryGoldenCase, ...]

    @property
    def withdrawn_titles(self) -> frozenset[str]:
        return frozenset(item.title for item in self.documents if item.withdrawn)


@dataclass(frozen=True)
class RetrievedHit:
    """One chunk of an answer, in rank order."""

    rank: int
    document_title: str
    location: str
    text: str
    relevant: bool


@dataclass(frozen=True)
class LibraryCaseResult:
    case: LibraryGoldenCase
    hits: tuple[RetrievedHit, ...]
    # Which expected passages the first k chunks found, in the case's order.
    found: tuple[bool, ...]
    # Why the search gave no answer, when it failed.
    failure: str | None = None

    @property
    def recall(self) -> float:
        return sum(self.found) / len(self.found)

    @property
    def first_relevant_rank(self) -> int | None:
        return next((hit.rank for hit in self.hits if hit.relevant), None)

    @property
    def reciprocal_rank(self) -> float:
        rank = self.first_relevant_rank
        return 0.0 if rank is None else 1 / rank

    @property
    def zero_hit(self) -> bool:
        return self.first_relevant_rank is None


@dataclass(frozen=True)
class LibraryEvaluationReport:
    golden_set_version: int
    # The embedding model and the index identity the corpus was built with.
    model: str
    index_identity: str
    k: int
    documents: int
    chunks: int
    results: tuple[LibraryCaseResult, ...]

    @property
    def failures(self) -> int:
        return sum(1 for item in self.results if item.failure is not None)

    @property
    def recall_at_k(self) -> float:
        return sum(item.recall for item in self.results) / len(self.results)

    @property
    def mean_reciprocal_rank(self) -> float:
        return sum(item.reciprocal_rank for item in self.results) / len(self.results)

    @property
    def zero_hit_share(self) -> float:
        return sum(item.zero_hit for item in self.results) / len(self.results)

    @property
    def empty_answers(self) -> int:
        """Cases whose search returned nothing at all."""
        return sum(1 for item in self.results if not item.hits and item.failure is None)

    def hits_from(self, titles: frozenset[str]) -> int:
        """How many answered chunks came from these documents (withdrawn ones must give 0)."""
        return sum(1 for item in self.results for hit in item.hits if hit.document_title in titles)


def _folded(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


@dataclass(frozen=True)
class SeededCorpus:
    documents: int
    chunks: int


class SeedLibraryForEvaluation:
    """Put the golden corpus in service the way the worker does for a real upload.

    Each document is submitted, read, reviewed with every block included, approved and indexed;
    a document the set marks withdrawn is then withdrawn. The repositories are the caller's,
    expected to be in memory: an evaluation never touches the portal's database.
    """

    def __init__(self, library: DocumentLibrary, knowledge: ReferenceKnowledge) -> None:
        self._library = library
        self._knowledge = knowledge

    def execute(self, golden: LibraryGoldenSet, actor: ActorProfile = EVALUATOR) -> SeededCorpus:
        chunks = 0
        for item in golden.documents:
            chunks += self._publish(item, actor)
        return SeededCorpus(len(golden.documents), chunks)

    def _publish(self, item: LibraryGoldenDocument, actor: ActorProfile) -> int:
        document = self._library.submit(
            item.title,
            UploadDocumentInput(item.filename, item.mime_type, item.text.encode("utf-8")),
            f"library-golden-{item.id}",
            actor,
        )
        if not self._library.process_next():
            raise LibraryEvaluationError(f"Document {item.id!r} was not picked up for reading.")
        view = self._library.get(document.id, actor)
        source = view.versions[-1]
        if source.stage is not IngestionStage.READY:
            raise LibraryEvaluationError(
                f"Document {item.id!r} could not be read: {source.error or source.stage.value}."
            )
        reviewed = self._library.review(
            document.id,
            source.id,
            view.version,
            actor,
            tuple(ReviewedPassage(block.id, block.text or "", True) for block in source.blocks),
            "Golden set evaluation: every block kept as extracted.",
        )
        revision = reviewed.versions[-1].revisions[-1]
        self._library.approve(
            document.id,
            source.id,
            revision.id,
            revision.fingerprint(source.id, CHUNKING_POLICY),
            reviewed.version,
            actor,
        )
        if not self._knowledge.index_next():
            raise LibraryEvaluationError(f"Document {item.id!r} was not picked up for indexing.")
        current = self._library.get(document.id, actor)
        if current.published_id is None:
            raise LibraryEvaluationError(f"Document {item.id!r} did not reach service.")
        if item.withdrawn:
            self._library.withdraw(
                document.id, current.version, actor, "Golden set evaluation: withdrawn by design."
            )
        return current.publications[-1].chunk_count or 0


class EvaluateLibraryRetrieval:
    """Search every golden case and score the first k chunks of each answer."""

    def __init__(self, knowledge: ReferenceKnowledge, model: str) -> None:
        self._knowledge = knowledge
        self._model = model

    def execute(
        self,
        golden: LibraryGoldenSet,
        corpus: SeededCorpus,
        k: int = DEFAULT_K,
        progress: Callable[[LibraryCaseResult], None] = lambda _: None,
    ) -> LibraryEvaluationReport:
        results: list[LibraryCaseResult] = []
        for case in golden.cases:
            result = self._evaluate(case, k)
            progress(result)
            results.append(result)
        return LibraryEvaluationReport(
            golden.version,
            self._model,
            self._knowledge.identity,
            k,
            corpus.documents,
            corpus.chunks,
            tuple(results),
        )

    def _evaluate(self, case: LibraryGoldenCase, k: int) -> LibraryCaseResult:
        try:
            chunks = self._knowledge.search(case.text)[:k]
        except (KnowledgeGenerationError, ModelTransportError, UnsupportedDocumentError) as exc:
            return LibraryCaseResult(case, (), (False,) * len(case.expected), str(exc))
        hits = tuple(
            RetrievedHit(
                rank,
                chunk.document_title,
                chunk.location,
                chunk.original_text,
                any(expected.matches(chunk) for expected in case.expected),
            )
            for rank, chunk in enumerate(chunks, 1)
        )
        found = tuple(
            any(expected.matches(chunk) for chunk in chunks) for expected in case.expected
        )
        return LibraryCaseResult(case, hits, found)
