"""Stored records whose journeys' calls carry a timing, read as the domain now holds it.

A call's timing was free text until it became Sync or Async, so a release, a suggestion or
an incoming change request stored before then may say "sync", "Synchronous" or whatever a
document's table said. Those load as the timing they name, or as unsaid; never as a record
that can't be read.
"""

from __future__ import annotations

from knowledge_portal.domain.architecture.journeys import read_timing


def stored_timings(raw: object) -> object:
    """``raw`` with the timing of every call in it, at any depth, read again."""
    if isinstance(raw, list):
        for item in raw:
            stored_timings(item)
    elif isinstance(raw, dict):
        calls = raw.get("integrations")
        for call in calls if isinstance(calls, list) else ():
            if isinstance(call, dict) and isinstance(call.get("timing"), str):
                timing = read_timing(call["timing"])
                call["timing"] = timing.value if timing else None
        for value in raw.values():
            stored_timings(value)
    return raw
