"""The portal's own sign-in entities (requirement-portal ADR-0104, phase 4)."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
ENTITIES = ROOT / "deploy" / "keycloak" / "knowledge-portal.json"


def _apply_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("keycloak_apply", ENTITIES.with_name("apply.py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


apply = _apply_module()


def _rendered(**environ: str) -> Any:
    return apply.render(ENTITIES.read_text(encoding="utf-8"), apply.settings(environ))


def test_the_portal_defines_its_own_client_roles_and_groups() -> None:
    entities = _rendered(KNOWLEDGE_APP_ORIGIN="https://knowledge.example.test")

    assert [client["clientId"] for client in entities["clients"]] == ["knowledge-spa"]
    assert [role["name"] for role in entities["roles"]["realm"]] == [
        "knowledge_admin",
        "knowledge_reader",
        "knowledge_maintainer",
    ]
    assert {group["name"] for group in entities["groups"]} == {
        "knowledge-admins",
        "knowledge-readers",
        "knowledge-maintainers",
    }


def test_the_client_signs_in_only_where_the_portal_is_served() -> None:
    entities = _rendered(KNOWLEDGE_APP_ORIGIN="https://knowledge.example.test/")
    client = entities["clients"][0]

    assert client["redirectUris"] == [
        "https://knowledge.example.test/knowledge/auth/callback",
        "https://knowledge.example.test/knowledge/auth/silent-callback",
    ]
    assert client["webOrigins"] == ["https://knowledge.example.test"]
    assert client["publicClient"] is True
    assert client["attributes"]["pkce.code.challenge.method"] == "S256"
    audiences = [
        mapper["config"]["included.client.audience"]
        for mapper in client["protocolMappers"]
        if mapper["protocolMapper"] == "oidc-audience-mapper"
    ]
    assert audiences == ["knowledge-api"]


def test_the_served_path_can_change() -> None:
    entities = _rendered(KNOWLEDGE_APP_ORIGIN="https://k.example.test", KNOWLEDGE_APP_PATH="")
    client = entities["clients"][0]

    assert client["redirectUris"][0] == "https://k.example.test/auth/callback"


def test_nothing_is_imported_without_the_portal_origin() -> None:
    with pytest.raises(SystemExit, match="KNOWLEDGE_APP_ORIGIN"):
        _rendered()


def test_nothing_of_requirement_work_is_defined_here() -> None:
    text = ENTITIES.read_text(encoding="utf-8")

    assert "requirement-spa" not in text
    assert "requirement-api" not in text
