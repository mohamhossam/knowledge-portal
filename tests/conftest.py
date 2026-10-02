"""Shared test fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture
def client() -> None:
    """The public API arrives in Stage 3.2; its route tests wait for it."""
    pytest.skip("The public API is wired in Stage 3.2.")
