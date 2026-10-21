"""List, and with --apply delete, the stored files of catalogue documents no version reads.

A version is unused when no release holds it, it was never published and it was uploaded
at least --older-than-days ago. Its registration stays, so its title and lineage still answer;
only its stored file goes. Without --apply nothing is deleted.

    uv run python scripts/collect_unused_documents.py --older-than-days 90
    uv run python scripts/collect_unused_documents.py --older-than-days 90 --apply

It reads the same environment as the API (PERSISTENCE_PROVIDER, the database, storage).
"""

from __future__ import annotations

import argparse
from datetime import timedelta

from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import build_container


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--older-than-days", type=int, required=True)
    parser.add_argument("--apply", action="store_true", help="delete the files, not just list")
    arguments = parser.parse_args()
    if arguments.older_than_days < 0:
        parser.error("--older-than-days cannot be negative")
    container = build_container(Settings.from_env())
    try:
        retention = container.document_retention
        period = timedelta(days=arguments.older_than_days)
        now = container.clock.now()
        found = retention.collect(now, period) if arguments.apply else retention.unused(now, period)
        verb = "Deleted" if arguments.apply else "Would delete"
        for version in found:
            print(
                f"{verb} {version.id}  {version.filename}  uploaded {version.uploaded_at:%Y-%m-%d}"
            )
        print(f"{verb} {len(found)} stored file(s).")
    finally:
        container.close_resources()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
