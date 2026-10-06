"""The exact published passage a requirement cites (requirement-portal ADR-0099).

Requirement work shows it read-only to any member of the citing requirement,
so only the live publication's included passages are ever returned: a working
extraction, an excluded passage or a withdrawn publication never is.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from knowledge_portal.application.errors import CitationNotCurrentError, DocumentNotFoundError
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.domain.document.library import LibraryDocument


@dataclass(frozen=True)
class CitedPassage:
    document_id: str
    title: str
    publication_id: str
    version_id: str
    version_number: int
    revision_id: str
    block_id: str
    section_path: tuple[str, ...]
    label: str
    text: str
    # When its document falls due for review again (Knowledge Center D); requirement work
    # shows "not reviewed since" once it has passed. Never a reason to withhold the passage.
    review_due_on: date | None = None


@dataclass(frozen=True)
class PassageCitation:
    document_id: str
    publication_id: str
    version_id: str
    revision_id: str
    block_id: str


class CitedPassages:
    def __init__(
        self, documents: DocumentLibraryPort, review_cycle: timedelta = timedelta(days=180)
    ) -> None:
        self._documents = documents
        self._review_cycle = review_cycle

    def read(self, citation: PassageCitation) -> CitedPassage:
        document = self._documents.get(citation.document_id)
        if document is None:
            raise DocumentNotFoundError("Library document was not found.")
        publication = next(
            (
                item
                for item in document.publications
                if item.id == citation.publication_id
                and item.id == document.published_id
                and item.withdrawn_at is None
            ),
            None,
        )
        version = next(
            (
                item
                for item in document.versions
                if publication is not None
                and item.id == citation.version_id == publication.version_id
            ),
            None,
        )
        revision = next(
            (
                item
                for item in (version.revisions if version else ())
                if publication is not None
                and item.id == citation.revision_id == publication.revision_id
            ),
            None,
        )
        passage = next(
            (
                item
                for item in (revision.passages if revision else ())
                if item.block_id == citation.block_id and item.included
            ),
            None,
        )
        block = next(
            (item for item in (version.blocks if version else ()) if item.id == citation.block_id),
            None,
        )
        if publication is None or version is None or revision is None or passage is None:
            raise CitationNotCurrentError(
                "This exact citation is no longer published. Search again for current evidence."
            )
        if block is None:  # pragma: no cover - a reviewed passage always names an extracted block
            raise CitationNotCurrentError("The cited passage cannot be resolved.")
        return CitedPassage(
            document.id,
            document.title,
            publication.id,
            version.id,
            version.number,
            revision.id,
            block.id,
            block.section_path,
            block.label,
            passage.text,
            self._due_on(document),
        )

    def _due_on(self, document: LibraryDocument) -> date | None:
        last = document.last_review()
        return None if last is None else (last[0] + self._review_cycle).date()
