"""What the seed scripts share. Development only, against a fake-identity API.

The fake personas, the full catalogue's file and name, waiting for the service to
reach a state, and the one refusal a seed meets in normal use: the service holds one
draft catalogue version at a time, so a second seed stops with whose draft it is.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
REVIEWER = {"X-Fake-Actor-Id": "fake-reviewer"}

FULL_CATALOGUE_FILE = ROOT / "catalogues" / "smb-architecture.yaml"
FULL_CATALOGUE_NAME = "Business Pro Plus (SDD v2.3)"
# The service starts with no catalogue, so the sample work first publishes the small reference
# catalogue the tests use, as a maintainer would.
INITIAL_CATALOGUE_FILE = ROOT / "tests" / "fixtures" / "smb_architecture.yaml"
INITIAL_CATALOGUE_NAME = "Initial catalogue"

POLL_SECONDS = 0.1
WAIT_SECONDS = 120.0


def wait_for(
    client: httpx.Client,
    path: str,
    headers: dict[str, str],
    ready: Callable[[Any], object],
    *,
    timeout: float = WAIT_SECONDS,
) -> dict[str, Any]:
    """Read `path` until `ready` holds for it.

    A failed read stops at once; a state that never comes stops after `timeout` seconds.
    """
    deadline = time.monotonic() + timeout
    while True:
        response = client.get(path, headers=headers)
        response.raise_for_status()
        view = response.json()
        if ready(view):
            return dict(view)
        if time.monotonic() >= deadline:
            raise TimeoutError(f"{path} did not reach the expected state within {timeout:.0f} s.")
        time.sleep(POLL_SECONDS)


@contextmanager
def one_draft_at_a_time() -> Iterator[None]:
    """Turn the service's "a draft is already in progress" refusal (409) into a plain message."""
    try:
        yield
    except httpx.HTTPStatusError as error:
        if error.response.status_code != 409:
            raise
        raise SystemExit(f"Nothing more seeded: {error.response.json()['message']}") from None
