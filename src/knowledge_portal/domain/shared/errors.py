"""Errors for shared domain concepts."""


class InvalidGeneratedContentError(Exception):
    """Raised when data shared by every generated aggregate is invalid.

    Covers timestamps, which are constructed from the
    clock and the adapter rather than from client input. Reaching this is a
    programming error, not something a caller can provoke.
    """
