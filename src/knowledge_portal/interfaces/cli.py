"""Operator commands: ``knowledge-portal import --source-database-url URL [--verify]``.

`import` copies the knowledge-owned tables from a requirements database into
this service's database (DATABASE_URL, already migrated). It is safe to run
again: rows converge on the source. `--verify` then compares every table's
row count and content checksum, and fails on any difference;
`--verify-only` compares without copying.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.infrastructure.config.options import (
    ConfigurationError,
    PersistenceProvider,
)
from knowledge_portal.infrastructure.config.settings import PersistenceSettings
from knowledge_portal.infrastructure.persistence.knowledge_import import (
    import_knowledge,
    verify_knowledge,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="knowledge-portal")
    commands = parser.add_subparsers(dest="command", required=True)
    copy = commands.add_parser(
        "import", help="Copy the knowledge tables out of a requirements database."
    )
    copy.add_argument(
        "--source-database-url",
        required=True,
        help="The requirements database, at or past requirement-portal 202610021400.",
    )
    mode = copy.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true", help="Compare every table afterwards.")
    mode.add_argument("--verify-only", action="store_true", help="Compare without copying.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        settings = PersistenceSettings.from_env()
        if settings.provider is not PersistenceProvider.POSTGRES or settings.database_url is None:
            raise ConfigurationError(
                "The import writes to PostgreSQL: set PERSISTENCE_PROVIDER=postgres and "
                "DATABASE_URL."
            )
        source, target = arguments.source_database_url, settings.database_url
        if not arguments.verify_only:
            for result in import_knowledge(source, target):
                print(f"[import] {result.table}: {result.inserted} added, {result.updated} updated")
        if arguments.verify or arguments.verify_only:
            checks = verify_knowledge(source, target)
            for check in checks:
                verdict = "ok" if check.matches else "DIFFERS"
                print(
                    f"[verify] {check.table}: {verdict} "
                    f"(source {check.source_rows}, target {check.target_rows})"
                )
            if not all(check.matches for check in checks):
                print("[verify] The knowledge database differs from the source.", file=sys.stderr)
                return 1
    except (ConfigurationError, PersistenceError) as exc:
        print(f"[import] {exc}", file=sys.stderr)
        return 2 if isinstance(exc, ConfigurationError) else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
