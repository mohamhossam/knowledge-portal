"""Every catalogued application error maps to its HTTP status (AGENTS 4.4.2).

An unmapped or wrongly ordered entry reaches clients as a 500 or as another
error's code; this walks the whole catalogue so a new error cannot ship
without its mapping holding end to end.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from knowledge_portal.application.errors import ModelTransportError, ServiceResponseError
from knowledge_portal.application.public_errors import ERROR_CATALOGUE, FailureCategory
from knowledge_portal.interfaces.api.error_handlers import (
    HTTP_STATUS_BY_CATEGORY,
    register_error_handlers,
)


def _instance(error_type: type[Exception]) -> Exception:
    """A representative instance; almost every catalogued error takes a message."""
    if error_type is ModelTransportError:
        return ModelTransportError("timeout")
    if error_type is ServiceResponseError:
        return ServiceResponseError(403, "boom")
    return error_type("boom")


@pytest.mark.parametrize(
    ("error_type", "code", "category"),
    ERROR_CATALOGUE,
    ids=[code for _, code, _ in ERROR_CATALOGUE],
)
def test_every_catalogued_error_maps_to_its_status(
    error_type: type[Exception], code: str, category: FailureCategory
) -> None:
    app = FastAPI()
    register_error_handlers(app)
    failure = _instance(error_type)

    @app.get("/boom")
    def boom() -> None:
        raise failure

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == HTTP_STATUS_BY_CATEGORY[category], (
        f"{error_type.__name__} should map to {category}"
    )
    body = response.json()
    if error_type is ModelTransportError:
        # Its public code names the failure kind ("model_timeout", "model_rate_limit"...).
        assert body["code"].startswith("model_")
    else:
        assert body["code"] == code
    assert body["correlation_id"]
