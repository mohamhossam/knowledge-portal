"""The product catalog: where plans and prices are recorded (requirement-portal ADR-0101)."""

from __future__ import annotations

from typing import Protocol

from knowledge_portal.domain.architecture.plans import CatalogOffering


class ProductCatalogPort(Protocol):
    @property
    def name(self) -> str:
        """What the screen calls the catalog it read, such as "the product catalog"."""
        ...

    def offering(self, code: str) -> CatalogOffering | None:
        """The offering with this code and its plans and prices; None when the catalog has none.

        Raises ServiceUnavailableError when the catalog cannot be read or answers unusably.
        """
        ...
