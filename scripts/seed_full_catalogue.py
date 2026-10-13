"""Load the full Business Pro Plus catalogue into a running offline knowledge API. Development only.

It takes the catalogue file (catalogues/smb-architecture.yaml by default) the way a
maintainer would: a new draft, the file imported into it, the draft built and then
published, so it becomes the version in service. The service holds one draft at a
time: when another is in progress, nothing is loaded and the script says whose it is.

    uv run python -m knowledge_portal.interfaces.api.serve --port 8100   # fake, in memory
    uv run python scripts/seed_full_catalogue.py --api http://127.0.0.1:8100

With the sample work too, use `seed_demo.py --full-catalogue`, which loads it before its draft.

Requires IDENTITY_PROVIDER=fake. With --draft-only the version is built but not published.
On a server with real sign-in, import the same file from Versions in the portal instead.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts._catalogue_seed import (  # noqa: E402
    FULL_CATALOGUE_FILE,
    FULL_CATALOGUE_NAME,
    OWNER,
    one_draft_at_a_time,
    wait_for,
)

RELEASES = "/architecture-knowledge/releases"


def load(client: httpx.Client, file: Path, name: str, *, publish: bool) -> dict[str, Any]:
    client.get("/identity/me", headers=OWNER).raise_for_status()
    draft = client.post(RELEASES, json={"name": name}, headers=OWNER)
    draft.raise_for_status()
    base = f"{RELEASES}/{draft.json()['id']}"
    imported = client.post(
        f"{base}/catalogue-file",
        files={"file": (file.name, file.read_bytes(), "application/yaml")},
        data={"expected_revision": str(draft.json()["revision"])},
        headers=OWNER,
    )
    imported.raise_for_status()
    revision = imported.json()["revision"]
    client.post(
        f"{base}/build", json={"expected_revision": revision}, headers=OWNER
    ).raise_for_status()
    job = wait_for(
        client,
        f"{base}/build",
        OWNER,
        lambda job: job and job["status"] in {"succeeded", "failed"},
    )
    if job["status"] != "succeeded":
        raise RuntimeError(f"The build of {name!r} failed: {job}")
    if publish:
        client.post(
            f"{base}/publish",
            json={
                "expected_revision": revision,
                "rationale": f"The full catalogue from {file.name}.",
            },
            headers=OWNER,
        ).raise_for_status()
    release = client.get(base, headers=OWNER)
    release.raise_for_status()
    return dict(release.json())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default="http://127.0.0.1:8100")
    parser.add_argument("--file", type=Path, default=FULL_CATALOGUE_FILE)
    parser.add_argument("--name", default=FULL_CATALOGUE_NAME)
    parser.add_argument(
        "--draft-only", action="store_true", help="build the version but leave it a draft"
    )
    arguments = parser.parse_args()
    with httpx.Client(base_url=arguments.api, timeout=120) as client, one_draft_at_a_time():
        release = load(client, arguments.file, arguments.name, publish=not arguments.draft_only)
    print(
        f"{release['name']}: {release['status']}, {len(release['systems'])} systems, "
        f"{len(release['journeys'])} journeys, {len(release['products'])} products."
    )


if __name__ == "__main__":
    main()
