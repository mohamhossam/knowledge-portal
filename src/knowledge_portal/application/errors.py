"""Application failures caused by orchestration or external boundaries.

Infrastructure failures raised by platform-kernel mechanisms are re-exported, not
redefined (ADR-0100), so a handler for one of these names catches exactly what
the kernel raises.
"""

from smb_kernel.errors import AuthenticationRequiredError as AuthenticationRequiredError
from smb_kernel.errors import DocumentExtractionBusyError as DocumentExtractionBusyError
from smb_kernel.errors import DocumentExtractionError as DocumentExtractionError
from smb_kernel.errors import DocumentExtractionTimeoutError as DocumentExtractionTimeoutError
from smb_kernel.errors import IdentityProviderUnavailableError as IdentityProviderUnavailableError
from smb_kernel.errors import KnowledgeGenerationError as KnowledgeGenerationError
from smb_kernel.errors import ModelTransportError as ModelTransportError
from smb_kernel.errors import PersistenceError as PersistenceError
from smb_kernel.errors import ServiceResponseError as ServiceResponseError
from smb_kernel.errors import ServiceUnavailableError as ServiceUnavailableError
from smb_kernel.errors import UnsupportedDocumentError as UnsupportedDocumentError


class ArchitectureJobNotFoundError(Exception):
    """A requested architecture job does not exist."""


class ProviderRateLimitExceededError(Exception):
    """An actor started more provider-calling operations than the rate limit allows."""

    def __init__(self, message: str, retry_after_seconds: int = 60) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class DocumentNotFoundError(Exception):
    """A requested source document or immutable version does not exist."""


class DocumentStorageError(Exception):
    """Document bytes could not be stored or retrieved safely."""


class DocumentVersionConflictError(Exception):
    """A document mutation used stale metadata."""


class DocumentContextTooLargeError(Exception):
    """Selected document context exceeds the configured window."""


class ActorNotFoundError(Exception):
    """An assignment target is not known to this workspace."""


class CitationNotCurrentError(Exception):
    """A cited library passage was withdrawn or replaced since it was cited."""
