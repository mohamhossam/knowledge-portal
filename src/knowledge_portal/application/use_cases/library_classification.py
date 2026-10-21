"""What kind of document a library document is and what it is about (ADR-0123).

The choices come from the catalogue version in service: its document-type terms and its
business capability concepts, both in service and in English. A document keeps the ids it
was given; one the catalogue later drops still reads, and is offered no more.
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.domain.architecture.deprecation import in_service
from knowledge_portal.domain.architecture.vocabularies import VocabularyScheme
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.language import has_arabic
from knowledge_portal.domain.document.library import LibraryDocument
from knowledge_portal.domain.identity.entities import ActorProfile

MAX_TOPICS = 20


@dataclass(frozen=True)
class ClassificationOption:
    id: str
    label: str


@dataclass(frozen=True)
class ClassificationOptions:
    """The types and topics a library document may be given now."""

    document_types: tuple[ClassificationOption, ...]
    topics: tuple[ClassificationOption, ...]


class LibraryClassification:
    def __init__(
        self, library: DocumentLibrary, catalogue: ArchitectureKnowledgeRepositoryPort
    ) -> None:
        self._library = library
        self._catalogue = catalogue

    def options(self) -> ClassificationOptions:
        release = self._catalogue.active()
        types = [
            ClassificationOption(item.id, item.pref_label)
            for item in in_service(release.vocabulary)
            if item.scheme is VocabularyScheme.DOCUMENT_TYPE and not has_arabic(item.pref_label)
        ]
        topics = [
            ClassificationOption(item.id, item.pref_label)
            for item in in_service(release.business_capabilities)
            if not has_arabic(item.pref_label)
        ]
        return ClassificationOptions(
            tuple(sorted(types, key=lambda item: item.label.casefold())),
            tuple(sorted(topics, key=lambda item: item.label.casefold())),
        )

    def check(self, document_type: str | None, topics: tuple[str, ...]) -> None:
        """Refuses a type or topic the catalogue in service does not offer."""
        if len(topics) > MAX_TOPICS:
            raise InvalidDocumentError(f"A document has at most {MAX_TOPICS} topics.")
        options = self.options()
        if document_type is not None and document_type not in {
            item.id for item in options.document_types
        }:
            raise InvalidDocumentError(
                f"{document_type!r} is not a document type of the catalogue in service."
            )
        offered = {item.id for item in options.topics}
        unknown = [item for item in topics if item not in offered]
        if unknown:
            raise InvalidDocumentError(
                f"{unknown[0]!r} is not a concept of the catalogue in service."
            )

    def classify(
        self,
        document_id: str,
        document_type: str | None,
        topics: tuple[str, ...],
        expected: int,
        actor: ActorProfile,
    ) -> LibraryDocument:
        self.check(document_type, topics)
        return self._library.classify(document_id, document_type, topics, expected, actor)
