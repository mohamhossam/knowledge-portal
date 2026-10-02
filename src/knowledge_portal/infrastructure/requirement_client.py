"""The knowledge service's adapters onto requirement work's internal API (ADR-0099).

Their counterpart is `contracts/requirement-internal.openapi.json`, pinned from
requirement-portal. Each decodes the response into this application's own
values and fails as `ServiceUnavailableError` when it cannot: a malformed
answer never reaches the domain. The fakes are deterministic stand-ins for
running without requirement work.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from pydantic import TypeAdapter
from smb_kernel.errors import ServiceResponseError, ServiceUnavailableError
from smb_kernel.http.client import InternalHttpClient

from knowledge_portal.application.ports.architecture_mapping_stats import MappingCount
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependent,
    RequirementDependentsPage,
)
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile

_CITATION = TypeAdapter(PublishedReference)
_COUNTS = TypeAdapter(tuple[MappingCount, ...])


def _decode[T](adapter: TypeAdapter[T], body: Any, what: str) -> T:
    """Whatever a constructor raises becomes one explicit adapter failure (AGENTS.md 4.3)."""
    try:
        return adapter.validate_python(body)
    except Exception as exc:
        raise ServiceUnavailableError(f"Requirement work returned unusable {what}.") from exc


def _segment(value: str) -> str:
    return quote(value, safe="")


class HttpRequirementDependents:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        body = self._client.get_json(
            f"/internal/references/{_segment(document_id)}/dependents",
            {
                "actor_id": actor_id.value,
                "target_kind": "proposal",
                "offset": offset,
                "limit": limit,
            },
        )
        try:
            items = tuple(_dependent(item) for item in body["items"])
            next_offset = body["next_offset"]
            if next_offset is not None and (
                not isinstance(next_offset, int) or isinstance(next_offset, bool)
            ):
                raise TypeError("expected a whole number or nothing")
        except ServiceUnavailableError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise ServiceUnavailableError("Requirement work returned unusable dependents.") from exc
        return RequirementDependentsPage(items, next_offset)


def _dependent(item: Any) -> RequirementDependent:
    return RequirementDependent(
        _text(item["requirement_id"]),
        _text(item["requirement_title"]),
        _optional_text(item.get("analysis_id")),
        _optional_whole(item.get("round_number")),
        _flag(item.get("current", True)),
        _text(item["target_id"]),
        _text(item["statement"]),
        ProposalStatus(item["status"]),
        _decode(_CITATION, item["lineage"]["citation"], "dependents"),
    )


def _text(value: object) -> str:
    if not isinstance(value, str):
        raise TypeError("expected text")
    return value


def _optional_text(value: object) -> str | None:
    return None if value is None else _text(value)


def _optional_whole(value: object) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError("expected a whole number")
    return value


def _flag(value: object) -> bool:
    if not isinstance(value, bool):
        raise TypeError("expected true or false")
    return value


class HttpActorLookup:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def get(self, actor_id: ActorId) -> ActorProfile | None:
        try:
            body = self._client.get_json(f"/internal/actors/{_segment(actor_id.value)}")
        except ServiceResponseError as refused:
            if refused.status_code == 404:
                return None
            raise
        try:
            roles = body["roles"]
            if not isinstance(roles, list):
                raise TypeError("expected a list of roles")
            return ActorProfile(
                ActorId(_text(body["id"])),
                _text(body["display_name"]),
                _optional_text(body["email"]),
                frozenset(_text(role) for role in roles),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ServiceUnavailableError("Requirement work returned an unusable actor.") from exc


class HttpArchitectureMappingStats:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def by_release(self) -> tuple[MappingCount, ...]:
        body = self._client.get_json("/internal/architecture-mapping/stats")
        return _decode(_COUNTS, body, "mapping counts")


class FakeRequirementDependents:
    """No requirement cites anything: offline, the library has no dependents."""

    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        return RequirementDependentsPage((), None)


class FakeActorLookup:
    """Knows a fixed set of actors, so ownership handover works offline."""

    def __init__(self, actors: tuple[ActorProfile, ...] = ()) -> None:
        self._actors = {actor.id: actor for actor in actors}

    def get(self, actor_id: ActorId) -> ActorProfile | None:
        return self._actors.get(actor_id)


class FakeArchitectureMappingStats:
    """Nothing is mapped: offline, every release reads as unused."""

    def by_release(self) -> tuple[MappingCount, ...]:
        return ()
