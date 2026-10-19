"""The Golden set report: runs of the impact mapper over the golden set, kept and read back."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from knowledge_portal.application.errors import (
    GoldenRunBusyError,
    GoldenRunNotFoundError,
    GoldenSetUnavailableError,
    InvalidGoldenRunError,
)
from knowledge_portal.application.ports.architecture_jobs import ArchitectureJobStatus
from knowledge_portal.application.ports.golden_runs import (
    GoldenMapper,
    GoldenPrecedents,
    GoldenRunOptions,
    GoldenRunResult,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.mapping_evaluation import GoldenSplit
from knowledge_portal.infrastructure.architecture.golden_floors_file import (
    GoldenFloorsFileError,
    read_golden_floors,
)
from knowledge_portal.infrastructure.architecture.golden_set_file import read_golden_set
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.error_handlers import status_code_for
from knowledge_portal.interfaces.api.main import create_app

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "tests" / "fixtures" / "golden" / "impact_golden_set.json"
FLOORS = ROOT / "tests" / "fixtures" / "golden" / "impact_floors.json"
OBSERVER = {"X-Fake-Actor-Id": "fake-observer"}
ADMIN = Actor("fake-reviewer", frozenset({"knowledge_maintainer"}))


def _finish_queued_runs(container: Container) -> None:
    while container.golden_runs.run_once() is not None:
        pass


def _floors_file(floors: dict[str, dict[str, float]]) -> bytes:
    return json.dumps({"note": "test", "floors": floors}).encode()


def test_the_committed_floors_are_valid_and_keep_the_live_ones_empty() -> None:
    floors = read_golden_floors(FLOORS.read_bytes())

    assert floors["fake"]["system_recall"] > 0
    # Nothing is invented for a real model: its floors are set from real runs.
    assert floors["live"] == {}


@pytest.mark.parametrize(
    "floors",
    [
        {"imaginary": {"system_recall": 0.5}},
        {"fake": {"system_accuracy": 0.5}},
        {"fake": {"system_recall": 1.5}},
        {"fake": {"system_recall": -0.1}},
    ],
)
def test_floors_naming_nothing_real_or_out_of_range_are_refused(
    floors: dict[str, dict[str, float]],
) -> None:
    with pytest.raises(GoldenFloorsFileError):
        read_golden_floors(_floors_file(floors))


def test_a_fifth_of_the_golden_set_is_held_out_of_tuning() -> None:
    golden = read_golden_set(GOLDEN.read_bytes())
    held_out = [item for item in golden.cases if item.split is GoldenSplit.HELD_OUT]

    assert len(held_out) == 12
    # Every kind of verdict has a held-out case, so the untuned score is not one-sided.
    assert {item.verdict for item in held_out} == {item.verdict for item in golden.cases}


def test_a_run_keeps_its_scores_and_every_cases_answer(container: Container) -> None:

    started = container.golden_runs.start(GoldenRunOptions(repeats=2), ADMIN)
    assert started.status.value == "queued"

    _finish_queued_runs(container)
    run = container.golden_runs.read(started.run.id, ADMIN)

    assert run.status.value == "succeeded"
    assert run.run.result is not None
    first, second = run.run.result.repetitions
    assert len(first.cases) == first.scores.cases == 59
    assert first.held_out is not None
    assert first.held_out.cases == 12
    assert first.tuning.cases + first.held_out.cases == first.scores.cases
    # Fake models answer the same every time: the spread of a deterministic run is zero.
    assert first.scores == second.scores
    assert (first.scores.systems_found, first.scores.systems_expected) == (70, 212)


def test_the_fake_models_stay_above_the_committed_floors(container: Container) -> None:

    started = container.golden_runs.start(GoldenRunOptions(), ADMIN)
    _finish_queued_runs(container)
    result = container.golden_runs.read(started.run.id, ADMIN).run.result
    assert result is not None
    floors = read_golden_floors(FLOORS.read_bytes())["fake"]

    scores = result.repetitions[0].scores
    below = {
        name: (getattr(scores, name), floor)
        for name, floor in floors.items()
        if (getattr(scores, name) or 0.0) < floor
    }
    assert not below


def test_a_stored_result_survives_the_json_it_is_kept_as(container: Container) -> None:

    started = container.golden_runs.start(GoldenRunOptions(), ADMIN)
    _finish_queued_runs(container)
    result = container.golden_runs.read(started.run.id, ADMIN).run.result
    assert result is not None
    codec: TypeAdapter[GoldenRunResult] = TypeAdapter(GoldenRunResult)

    kept = json.loads(json.dumps(codec.dump_python(result, mode="json")))

    assert codec.validate_python(kept) == result


def test_only_one_run_waits_or_runs_at_a_time(container: Container) -> None:

    container.golden_runs.start(GoldenRunOptions(), ADMIN)

    with pytest.raises(GoldenRunBusyError):
        container.golden_runs.start(GoldenRunOptions(), ADMIN)

    _finish_queued_runs(container)
    container.golden_runs.start(GoldenRunOptions(), ADMIN)


def test_a_cancelled_run_does_not_block_the_next(container: Container) -> None:
    started = container.golden_runs.start(GoldenRunOptions(), ADMIN)
    assert started.job is not None
    container.golden_runs.cancel(started.job.id, ADMIN)

    assert container.golden_runs.read(started.run.id, ADMIN).status is (
        ArchitectureJobStatus.CANCELLED
    )
    container.golden_runs.start(GoldenRunOptions(), ADMIN)


def test_options_that_cannot_run_are_refused() -> None:
    with pytest.raises(InvalidGoldenRunError):
        GoldenRunOptions(repeats=0)
    with pytest.raises(InvalidGoldenRunError):
        GoldenRunOptions(repeats=6)
    with pytest.raises(InvalidGoldenRunError):
        GoldenRunOptions(GoldenMapper.MATCH, GoldenPrecedents.LEAVE_ONE_OUT)
    with pytest.raises(InvalidGoldenRunError):
        GoldenRunOptions.from_key("assess|loo")


def test_the_routes(client: TestClient, container: Container) -> None:
    info = client.get("/evaluation/golden-set").json()
    assert (info["cases"], info["held_out_cases"], info["provider"]) == (59, 12, "fake")
    assert info["floors"]["live"] == {}

    started = client.post("/evaluation/golden-runs", json={"repeats": 2})
    assert started.status_code == 202
    run_id = started.json()["id"]
    assert started.json()["status"] == "queued"
    assert started.json()["result"] is None
    assert client.post("/evaluation/golden-runs", json={}).status_code == 409

    _finish_queued_runs(container)
    detail = client.get(f"/evaluation/golden-runs/{run_id}").json()
    assert detail["status"] == "succeeded"
    assert (detail["mapper"], detail["precedents"], detail["repeats"]) == ("assess", "none", 2)
    assert len(detail["result"]["repetitions"]) == 2
    assert len(detail["result"]["repetitions"][0]["cases"]) == 59

    listed = client.get("/evaluation/golden-runs").json()["runs"]
    assert [item["id"] for item in listed] == [run_id]
    # The list carries scores, not every case's answer.
    assert "cases" not in listed[0]["result"]["repetitions"][0]
    assert listed[0]["result"]["repetitions"][0]["scores"]["cases"] == 59


def test_the_routes_refuse_what_cannot_run(client: TestClient) -> None:
    assert client.post("/evaluation/golden-runs", json={"repeats": 0}).status_code == 422
    assert client.post("/evaluation/golden-runs", json={"mapper": "nope"}).status_code == 422
    missing = client.get("/evaluation/golden-runs/nope")
    assert (missing.status_code, missing.json()["code"]) == (404, "golden_run_not_found")
    assert client.get("/evaluation/golden-runs", headers=OBSERVER).status_code == 403


def test_a_deployment_without_the_golden_set_says_so_and_queues_nothing(tmp_path: Path) -> None:
    container = build_container(Settings(llm_provider=LLMProvider.FAKE, evaluation_root=tmp_path))
    try:
        with TestClient(create_app(lambda: container)) as client:
            info = client.get("/evaluation/golden-set")
            started = client.post("/evaluation/golden-runs", json={})

            assert (info.status_code, info.json()["code"]) == (503, "golden_set_unavailable")
            assert started.status_code == 503
            assert client.get("/evaluation/golden-runs").json() == {"runs": []}
    finally:
        container.close_resources()


def test_each_golden_error_has_its_status() -> None:
    assert status_code_for(GoldenRunNotFoundError("x")) == 404
    assert status_code_for(GoldenRunBusyError("x")) == 409
    assert status_code_for(InvalidGoldenRunError("x")) == 422
    assert status_code_for(GoldenSetUnavailableError("x")) == 503
