"""Catalogue files maintainers upload or download: Excel, YAML or JSON."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.architecture.change_requests import ChangeRequestRecord
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.governance import KnowledgeSource, SourceConflict
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    InvalidKnowledgeError,
    LandscapeDomain,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.vocabularies import VocabularyTerm


class CatalogueFileFormat(StrEnum):
    XLSX = "xlsx"
    YAML = "yaml"
    JSON = "json"

    @classmethod
    def from_filename(cls, filename: str) -> CatalogueFileFormat:
        suffix = filename.rsplit(".", 1)[-1].casefold() if "." in filename else ""
        formats = {"xlsx": cls.XLSX, "yaml": cls.YAML, "yml": cls.YAML, "json": cls.JSON}
        if suffix not in formats:
            raise InvalidKnowledgeError(
                "Upload the catalogue as an Excel (.xlsx), YAML (.yaml, .yml) or JSON file."
            )
        return formats[suffix]

    @property
    def media_type(self) -> str:
        return {
            CatalogueFileFormat.XLSX: (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            CatalogueFileFormat.YAML: "application/yaml",
            CatalogueFileFormat.JSON: "application/json",
        }[self]


@dataclass(frozen=True)
class CatalogueContent:
    """The editable body of a release; identity, status and documents stay with the draft."""

    systems: tuple[SystemDefinition, ...]
    relationships: tuple[SystemRelationship, ...]
    capability_domains: tuple[CapabilityDomain, ...] = ()
    landscape_domains: tuple[LandscapeDomain, ...] = ()
    products: tuple[ProductOffering, ...] = ()
    journeys: tuple[Journey, ...] = ()
    channels: tuple[Channel, ...] = ()
    sources: tuple[KnowledgeSource, ...] = ()
    conflicts: tuple[SourceConflict, ...] = ()
    # The change requests applied (requirement-portal ADR-0101, step 7). None when the file
    # has no change history, so importing it keeps the draft's own.
    change_history: tuple[ChangeRequestRecord, ...] | None = None
    # The product portfolio its offerings sit in.
    portfolio: tuple[PortfolioNode, ...] = ()
    # The business capability concepts capabilities and components are linked to (ADR-0114).
    business_capabilities: tuple[BusinessCapability, ...] = ()
    # The controlled vocabularies written values are linked to.
    vocabulary: tuple[VocabularyTerm, ...] = ()
    # The contracts systems expose and consume (ontology plan Phase 8).
    interfaces: tuple[SystemInterface, ...] = ()


class CatalogueFilePort(Protocol):
    def read(self, file_format: CatalogueFileFormat, content: bytes) -> CatalogueContent:
        """Parse a file; a malformed one raises InvalidKnowledgeError naming where."""
        ...

    def write(self, file_format: CatalogueFileFormat, release: ArchitectureKnowledge) -> bytes: ...

    def template(self) -> bytes:
        """An empty Excel workbook with the expected sheets, headers and instructions."""
        ...
