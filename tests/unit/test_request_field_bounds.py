"""Over-long request fields are refused as 422 before any use case runs.

`tests/architecture/test_request_bounds.py` proves every field declares a
maximum; these prove the maximum is enforced, and that a value at the maximum
still reaches the use case (here a 404, because the Requirement is absent).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from knowledge_portal.domain.architecture.knowledge import SystemDefinition
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import (
    MAX_PASSAGE_TEXT_CHARACTERS,
    ReviewedPassage,
    require_submittable_passages,
)
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    SystemDefinitionSchema,
)
from knowledge_portal.interfaces.api.schemas.bounds import (
    MAX_IDENTIFIER_CHARACTERS,
    MAX_NAME_CHARACTERS,
    MAX_TEXT_CHARACTERS,
)
from tests.conftest import FAKE_PROVIDER_SETTINGS

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
MISSING = "/architecture-knowledge/releases/no-such-release"


@pytest.fixture
def api() -> Iterator[TestClient]:
    container = build_container(FAKE_PROVIDER_SETTINGS)
    with TestClient(create_app(lambda: container)) as client:
        yield client


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param(
            "post",
            f"{MISSING}/activate",
            {"rationale": "r" * (MAX_TEXT_CHARACTERS + 1)},
            id="activation rationale",
        ),
        pytest.param(
            "post",
            "/knowledge/search",
            {"query": "q" * 2001},
            id="search query",
        ),
        pytest.param(
            "put",
            "/organisation/people/p-1",
            {"person": {"id": "p" * (MAX_IDENTIFIER_CHARACTERS + 1), "name": "Person"}},
            id="person identifier",
        ),
    ],
)
def test_an_over_long_field_is_refused_before_the_use_case(
    api: TestClient, method: str, path: str, body: dict[str, Any]
) -> None:
    response = api.request(method.upper(), path, json=body, headers=OWNER)

    assert response.status_code == 422


def test_a_field_at_its_maximum_reaches_the_use_case(api: TestClient) -> None:
    response = api.post(
        f"{MISSING}/activate",
        json={"rationale": "r" * MAX_TEXT_CHARACTERS},
        headers=OWNER,
    )

    assert response.status_code == 404


def test_reviewed_passages_are_bounded_at_submission_not_on_load() -> None:
    over = ReviewedPassage("block-1", "t" * (MAX_PASSAGE_TEXT_CHARACTERS + 1), True)
    # Constructing one, as loading a stored review does, is always allowed.
    assert over.text

    require_submittable_passages(
        (ReviewedPassage("block-1", "t" * MAX_PASSAGE_TEXT_CHARACTERS, True),)
    )
    with pytest.raises(InvalidDocumentError, match="limited"):
        require_submittable_passages((over,))


def test_a_stored_catalogue_over_a_request_limit_still_reads_back() -> None:
    long_name = "n" * (MAX_NAME_CHARACTERS + 1)
    stored = SystemDefinition(id="legacy", name=long_name, aliases=(), capabilities=())

    assert SystemDefinitionSchema.from_domain(stored).model_dump()["name"] == long_name
    with pytest.raises(ValidationError):
        SystemDefinitionSchema(id="legacy", name=long_name)
