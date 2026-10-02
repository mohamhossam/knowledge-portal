"""Copy the knowledge-owned tables out of a requirements database (requirement-portal ADR-0099).

The source is a requirements database at or past `202610021400`, whose
knowledge tables the baseline migration reproduces exactly. Rows are copied
unchanged, ids included, in one target transaction:

- **Idempotent.** Each row is inserted or, when it differs, updated by
  primary key, so running again converges on the source. Rows that exist only
  in the target are kept, and verification reports them.
- **Consistent.** The source is read in one repeatable-read snapshot, so a
  system still in use yields a coherent copy.
- **Sequences follow.** Identity and serial counters move past the copied
  ids, so new audit rows and outbox events continue the numbering;
  requirement work's event cursor therefore stays valid.

`actor_profiles` is not copied. The directory holds only the knowledge admins
who sign in to this portal, so hand-over targets are always portal users;
documents keep their owners' snapshots either way.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import psycopg
from psycopg import sql

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.infrastructure.persistence.migration_runner import (
    latest_packaged_migration,
)

# The requirements migration after which every knowledge table has its final
# shape and attachments have left the library tables.
SOURCE_MIGRATION = "202610021400_knowledge_document_blobs.sql"

# Parents before children, so foreign keys hold at every step.
IMPORTED_TABLES: tuple[str, ...] = (
    "library_documents",
    "library_submissions",
    "library_chunks",
    "library_embedding_cache",
    "knowledge_document_blobs",
    "architecture_knowledge_releases",
    "architecture_knowledge_documents",
    "architecture_knowledge_indexes",
    "architecture_knowledge_chunks",
    "architecture_embedding_cache",
    "architecture_knowledge_audit",
    "architecture_catalogue_candidates",
    "architecture_extraction_runs",
    "architecture_sample_requirements",
    "architecture_jobs",
    "organisation_catalogue",
    "organisation_audit",
    "knowledge_events",
)


@dataclass(frozen=True)
class TableImport:
    table: str
    inserted: int
    updated: int


@dataclass(frozen=True)
class TableCheck:
    table: str
    source_rows: int
    target_rows: int
    matches: bool


@dataclass(frozen=True)
class _Shape:
    """A table's copied columns: every stored column, never a generated one."""

    columns: tuple[str, ...]
    key: tuple[str, ...]


def import_knowledge(
    source_url: str, target_url: str, tables: Sequence[str] = IMPORTED_TABLES
) -> tuple[TableImport, ...]:
    """Copy `tables` from the source into the migrated target, atomically."""
    try:
        with (
            psycopg.connect(source_url) as source,
            psycopg.connect(target_url) as target,
        ):
            _prepare(source, target)
            results = tuple(_copy(source, target, table) for table in tables)
            for table in tables:
                _advance_sequences(target, table)
            return results
    except psycopg.Error as exc:
        raise PersistenceError(f"Knowledge import failed: {exc}") from exc


def verify_knowledge(
    source_url: str, target_url: str, tables: Sequence[str] = IMPORTED_TABLES
) -> tuple[TableCheck, ...]:
    """Compare each table's row count and content checksum in source and target."""
    try:
        with (
            psycopg.connect(source_url) as source,
            psycopg.connect(target_url) as target,
        ):
            _prepare(source, target)
            checks: list[TableCheck] = []
            for table in tables:
                shape = _shape(target, table)
                source_count, source_sum = _fingerprint(source, table, shape)
                target_count, target_sum = _fingerprint(target, table, shape)
                checks.append(
                    TableCheck(
                        table,
                        source_count,
                        target_count,
                        source_count == target_count and source_sum == target_sum,
                    )
                )
            return tuple(checks)
    except psycopg.Error as exc:
        raise PersistenceError(f"Knowledge verification failed: {exc}") from exc


def _prepare(
    source: psycopg.Connection[tuple[object, ...]], target: psycopg.Connection[tuple[object, ...]]
) -> None:
    # One consistent view of a source that may still be in use; nothing written there.
    source.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    for connection in (source, target):
        # Checksums compare text renderings, so both sides render times alike.
        connection.execute("SET TIME ZONE 'UTC'")
    applied = _applied_migrations(source)
    if SOURCE_MIGRATION not in applied:
        raise PersistenceError(
            f"The source database is not a requirements database at {SOURCE_MIGRATION}; "
            "migrate it with requirement-portal first."
        )
    if latest_packaged_migration() not in _applied_migrations(target):
        raise PersistenceError(
            "The target database is not migrated; run "
            "`python -m knowledge_portal.infrastructure.persistence.migrate` first."
        )


def _applied_migrations(connection: psycopg.Connection[tuple[object, ...]]) -> set[str]:
    """The migrations a database records; none when it has never been migrated."""
    row = connection.execute("SELECT to_regclass('schema_migrations') IS NOT NULL").fetchone()
    if row is None or not row[0]:
        return set()
    return {str(item[0]) for item in connection.execute("SELECT version FROM schema_migrations")}


def _shape(connection: psycopg.Connection[tuple[object, ...]], table: str) -> _Shape:
    columns = tuple(
        str(row[0])
        for row in connection.execute(
            """
            SELECT attname FROM pg_attribute
            WHERE attrelid = to_regclass(%s) AND attnum > 0 AND NOT attisdropped
              AND attgenerated = ''
            ORDER BY attnum
            """,
            (table,),
        )
    )
    key = tuple(
        str(row[0])
        for row in connection.execute(
            """
            SELECT a.attname FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = to_regclass(%s) AND i.indisprimary
            ORDER BY array_position(i.indkey, a.attnum)
            """,
            (table,),
        )
    )
    if not columns or not key:
        raise PersistenceError(f"Table {table} is missing or has no primary key.")
    return _Shape(columns, key)


def _copy(
    source: psycopg.Connection[tuple[object, ...]],
    target: psycopg.Connection[tuple[object, ...]],
    table: str,
) -> TableImport:
    shape = _shape(target, table)
    columns = sql.SQL(", ").join(sql.Identifier(name) for name in shape.columns)
    staging = sql.Identifier(f"import_{table}")
    target.execute(
        sql.SQL(
            "CREATE TEMP TABLE {staging} ON COMMIT DROP AS "
            "SELECT {columns} FROM {table} WITH NO DATA"
        ).format(staging=staging, columns=columns, table=sql.Identifier(table))
    )
    # Binary COPY streams rows, large blobs and vectors included, without decoding them.
    with (
        source.cursor().copy(
            sql.SQL("COPY (SELECT {columns} FROM {table}) TO STDOUT (FORMAT BINARY)").format(
                columns=columns, table=sql.Identifier(table)
            )
        ) as out,
        target.cursor().copy(
            sql.SQL("COPY {staging} ({columns}) FROM STDIN (FORMAT BINARY)").format(
                staging=staging, columns=columns
            )
        ) as into,
    ):
        for chunk in out:
            into.write(chunk)
    rest = [name for name in shape.columns if name not in shape.key]
    changed = (
        sql.SQL("DO UPDATE SET {sets} WHERE ({current}) IS DISTINCT FROM ({incoming})").format(
            sets=sql.SQL(", ").join(
                sql.SQL("{name} = EXCLUDED.{name}").format(name=sql.Identifier(name))
                for name in rest
            ),
            current=sql.SQL(", ").join(
                sql.SQL("{table}.{name}").format(
                    table=sql.Identifier(table), name=sql.Identifier(name)
                )
                for name in rest
            ),
            incoming=sql.SQL(", ").join(
                sql.SQL("EXCLUDED.{name}").format(name=sql.Identifier(name)) for name in rest
            ),
        )
        if rest
        else sql.SQL("DO NOTHING")
    )
    rows = target.execute(
        sql.SQL(
            "INSERT INTO {table} ({columns}) OVERRIDING SYSTEM VALUE "
            "SELECT {columns} FROM {staging} ON CONFLICT ({key}) {changed} "
            "RETURNING (xmax = 0)"
        ).format(
            table=sql.Identifier(table),
            columns=columns,
            staging=staging,
            key=sql.SQL(", ").join(sql.Identifier(name) for name in shape.key),
            changed=changed,
        )
    ).fetchall()
    inserted = sum(1 for row in rows if row[0])
    return TableImport(table, inserted, len(rows) - inserted)


def _advance_sequences(target: psycopg.Connection[tuple[object, ...]], table: str) -> None:
    for (column,) in target.execute(
        """
        SELECT attname FROM pg_attribute
        WHERE attrelid = to_regclass(%s) AND attnum > 0 AND NOT attisdropped
          AND pg_get_serial_sequence(%s, attname) IS NOT NULL
        """,
        (table, table),
    ).fetchall():
        target.execute(
            sql.SQL(
                "SELECT setval(pg_get_serial_sequence({table_name}, {column_name}), "
                "COALESCE(MAX({column}), 1), MAX({column}) IS NOT NULL) FROM {table}"
            ).format(
                table_name=sql.Literal(table),
                column_name=sql.Literal(str(column)),
                column=sql.Identifier(str(column)),
                table=sql.Identifier(table),
            )
        )


def _fingerprint(
    connection: psycopg.Connection[tuple[object, ...]], table: str, shape: _Shape
) -> tuple[int, str]:
    row = connection.execute(
        sql.SQL(
            "SELECT count(*), COALESCE(md5(string_agg(md5(ROW({columns})::text), '' "
            "ORDER BY {key})), '') FROM {table}"
        ).format(
            columns=sql.SQL(", ").join(sql.Identifier(name) for name in shape.columns),
            key=sql.SQL(", ").join(sql.Identifier(name) for name in shape.key),
            table=sql.Identifier(table),
        )
    ).fetchone()
    if row is None or not isinstance(row[0], int):  # pragma: no cover - aggregate invariant
        raise PersistenceError(f"Could not fingerprint {table}.")
    return row[0], str(row[1])
