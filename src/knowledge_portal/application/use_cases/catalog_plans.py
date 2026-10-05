"""An offering's plans and prices, read live from the product catalog by its code.

The explorer shows what the catalog says now (requirement-portal ADR-0101); the knowledge
catalogue never holds a copy. Anyone who may read the explorer may read these.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.product_catalog import ProductCatalogPort
from knowledge_portal.application.use_cases.architecture_knowledge import KnowledgeNotFoundError
from knowledge_portal.domain.architecture.plans import CatalogOffering


class CatalogPlansStatus(StrEnum):
    FOUND = "found"
    # The offering has no code to look it up by.
    NO_CODE = "no_code"
    NOT_IN_CATALOG = "not_in_catalog"
    # This deployment reads no product catalog.
    NOT_CONFIGURED = "not_configured"


@dataclass(frozen=True)
class CatalogPlans:
    status: CatalogPlansStatus
    code: str | None = None
    catalog: str | None = None
    offering: CatalogOffering | None = None


class ReadCatalogPlans:
    def __init__(
        self,
        repository: ArchitectureKnowledgeRepositoryPort,
        catalog: ProductCatalogPort | None,
    ) -> None:
        self._repository = repository
        self._catalog = catalog

    def for_offering(self, offering_id: str) -> CatalogPlans:
        """The plans of an offering in the catalogue version in service."""
        offering = next(
            (item for item in self._repository.active().products if item.id == offering_id), None
        )
        if offering is None:
            raise KnowledgeNotFoundError(
                f"The catalogue in service has no offering {offering_id!r}."
            )
        if self._catalog is None:
            return CatalogPlans(CatalogPlansStatus.NOT_CONFIGURED, offering.code)
        if not offering.code:
            return CatalogPlans(CatalogPlansStatus.NO_CODE, catalog=self._catalog.name)
        found = self._catalog.offering(offering.code)
        return CatalogPlans(
            CatalogPlansStatus.FOUND if found is not None else CatalogPlansStatus.NOT_IN_CATALOG,
            offering.code,
            self._catalog.name,
            found,
        )
