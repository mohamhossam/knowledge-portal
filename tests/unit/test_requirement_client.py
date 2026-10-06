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
from knowledge_portal.application.ports.requirement_citations import (
    RequirementCitationCountsPort,
)
from knowledge_portal.application.ports.requirement_corpus import (
    CorpusQuery,
    CorpusState,
    FindingAge,
    FindingKind,
    FindingQuery,
    IndexState,
    OpenFindingAges,
    PersonName,
    ReindexScope,
    RequirementCorpusConflictError,
    RequirementCorpusPort,
    RequirementFindingConflictError,
    RequirementFindingNotFoundError,
    RequirementNotInCorpusError,
)
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependentsPort,
)
from knowledge_portal.application.ports.requirement_historic_citations import (
    RequirementHistoricCitationsPort,
)
from knowledge_portal.application.ports.source_impact import (
    ImpactDecisionKind,
    RequirementImpactPort,
)
from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementCitationCounts,
    FakeRequirementCorpus,
    FakeRequirementDependents,
    FakeRequirementHistoricCitations,
    FakeRequirementImpact,
    HttpArchitectureMappingStats,
    HttpRequirementCitationCounts,
    HttpRequirementCorpus,
    HttpRequirementDependents,
    HttpRequirementHistoricCitations,
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


def test_citation_counts_are_asked_for_each_document_and_decoded() -> None:
    seen: list[httpx.Request] = []
    body = {"counts": {"d1": 3, "d/2": 0}}
    counts = HttpRequirementCitationCounts(_client(_answering(body), seen)).counts(("d1", "d/2"))
    _assert_in_contract(seen[0])
    assert seen[0].url.params.get_list("document_id") == ["d1", "d/2"]
    assert counts == {"d1": 3, "d/2": 0}
    # Nothing to count asks nothing.
    assert HttpRequirementCitationCounts(_client(_answering(body), seen)).counts(()) == {}
    assert len(seen) == 1


@pytest.mark.parametrize(
    "body",
    [{"counts": {"d1": -1}}, {"counts": {"d1": "many"}}, {"counts": {}}, {"other": {}}, []],
)
def test_unusable_citation_counts_are_an_explicit_failure(body: Any) -> None:
    with pytest.raises(ServiceUnavailableError):
        HttpRequirementCitationCounts(_client(_answering(body))).counts(("d1",))


def test_historic_citation_counts_are_asked_for_each_record_and_decoded() -> None:
    seen: list[httpx.Request] = []
    body = {"counts": {"h1": 2, "h/2": 0}}
    adapter = HttpRequirementHistoricCitations(_client(_answering(body), seen))
    assert adapter.counts(("h1", "h/2")) == {"h1": 2, "h/2": 0}
    _assert_in_contract(seen[0])
    assert seen[0].url.params.get_list("historic_id") == ["h1", "h/2"]
    assert adapter.counts(()) == {}
    assert len(seen) == 1


HISTORIC_CITATION = {
    "requirement_id": "R-1",
    "title": "Fibre bundles",
    "owner": "Mona Adel",
    "checked_at": "2026-10-06T09:00:00Z",
    "current": True,
    "retired": False,
    "duplicate": False,
}


def test_where_a_historic_requirement_is_cited_is_read_a_page_at_a_time() -> None:
    seen: list[httpx.Request] = []
    body = {"items": [HISTORIC_CITATION], "next_offset": 20}
    page = HttpRequirementHistoricCitations(_client(_answering(body), seen)).citations("h/1", 0, 20)
    _assert_in_contract(seen[0])
    # An escaped slash keeps the id one path segment.
    assert seen[0].url.raw_path.startswith(b"/internal/knowledge/historic/h%2F1/citations")
    assert (seen[0].url.params["offset"], seen[0].url.params["limit"]) == ("0", "20")
    assert page.next_offset == 20
    assert (page.items[0].requirement_id, page.items[0].owner) == ("R-1", "Mona Adel")
    assert page.items[0].current


@pytest.mark.parametrize(
    "body",
    [
        {"counts": {"h1": -1}},
        {"counts": {}},
        {"items": [{**HISTORIC_CITATION, "current": "maybe"}], "next_offset": None},
        {"items": [], "next_offset": "later"},
    ],
)
def test_unusable_historic_citations_are_an_explicit_failure(body: Any) -> None:
    adapter = HttpRequirementHistoricCitations(_client(_answering(body)))
    with pytest.raises(ServiceUnavailableError):
        adapter.counts(("h1",)) if "counts" in body else adapter.citations("h1", 0, 20)


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


OWNER = {"id": "fake-owner", "display_name": "Amina Owner"}
ROW = {
    "requirement_id": "REQ-1",
    "title": "XGPON bundles",
    "duplicate": False,
    "owner": OWNER,
    "index_state": "failed",
    "last_screened_at": None,
    "open_findings": 2,
    "retired": None,
}
FINDING = {
    "finding_id": "kf-1",
    "kind": "possible_duplicate",
    "rationale": "Both order XGPON bundles through BCRM.",
    "raised_at": "2026-09-01T09:00:00+00:00",
    "age": "over_30_days",
    "subject": {"requirement_id": "REQ-2", "title": "XGPON for offices", "owner": None},
    "related": {"requirement_id": "REQ-1", "title": "XGPON bundles", "owner": OWNER},
    "last_nudge": {"at": "2026-10-01T09:00:00+00:00", "by": "Ravi Reviewer"},
    "next_nudge_at": "2026-10-08T09:00:00+00:00",
}
RECEIPT = {
    "finding_id": "kf-1",
    "nudged_at": "2026-10-06T09:00:00+00:00",
    "recipients": ["Amina Owner", "Ravi Reviewer"],
    "next_nudge_at": "2026-10-13T09:00:00+00:00",
}


def _response_schema(request: httpx.Request) -> dict[str, Any]:
    content = _operation(request)["responses"]["200"]["content"]["application/json"]
    ref = content["schema"]["$ref"].rsplit("/", 1)[-1]
    schema: dict[str, Any] = CONTRACT["components"]["schemas"][ref]
    return schema


def test_corpus_rows_are_read_with_their_filters_and_decoded() -> None:
    seen: list[httpx.Request] = []
    page = HttpRequirementCorpus(
        _client(_answering({"items": [ROW], "next_offset": 50}), seen)
    ).requirements(
        CorpusQuery(IndexState.FAILED, "fake-owner", "xgpon", True, 30), offset=0, limit=50
    )
    (request,) = seen
    _assert_in_contract(request)
    assert request.url.path == "/internal/knowledge/corpus"
    assert dict(request.url.params) == {
        "index_state": "failed",
        "owner_id": "fake-owner",
        "q": "xgpon",
        "open_findings_only": "true",
        "not_screened_for_days": "30",
        "offset": "0",
        "limit": "50",
    }
    assert set(ROW) == set(CONTRACT["components"]["schemas"]["CorpusRow"]["properties"]), (
        "the canned row drifted from the contract"
    )
    assert _response_schema(request)["title"] == "CorpusPage"
    (row,) = page.items
    assert (row.index_state, row.owner, page.next_offset) == (
        IndexState.FAILED,
        PersonName("fake-owner", "Amina Owner"),
        50,
    )


def test_unset_filters_are_left_out() -> None:
    seen: list[httpx.Request] = []
    corpus = HttpRequirementCorpus(_client(_answering({"items": [], "next_offset": None}), seen))
    corpus.requirements(CorpusQuery(), offset=0, limit=10)
    corpus.findings(FindingQuery(), offset=0, limit=10)
    for request in seen:
        _assert_in_contract(request)
    assert set(seen[0].url.params) == {"q", "open_findings_only", "offset", "limit"}
    assert set(seen[1].url.params) == {"offset", "limit"}


def test_findings_are_read_with_their_filters_and_decoded() -> None:
    seen: list[httpx.Request] = []
    page = HttpRequirementCorpus(
        _client(_answering({"items": [FINDING], "next_offset": None}), seen)
    ).findings(
        FindingQuery(FindingKind.POSSIBLE_DUPLICATE, FindingAge.OVER_30_DAYS, "fake-owner"),
        offset=50,
        limit=50,
    )
    (request,) = seen
    _assert_in_contract(request)
    assert dict(request.url.params) == {
        "kind": "possible_duplicate",
        "age": "over_30_days",
        "owner_id": "fake-owner",
        "offset": "50",
        "limit": "50",
    }
    assert set(FINDING) == set(CONTRACT["components"]["schemas"]["FindingRow"]["properties"])
    (finding,) = page.items
    assert finding.subject.owner is None
    assert finding.related.owner == PersonName("fake-owner", "Amina Owner")
    assert finding.last_nudge is not None and finding.last_nudge.by == "Ravi Reviewer"


def test_a_nudge_posts_the_admin_and_decodes_the_receipt() -> None:
    seen: list[httpx.Request] = []
    receipt = HttpRequirementCorpus(_client(_answering(RECEIPT), seen)).nudge(
        "kf/1", "fake-reviewer", "Ravi Reviewer"
    )
    (request,) = seen
    _assert_in_contract(request)
    assert request.method == "POST"
    assert request.url.raw_path == b"/internal/knowledge/findings/kf%2F1/nudge"
    body = json.loads(request.content)
    assert body == {"actor_id": "fake-reviewer", "actor_name": "Ravi Reviewer"}
    request_ref = _operation(request)["requestBody"]["content"]["application/json"]["schema"]
    schema = CONTRACT["components"]["schemas"][request_ref["$ref"].rsplit("/", 1)[-1]]
    assert set(body) == set(schema["required"])
    assert receipt.recipients == ("Amina Owner", "Ravi Reviewer")


def test_a_refused_nudge_keeps_requirement_work_s_reason() -> None:
    refusal = {
        "code": "knowledge_finding_conflict",
        "message": "Its owners were asked on 6 Oct 2026; it can be nudged again from 13 Oct 2026.",
        "correlation_id": "c-1",
    }
    corpus = HttpRequirementCorpus(_client(_answering(refusal, 409)))
    with pytest.raises(RequirementFindingConflictError, match="again from 13 Oct 2026"):
        corpus.nudge("kf-1", "a", "A")
    with pytest.raises(RequirementFindingNotFoundError):
        HttpRequirementCorpus(_client(_answering({}, 404))).nudge("kf-1", "a", "A")
    with pytest.raises(RequirementFindingConflictError, match="refused the nudge"):
        HttpRequirementCorpus(_client(_answering("not json", 409))).nudge("kf-1", "a", "A")
    with pytest.raises(ServiceUnavailableError):
        HttpRequirementCorpus(_client(_answering({}, 401))).nudge("kf-1", "a", "A")


MEMBERSHIP = {
    "requirement_id": "REQ-1",
    "state": "retired",
    "changed_at": "2026-10-07T09:00:00+00:00",
    "closed_findings": 2,
    "notified": "Ravi Reviewer",
}


def test_retirement_and_reinstatement_post_the_admin_and_reason() -> None:
    seen: list[httpx.Request] = []
    corpus = HttpRequirementCorpus(_client(_answering(MEMBERSHIP), seen))
    retired = corpus.retire("REQ/1", "fake-owner", "Amina Owner", "Cancelled.")
    corpus.reinstate("REQ-1", "fake-owner", "Amina Owner", "Back on.")
    for request in seen:
        _assert_in_contract(request)
        assert request.method == "POST"
    assert seen[0].url.raw_path == b"/internal/knowledge/requirements/REQ%2F1/retirement"
    assert seen[1].url.raw_path == b"/internal/knowledge/requirements/REQ-1/reinstatement"
    assert json.loads(seen[0].content) == {
        "actor_id": "fake-owner",
        "actor_name": "Amina Owner",
        "reason": "Cancelled.",
    }
    assert set(MEMBERSHIP) == set(
        CONTRACT["components"]["schemas"]["MembershipResult"]["properties"]
    )
    assert (retired.state, retired.closed_findings, retired.notified) == (
        CorpusState.RETIRED,
        2,
        "Ravi Reviewer",
    )


def test_reindex_posts_its_scope_and_choice() -> None:
    seen: list[httpx.Request] = []
    result = HttpRequirementCorpus(_client(_answering({"requirements": 3}), seen)).reindex(
        ReindexScope.REQUIREMENTS, ("REQ-1", "REQ-2"), "fake-owner", "Amina Owner"
    )
    (request,) = seen
    _assert_in_contract(request)
    assert request.url.path == "/internal/knowledge/reindex"
    assert json.loads(request.content) == {
        "actor_id": "fake-owner",
        "actor_name": "Amina Owner",
        "scope": "requirements",
        "requirement_ids": ["REQ-1", "REQ-2"],
    }
    assert result.requirements == 3


def test_retired_rows_are_asked_for_and_decoded() -> None:
    seen: list[httpx.Request] = []
    row = {**ROW, "retired": {"at": "2026-10-07T09:00:00+00:00", "by": "Omar", "reason": "Old."}}
    page = HttpRequirementCorpus(
        _client(_answering({"items": [row], "next_offset": None}), seen)
    ).requirements(CorpusQuery(retired_only=True), offset=0, limit=50)
    _assert_in_contract(seen[0])
    assert seen[0].url.params["retired_only"] == "true"
    (item,) = page.items
    assert item.retired is not None and item.retired.reason == "Old."


def test_an_unusable_reindex_count_is_an_explicit_failure() -> None:
    with pytest.raises(ServiceUnavailableError):
        HttpRequirementCorpus(_client(_answering({"requirements": "many"}))).reindex(
            ReindexScope.FAILED, (), "a", "A"
        )


def test_a_refused_corpus_action_keeps_requirement_work_s_reason() -> None:
    refusal = {"code": "corpus_membership_conflict", "message": "This Requirement is not retired."}
    with pytest.raises(RequirementCorpusConflictError, match="is not retired"):
        HttpRequirementCorpus(_client(_answering(refusal, 409))).reinstate("R", "a", "A", "x")
    with pytest.raises(RequirementNotInCorpusError):
        HttpRequirementCorpus(_client(_answering({}, 404))).retire("R", "a", "A", "x")
    with pytest.raises(ServiceUnavailableError):
        HttpRequirementCorpus(_client(_answering({}, 401))).reindex(
            ReindexScope.FAILED, (), "a", "A"
        )


@pytest.mark.parametrize(
    "call",
    [
        lambda c: HttpRequirementDependents(c).proposals(ActorId("a"), "d", 0, 10),
        lambda c: HttpArchitectureMappingStats(c).by_release(),
        lambda c: HttpRequirementCorpus(c).summary(),
        lambda c: HttpRequirementCorpus(c).requirements(CorpusQuery(), 0, 10),
        lambda c: HttpRequirementCorpus(c).findings(FindingQuery(), 0, 10),
        lambda c: HttpRequirementCorpus(c).nudge("kf-1", "a", "A"),
        lambda c: HttpRequirementCorpus(c).retire("R", "a", "A", "x"),
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
        {"items": [{**ROW, "index_state": "stale"}], "next_offset": None},
        {"items": [{**FINDING, "owner": OWNER, "subject": None}], "next_offset": None},
        {**RECEIPT, "nudged_at": "soon"},
        {**MEMBERSHIP, "state": "gone"},
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
    assert corpus.requirements(CorpusQuery(), 0, 10).items == ()
    assert corpus.findings(FindingQuery(), 0, 10).items == ()
    with pytest.raises(RequirementFindingNotFoundError):
        corpus.nudge("kf-1", "a", "A")
    with pytest.raises(RequirementNotInCorpusError):
        corpus.retire("R", "a", "A", "x")
    assert corpus.reindex(ReindexScope.FAILED, (), "a", "A").requirements == 0
    citations: RequirementCitationCountsPort = FakeRequirementCitationCounts()
    assert citations.counts(("d1", "d2")) == {"d1": 0, "d2": 0}
    historic: RequirementHistoricCitationsPort = FakeRequirementHistoricCitations()
    assert historic.counts(("h1",)) == {"h1": 0}
    assert historic.citations("h1", 0, 10).items == ()
