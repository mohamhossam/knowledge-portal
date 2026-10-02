"""Shared test fixtures.

Every API test gets its own container, so no state leaks between tests and no
test depends on a process-wide singleton.
"""

from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app

# The application resolves settings during startup, which TestClient triggers.
# Default the suite to the fake provider so no test needs provider credentials.
os.environ.setdefault("LLM_PROVIDER", LLMProvider.FAKE.value)
os.environ.setdefault("PERSISTENCE_PROVIDER", "memory")

FAKE_PROVIDER_SETTINGS = Settings(llm_provider=LLMProvider.FAKE)


@pytest.fixture
def container() -> Container:
    """A fresh object graph backed by the deterministic fake models."""
    return build_container(FAKE_PROVIDER_SETTINGS)


@pytest.fixture
def client(container: Container) -> Generator[TestClient, None, None]:
    """A TestClient wired to an isolated container."""
    application = create_app(lambda: container)
    with TestClient(application) as c:
        yield c
