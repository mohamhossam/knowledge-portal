"""Offline stored golden set runs."""

from copy import deepcopy
from dataclasses import replace
from threading import RLock
from typing import Any

from knowledge_portal.application.errors import GoldenRunNotFoundError
from knowledge_portal.application.ports.golden_runs import GoldenRun, GoldenRunResult


class InMemoryGoldenRuns:
    def __init__(self) -> None:
        self._lock = RLock()
        self._runs: dict[str, GoldenRun] = {}

    def snapshot_state(self) -> Any:
        return deepcopy((self._runs,))

    def restore_state(self, state: Any) -> None:
        (self._runs,) = deepcopy(state)

    def add(self, run: GoldenRun) -> None:
        with self._lock:
            self._runs[run.id] = run

    def get(self, run_id: str) -> GoldenRun | None:
        with self._lock:
            return self._runs.get(run_id)

    def save_result(self, run_id: str, result: GoldenRunResult) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise GoldenRunNotFoundError("Golden set run not found.")
            self._runs[run_id] = replace(run, result=result)

    def newest(self, limit: int) -> tuple[GoldenRun, ...]:
        with self._lock:
            ordered = sorted(self._runs.values(), key=lambda run: run.requested_at, reverse=True)
        return tuple(ordered[:limit])

    def unfinished(self) -> tuple[GoldenRun, ...]:
        with self._lock:
            return tuple(run for run in self._runs.values() if run.result is None)
