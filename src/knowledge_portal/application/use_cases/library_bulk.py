"""Retry the library's stopped work in one go (Knowledge Center C).

A knowledge admin retries every document whose reading failed, or every approval whose
indexing stopped, whoever owns it. The worker picks them up as it would after an owner's
own retry; the admin and the documents are recorded.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.document_library import (
    indexing_retried,
    indexing_stopped,
    reading_retried,
)
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.application.use_cases.library_admin import LibraryStewardship
from knowledge_portal.domain.document.library import IngestionStage, LibraryDocument
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError

PAGE = 200


class LibraryRetryScope(StrEnum):
    # Every document whose newest version's reading failed.
    READING = "reading"
    # Every document whose newest approval stopped indexing after repeated failures.
    INDEXING = "indexing"


@dataclass(frozen=True)
class LibraryRetryResult:
    scope: LibraryRetryScope
    documents: int


def reading_failed(document: LibraryDocument) -> bool:
    return document.versions[-1].stage is IngestionStage.FAILED


def _read_again(document: LibraryDocument) -> LibraryDocument:
    return reading_retried(document, document.versions[-1])


_SCOPES: dict[
    LibraryRetryScope,
    tuple[
        Callable[[LibraryDocument], bool],
        Callable[[LibraryDocument], LibraryDocument],
        LibraryAdminAction,
    ],
] = {
    LibraryRetryScope.READING: (reading_failed, _read_again, LibraryAdminAction.RETRY_READING),
    LibraryRetryScope.INDEXING: (
        indexing_stopped,
        indexing_retried,
        LibraryAdminAction.RETRY_INDEXING,
    ),
}


class BulkRetryLibrary:
    def __init__(
        self,
        documents: DocumentLibraryPort,
        stewardship: LibraryStewardship,
        transactions: TransactionManagerPort,
    ) -> None:
        self._documents, self._stewardship = documents, stewardship
        self._transactions = transactions

    def execute(self, scope: LibraryRetryScope, actor: ActorProfile) -> LibraryRetryResult:
        if KNOWLEDGE_ADMIN not in actor.roles:
            raise AuthorizationDeniedError("Only a knowledge admin can retry the whole library.")
        stopped, retried, action = _SCOPES[scope]
        with self._transactions.transaction():
            touched: list[str] = []
            offset = 0
            while page := self._documents.list_all(offset, PAGE):
                for document in page:
                    if stopped(document):
                        self._documents.save(retried(document), document.version)
                        touched.append(document.id)
                offset += PAGE
            if touched:
                self._stewardship.record(action, actor, None, tuple(touched))
        return LibraryRetryResult(scope, len(touched))
