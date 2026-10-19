"""The catalogue lab's bundled sample is the committed catalogue file, as the API sends it.

`frontend/src/catalogue/model/fixtures/smb-release.json` is written by
`scripts/dump_catalogue_fixture.py`. A change to the catalogue file, or to the read schema,
that is not written into the sample fails here, not in front of a person comparing it.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    KnowledgeReleaseResponse,
)

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "dump_catalogue_fixture.py"
FIXTURE = ROOT / "frontend" / "src" / "catalogue" / "model" / "fixtures" / "smb-release.json"


def test_the_sample_is_the_committed_catalogue_file_as_written_today() -> None:
    checked = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"], capture_output=True, text=True, check=False
    )

    assert checked.returncode == 0, checked.stderr or checked.stdout


def test_the_sample_reads_as_a_catalogue_version_of_the_api() -> None:
    release = KnowledgeReleaseResponse.model_validate(json.loads(FIXTURE.read_text("utf-8")))

    assert release.id == "smb-architecture-draft"
    assert release.journeys, "the sample has journeys to draw"
    # The derived flows the lab draws ride along, per channel too.
    assert all(journey.edges for journey in release.journeys)
    assert any(journey.channel_edges for journey in release.journeys)
