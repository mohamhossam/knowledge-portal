"""Time rules shared by every aggregate."""

from __future__ import annotations

from datetime import datetime

from knowledge_portal.domain.shared.errors import InvalidGeneratedContentError


def require_aware(moment: datetime, field: str) -> datetime:
    """Reject naive datetimes, which compare and serialise ambiguously."""
    if moment.tzinfo is None or moment.tzinfo.utcoffset(moment) is None:
        raise InvalidGeneratedContentError(f"{field} must be timezone-aware.")
    return moment
