"""The organisation catalogue survives restarts and serialises concurrent editors."""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest
from psycopg.types.json import Jsonb
from smb_kernel.persistence.connector import (
    DirectPostgresConnector,
)
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.domain.organisation.catalogue import (
    OrganisationConflictError,
    Person,
    Squad,
    SquadResource,
    SquadRole,
    ValueStream,
)
from knowledge_portal.infrastructure.persistence.migration_runner import (
    MIGRATIONS,
    run_migrations,
)
from knowledge_portal.infrastructure.persistence.postgres_organisation import (
    PostgresOrganisationRepository,
)

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
NOW = datetime(2026, 9, 29, 9, 0, tzinfo=UTC)
MIGRATION = MIGRATIONS / "202610101800_squad_resources.sql"


def test_organisation_catalogue_round_trips_and_rejects_stale_revisions() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    repository = PostgresOrganisationRepository(
        DirectPostgresConnector(DATABASE_URL), FixedClock(NOW)
    )
    suffix = f"{datetime.now(UTC).timestamp():.0f}"
    person_id, stream_id, squad_id = f"p-{suffix}", f"vs-{suffix}", f"sq-{suffix}"

    repository.change(
        lambda current: (
            current.put_person(Person(person_id, "Layla"), None)
            .put_value_stream(ValueStream(stream_id, f"Retail {suffix}", person_id), None)
            .put_squad(
                Squad(
                    squad_id,
                    "Sales",
                    stream_id,
                    person_id,
                    (SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, person_id),),
                ),
                None,
            )
        ),
        "amina",
        "seed",
        squad_id,
    )

    reloaded = PostgresOrganisationRepository(
        DirectPostgresConnector(DATABASE_URL), FixedClock(NOW)
    )
    squad = reloaded.load().squad(squad_id)
    assert squad.resources == (SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, person_id),)
    assert reloaded.audit(1)[0].subject_id == squad_id
    with pytest.raises(OrganisationConflictError):
        reloaded.change(
            lambda current: current.put_squad(Squad(squad_id, "Stale", stream_id), 9),
            "amina",
            "save_squad",
            squad_id,
        )
    assert reloaded.load().squad(squad_id).name == "Sales"


def test_squad_systems_stored_before_resources_become_system_contacts() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    connector = DirectPostgresConnector(DATABASE_URL)
    old = {
        "people": [{"id": "omar", "name": "Omar", "active": True, "revision": 1}],
        "value_streams": [{"id": "business", "name": "Business", "revision": 1}],
        "products": [
            {
                "id": "fibre",
                "value_stream_id": "business",
                "name": "Fibre",
                "system_ids": ["cwom"],
                "revision": 3,
            }
        ],
        "squads": [
            {
                "id": "fulfilment",
                "name": "Fulfilment",
                "value_stream_id": "business",
                "scrum_master_person_id": "omar",
                "systems": [
                    {"system_id": "cwom", "person_id": "omar"},
                    {"system_id": "wfm", "person_id": None},
                ],
                "revision": 2,
            },
            {"id": "empty", "name": "Empty", "value_stream_id": "business", "systems": []},
        ],
    }
    with connector.connection() as connection:
        row = connection.execute(
            "SELECT payload FROM organisation_catalogue WHERE catalogue_id = 1"
        ).fetchone()
        kept = None if row is None else row[0]
        connection.execute(
            "INSERT INTO organisation_catalogue (catalogue_id, payload) VALUES (1, %s) "
            "ON CONFLICT (catalogue_id) DO UPDATE SET payload = excluded.payload",
            (Jsonb(old),),
        )
        connection.execute(MIGRATION.read_text(encoding="utf-8"))
    try:
        catalogue = PostgresOrganisationRepository(connector, FixedClock(NOW)).load()
        squad = catalogue.squad("fulfilment")
        assert squad.resources == (
            SquadResource("cwom", SquadRole.SYSTEM_CONTACT, "omar"),
            SquadResource("wfm", SquadRole.SYSTEM_CONTACT),
        )
        assert squad.revision == 2
        assert catalogue.squad("empty").resources == ()
        product = catalogue.product("fibre")
        assert (product.offering_ids, product.portfolio_node_id, product.revision) == (
            (),
            None,
            3,
        )
    finally:
        with connector.connection() as connection:
            if kept is None:
                connection.execute("DELETE FROM organisation_catalogue WHERE catalogue_id = 1")
            else:
                connection.execute(
                    "UPDATE organisation_catalogue SET payload = %s WHERE catalogue_id = 1",
                    (Jsonb(kept),),
                )
