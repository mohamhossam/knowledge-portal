"""The knowledge service's adapters onto requirement work's internal API (ADR-0099).

Their counterpart is `contracts/requirement-internal.openapi.json`, pinned from
requirement-portal. Each decodes the response into this application's own
values and fails as `ServiceUnavailableError` when it cannot: a malformed
answer never reaches the domain. The fakes are deterministic stand-ins for
running without requirement work.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from pydantic import TypeAdapter
from smb_kernel.errors import ServiceResponseError, ServiceUnavailableError
from smb_kernel.http.client import InternalHttpClient

from knowledge_portal.application.ports.architecture_mapping_stats import MappingCount
from knowledge_portal.application.ports.requirement_corpus import (
    CorpusFindingsPage,
    CorpusQuery,
    CorpusRequirementsPage,
    CorpusSummary,
    FindingQuery,
    NudgeReceipt,
    OpenFindingAges,
    RequirementFindingConflictError,
    RequirementFindingNotFoundError,
)
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependent,
    RequirementDependentsPage,
)
from knowledge_portal.application.ports.source_impact import DependencyImpactPage
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId

_CITATION = TypeAdapter(PublishedReference)
_COUNTS = TypeAdapter(tuple[MappingCount, ...])
_IMPACT = TypeAdapter(DependencyImpactPage)
_CORPUS = TypeAdapter(CorpusSummary)
_REQUIREMENTS = TypeAdapter(CorpusRequirementsPage)
_FINDINGS = TypeAdapter(CorpusFindingsPage)
_NUDGE = TypeAdapter(NudgeReceipt)


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


class HttpRequirementImpact:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def document_impact(
        self,
        actor_id: ActorId,
        document_id: str,
        *,
        active_only: bool,
        query: str,
        offset: int,
        limit: int,
    ) -> DependencyImpactPage:
        body = self._client.get_json(
            f"/internal/references/{_segment(document_id)}/impact",
            {
                "actor_id": actor_id.value,
                "active_only": "true" if active_only else "false",
                "query": query,
                "offset": offset,
                "limit": limit,
            },
        )
        return _decode(_IMPACT, body, "source impact")


class HttpArchitectureMappingStats:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def by_release(self) -> tuple[MappingCount, ...]:
        body = self._client.get_json("/internal/architecture-mapping/stats")
        return _decode(_COUNTS, body, "mapping counts")


class HttpRequirementCorpus:
    def __init__(self, client: InternalHttpClient) -> None:
        self._client = client

    def summary(self) -> CorpusSummary:
        body = self._client.get_json("/internal/knowledge/corpus/summary")
        return _decode(_CORPUS, body, "corpus summary")

    def requirements(self, query: CorpusQuery, offset: int, limit: int) -> CorpusRequirementsPage:
        params: dict[str, Any] = {
            "q": query.text,
            "open_findings_only": "true" if query.open_findings_only else "false",
            "offset": offset,
            "limit": limit,
        }
        if query.index_state is not None:
            params["index_state"] = query.index_state.value
        if query.owner_id is not None:
            params["owner_id"] = query.owner_id
        if query.not_screened_for_days is not None:
            params["not_screened_for_days"] = query.not_screened_for_days
        body = self._client.get_json("/internal/knowledge/corpus", params)
        return _decode(_REQUIREMENTS, body, "corpus rows")

    def findings(self, query: FindingQuery, offset: int, limit: int) -> CorpusFindingsPage:
        params: dict[str, Any] = {"offset": offset, "limit": limit}
        if query.kind is not None:
            params["kind"] = query.kind.value
        if query.age is not None:
            params["age"] = query.age.value
        if query.owner_id is not None:
            params["owner_id"] = query.owner_id
        body = self._client.get_json("/internal/knowledge/findings", params)
        return _decode(_FINDINGS, body, "findings")

    def nudge(self, finding_id: str, actor_id: str, actor_name: str) -> NudgeReceipt:
        try:
            body = self._client.post_json(
                f"/internal/knowledge/findings/{_segment(finding_id)}/nudge",
                {"actor_id": actor_id, "actor_name": actor_name},
            )
        except ServiceResponseError as exc:
            if exc.status_code == 404:
                raise RequirementFindingNotFoundError("This finding no longer exists.") from exc
            if exc.status_code == 409:
                raise RequirementFindingConflictError(_refusal(exc.detail)) from exc
            raise ServiceUnavailableError(
                f"Requirement work refused the nudge ({exc.status_code})."
            ) from exc
        return _decode(_NUDGE, body, "nudge receipt")


def _refusal(detail: str) -> str:
    """Requirement work's own reason for a refusal: its error body's message."""
    try:
        message = json.loads(detail).get("message")
    except (ValueError, AttributeError):
        message = None
    if isinstance(message, str) and message.strip():
        return message.strip()
    return "Requirement work refused the nudge."


class FakeRequirementCorpus:
    """No Requirements: offline, the corpus is empty and fully indexed."""

    def __init__(self, at: datetime | None = None) -> None:
        self._at = at

    def summary(self) -> CorpusSummary:
        return CorpusSummary(
            0, 0, 0, 0, 0, False, OpenFindingAges(0, 0, 0), self._at or datetime.now(UTC)
        )

    def requirements(self, query: CorpusQuery, offset: int, limit: int) -> CorpusRequirementsPage:
        return CorpusRequirementsPage((), None)

    def findings(self, query: FindingQuery, offset: int, limit: int) -> CorpusFindingsPage:
        return CorpusFindingsPage((), None)

    def nudge(self, finding_id: str, actor_id: str, actor_name: str) -> NudgeReceipt:
        raise RequirementFindingNotFoundError("This finding no longer exists.")


class FakeRequirementDependents:
    """No requirement cites anything: offline, the library has no dependents."""

    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        return RequirementDependentsPage((), None)


class FakeArchitectureMappingStats:
    """Nothing is mapped: offline, every release reads as unused."""

    def by_release(self) -> tuple[MappingCount, ...]:
        return ()


class FakeRequirementImpact:
    """No requirement cites anything: offline, no change needs review."""

    def document_impact(
        self,
        actor_id: ActorId,
        document_id: str,
        *,
        active_only: bool,
        query: str,
        offset: int,
        limit: int,
    ) -> DependencyImpactPage:
        return DependencyImpactPage((), None)
