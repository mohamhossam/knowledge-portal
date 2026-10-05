"""The product catalog over TM Forum's Product Catalog Management API (TMF620).

An offering is found by its code (requirement-portal ADR-0101): by default the code is the
catalog's own productOffering id; a deployment can name another field to search on. A
bundled offering's plans are its bundled offerings; an offering that bundles nothing is its
own one plan. Prices are its productOfferingPrice entries, fetched when only referred to.

Whatever the catalog answers is untrusted: it is read into this application's own values,
bounded, and a malformed answer fails as ServiceUnavailableError, never reaching the screen
half-read. A short cache spares the catalog a call per page view; each reading keeps the
time it was taken.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote

from smb_kernel.errors import ServiceResponseError, ServiceUnavailableError
from smb_kernel.http.client import InternalHttpClient
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.product_catalog import ProductCatalogPort
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.plans import (
    CatalogOffering,
    CatalogPlan,
    PlanPrice,
    PriceKind,
)

MAX_PLANS = 50
MAX_PRICES = 50
_KINDS = {
    "recurring": PriceKind.RECURRING,
    "onetime": PriceKind.ONE_TIME,
    "one_time": PriceKind.ONE_TIME,
    "usage": PriceKind.USAGE,
}


class _Unusable(Exception):
    """The catalog's answer cannot be read; reported as the catalog being unavailable."""


def _object(value: object) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _Unusable("expected an object")
    return value


def _text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str | int | float) or isinstance(value, bool):
        raise _Unusable("expected text")
    text = str(value).strip()
    return text or None


def _list(value: object, limit: int) -> list[Any]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise _Unusable("expected a list")
    return value[:limit]


def _terms(raw: Mapping[str, Any]) -> tuple[str, ...]:
    """The commitments stated on an offering: "24 months", or the term's name."""
    terms = []
    for item in _list(raw.get("productOfferingTerm"), MAX_PRICES):
        term = _object(item)
        duration = term.get("duration")
        if isinstance(duration, Mapping) and duration.get("amount") is not None:
            units = _text(duration.get("units")) or ""
            terms.append(f"{_text(duration.get('amount'))} {units}".strip())
        elif name := _text(term.get("name")):
            terms.append(name)
    return tuple(dict.fromkeys(terms))


class Tmf620ProductCatalog:
    """Reads one offering, its plans and their prices from a TMF620 catalog."""

    name = "the product catalog"

    def __init__(
        self, client: InternalHttpClient, clock: ClockPort, code_field: str = "id"
    ) -> None:
        self._client = client
        self._clock = clock
        self._code_field = code_field

    def offering(self, code: str) -> CatalogOffering | None:
        raw = self._find(code)
        if raw is None:
            return None
        try:
            found = _object(raw)
            return CatalogOffering(
                id=_text(found.get("id")) or code,
                name=_text(found.get("name")) or code,
                read_at=self._clock.now(),
                lifecycle=_text(found.get("lifecycleStatus")),
                plans=self._plans(found),
                terms=_terms(found),
            )
        except (_Unusable, InvalidKnowledgeError, InvalidOperation, ValueError) as exc:
            raise ServiceUnavailableError(
                f"The product catalog returned an unusable offering for {code!r}."
            ) from exc

    def _find(self, code: str) -> object | None:
        if self._code_field == "id":
            return self._get(f"/productOffering/{quote(code, safe='')}")
        found = self._get("/productOffering", {self._code_field: code, "limit": 2})
        if not isinstance(found, list):
            raise ServiceUnavailableError("The product catalog returned an unusable search.")
        if len(found) > 1:
            raise ServiceUnavailableError(
                f"The product catalog has more than one offering whose {self._code_field} is "
                f"{code!r}."
            )
        return found[0] if found else None

    def _get(self, path: str, params: Mapping[str, Any] | None = None) -> object | None:
        """What the catalog answers; None when it has no such thing. A refusal (a wrong
        token, say) is the catalog being unavailable to this reader, not a missing offering."""
        try:
            found: object = self._client.get_json(path, params)
        except ServiceResponseError as exc:
            if exc.status_code == 404:
                return None
            raise ServiceUnavailableError(
                f"The product catalog refused the request ({exc.status_code})."
            ) from exc
        return found

    def _plans(self, offering: Mapping[str, Any]) -> tuple[CatalogPlan, ...]:
        bundled = _list(offering.get("bundledProductOffering"), MAX_PLANS)
        if not (offering.get("isBundle") is True and bundled):
            return (self._plan(offering),)
        plans = []
        for reference in bundled:
            plan_id = _text(_object(reference).get("id"))
            if plan_id is None:
                raise _Unusable("a bundled offering without an id")
            child = self._get(f"/productOffering/{quote(plan_id, safe='')}")
            if child is not None:
                plans.append(self._plan(_object(child)))
        return tuple(plans)

    def _plan(self, raw: Mapping[str, Any]) -> CatalogPlan:
        prices = (
            self._price(_object(item))
            for item in _list(raw.get("productOfferingPrice"), MAX_PRICES)
        )
        return CatalogPlan(
            id=_text(raw.get("id")) or "",
            name=_text(raw.get("name")) or "",
            description=_text(raw.get("description")),
            lifecycle=_text(raw.get("lifecycleStatus")),
            prices=tuple(price for price in prices if price is not None),
            terms=_terms(raw),
        )

    def _price(self, reference: Mapping[str, Any]) -> PlanPrice | None:
        """A price, fetched when the offering only refers to it; a bundle's header that
        states no amount of its own is left out."""
        raw = reference
        if "price" not in reference and "priceType" not in reference:
            price_id = _text(reference.get("id"))
            if price_id is None:
                raise _Unusable("a price reference without an id")
            fetched = self._get(f"/productOfferingPrice/{quote(price_id, safe='')}")
            if fetched is None:
                return None
            raw = _object(fetched)
        money = raw.get("price")
        if not isinstance(money, Mapping):
            return None
        value = money.get("value", money.get("amount"))
        kind = _KINDS.get((_text(raw.get("priceType")) or "").replace(" ", "").casefold())
        if value is None or kind is None:
            return None
        period = None
        if kind is PriceKind.RECURRING:
            every = _text(raw.get("recurringChargePeriodLength")) or "1"
            unit = _text(raw.get("recurringChargePeriodType"))
            period = f"{every} {unit}" if unit else None
        measure = raw.get("unitOfMeasure")
        return PlanPrice(
            name=_text(raw.get("name")) or kind.value.replace("_", " ").capitalize(),
            kind=kind,
            amount=Decimal(str(value)),
            currency=_text(money.get("unit")) or _text(money.get("currency")) or "",
            period=period,
            unit=_text(measure.get("units")) if isinstance(measure, Mapping) else None,
        )


class CachedProductCatalog:
    """A catalog read at most once per code in a while; a miss is remembered too."""

    def __init__(self, inner: ProductCatalogPort, clock: ClockPort, seconds: int) -> None:
        self._inner = inner
        self._clock = clock
        self._keep = timedelta(seconds=seconds)
        self._read: dict[str, tuple[Any, CatalogOffering | None]] = {}

    @property
    def name(self) -> str:
        return self._inner.name

    def offering(self, code: str) -> CatalogOffering | None:
        now = self._clock.now()
        kept = self._read.get(code)
        if kept is not None and now - kept[0] < self._keep:
            return kept[1]
        found = self._inner.offering(code)
        self._read[code] = (now, found)
        return found


def _sample(code: str, name: str, tiers: tuple[tuple[str, str, str], ...]) -> dict[str, Any]:
    """A bundled offering whose plans are speed tiers, as a TMF620 catalog would state it."""
    return {
        "id": code,
        "name": name,
        "isBundle": True,
        "lifecycleStatus": "Launched",
        "productOfferingTerm": [
            {"name": "No contract"},
            {"name": "12 months", "duration": {"amount": 12, "units": "months"}},
            {"name": "24 months", "duration": {"amount": 24, "units": "months"}},
        ],
        "bundledProductOffering": [
            {
                "id": f"{code}-{tier}",
                "name": f"{name} {tier} (sample)",
                "productOfferingPrice": [
                    {
                        "name": "Monthly, with a contract",
                        "priceType": "recurring",
                        "recurringChargePeriodType": "month",
                        "price": {"unit": "AED", "value": contract},
                    },
                    {
                        "name": "Monthly, without a contract",
                        "priceType": "recurring",
                        "recurringChargePeriodType": "month",
                        "price": {"unit": "AED", "value": free},
                    },
                    {
                        "name": "Installation",
                        "priceType": "oneTime",
                        "price": {"unit": "AED", "value": "0"},
                    },
                ],
            }
            for tier, contract, free in tiers
        ],
    }


# Clearly sample prices, for running offline and for demonstrations; never a real tariff.
_SAMPLES = {
    item["id"]: item
    for item in (
        _sample(
            "BUSINESS_PRO_PLUS",
            "Business Pro Plus",
            (("200Mbps", "2740", "3040"), ("300Mbps", "3120", "3420")),
        ),
        _sample("BFB-1", "Business Fibre", (("100Mbps", "399", "449"),)),
    )
}


class _SampleClient:
    """Answers as a TMF620 catalog would, from the samples, so the real reading is exercised."""

    def get_json(self, path: str, params: Mapping[str, Any] | None = None) -> Any:
        kind, _, key = path.strip("/").partition("/")
        if kind == "productOffering":
            for offering in _SAMPLES.values():
                if offering["id"] == key:
                    return offering
                for plan in offering["bundledProductOffering"]:
                    if plan["id"] == key:
                        return plan
        raise ServiceResponseError(404, "Not found")


class FakeProductCatalog(Tmf620ProductCatalog):
    """A sample product catalog for running offline; its offerings say "(sample)"."""

    name = "the sample product catalog"

    def __init__(self, clock: ClockPort) -> None:
        super().__init__(_SampleClient(), clock)  # type: ignore[arg-type]
