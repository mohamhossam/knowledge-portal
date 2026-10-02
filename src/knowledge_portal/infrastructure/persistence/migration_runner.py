"""This application's PostgreSQL migrations, applied by platform-kernel's runner (ADR-0100)."""

from __future__ import annotations

from pathlib import Path

from smb_kernel.persistence import migrations as kernel_migrations

MIGRATIONS = Path(__file__).with_name("migrations")


def latest_packaged_migration() -> str:
    """The migration a fully upgraded database has applied last.

    Readiness compares against this rather than a hard-coded name, so adding a
    migration cannot leave probes accepting a schema that lacks it.
    """
    return kernel_migrations.latest_packaged_migration(MIGRATIONS)


def run_migrations(database_url: str) -> None:
    """Apply each packaged SQL migration exactly once."""
    kernel_migrations.run_migrations(database_url, MIGRATIONS)
