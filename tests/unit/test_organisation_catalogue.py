"""Value streams own products and squads; squads staff architecture systems with people."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.organisation_catalogue import (
    ManageOrganisationCatalogue,
)
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    OrderType,
    ProductOffering,
)
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.domain.organisation.catalogue import (
    InvalidOrganisationError,
    OrganisationCatalogue,
    OrganisationConflictError,
    Person,
    Product,
    ReleaseReferences,
    Squad,
    SquadResource,
    SquadRole,
    ValueStream,
    check_references,
)
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import (
    InMemoryEvidenceIndex,
)
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.reasoning import FakeArchitectureReasoner
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)

MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))
READER = Actor("ravi", frozenset({"knowledge_reader"}))
OWNER_HEADERS = {"X-Fake-Actor-Id": "fake-owner"}
READER_HEADERS = {"X-Fake-Actor-Id": "fake-reviewer"}
NOW = datetime(2026, 9, 29, 9, 0, tzinfo=UTC)


def _catalogue() -> OrganisationCatalogue:
    return (
        OrganisationCatalogue()
        .put_person(Person("layla", "Layla Lead", "layla@example.test", "Delivery"), None)
        .put_person(Person("sam", "Sam Scrum", team="Agile office"), None)
        .put_person(Person("bea", "Bea Backend", team="CRM team"), None)
        .put_value_stream(ValueStream("retail", "Retail", "layla"), None)
        .put_product(Product("ordering", "retail", "Ordering", system_ids=("bcrm",)), None)
        .put_squad(
            Squad(
                "sales",
                "Sales squad",
                "retail",
                "sam",
                (
                    SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, "bea"),
                    SquadResource("gis", SquadRole.SYSTEM_CONTACT),
                ),
            ),
            None,
        )
    )


def test_a_system_can_sit_in_several_squads_with_its_value_streams_and_products() -> None:
    catalogue = _catalogue().put_squad(
        Squad(
            "care",
            "Care squad",
            "retail",
            None,
            (SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, "bea"),),
        ),
        None,
    )

    owned = catalogue.ownership("bcrm")

    assert [item.name for item in owned.squads] == ["Care squad", "Sales squad"]
    assert [item.name for item in owned.products] == ["Ordering"]
    assert [item.name for item in owned.value_streams] == ["Retail"]
    assert catalogue.ownership("unknown").squads == ()


def test_invariants_protect_references_names_and_people() -> None:
    catalogue = _catalogue()

    with pytest.raises(InvalidOrganisationError, match="Unknown value stream"):
        catalogue.put_squad(Squad("orphan", "Orphan", "missing"), None)
    with pytest.raises(InvalidOrganisationError, match="already used"):
        catalogue.put_squad(Squad("again", "sales SQUAD", "retail"), None)
    with pytest.raises(InvalidOrganisationError, match="same seat on x twice"):
        Squad(
            "dup",
            "Dup",
            "retail",
            None,
            (
                SquadResource("x", SquadRole.SYSTEM_CONTACT),
                SquadResource("x", SquadRole.SYSTEM_CONTACT),
            ),
        )
    with pytest.raises(InvalidOrganisationError, match="inactive"):
        catalogue.put_person(Person("bea", "Bea Backend", active=False), 1)
    with pytest.raises(InvalidOrganisationError, match="not a known person"):
        catalogue.put_value_stream(ValueStream("b2b", "B2B", "nobody"), None)
    with pytest.raises(InvalidOrganisationError, match="more than one person"):
        catalogue.put_person(Person("dupe", "Dupe", "LAYLA@example.test"), None)
    with pytest.raises(InvalidOrganisationError, match="products and squads first"):
        catalogue.remove_value_stream("retail", 1)


def test_a_squad_holds_many_resources_on_a_system_one_seat_each() -> None:
    developer = SquadResource("bcrm", SquadRole.DEVELOPER, "layla")
    squad = Squad(
        "sales",
        "Sales squad",
        "retail",
        "sam",
        (
            SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, "bea"),
            developer,
            SquadResource("bcrm", SquadRole.TESTER),
            SquadResource("bcrm", SquadRole.DEVELOPER),
            SquadResource("gis", SquadRole.SYSTEM_CONTACT),
        ),
    )

    catalogue = _catalogue().put_squad(squad, 1)

    assert catalogue.squad("sales").system_ids == ("bcrm", "gis")
    assert [item.name for item in catalogue.ownership("bcrm").squads] == ["Sales squad"]
    with pytest.raises(InvalidOrganisationError, match="same seat on bcrm twice"):
        Squad("dup", "Dup", "retail", None, (developer, replace(developer, role=SquadRole.TESTER)))
    with pytest.raises(InvalidOrganisationError, match="same seat on bcrm twice"):
        Squad(
            "dup",
            "Dup",
            "retail",
            None,
            (SquadResource("bcrm", SquadRole.TESTER), SquadResource("bcrm", SquadRole.TESTER)),
        )
    # The same person may hold a seat on one capability of the system as well.
    Squad("caps", "Caps", "retail", None, (developer, replace(developer, capability_id="billing")))
    with pytest.raises(InvalidOrganisationError, match="Unknown squad role"):
        SquadResource("bcrm", "juggler")  # type: ignore[arg-type]
    with pytest.raises(InvalidOrganisationError, match="not a known person"):
        _catalogue().put_squad(
            Squad("x", "X", "retail", None, (SquadResource("bcrm", SquadRole.TESTER, "ghost"),)),
            None,
        )


def test_a_product_lists_each_offering_once_and_its_portfolio_node() -> None:
    product = Product(
        "ordering", "retail", "Ordering", offering_ids=(" bpp ",), portfolio_node_id=" smb "
    )

    assert (product.offering_ids, product.portfolio_node_id) == (("bpp",), "smb")
    with pytest.raises(InvalidOrganisationError, match="each offering once"):
        Product("ordering", "retail", "Ordering", offering_ids=("bpp", "bpp"))


def test_references_flag_what_a_release_retired_and_products_out_of_step() -> None:
    catalogue = (
        _catalogue()
        .put_product(
            Product(
                "fibre",
                "retail",
                "Fibre",
                system_ids=("bcrm", "cwom"),
                offering_ids=("fibre-offer", "retired-offer"),
                portfolio_node_id="old-node",
            ),
            None,
        )
        .put_product(
            Product("linked", "retail", "Linked", system_ids=("bcrm",), portfolio_node_id="smb"),
            None,
        )
    )
    release = ReleaseReferences(
        system_ids={"bcrm", "cwom", "bscs"},
        offering_systems={"fibre-offer": {"cwom", "bscs"}},
        portfolio_node_ids={"smb"},
    )

    flags = {(item.subject, item.subject_id): item for item in check_references(catalogue, release)}

    # Sales squad staffs gis, which the release no longer has.
    assert flags["squad", "sales"].retired_system_ids == ("gis",)
    fibre = flags["product", "fibre"]
    assert fibre.retired_offering_ids == ("retired-offer",)
    assert fibre.retired_portfolio_node_id == "old-node"
    assert fibre.systems_missing == ("bscs",)
    assert fibre.systems_unexplained == ("bcrm",)
    assert not fibre.unlinked
    # Ordering names no offering and no portfolio node.
    assert flags["product", "ordering"].unlinked
    assert ("product", "linked") not in flags


def test_records_are_revision_checked() -> None:
    catalogue = _catalogue()

    updated = catalogue.put_squad(Squad("sales", "Sales and service", "retail"), 1)

    assert updated.squad("sales").revision == 2
    with pytest.raises(OrganisationConflictError, match="changed"):
        updated.put_squad(Squad("sales", "Stale", "retail"), 1)
    with pytest.raises(OrganisationConflictError, match="already exists"):
        updated.put_squad(Squad("sales", "New", "retail"), None)
    assert updated.remove_squad("sales", 2).squads == ()


def _manage() -> ManageOrganisationCatalogue:
    return ManageOrganisationCatalogue(
        InMemoryOrganisationRepository(FixedClock(NOW)),
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
    )


def test_links_must_name_active_catalogue_systems_and_readers_do_not_see_emails() -> None:
    manage = _manage()
    manage.save_person(Person("layla", "Layla Lead", "layla@example.test"), None, MAINTAINER)
    manage.save_value_stream(ValueStream("retail", "Retail", "layla"), None, MAINTAINER)

    with pytest.raises(InvalidOrganisationError, match="not in the active architecture"):
        manage.save_squad(
            Squad(
                "sales",
                "Sales",
                "retail",
                None,
                (SquadResource("made-up", SquadRole.SYSTEM_CONTACT),),
            ),
            None,
            MAINTAINER,
        )
    with pytest.raises(AuthorizationDeniedError):
        manage.save_person(Person("x", "X"), None, READER)

    manage.save_squad(
        Squad("sales", "Sales", "retail", None, (SquadResource("bcrm", SquadRole.SYSTEM_CONTACT),)),
        None,
        MAINTAINER,
    )

    assert manage.view(READER).person("layla").email is None
    assert manage.view(MAINTAINER).person("layla").email == "layla@example.test"
    assert [event.action for event in manage.audit(MAINTAINER)] == [
        "save_squad",
        "save_value_stream",
        "save_person",
    ]


def test_products_link_offerings_and_portfolio_nodes_in_service_and_are_flagged() -> None:
    line = OfferingComponent(
        "line",
        "Fibre line",
        responsibilities=(ComponentResponsibility("cwom", "Fulfils", "Builds the line."),),
    )
    release = replace(
        seed_knowledge(),
        portfolio=(PortfolioNode("smb", "SMB", "Segment"),),
        products=(ProductOffering("fibre", "Business fibre", components=(line,)),),
        channels=(Channel("b2b", "B2B web", entry_system_id="b2b-web"),),
    )
    release = replace(
        release,
        products=(
            replace(
                release.products[0],
                order_types=(OrderType("NEW", "New connection", channels=("b2b",)),),
            ),
        ),
    )
    manage = ManageOrganisationCatalogue(
        InMemoryOrganisationRepository(FixedClock(NOW)),
        InMemoryArchitectureKnowledgeRepository(release),
    )
    manage.save_value_stream(ValueStream("retail", "Retail"), None, MAINTAINER)

    with pytest.raises(InvalidOrganisationError, match="Offerings made-up are not"):
        manage.save_product(
            Product("p", "retail", "P", offering_ids=("made-up",)), None, MAINTAINER
        )
    with pytest.raises(InvalidOrganisationError, match="Portfolio nodes gone are not"):
        manage.save_product(Product("p", "retail", "P", portfolio_node_id="gone"), None, MAINTAINER)
    manage.save_product(
        Product(
            "p",
            "retail",
            "Fibre ordering",
            system_ids=("cwom", "bscs"),
            offering_ids=("fibre",),
            portfolio_node_id="smb",
        ),
        None,
        MAINTAINER,
    )

    (flag,) = manage.references(READER)
    # The offering names cwom through its component and b2b-web through its channel.
    assert (flag.subject_id, flag.systems_missing, flag.systems_unexplained) == (
        "p",
        ("b2b-web",),
        ("bscs",),
    )


def test_mapping_records_squads_value_streams_and_products_from_the_organisation() -> None:
    releases = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    organisation = InMemoryOrganisationRepository(FixedClock(NOW))
    organisation.change(lambda _: _catalogue(), "amina", "seed", "all")
    resolver = ResolveArchitectureKnowledge(
        releases,
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        FakeArchitectureReasoner(),
        YamlArchitectureKnowledge(default_knowledge_path()),
        organisation,
    )

    result = resolver.match(
        ArchitectureQuery(text=("Update customers",), declared_systems=("BCRM", "CPP"))
    )

    by_id = {item.id: item for item in result.systems}
    assert [item.name for item in by_id["bcrm"].squads] == ["Sales squad"]
    assert [item.name for item in by_id["bcrm"].value_streams] == ["Retail"]
    assert [item.name for item in by_id["bcrm"].products] == ["Ordering"]
    declared = next(item for item in result.systems if not item.catalogued)
    assert declared.squads == ()


def test_organisation_api_round_trip_and_permissions(client: TestClient) -> None:
    person = client.post(
        "/organisation/people",
        json={"person": {"id": "layla", "name": "Layla Lead", "email": "layla@example.test"}},
        headers=OWNER_HEADERS,
    )
    assert person.status_code == 201
    stream = client.post(
        "/organisation/value-streams",
        json={"value_stream": {"id": "retail", "name": "Retail", "lead_person_id": "layla"}},
        headers=OWNER_HEADERS,
    )
    assert stream.status_code == 201
    squad = client.post(
        "/organisation/squads",
        json={
            "squad": {
                "id": "sales",
                "name": "Sales squad",
                "value_stream_id": "retail",
                "scrum_master_person_id": "layla",
                "resources": [
                    {"system_id": "bcrm", "role": "system_contact", "person_id": "layla"},
                    {"system_id": "bcrm", "role": "developer"},
                ],
            }
        },
        headers=OWNER_HEADERS,
    )
    assert squad.status_code == 201

    stale = client.put(
        "/organisation/squads/sales",
        json={
            "expected_revision": 7,
            "squad": {"id": "sales", "name": "Renamed", "value_stream_id": "retail"},
        },
        headers=OWNER_HEADERS,
    )
    assert stale.status_code == 409
    mismatched = client.put(
        "/organisation/squads/other",
        json={
            "expected_revision": 1,
            "squad": {"id": "sales", "name": "Renamed", "value_stream_id": "retail"},
        },
        headers=OWNER_HEADERS,
    )
    assert mismatched.status_code == 422

    read = client.get("/organisation", headers=READER_HEADERS)
    assert read.status_code == 200
    assert read.json()["people"][0]["email"] is None
    assert read.json()["squads"][0]["resources"] == [
        {"system_id": "bcrm", "role": "system_contact", "person_id": "layla"},
        {"system_id": "bcrm", "role": "developer", "person_id": None},
    ]
    references = client.get("/organisation/references", headers=READER_HEADERS)
    assert references.status_code == 200
    assert references.json() == []
    ownership = client.get("/organisation/systems/bcrm/ownership", headers=READER_HEADERS)
    assert [item["name"] for item in ownership.json()["squads"]] == ["Sales squad"]
    assert (
        client.post(
            "/organisation/people",
            json={"person": {"id": "x", "name": "X"}},
            headers=READER_HEADERS,
        ).status_code
        == 403
    )
    removed = client.request(
        "DELETE",
        "/organisation/squads/sales",
        json={"expected_revision": 1},
        headers=OWNER_HEADERS,
    )
    assert removed.status_code == 200
    assert removed.json()["squads"] == []
