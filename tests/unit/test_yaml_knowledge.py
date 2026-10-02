"""The YAML catalogue adapter: what it matches and which files it refuses to load.

Ported from requirement-portal's architecture mapping tests when the catalogue moved here.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.domain.architecture.entities import ArchitectureDependency
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.config.options import ConfigurationError


def test_yaml_adapter_maps_catalogued_and_declared_unknown_systems() -> None:
    adapter = YamlArchitectureKnowledge(default_knowledge_path())

    result = adapter.match(
        ArchitectureQuery(
            text=("The assisted sales journey needs service activation.",),
            declared_systems=("BCRM", "CPP"),
        )
    )

    by_name = {item.name: item for item in result.systems}
    assert result.knowledge_version == "smb-source-reference-v1"
    assert by_name["BCRM"].catalogued is True
    assert by_name["CPP"].catalogued is False
    assert by_name["eVEDA / E2ESO / XaaS / IN"].capabilities[0].name == (
        "Network and service activation"
    )
    assert all(not item.squads for item in result.systems)


def test_yaml_adapter_matches_punctuation_and_selected_dependencies(tmp_path: Path) -> None:
    catalogue = tmp_path / "catalogue.yaml"
    catalogue.write_text(
        """version: test-v1
systems:
  - id: front-end
    name: Front End
    aliases: [customer portal]
    capabilities:
      - {id: quote, name: Quote capture, triggers: [quote capture]}
  - {id: crm, name: CRM, aliases: [customer records]}
dependencies:
  - {source_system_id: front-end, target_system_id: crm, description: Reads customers}
""",
        encoding="utf-8",
    )

    result = YamlArchitectureKnowledge(catalogue).match(
        ArchitectureQuery(
            text=("The customer-portal performs quote capture.",),
            declared_systems=("CRM",),
        )
    )

    assert [item.name for item in result.systems] == ["CRM", "Front End"]
    front_end = result.systems[1]
    assert front_end.capabilities[0].name == "Quote capture"
    assert result.dependencies == (ArchitectureDependency("front-end", "crm", "Reads customers"),)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (
            """version: v1
systems:
  - {id: one, name: One, aliases: [shared]}
  - {id: two, name: Two, aliases: [shared]}
""",
            "multiple systems",
        ),
        (
            """version: v1
systems:
  - {id: one, name: One}
dependencies:
  - {source_system_id: one, target_system_id: missing, description: Missing}
""",
            "absent",
        ),
        (
            """version: v1
systems:
  - {id: repeated, name: One}
  - {id: repeated, name: Two}
""",
            "Duplicate architecture system id",
        ),
        ("version: [", "could not be loaded"),
    ],
    ids=["duplicate-alias", "dangling-dependency", "duplicate-id", "malformed-yaml"],
)
def test_yaml_adapter_rejects_duplicate_aliases_dangling_dependencies_and_bad_yaml(
    tmp_path: Path, content: str, message: str
) -> None:
    catalogue = tmp_path / "catalogue.yaml"
    catalogue.write_text(content, encoding="utf-8")

    with pytest.raises(ConfigurationError, match=message):
        YamlArchitectureKnowledge(catalogue)
