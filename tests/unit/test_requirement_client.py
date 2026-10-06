"""The knowledge service's adapters onto requirement work's internal API (ADR-0099).

Requirement work is another service, so these run against canned answers shaped
by the pinned contract, `contracts/requirement-internal.openapi.json`, and every
request an adapter makes is checked against that contract too.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from smb_kernel.errors import ServiceUnavailableError
from smb_kernel.http.client import InternalHttpClient

from knowledge_portal.application.ports.architecture_mapping_stats import (
    ArchitectureMappingStatsPort,
    MappingCount,
)
from knowledge_portal.application.ports.requirement_corpus import (
    OpenFindingAges,
    RequirementCorpusPort,
)
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependentsPort,
)
from knowledge_portal.application.ports.source_impact import (
    ImpactDecisionKind,
    RequirementImpactPort,
)
from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementCorpus,
    FakeRequirementDependents,
    FakeRequirementImpact,
    HttpArchitectureMappingStats,
    HttpRequirementCorpus,
    HttpRequirementDependents,
    HttpRequirementImpact,
)

CONTRACT = json.loads(
    (Path(__file__).parents[2] / "contracts" / "requirement-internal.openapi.json").read_text(
        encoding="utf-8"
    )
)
TOKEN = "k" * 40
HASH = "a" * 64
CITATION = {
    "document_id": "doc-1",
    "title": "Eligibility policy",
    "version_id": "ver-1",
    "version_number": 1,
    "revision_id": "rev-1",
    "publication_id": "pub-1",
    "approval_fingerprint": HASH,
    "block_id": "block-1",
    "location": "Line 1",
    "excerpt": "XGPON coverage",
    "start_offset": 0,
    "end_offset": 14,
    "lineage_hash": HASH,
}
DEPENDENT = {
    "id": "dep-1",
    "requirement_id": "req-1",
    "requirement_title": "Fibre bundles",
    "analysis_id": "an-1",
    "round_number": 2,
    "current": True,
    "target_kind": "proposal",
    "target_id": "prop-1",
    "statement": "Bundles require XGPON coverage.",
    "content_fingerprint": HASH,
    "lineage": {"citation": CITATION, "via": []},
    "active": True,
    "status": "accepted",
}

Handler = Callable[[httpx.Request], httpx.Response]


def _client(handler: Handler, seen: list[httpx.Request] | None = None) -> InternalHttpClient:
    def record(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return handler(request)

    return InternalHttpClient(
        "http://requirements",
        TOKEN,
        service="requirements",
        http=httpx.Client(transport=httpx.MockTransport(record)),
        retries=0,
    )


def _answering(body: Any, status: int = 200) -> Handler:
    return lambda _request: httpx.Response(status, json=body)


def _operation(request: httpx.Request) -> dict[str, Any]:
    """The contract operation a request addresses, or a failure naming the request."""
    # The raw path: an escaped slash inside an id must stay one path segment.
    path = request.url.raw_path.split(b"?")[0].decode()
    for template, item in CONTRACT["paths"].items():
        pattern = "^" + re.sub(r"\{[^}]+\}", "[^/]+", template) + "$"
        if re.match(pattern, path) and request.method.lower() in item:
            operation: dict[str, Any] = item[request.method.lower()]
            return operation
    raise AssertionError(f"{request.method} {path} is not in the contract.")


def _assert_in_contract(request: httpx.Request) -> None:
    operation = _operation(request)
    query = {p["name"] for p in operation.get("parameters", ()) if p["in"] == "query"}
    required = {
        p["name"] for p in operation.get("parameters", ()) if p["in"] == "query" and p["required"]
    }
    sent = set(request.url.params.keys())
    assert sent <= query, f"undocumented parameters {sent - query}"
    assert required <= sent, f"missing required parameters {required - sent}"
    assert request.headers["authorization"] == f"Bearer {TOKEN}"


def test_dependents_are_read_for_proposals_and_decoded() -> None:
    seen: list[httpx.Request] = []
    body = {"items": [DEPENDENT], "next_offset": 50}
    page = HttpRequirementDependents(_client(_answering(body), seen)).proposals(
        ActorId("fake-owner"), "doc/1", 0, 50
    )
    (request,) = seen
    _assert_in_contract(request)
    assert request.url.raw_path.startswith(b"/internal/references/doc%2F1/dependents")
    assert request.url.params["target_kind"] == "proposal"
    assert request.url.params["actor_id"] == "fake-owner"
    assert page.next_offset == 50
    (item,) = page.items
    assert (item.requirement_id, item.proposal_id, item.round_number) == ("req-1", "prop-1", 2)
    assert item.status is ProposalStatus.ACCEPTED
    assert item.citation.publication_id == "pub-1"


DECISION = {
    "dependency_id": "dep-1",
    "publication_state": "published",
    "decision": "retain_historical",
    "reason": "Still applies as written.",
    "actor": {"id": {"value": "fake-reviewer"}, "display_name": "Ravi", "email": None},
    "recorded_at": "2026-10-02T09:00:00+00:00",
    "version": 1,
}
IMPACT = {
    "dependency": DEPENDENT,
    "publication_current": False,
    "publication_state": "withdrawn",
    "needs_review": True,
    "decisions": [DECISION],
}


def test_a_document_s_impact_is_read_with_its_filters_and_decoded() -> None:
    seen: list[httpx.Request] = []
    body = {"items": [IMPACT], "next_offset": 20}
    page = HttpRequirementImpact(_client(_answering(body), seen)).document_impact(
        ActorId("fake-owner"), "doc/1", active_only=True, query="XGPON", offset=0, limit=20
    )
    (request,) = seen
    _assert_in_contract(request)
    assert request.url.raw_path.startswith(b"/internal/references/doc%2F1/impact")
    assert dict(request.url.params) == {
        "actor_id": "fake-owner",
        "active_only": "true",
        "query": "XGPON",
        "offset": "0",
        "limit": "20",
    }
    (item,) = page.items
    assert (item.needs_review, item.publication_state, page.next_offset) == (
        True,
        "withdrawn",
        20,
    )
    assert item.dependency.lineage.citation.publication_id == "pub-1"
    assert item.decisions[0].decision is ImpactDecisionKind.RETAIN
    assert item.decisions[0].actor.id == ActorId("fake-reviewer")


def test_mapping_counts_are_decoded() -> None:
    seen: list[httpx.Request] = []
    body = [{"release_id": "r1", "requirements": 2, "features": 3, "stories": 4}]
    counts = HttpArchitectureMappingStats(_client(_answering(body), seen)).by_release()
    _assert_in_contract(seen[0])
    assert counts == (MappingCount("r1", 2, 3, 4),)


CORPUS = {
    "requirements": 12,
    "duplicates": 1,
    "current": 9,
    "waiting": 2,
    "failed": 1,
    "rebuild_required": False,
    "open_findings": {"under_7_days": 3, "from_7_to_30_days": 1, "over_30_days": 2},
    "as_of": "2026-10-06T09:00:00+00:00",
}


def test_the_corpus_summary_is_read_in_counts_and_decoded() -> None:
    seen: list[httpx.Request] = []
    summary = HttpRequirementCorpus(_client(_answering(CORPUS), seen)).summary()
    (request,) = seen
    _assert_in_contract(request)
    assert request.url.raw_path == b"/internal/knowledge/corpus/summary"
    assert (summary.requirements, summary.current, summary.waiting, summary.failed) == (
        12,
        9,
        2,
        1,
    )
    assert summary.open_findings == OpenFindingAges(3, 1, 2)
    assert summary.as_of.isoformat() == "2026-10-06T09:00:00+00:00"


@pytest.mark.parametrize(
    "call",
    [
        lambda c: HttpRequirementDependents(c).proposals(ActorId("a"), "d", 0, 10),
        lambda c: HttpArchitectureMappingStats(c).by_release(),
        lambda c: HttpRequirementCorpus(c).summary(),
        lambda c: HttpRequirementImpact(c).document_impact(
            ActorId("a"), "d", active_only=False, query="", offset=0, limit=10
        ),
    ],
)
@pytest.mark.parametrize(
    "body",
    [
        {"unexpected": True},
        [{"release_id": "r1"}],
        {"items": [{**DEPENDENT, "status": "unknown"}], "next_offset": None},
        {"items": [{**DEPENDENT, "lineage": {"citation": {**CITATION, "excerpt": " "}}}]},
        {"items": [], "next_offset": "later"},
        {"items": [{**IMPACT, "decisions": [{**DECISION, "decision": "ignore"}]}]},
        {"items": [{**IMPACT, "publication_current": "maybe"}], "next_offset": None},
        {**CORPUS, "open_findings": {"under_7_days": 1}},
        {**CORPUS, "waiting": "several"},
    ],
)
def test_an_unusable_answer_is_an_explicit_failure(call: Any, body: Any) -> None:
    with pytest.raises(ServiceUnavailableError):
        call(_client(_answering(body)))


def test_the_fakes_stand_in_for_each_port_deterministically() -> None:
    dependents: RequirementDependentsPort = FakeRequirementDependents()
    stats: ArchitectureMappingStatsPort = FakeArchitectureMappingStats()
    page = dependents.proposals(ActorId("a"), "d", 0, 10)
    assert (page.items, page.next_offset) == ((), None)
    assert stats.by_release() == ()
    impact: RequirementImpactPort = FakeRequirementImpact()
    empty = impact.document_impact(
        ActorId("a"), "d", active_only=False, query="", offset=0, limit=5
    )
    assert (empty.items, empty.next_offset) == ((), None)
    corpus: RequirementCorpusPort = FakeRequirementCorpus()
    summary = corpus.summary()
    assert (summary.requirements, summary.waiting, summary.failed) == (0, 0, 0)
    assert summary.open_findings == OpenFindingAges(0, 0, 0)
