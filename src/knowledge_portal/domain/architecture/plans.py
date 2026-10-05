"""Plans and prices, as the product catalog states them (requirement-portal ADR-0101).

The product catalog is the system of record for what an offering costs. The explorer reads
it live, by the offering's code; nothing here is stored in the knowledge catalogue, so a
price shown is never a stale copy. Each reading says when it was read.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)


class PriceKind(StrEnum):
    RECURRING = "recurring"
    ONE_TIME = "one_time"
    USAGE = "usage"


@dataclass(frozen=True)
class PlanPrice:
    name: str
    kind: PriceKind
    amount: Decimal
    currency: str
    # How often a recurring price falls due, such as "1 month".
    period: str | None = None
    # What a usage price is charged per, such as "GB".
    unit: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", required(self.name, "Price name"))
        object.__setattr__(self, "kind", PriceKind(self.kind))
        object.__setattr__(self, "currency", required(self.currency, "Currency"))
        object.__setattr__(self, "period", optional(self.period, "Period"))
        object.__setattr__(self, "unit", optional(self.unit, "Unit"))
        if not self.amount.is_finite() or self.amount < 0:
            raise InvalidKnowledgeError(f"{self.name}: a price is a finite amount, never negative.")


@dataclass(frozen=True)
class CatalogPlan:
    """One plan the offering is sold as, such as a speed tier, with its prices and terms."""

    id: str
    name: str
    description: str | None = None
    lifecycle: str | None = None
    prices: tuple[PlanPrice, ...] = ()
    # Commitments it is sold with, such as "24 months".
    terms: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Plan id"))
        object.__setattr__(self, "name", required(self.name, "Plan name"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        object.__setattr__(self, "lifecycle", optional(self.lifecycle, "Lifecycle"))


@dataclass(frozen=True)
class CatalogOffering:
    """An offering as the product catalog states it, and when it was read."""

    id: str
    name: str
    read_at: datetime
    lifecycle: str | None = None
    plans: tuple[CatalogPlan, ...] = ()
    terms: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Catalog offering id"))
        object.__setattr__(self, "name", required(self.name, "Catalog offering name"))
        object.__setattr__(self, "lifecycle", optional(self.lifecycle, "Lifecycle"))
        if self.read_at.tzinfo is None:
            raise InvalidKnowledgeError("A catalog reading says when it was read, with its zone.")
