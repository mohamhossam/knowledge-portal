"""Each app proves itself with its own credential, and is admitted under its name (ADR-0126).

The knowledge base admits the tokens the OIDC issuer grants a registered app's client for
the audience knowledge-apps, so it holds no secret of the app's; or the app's own shared
token, alone or alongside. No app is named in code: each is named where it is registered.
"""

from __future__ import annotations

from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from smb_kernel.errors import ServiceAuthenticationError
from smb_kernel.http.service_auth import ServiceTokenVerifier, ServiceVerifierChain

from knowledge_portal.infrastructure.config.options import ConfigurationError, LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.composition import identity
from knowledge_portal.interfaces.api.composition.identity import (
    APPS_AUDIENCE,
    build_app_verifier,
)
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app

ISSUER = "https://identity.example.test/realms/platform"
TOKEN = "r" * 40
OTHER = "o" * 40
_PRIVATE = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _settings(**changes: Any) -> Settings:
    return Settings(llm_provider=LLMProvider.FAKE, **changes)


def _granted(**overrides: object) -> str:
    claims: dict[str, object] = {
        "iss": ISSUER,
        "aud": APPS_AUDIENCE,
        "azp": "reporting",
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, _PRIVATE, algorithm="RS256", headers={"kid": "k1"})


@pytest.fixture
def issuer(monkeypatch: pytest.MonkeyPatch) -> None:
    """The issuer's discovery and keys, served to the verifier's HTTP client."""
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(_PRIVATE.public_key(), as_dict=True)
    jwk.update({"kid": "k1", "use": "sig"})

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("openid-configuration"):
            return httpx.Response(200, json={"issuer": ISSUER, "jwks_uri": f"{ISSUER}/certs"})
        return httpx.Response(200, json={"keys": [jwk]})

    real = httpx.Client

    def client(**options: Any) -> httpx.Client:
        return real(transport=httpx.MockTransport(handle), **options)

    monkeypatch.setattr(identity.httpx, "Client", client)


class TestSettings:
    @pytest.mark.parametrize(
        ("changes", "message"),
        [
            ({"app_client_ids": ("reporting",)}, "APP_CLIENT_IDS needs OIDC_ISSUER_URL"),
            (
                {"app_client_ids": ("reporting",), "oidc_issuer_url": "http://identity.test"},
                "APP_CLIENT_IDS needs OIDC_ISSUER_URL",
            ),
            ({"app_client_ids": ("Reporting App",)}, "is not an app name"),
            ({"app_client_ids": ("reporting", "reporting")}, "names a client twice"),
            ({"app_tokens": {"reporting": "short"}}, "token must be at least 32"),
            ({"app_tokens": {"Reporting": TOKEN}}, "is not an app name"),
            ({"app_tokens": {"a": TOKEN, "b": TOKEN}}, "the same token"),
        ],
    )
    def test_a_bad_registration_fails_the_boot(
        self, changes: dict[str, object], message: str
    ) -> None:
        with pytest.raises(ConfigurationError, match=message):
            _settings(**changes)

    def test_apps_are_read_from_the_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        monkeypatch.setenv("OIDC_ISSUER_URL", ISSUER)
        monkeypatch.setenv("APP_CLIENT_IDS", "reporting, requirement-service")
        monkeypatch.setenv("APP_TOKENS", f"reporting={TOKEN}, search-bot = {OTHER}")
        settings = Settings.from_env()
        assert settings.app_client_ids == ("reporting", "requirement-service")
        assert dict(settings.app_tokens) == {"reporting": TOKEN, "search-bot": OTHER}
        # Secrets never reach a log line through the settings' repr.
        assert TOKEN not in repr(settings) and OTHER not in repr(settings)

    @pytest.mark.parametrize("value", ["reporting", "=token", "reporting=", "a=x,a=y"])
    def test_a_malformed_token_list_fails_the_boot(
        self, monkeypatch: pytest.MonkeyPatch, value: str
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        monkeypatch.setenv("APP_TOKENS", value)
        with pytest.raises(ConfigurationError, match="APP_TOKENS"):
            Settings.from_env()

    @pytest.mark.parametrize(
        "old",
        [
            "REQUIREMENT_SERVICE_TOKEN",
            "REQUIREMENT_SERVICE_CLIENT_ID",
            "REQUIREMENT_API_BASE_URL",
            "KNOWLEDGE_SERVICE_TOKEN",
            "KNOWLEDGE_SERVICE_CLIENT_ID",
            "KNOWLEDGE_SERVICE_CLIENT_SECRET",
        ],
    )
    def test_a_setting_of_the_old_link_fails_the_boot_with_its_replacement(
        self, monkeypatch: pytest.MonkeyPatch, old: str
    ) -> None:
        # A deployment upgraded without renaming would otherwise lose its app silently.
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        monkeypatch.setenv(old, "x" * 40)
        with pytest.raises(ConfigurationError, match=f"{old} is no longer read"):
            Settings.from_env()


class TestIncoming:
    def test_with_no_app_registered_nothing_is_admitted(self) -> None:
        with ExitStack() as resources:
            assert build_app_verifier(_settings(), resources) is None

    def test_each_shared_token_names_its_own_app(self) -> None:
        settings = _settings(app_tokens={"reporting": TOKEN, "search-bot": OTHER})
        with ExitStack() as resources:
            verifier = build_app_verifier(settings, resources)
        assert isinstance(verifier, ServiceTokenVerifier)
        assert verifier.caller(f"Bearer {TOKEN}") == "reporting"
        assert verifier.caller(f"Bearer {OTHER}") == "search-bot"

    @pytest.mark.usefixtures("issuer")
    def test_a_granted_token_names_the_app_after_its_client(self) -> None:
        settings = _settings(oidc_issuer_url=ISSUER, app_client_ids=("reporting", "search-bot"))
        with ExitStack() as resources:
            verifier = build_app_verifier(settings, resources)
            assert verifier is not None
            assert verifier.caller(f"Bearer {_granted()}") == "reporting"
            assert verifier.caller(f"Bearer {_granted(azp='search-bot')}") == "search-bot"
            for refused in (
                _granted(azp="knowledge-spa"),
                _granted(aud="knowledge-api"),
                _granted(aud="knowledge-internal"),
                _granted(azp="unregistered"),
            ):
                with pytest.raises(ServiceAuthenticationError):
                    verifier.caller(f"Bearer {refused}")

    @pytest.mark.usefixtures("issuer")
    def test_both_are_admitted_while_an_app_moves_over(self) -> None:
        settings = _settings(
            oidc_issuer_url=ISSUER,
            app_client_ids=("reporting",),
            app_tokens={"reporting": TOKEN},
        )
        with ExitStack() as resources:
            verifier = build_app_verifier(settings, resources)
            assert isinstance(verifier, ServiceVerifierChain)
            assert verifier.caller(f"Bearer {TOKEN}") == "reporting"
            assert verifier.caller(f"Bearer {_granted()}") == "reporting"

    def test_the_app_api_is_served_with_only_a_client_registered(self) -> None:
        container = build_container(
            _settings(oidc_issuer_url=ISSUER, app_client_ids=("reporting",))
        )
        with TestClient(create_app(lambda: container)) as client:
            response = client.get("/apps/v2/events")
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
