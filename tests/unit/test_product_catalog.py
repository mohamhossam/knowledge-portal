"""Plans and prices, read live from a TMF620 product catalog by offering code
(requirement-portal ADR-0101): never stored in the knowledge catalogue."""

from __future__ import annotations

from collections.abc import Callable, Generator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from smb_kernel.errors import ServiceUnavailableError
from smb_kernel.http.client import InternalHttpClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.use_cases.architecture_knowledge import KnowledgeNotFoundError
from knowledge_portal.application.use_cases.catalog_plans import (
    CatalogPlansStatus,
    ReadCatalogPlans,
)
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.plans import (
    CatalogOffering,
    PlanPrice,
    PriceKind,
)
from knowledge_portal.domain.architecture.products import OrderType, ProductOffering
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.config.options import (
    ConfigurationError,
    ProductCatalogProvider,
)
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.product_catalog import (
    CachedProductCatalog,
    FakeProductCatalog,
    Tmf620ProductCatalog,
)
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

NOW = datetime(2026, 10, 5, 9, 30, tzinfo=UTC)
OBSERVER = {"X-Fake-Actor-Id": "fake-observer"}

PRO = ProductOffering(
    "business-pro-plus",
    "Business Pro Plus",
    code="BUSINESS_PRO_PLUS",
    order_types=(OrderType("NEW_ACTIVATION", "New Activation"),),
)
UNCODED = ProductOffering("office", "Office Connect")
UNKNOWN = ProductOffering("retired", "Retired Plan", code="RETIRED")

Handler = Callable[[httpx.Request], httpx.Response]


def _catalog(handler: Handler, code_field: str = "id") -> Tmf620ProductCatalog:
    client = InternalHttpClient(
        "https://catalog.example/tmf-api/productCatalogManagement/v4",
        "token",
        service="product catalog",
        retries=0,
        http=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    return Tmf620ProductCatalog(client, FixedClock(NOW), code_field)


def _answering(resources: dict[str, Any], seen: list[httpx.Request] | None = None) -> Handler:
    """A TMF620 catalog holding these resources, keyed by the path after the API root."""

    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        path = request.url.path.split("/v4/", 1)[1]
        if path == "productOffering" and request.url.query:
            return httpx.Response(200, json=resources.get(f"search:{request.url.query.decode()}"))
        if path not in resources:
            return httpx.Response(404, json={"detail": "Not found"})
        return httpx.Response(200, json=resources[path])

    return handle


SINGLE = {
    "id": "BFB-1",
    "name": "Business Fibre",
    "lifecycleStatus": "Launched",
    "productOfferingTerm": [{"name": "24 months", "duration": {"amount": 24, "units": "months"}}],
    "productOfferingPrice": [
        {
            "name": "Monthly",
            "priceType": "recurring",
            "recurringChargePeriodType": "month",
            "price": {"unit": "AED", "value": 399.5},
        },
        {"id": "POP-INSTALL", "href": "/productOfferingPrice/POP-INSTALL"},
        {"id": "POP-DATA"},
    ],
}
PRICES = {
    "productOfferingPrice/POP-INSTALL": {
        "id": "POP-INSTALL",
        "name": "Installation",
        "priceType": "oneTime",
        "price": {"unit": "AED", "value": 150},
    },
    "productOfferingPrice/POP-DATA": {
        "id": "POP-DATA",
        "name": "Extra data",
        "priceType": "usage",
        "unitOfMeasure": {"amount": 1, "units": "GB"},
        "price": {"currency": "AED", "amount": "2.25"},
    },
}


# The TMF620 adapter -----------------------------------------------------------------------


def test_an_offering_that_bundles_nothing_is_its_own_one_plan_with_referred_prices() -> None:
    seen: list[httpx.Request] = []
    catalog = _catalog(_answering({"productOffering/BFB-1": SINGLE, **PRICES}, seen))

    found = catalog.offering("BFB-1")

    assert found is not None
    assert (found.id, found.name, found.lifecycle, found.read_at) == (
        "BFB-1",
        "Business Fibre",
        "Launched",
        NOW,
    )
    (plan,) = found.plans
    assert plan.terms == ("24 months",)
    assert plan.prices == (
        PlanPrice("Monthly", PriceKind.RECURRING, Decimal("399.5"), "AED", period="1 month"),
        PlanPrice("Installation", PriceKind.ONE_TIME, Decimal("150"), "AED"),
        PlanPrice("Extra data", PriceKind.USAGE, Decimal("2.25"), "AED", unit="GB"),
    )
    assert seen[0].headers["Authorization"] == "Bearer token"
    assert [request.url.path.rsplit("/", 1)[1] for request in seen] == [
        "BFB-1",
        "POP-INSTALL",
        "POP-DATA",
    ]


def test_a_bundles_plans_are_its_bundled_offerings() -> None:
    found = FakeProductCatalog(FixedClock(NOW)).offering("BUSINESS_PRO_PLUS")

    assert found is not None
    assert found.terms == ("No contract", "12 months", "24 months")
    assert [plan.name for plan in found.plans] == [
        "Business Pro Plus 200Mbps (sample)",
        "Business Pro Plus 300Mbps (sample)",
    ]
    assert [(price.name, price.amount) for price in found.plans[0].prices] == [
        ("Monthly, with a contract", Decimal("2740")),
        ("Monthly, without a contract", Decimal("3040")),
        ("Installation", Decimal("0")),
    ]


def test_a_code_the_catalog_does_not_hold_is_not_found() -> None:
    assert _catalog(_answering({})).offering("NOPE") is None


def test_an_offering_is_found_by_another_field_when_one_is_named() -> None:
    seen: list[httpx.Request] = []
    catalog = _catalog(
        _answering({"search:externalId=BFB-1&limit=2": [SINGLE], **PRICES}, seen), "externalId"
    )

    found = catalog.offering("BFB-1")

    assert found is not None and found.name == "Business Fibre"
    assert seen[0].url.params["externalId"] == "BFB-1"
    assert (
        _catalog(_answering({"search:externalId=X&limit=2": []}), "externalId").offering("X")
        is None
    )


def test_two_offerings_with_one_code_is_never_guessed_between() -> None:
    catalog = _catalog(
        _answering({"search:externalId=BFB-1&limit=2": [SINGLE, SINGLE]}), "externalId"
    )

    with pytest.raises(ServiceUnavailableError, match="more than one offering"):
        catalog.offering("BFB-1")


@pytest.mark.parametrize("status", [401, 403, 500])
def test_a_catalog_that_refuses_or_fails_is_unavailable(status: int) -> None:
    catalog = _catalog(lambda request: httpx.Response(status, json={"detail": "no"}))

    with pytest.raises(ServiceUnavailableError):
        catalog.offering("BFB-1")


@pytest.mark.parametrize(
    "answer",
    [
        ["not", "an", "offering"],
        {**SINGLE, "productOfferingPrice": "monthly"},
        {
            **SINGLE,
            "productOfferingPrice": [
                {"priceType": "recurring", "price": {"unit": "AED", "value": -1}}
            ],
        },
        {
            **SINGLE,
            "productOfferingPrice": [
                {"priceType": "oneTime", "price": {"unit": "AED", "value": "lots"}}
            ],
        },
        {**SINGLE, "productOfferingPrice": [{"priceType": "oneTime", "price": {"value": 5}}]},
        {**SINGLE, "productOfferingPrice": [{"href": "/productOfferingPrice/x"}]},
        {**SINGLE, "isBundle": True, "bundledProductOffering": [{"name": "no id"}]},
        {**SINGLE, "name": {"en": "Business Fibre"}},
    ],
)
def test_a_malformed_answer_never_reaches_the_screen_half_read(answer: object) -> None:
    catalog = _catalog(_answering({"productOffering/BFB-1": answer}))

    with pytest.raises(ServiceUnavailableError, match="unusable"):
        catalog.offering("BFB-1")


def test_a_price_without_an_amount_or_a_known_kind_is_left_out() -> None:
    answer = {
        **SINGLE,
        "productOfferingPrice": [
            {"name": "Bundle header", "priceType": "recurring"},
            {"name": "Discount", "priceType": "discount", "price": {"unit": "AED", "value": 10}},
        ],
    }

    found = _catalog(_answering({"productOffering/BFB-1": answer})).offering("BFB-1")

    assert found is not None and found.plans[0].prices == ()


def test_a_catalog_is_read_once_in_a_while_for_each_code() -> None:
    calls: list[str] = []
    clock = FixedClock(NOW)

    class Counting(FakeProductCatalog):
        def offering(self, code: str) -> CatalogOffering | None:
            calls.append(code)
            return super().offering(code)

    cached = CachedProductCatalog(Counting(clock), clock, 300)

    first = cached.offering("BFB-1")
    assert cached.offering("BFB-1") is first
    assert cached.offering("NOPE") is None and cached.offering("NOPE") is None
    clock.set(NOW + timedelta(seconds=300))
    assert cached.offering("BFB-1") is not first
    assert calls == ["BFB-1", "NOPE", "BFB-1"]
    assert cached.name == "the sample product catalog"


def test_a_failed_read_is_not_remembered() -> None:
    clock = FixedClock(NOW)
    answers = iter([httpx.Response(503), httpx.Response(200, json=SINGLE)])
    cached = CachedProductCatalog(
        _catalog(
            lambda request: next(answers) if "BFB-1" in request.url.path else httpx.Response(404)
        ),
        clock,
        300,
    )

    with pytest.raises(ServiceUnavailableError):
        cached.offering("BFB-1")
    assert cached.offering("BFB-1") is not None


# The domain -------------------------------------------------------------------------------


def test_a_price_is_a_finite_amount_never_negative() -> None:
    for amount in (Decimal("-1"), Decimal("NaN"), Decimal("Infinity")):
        with pytest.raises(InvalidKnowledgeError, match="never negative"):
            PlanPrice("Monthly", PriceKind.RECURRING, amount, "AED")


def test_a_reading_says_when_it_was_read_with_its_zone() -> None:
    with pytest.raises(InvalidKnowledgeError, match="when it was read"):
        CatalogOffering("BFB-1", "Business Fibre", datetime(2026, 10, 5, 9, 30))  # noqa: DTZ001


# The use case -----------------------------------------------------------------------------


def _plans(catalog: Any = None) -> ReadCatalogPlans:
    release = replace(seed_knowledge(), products=(PRO, UNCODED, UNKNOWN))
    return ReadCatalogPlans(InMemoryArchitectureKnowledgeRepository(release), catalog)


def test_plans_are_read_by_the_offering_code_in_the_version_in_service() -> None:
    read = _plans(FakeProductCatalog(FixedClock(NOW)))

    found = read.for_offering("business-pro-plus")
    assert found.status is CatalogPlansStatus.FOUND
    assert (found.code, found.catalog) == ("BUSINESS_PRO_PLUS", "the sample product catalog")
    assert found.offering is not None and len(found.offering.plans) == 2

    assert read.for_offering("retired").status is CatalogPlansStatus.NOT_IN_CATALOG
    assert read.for_offering("office").status is CatalogPlansStatus.NO_CODE
    with pytest.raises(KnowledgeNotFoundError):
        read.for_offering("missing")


def test_without_a_catalog_the_explorer_says_none_is_read() -> None:
    found = _plans().for_offering("business-pro-plus")

    assert (found.status, found.code, found.catalog) == (
        CatalogPlansStatus.NOT_CONFIGURED,
        "BUSINESS_PRO_PLUS",
        None,
    )


# The API ----------------------------------------------------------------------------------


@pytest.fixture
def plans_client(container: Container) -> Generator[TestClient, None, None]:
    plans = _plans(FakeProductCatalog(FixedClock(NOW)))
    with TestClient(create_app(lambda: replace(container, catalog_plans=plans))) as client:
        yield client


def test_a_signed_in_reader_reads_an_offerings_plans(plans_client: TestClient) -> None:
    response = plans_client.get("/explorer/offerings/business-pro-plus/plans", headers=OBSERVER)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "found"
    assert body["catalog_offering_name"] == "Business Pro Plus"
    assert body["read_at"].startswith("2026-10-05T09:30:00")
    assert body["terms"] == ["No contract", "12 months", "24 months"]
    assert body["plans"][0]["prices"][0] == {
        "name": "Monthly, with a contract",
        "kind": "recurring",
        "amount": "2740",
        "currency": "AED",
        "period": "1 month",
        "unit": None,
    }


def test_an_offering_not_in_service_is_not_found(plans_client: TestClient) -> None:
    response = plans_client.get("/explorer/offerings/missing/plans", headers=OBSERVER)

    assert response.status_code == 404


def test_an_unavailable_catalog_is_said_so(container: Container) -> None:
    failing = _plans(_catalog(lambda request: httpx.Response(500)))
    with TestClient(create_app(lambda: replace(container, catalog_plans=failing))) as client:
        response = client.get("/explorer/offerings/business-pro-plus/plans", headers=OBSERVER)

    assert response.status_code == 503
    assert response.json()["code"] == "platform_service_unavailable"


def test_an_unknown_caller_reads_no_plans(plans_client: TestClient) -> None:
    response = plans_client.get(
        "/explorer/offerings/business-pro-plus/plans", headers={"X-Fake-Actor-Id": "nobody"}
    )

    assert response.status_code == 401


# Settings ---------------------------------------------------------------------------------


def test_by_default_no_catalog_is_read() -> None:
    assert FAKE_PROVIDER_SETTINGS.product_catalog_provider is ProductCatalogProvider.NONE


def test_the_sample_catalog_is_wired_when_chosen() -> None:
    settings = replace(FAKE_PROVIDER_SETTINGS, product_catalog_provider=ProductCatalogProvider.FAKE)
    container = build_container(settings)
    try:
        assert container.catalog_plans is not None
        with pytest.raises(KnowledgeNotFoundError):
            container.catalog_plans.for_offering("missing")
    finally:
        container.close_resources()


def test_a_tmf620_catalog_is_wired_with_its_url_and_token() -> None:
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        product_catalog_provider=ProductCatalogProvider.TMF620,
        product_catalog_url="https://catalog.example/tmf-api/productCatalogManagement/v4",
        product_catalog_token="secret",
    )
    container = build_container(settings)
    container.close_resources()
    assert "secret" not in repr(settings)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"product_catalog_provider": ProductCatalogProvider.TMF620}, "PRODUCT_CATALOG_URL"),
        (
            {
                "product_catalog_provider": ProductCatalogProvider.TMF620,
                "product_catalog_url": "catalog.example",
                "product_catalog_token": "secret",
            },
            "PRODUCT_CATALOG_URL",
        ),
        (
            {
                "product_catalog_provider": ProductCatalogProvider.TMF620,
                "product_catalog_url": "https://catalog.example",
            },
            "PRODUCT_CATALOG_TOKEN",
        ),
        ({"product_catalog_code_field": "id&limit=1000"}, "PRODUCT_CATALOG_CODE_FIELD"),
        ({"product_catalog_cache_seconds": -1}, "PRODUCT_CATALOG_CACHE_SECONDS"),
    ],
)
def test_catalog_settings_are_checked_at_startup(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(ConfigurationError, match=message):
        replace(FAKE_PROVIDER_SETTINGS, **changes)


def test_catalog_settings_are_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("PRODUCT_CATALOG_PROVIDER", "TMF620")
    monkeypatch.setenv("PRODUCT_CATALOG_URL", "https://catalog.example/v4")
    monkeypatch.setenv("PRODUCT_CATALOG_TOKEN", "secret")
    monkeypatch.setenv("PRODUCT_CATALOG_CODE_FIELD", "externalId")
    monkeypatch.setenv("PRODUCT_CATALOG_CACHE_SECONDS", "60")

    settings = Settings.from_env()

    assert settings.product_catalog_provider is ProductCatalogProvider.TMF620
    assert settings.product_catalog_code_field == "externalId"
    assert settings.product_catalog_cache_seconds == 60

    monkeypatch.setenv("PRODUCT_CATALOG_PROVIDER", "excel")
    with pytest.raises(ConfigurationError, match="none, fake or tmf620"):
        Settings.from_env()
    monkeypatch.setenv("PRODUCT_CATALOG_PROVIDER", "none")
    monkeypatch.setenv("PRODUCT_CATALOG_CACHE_SECONDS", "soon")
    with pytest.raises(ConfigurationError, match="whole number"):
        Settings.from_env()
