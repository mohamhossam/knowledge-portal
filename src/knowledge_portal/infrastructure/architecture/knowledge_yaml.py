"""A catalogue release read from a YAML catalogue file (`catalogues/*.yaml`)."""

from __future__ import annotations

import yaml

from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import content_from_mapping


def knowledge_from_yaml(text: str) -> ArchitectureKnowledge:
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise InvalidKnowledgeError("Architecture YAML has invalid content.") from exc
    if not isinstance(raw, dict) or not raw.get("version"):
        raise InvalidKnowledgeError("Architecture YAML needs a version.")
    content = content_from_mapping(raw)
    return ArchitectureKnowledge(
        str(raw["version"]),
        1,
        content.systems,
        content.relationships,
        capability_domains=content.capability_domains,
        landscape_domains=content.landscape_domains,
        products=content.products,
        journeys=content.journeys,
        channels=content.channels,
        sources=content.sources,
        conflicts=content.conflicts,
        portfolio=content.portfolio,
        business_capabilities=content.business_capabilities,
        vocabulary=content.vocabulary,
        schemes=content.schemes,
        interfaces=content.interfaces,
        realisations=content.realisations,
    )
