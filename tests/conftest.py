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
from tests.catalogue_seed import seed_knowledge

# The application resolves settings during startup, which TestClient triggers.
# Default the suite to the fake provider so no test needs provider credentials.
os.environ.setdefault("LLM_PROVIDER", LLMProvider.FAKE.value)
os.environ.setdefault("PERSISTENCE_PROVIDER", "memory")

# Offline scan mode, as a developer without ClamAV runs: uploads are scanned
# deterministically (the EICAR marker) instead of failing closed on a missing daemon.
FAKE_PROVIDER_SETTINGS = Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline")


@pytest.fixture
def container() -> Container:
    """A fresh object graph backed by the deterministic fake models, with the test
    catalogue in service (the service itself starts with none)."""
    return build_container(FAKE_PROVIDER_SETTINGS, in_service=seed_knowledge())


@pytest.fixture
def client(container: Container) -> Generator[TestClient, None, None]:
    """A TestClient wired to an isolated container."""
    application = create_app(lambda: container)
    with TestClient(application) as c:
        yield c
