"""The internal contract is versioned, and each change is held to its version (recommendation 11).

`contract_compat.compare` sorts what changed between two versions of an OpenAPI contract into
breaking and additive; `required_bump` says which part of the version that raises; and
`version_problems` refuses a version that does not raise it.
"""

from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

from knowledge_portal.interfaces.api.contract_compat import (
    Bump,
    compare,
    required_bump,
    version_problems,
)
from knowledge_portal.interfaces.api.routes.internal import INTERNAL_CONTRACT_VERSION

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "knowledge-internal.openapi.json"


def _contract() -> dict[str, Any]:
    """One operation: a query a caller sends, and the answer it receives."""
    return {
        "openapi": "3.1.0",
        "info": {"title": "Internal", "version": "1.0.0"},
        "paths": {
            "/internal/match": {
                "post": {
                    "summary": "Match",
                    "parameters": [
                        {
                            "in": "query",
                            "name": "limit",
                            "required": False,
                            "schema": {"type": "integer"},
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {"schema": {"$ref": "#/components/schemas/Query"}}
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "The match",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/Answer"}
                                }
                            },
                        }
                    },
                }
            }
        },
        "components": {
            "schemas": {
                "Query": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "maxLength": 100},
                        "mode": {"type": "string", "enum": ["fast", "full"]},
                    },
                    "required": ["text"],
                },
                "Answer": {
                    "type": "object",
                    "description": "What matched.",
                    "properties": {
                        "system": {"type": "string"},
                        # A field named like an annotation is still a field.
                        "description": {"type": "string"},
                        "kind": {"type": "string", "enum": ["api", "event"]},
                    },
                    "required": ["system", "description"],
                },
            }
        },
    }


def _changed(edit: Any) -> Bump:
    base = _contract()
    head = copy.deepcopy(base)
    edit(head)
    return required_bump(compare(base, head))


def _schema(contract: dict[str, Any], name: str) -> dict[str, Any]:
    found: dict[str, Any] = contract["components"]["schemas"][name]
    return found


def _operation(contract: dict[str, Any]) -> dict[str, Any]:
    found: dict[str, Any] = contract["paths"]["/internal/match"]["post"]
    return found


def test_an_unchanged_contract_or_its_wording_needs_no_new_version() -> None:
    assert _changed(lambda head: None) is Bump.NONE
    assert _changed(lambda head: head["info"].update(version="1.0.1")) is Bump.NONE
    assert _changed(lambda head: _schema(head, "Answer").update(description="Matched.")) is (
        Bump.PATCH
    )


@pytest.mark.parametrize(
    ("edit", "why"),
    [
        (
            lambda head: _schema(head, "Answer")["properties"].update(owner={"type": "string"}),
            "a field it sends",
        ),
        (
            lambda head: _schema(head, "Query")["properties"].update(note={"type": "string"}),
            "an optional field it takes",
        ),
        (
            lambda head: _operation(head)["parameters"].append(
                {"in": "query", "name": "page", "schema": {"type": "integer"}}
            ),
            "an optional parameter",
        ),
        (
            lambda head: _schema(head, "Query")["properties"]["mode"]["enum"].append("deep"),
            "a value it takes",
        ),
        (
            lambda head: _schema(head, "Answer")["properties"]["kind"]["enum"].append("file"),
            "a value it sends",
        ),
        (
            lambda head: _schema(head, "Query")["properties"]["text"].update(maxLength=200),
            "a looser limit on what it takes",
        ),
        (
            lambda head: head["paths"].update(
                {"/internal/other": {"get": {"responses": {"200": {"description": "ok"}}}}}
            ),
            "an operation",
        ),
        (lambda head: head["components"]["schemas"].update(Extra={"type": "object"}), "a schema"),
    ],
)
def test_what_a_caller_may_ignore_raises_the_minor_version(edit: Any, why: str) -> None:
    assert _changed(edit) is Bump.MINOR, why


@pytest.mark.parametrize(
    ("edit", "why"),
    [
        (lambda head: head["paths"].pop("/internal/match"), "an operation removed"),
        (
            lambda head: _schema(head, "Answer")["properties"].pop("system"),
            "a field it sent, removed",
        ),
        (
            lambda head: _schema(head, "Answer")["properties"].pop("description"),
            "a field named description, removed",
        ),
        (
            lambda head: _schema(head, "Answer")["required"].remove("system"),
            "a field it always sent, now optional",
        ),
        (
            lambda head: _schema(head, "Query")["required"].append("mode"),
            "a field callers must now send",
        ),
        (
            lambda head: (
                _schema(head, "Query")["properties"].update(tenant={"type": "string"}),
                _schema(head, "Query")["required"].append("tenant"),
            ),
            "a new field callers must send",
        ),
        (
            lambda head: _schema(head, "Answer")["properties"]["system"].update(type="integer"),
            "a type changed",
        ),
        (
            lambda head: _schema(head, "Query")["properties"]["mode"]["enum"].remove("full"),
            "a value it no longer takes",
        ),
        (
            lambda head: _schema(head, "Query")["properties"]["text"].update(maxLength=50),
            "a stricter limit on what it takes",
        ),
        (
            lambda head: _operation(head)["parameters"].append(
                {"in": "query", "name": "page", "required": True, "schema": {"type": "integer"}}
            ),
            "a new required parameter",
        ),
        (lambda head: _operation(head)["parameters"].clear(), "a parameter removed"),
        (lambda head: _operation(head)["responses"].clear(), "a response removed"),
        (lambda head: head["components"]["schemas"].pop("Answer"), "a schema removed"),
        (
            lambda head: _schema(head, "Answer")["properties"].update(
                system={"anyOf": [{"type": "string"}, {"type": "null"}]}
            ),
            "a field it sends may now be null",
        ),
    ],
)
def test_what_a_caller_relies_on_changing_raises_the_major_version(edit: Any, why: str) -> None:
    assert _changed(edit) is Bump.MAJOR, why


def test_a_version_never_goes_back_and_rises_as_far_as_the_change_needs() -> None:
    assert version_problems("1.2.3", "1.2.3", Bump.NONE) == []
    assert version_problems("1.2.3", "1.2.4", Bump.PATCH) == []
    assert version_problems("1.2.3", "1.3.0", Bump.MINOR) == []
    assert version_problems("1.2.3", "2.0.0", Bump.MINOR) == []
    assert version_problems("1.2.3", "2.0.0", Bump.MAJOR) == []
    assert version_problems("1.2.3", "1.2.2", Bump.NONE) == [
        "The version went back from 1.2.3 to 1.2.2."
    ]
    assert version_problems("1.2.3", "1.2.4", Bump.MINOR) == [
        "An additive change needs a new minor version: 1.3.0, not 1.2.4."
    ]
    assert version_problems("1.2.3", "1.3.0", Bump.MAJOR) == [
        "A breaking change needs a new major version: 2.0.0, not 1.3.0."
    ]
    with pytest.raises(ValueError, match="MAJOR.MINOR.PATCH"):
        version_problems("1.2", "1.3.0", Bump.MINOR)


def test_the_committed_contract_carries_the_package_s_version() -> None:
    committed = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert committed["info"]["version"] == INTERNAL_CONTRACT_VERSION


def test_the_committed_contract_compared_with_itself_needs_nothing() -> None:
    spec = importlib.util.spec_from_file_location(
        "check_internal_contract", ROOT / "scripts" / "check_internal_contract.py"
    )
    assert spec is not None and spec.loader is not None
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)

    assert script.main(["--base", "HEAD"]) == 0
