"""Routes name their use cases, and every refusal answers in one shape (recommendation 12).

No route handler takes the container: each takes the providers in `dependencies.py` for
what it uses, so a handler cannot reach an adapter the container happens to hold. And the
refusals the auth layer used to answer as ``{"detail": ...}`` (the internal API when it is
not served, the kernel guard's missing token, FastAPI's unknown path or method) answer
``{code, message, correlation_id}`` like every other error, so a refused internal call can be
traced to its log line.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.types import Message

from knowledge_portal.application.errors import AuthenticationRequiredError
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.dependencies import get_container, require_service_caller
from knowledge_portal.interfaces.api.error_envelope import enveloped
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

ROUTES = Path(__file__).resolve().parents[2] / "src" / "knowledge_portal" / "interfaces" / "api"
TOKEN = "r" * 40


def _client(**settings: Any) -> Iterator[TestClient]:
    container = build_container(replace(FAKE_PROVIDER_SETTINGS, **settings))
    with TestClient(create_app(lambda: container)) as client:
        yield client


@pytest.fixture
def served() -> Iterator[TestClient]:
    yield from _client(requirement_service_token=TOKEN)


@pytest.fixture
def unserved() -> Iterator[TestClient]:
    yield from _client()


def _is_envelope(response: Any) -> None:
    body = response.json()
    assert set(body) == {"code", "message", "correlation_id"}, body
    # The id the caller can quote is the one the trace and the log carry.
    assert body["correlation_id"] == response.headers["X-Request-ID"]


# The route surface -----------------------------------------------------------------------------


def test_no_route_module_reaches_for_the_container() -> None:
    for module in sorted((ROUTES / "routes").glob("*.py")):
        source = module.read_text(encoding="utf-8")
        assert "ContainerDep" not in source, module.name
        assert "container." not in source, module.name


def test_no_handler_takes_the_container(served: TestClient) -> None:
    app = served.app
    routes = [route for route in app.routes if isinstance(route, APIRoute)]  # type: ignore[attr-defined]

    assert routes
    for route in routes:
        direct = [item.call for item in route.dependant.dependencies]
        assert get_container not in direct, route.path


# One error shape -------------------------------------------------------------------------------


def test_a_refused_internal_call_can_be_traced(served: TestClient) -> None:
    response = served.get("/internal/events", headers={"X-Request-ID": "trace-me-1"})

    assert response.status_code == 401
    _is_envelope(response)
    assert response.json()["code"] == "authentication_required"
    assert response.json()["correlation_id"] == "trace-me-1"
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_an_admitted_internal_call_is_answered_as_before(served: TestClient) -> None:
    response = served.get("/internal/events", headers={"Authorization": f"Bearer {TOKEN}"})

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_an_internal_api_not_served_answers_not_found_in_the_one_shape(
    unserved: TestClient,
) -> None:
    response = unserved.get("/internal/events")

    assert response.status_code == 404
    _is_envelope(response)
    assert response.json()["code"] == "not_found"


def test_an_unknown_path_or_method_answers_in_the_one_shape(served: TestClient) -> None:
    missing = served.get("/no-such-route")
    wrong_method = served.delete("/health")

    assert (missing.status_code, missing.json()["code"]) == (404, "not_found")
    _is_envelope(missing)
    assert (wrong_method.status_code, wrong_method.json()["code"]) == (405, "method_not_allowed")
    _is_envelope(wrong_method)


def test_the_second_wall_refuses_with_the_catalogue_s_own_error() -> None:
    class Unchecked:
        scope: dict[str, Any] = {}

    with pytest.raises(AuthenticationRequiredError, match="needs a service token"):
        require_service_caller(Unchecked())  # type: ignore[arg-type]


def test_only_a_detail_refusal_is_rewritten() -> None:
    asyncio.run(_rewrites_only_a_detail_refusal())


async def _rewrites_only_a_detail_refusal() -> None:
    sent: list[Message] = []

    async def send(message: Message) -> None:
        sent.append(message)

    scope = {"state": {"correlation_id": "c-1"}}
    # The application's own error already has the shape: it passes through as written.
    own = b'{"code":"not_found","message":"Gone","correlation_id":"c-1"}'
    wrapped = enveloped(send, scope)
    await wrapped({"type": "http.response.start", "status": 404, "headers": []})
    await wrapped({"type": "http.response.body", "body": own})
    assert sent[-1]["body"] == own

    sent.clear()
    wrapped = enveloped(send, scope)
    await wrapped(
        {"type": "http.response.start", "status": 503, "headers": [(b"content-length", b"9")]}
    )
    await wrapped({"type": "http.response.body", "body": b'{"detail"', "more_body": True})
    await wrapped({"type": "http.response.body", "body": b':"Down"}'})
    start, body = sent
    assert body["body"] == (
        b'{"code": "service_unavailable", "message": "Down", "correlation_id": "c-1"}'
    )
    assert (b"content-length", str(len(body["body"])).encode()) in start["headers"]
