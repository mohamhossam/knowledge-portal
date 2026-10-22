"""Score the reference library's retrieval against a labelled golden set (RAG review, E1).

The golden set names a corpus of library documents, of any product and any format a library
accepts, and for each query the passages a knowledge admin would expect among the first answers.
Nothing here assumes how a document is laid out: an expected passage is a piece of the
document's wording, found wherever the extractor put it (a line, a paragraph, a page, a slide, a
table row or a worksheet range), or no passage at all when any part of the document will do.

The corpus is put in service through the path the worker takes for a real upload (submit, read,
review, approve, index), so the chunks scored are the chunks the portal would serve. The review
keeps every block with text, and excludes what a reviewer would have to: a block with no text
(an image, a page's visual) and a block a blocking extraction warning names. Each expected
passage is then located in the reviewed text, ignoring case and spacing; a passage the reviewed
text does not hold stops the run, since the golden set no longer describes its corpus. A chunk
answers an expected passage when it comes from the same reviewed block and covers at least half
of the passage, or the passage covers at least half of the chunk: a passage the chunker split
counts as found by either half.

What is scored, over the first `k` chunks of each answer (`k` is 10 by default, the most
`ReferenceKnowledge.retrieve` ever hands to an app):
- recall@k: of the passages each case expects, the share found, averaged over the cases;
- mean reciprocal rank: 1 over the rank of the first expected passage, 0 when none is found,
  averaged over the cases;
- the zero-hit share: the share of cases whose first `k` chunks hold no expected passage.

The same scores are given per product, so a corpus that serves many products shows where
retrieval is weak. A case whose search fails (a provider that answers unusably, a query the
search refuses) scores as a miss and is counted as a failure, so one bad answer never stops
the run.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, replace

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
from knowledge_portal.domain.document.library import (
    IngestionStage,
    LibraryVersion,
    ReviewedPassage,
)
from knowledge_portal.domain.document.value_objects import ExtractionWarningSeverity
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile

EVALUATOR = ActorProfile(
    ActorId("library-golden-set-evaluation"),
    "Library evaluation",
    roles=frozenset({"knowledge_admin"}),
)
DEFAULT_K = 10
# The product a case is scored under when the golden set names none.
UNLABELLED = "No product named"


class LibraryEvaluationError(Exception):
    """The golden corpus could not be put in service, or no longer holds what a case expects."""


@dataclass(frozen=True)
class LibraryGoldenDocument:
    """One document of the golden corpus, uploaded as its file would be."""

    id: str
    title: str
    filename: str
    # Empty or generic types are read from the file name's extension, as an upload's are.
    mime_type: str
    content: bytes
    product: str | None = None
    # Published, then withdrawn: it must never be among the answers.
    withdrawn: bool = False


@dataclass(frozen=True)
class ExpectedHit:
    """A passage a case expects: the document's title and a piece of its wording, or no
    wording when any passage of the document answers the case."""

    document_title: str
    passage: str | None = None


@dataclass(frozen=True)
class LibraryGoldenCase:
    id: str
    text: str
    expected: tuple[ExpectedHit, ...]
    product: str | None = None
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
class SourceSpan:
    """Where an expected passage sits in a reviewed passage's text."""

    block_id: str
    start: int
    end: int

    def answered_by(self, chunk: ReferenceChunk) -> bool:
        if chunk.block_id != self.block_id:
            return False
        shared = min(self.end, chunk.end_offset) - max(self.start, chunk.start_offset)
        shorter = min(self.end - self.start, chunk.end_offset - chunk.start_offset)
        return shared > 0 and 2 * shared >= shorter


@dataclass(frozen=True)
class PublishedSource:
    """A golden document as it was put in service: its reviewed, included passages."""

    document_id: str
    title: str
    product: str | None
    # (block id, reviewed text) of every included passage.
    passages: tuple[tuple[str, str], ...]
    chunks: int
    # Blocks the review excluded: no text, or named by a blocking extraction warning.
    excluded_blocks: int
    withdrawn: bool = False

    def locate(self, passage: str) -> tuple[SourceSpan, ...]:
        """Every place the passage occurs, ignoring case and spacing."""
        pattern = re.compile(
            r"\s+".join(re.escape(word) for word in passage.split()), re.IGNORECASE
        )
        return tuple(
            SourceSpan(block_id, found.start(), found.end())
            for block_id, text in self.passages
            for found in pattern.finditer(text)
        )


@dataclass(frozen=True)
class SeededCorpus:
    sources: tuple[PublishedSource, ...]

    @property
    def documents(self) -> int:
        return len(self.sources)

    @property
    def chunks(self) -> int:
        return sum(item.chunks for item in self.sources)

    @property
    def excluded_blocks(self) -> int:
        return sum(item.excluded_blocks for item in self.sources)

    def source(self, title: str) -> PublishedSource | None:
        return next((item for item in self.sources if item.title == title), None)


@dataclass(frozen=True)
class ResolvedHit:
    """An expected hit, found in the corpus as it was put in service."""

    expected: ExpectedHit
    document_id: str
    # Empty when any passage of the document answers.
    spans: tuple[SourceSpan, ...]

    def matches(self, chunk: ReferenceChunk) -> bool:
        if chunk.document_id != self.document_id:
            return False
        return self.expected.passage is None or any(span.answered_by(chunk) for span in self.spans)


def resolve(golden: LibraryGoldenSet, corpus: SeededCorpus) -> dict[str, tuple[ResolvedHit, ...]]:
    """Each case's expected hits, located in the reviewed text; refuses any it cannot find."""
    resolved: dict[str, tuple[ResolvedHit, ...]] = {}
    problems: list[str] = []
    for case in golden.cases:
        hits: list[ResolvedHit] = []
        for expected in case.expected:
            source = corpus.source(expected.document_title)
            if source is None or source.withdrawn:
                problems.append(f"{case.id}: {expected.document_title!r} is not in service")
                continue
            spans = source.locate(expected.passage) if expected.passage is not None else ()
            if expected.passage is not None and not spans:
                problems.append(
                    f"{case.id}: {expected.document_title!r} as extracted does not hold "
                    f"{expected.passage!r}"
                )
                continue
            hits.append(ResolvedHit(expected, source.document_id, spans))
        resolved[case.id] = tuple(hits)
    if problems:
        raise LibraryEvaluationError(
            "The golden set no longer matches its corpus: " + "; ".join(problems) + "."
        )
    return resolved


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
    def product(self) -> str:
        return self.case.product or UNLABELLED

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
    excluded_blocks: int
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

    @property
    def products(self) -> tuple[str, ...]:
        return tuple(sorted({item.product for item in self.results}))

    def only(self, product: str) -> LibraryEvaluationReport:
        """The same report over one product's cases."""
        return replace(
            self, results=tuple(item for item in self.results if item.product == product)
        )

    def hits_from(self, titles: frozenset[str]) -> int:
        """How many answered chunks came from these documents (withdrawn ones must give 0)."""
        return sum(1 for item in self.results for hit in item.hits if hit.document_title in titles)


class SeedLibraryForEvaluation:
    """Put the golden corpus in service the way the worker does for a real upload.

    Each document is submitted, read, reviewed, approved and indexed; a document the set marks
    withdrawn is then withdrawn. The repositories are the caller's, expected to be in memory:
    an evaluation never touches the portal's database.
    """

    def __init__(self, library: DocumentLibrary, knowledge: ReferenceKnowledge) -> None:
        self._library = library
        self._knowledge = knowledge

    def execute(self, golden: LibraryGoldenSet, actor: ActorProfile = EVALUATOR) -> SeededCorpus:
        return SeededCorpus(tuple(self._publish(item, actor) for item in golden.documents))

    def _publish(self, item: LibraryGoldenDocument, actor: ActorProfile) -> PublishedSource:
        try:
            document = self._library.submit(
                item.title,
                UploadDocumentInput(item.filename, item.mime_type, item.content),
                f"library-golden-{item.id}",
                actor,
            )
        except UnsupportedDocumentError as exc:
            raise LibraryEvaluationError(f"Document {item.id!r} cannot be uploaded: {exc}") from exc
        if not self._library.process_next():
            raise LibraryEvaluationError(f"Document {item.id!r} was not picked up for reading.")
        view = self._library.get(document.id, actor)
        source = view.versions[-1]
        if source.stage is not IngestionStage.READY:
            raise LibraryEvaluationError(
                f"Document {item.id!r} could not be read: {source.error or source.stage.value}."
            )
        passages = _review(source)
        reviewed = self._library.review(
            document.id,
            source.id,
            view.version,
            actor,
            passages,
            "Golden set evaluation: every block with text kept as extracted.",
        )
        if blocking := reviewed.file_version(source.id).unresolved_blocking_warnings:
            raise LibraryEvaluationError(
                f"Document {item.id!r} has blocking extraction problems a reviewer must "
                f"settle: {'; '.join(blocking)}"
            )
        revision = reviewed.file_version(source.id).revisions[-1]
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
        return PublishedSource(
            document.id,
            item.title,
            item.product,
            tuple((p.block_id, p.text) for p in passages if p.included),
            current.publications[-1].chunk_count or 0,
            sum(1 for p in passages if not p.included),
            item.withdrawn,
        )


def _review(source: LibraryVersion) -> tuple[ReviewedPassage, ...]:
    """Keep every block with text; exclude what a reviewer must: blocks with no text and
    blocks a blocking warning names."""
    blocked = {
        warning.block_id
        for warning in source.warning_details
        if warning.severity is ExtractionWarningSeverity.BLOCKING and warning.block_id
    }
    passages: list[ReviewedPassage] = []
    for block in source.blocks:
        text = block.text or ""
        if not text.strip():
            passages.append(
                ReviewedPassage(block.id, block.label or "No text", False, "No extractable text.")
            )
        elif block.id in blocked:
            passages.append(
                ReviewedPassage(block.id, text, False, "Excluded for a blocking warning.")
            )
        else:
            passages.append(ReviewedPassage(block.id, text, True))
    return tuple(passages)


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
        expected = resolve(golden, corpus)
        results: list[LibraryCaseResult] = []
        for case in golden.cases:
            result = self._evaluate(case, expected[case.id], k)
            progress(result)
            results.append(result)
        return LibraryEvaluationReport(
            golden.version,
            self._model,
            self._knowledge.identity,
            k,
            corpus.documents,
            corpus.chunks,
            corpus.excluded_blocks,
            tuple(results),
        )

    def _evaluate(
        self, case: LibraryGoldenCase, expected: tuple[ResolvedHit, ...], k: int
    ) -> LibraryCaseResult:
        try:
            chunks = self._knowledge.search(case.text)[:k]
        except (KnowledgeGenerationError, ModelTransportError, UnsupportedDocumentError) as exc:
            return LibraryCaseResult(case, (), (False,) * len(expected), str(exc))
        hits = tuple(
            RetrievedHit(
                rank,
                chunk.document_title,
                chunk.location,
                chunk.original_text,
                any(item.matches(chunk) for item in expected),
            )
            for rank, chunk in enumerate(chunks, 1)
        )
        found = tuple(any(item.matches(chunk) for chunk in chunks) for item in expected)
        return LibraryCaseResult(case, hits, found)
