"""An accepted suggestion stays recorded on what it produced (ADR-0120)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock

import pytest
from pydantic import TypeAdapter

from knowledge_portal.application.ports.catalogue_candidates import ExtractionRun
from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import DecideCatalogueCandidate
from knowledge_portal.domain.architecture.acceptance import (
    recorded_acceptances,
    with_recorded_acceptances,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CatalogueCandidate,
)
from knowledge_portal.domain.architecture.diff import diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemComponent,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.provenance import AcceptedCitation, AcceptedFrom
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import (
    knowledge_from_yaml,
    seed_knowledge,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_catalogue_candidates import (
    InMemoryCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ExplorerReleaseResponse,
)

NOW = datetime(2026, 10, 21, 9, 0, tzinfo=UTC)
CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))


class _World:
    def __init__(self) -> None:
        self.repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
        self.manage = ManageArchitectureKnowledge(
            self.repository,
            CatalogueFileAdapter(),
            InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
            10_000_000,
            OfflineDocumentScanner(),
        )
        self.candidates = InMemoryCatalogueCandidates()
        self.decide = DecideCatalogueCandidate(
            self.manage, self.repository, self.candidates, InMemoryTransactionManager(RLock())
        )
        self.draft = self.manage.create_draft(MAINTAINER, "Next version")

    def propose(self, *contents: CandidateContent) -> None:
        run = ExtractionRun("r", self.draft.id, "doc", "model-x", "prompt-7", 2, (), NOW)
        self.candidates.replace_proposals(
            run,
            tuple(
                CatalogueCandidate(
                    f"c{number}",
                    self.draft.id,
                    "doc",
                    content,
                    (CandidateCitation("line 1", "quote"),),
                    "model-x",
                    "prompt-7",
                    NOW,
                )
                for number, content in enumerate(contents, start=1)
            ),
        )

    def accept(self, candidate_id: str, at: datetime = NOW) -> ArchitectureKnowledge:
        self.draft = self.decide.decide(
            self.draft.id, candidate_id, self.draft.revision, True, MAINTAINER, at
        )
        return self.draft


def _entry(candidate_id: str, at: datetime = NOW) -> AcceptedFrom:
    # Each suggestion here cites "line 1"; the draft holds no document, so none is named.
    return AcceptedFrom(
        candidate_id, "model-x", "prompt-7", "amina", at, (AcceptedCitation("line 1", "quote"),)
    )


def _system(release: ArchitectureKnowledge, system_id: str) -> SystemDefinition:
    return next(item for item in release.systems if item.id == system_id)


def _offering(release: ArchitectureKnowledge, offering_id: str) -> ProductOffering:
    return next(item for item in release.products if item.id == offering_id)


def test_a_new_system_records_the_suggestion_and_who_accepted_it() -> None:
    world = _World()
    world.propose(CandidateContent(CandidateKind.SYSTEM, "hub", name="Order Hub"))

    accepted = world.accept("c1")

    assert _system(accepted, "hub").accepted == (_entry("c1"),)


def test_each_suggestion_merged_into_an_entity_appends_in_order() -> None:
    world = _World()
    later = NOW + timedelta(minutes=5)
    world.propose(
        CandidateContent(CandidateKind.SYSTEM, "bcrm", name="BCRM", aliases=("Sales desk",)),
        CandidateContent(CandidateKind.CONSTRAINT, "bcrm", text="Closes at midnight"),
    )

    world.accept("c1")
    accepted = world.accept("c2", later)

    assert _system(accepted, "bcrm").accepted == (_entry("c1"), _entry("c2", later))


def test_only_the_suggestions_subject_records_it() -> None:
    world = _World()
    world.propose(
        CandidateContent(CandidateKind.COMPONENT, "bcrm", component_id="quotes", name="Quotes")
    )

    accepted = world.accept("c1")

    bcrm = _system(accepted, "bcrm")
    assert bcrm.component("quotes") is not None
    assert bcrm.component("quotes").accepted == (_entry("c1"),)  # type: ignore[union-attr]
    assert bcrm.accepted == ()


def test_a_suggestion_that_adds_nothing_records_nothing() -> None:
    world = _World()
    world.propose(CandidateContent(CandidateKind.SYSTEM, "bcrm", name="BCRM"))

    accepted = world.accept("c1")

    assert _system(accepted, "bcrm").accepted == ()


def test_an_offering_replaced_whole_keeps_what_it_recorded_before() -> None:
    world = _World()
    first = ProductOffering("pro", "Business Pro")
    world.propose(
        CandidateContent(CandidateKind.PRODUCT, "pro", name=first.name, product=first),
        CandidateContent(
            CandidateKind.PRODUCT,
            "pro",
            name="Business Pro Plus",
            product=replace(first, name="Business Pro Plus"),
        ),
    )

    world.accept("c1")
    accepted = world.accept("c2")

    assert _offering(accepted, "pro").accepted == (_entry("c1"), _entry("c2"))


def test_accepting_all_records_each_suggestion_on_its_own_subject() -> None:
    world = _World()
    world.propose(
        CandidateContent(CandidateKind.SYSTEM, "hub", name="Order Hub"),
        CandidateContent(CandidateKind.CONSTRAINT, "bcrm", text="Closes at midnight"),
    )

    accepted, remaining = world.decide.accept_all(
        world.draft.id, world.draft.revision, MAINTAINER, NOW
    )

    assert remaining == 0
    assert _system(accepted, "hub").accepted == (_entry("c1"),)
    assert _system(accepted, "bcrm").accepted == (_entry("c2"),)


def test_a_maintainers_edit_neither_adds_nor_removes_records() -> None:
    world = _World()
    world.propose(CandidateContent(CandidateKind.SYSTEM, "hub", name="Order Hub"))
    accepted = world.accept("c1")
    # An edit arrives as the editor sends it: without the record.
    edited = replace(_system(accepted, "hub"), description="Takes orders in.", accepted=())

    saved = world.manage.upsert_system(world.draft.id, accepted.revision, edited, MAINTAINER)

    assert _system(saved, "hub").description == "Takes orders in."
    assert _system(saved, "hub").accepted == (_entry("c1"),)
    assert saved.revision == accepted.revision + 1


def test_a_record_is_not_a_change_to_review() -> None:
    world = _World()
    world.propose(
        CandidateContent(CandidateKind.SYSTEM, "bcrm", name="BCRM", aliases=("Sales desk",))
    )
    before = world.draft
    accepted = world.accept("c1")
    only_recorded = replace(
        accepted,
        systems=tuple(
            replace(item, aliases=_system(before, "bcrm").aliases) if item.id == "bcrm" else item
            for item in accepted.systems
        ),
    )

    assert _system(only_recorded, "bcrm").accepted == (_entry("c1"),)
    assert diff_releases(before, only_recorded).changes == ()
    assert [change.key for change in diff_releases(before, accepted).changes] == ["bcrm"]


def test_an_acceptance_needs_a_time_with_a_timezone() -> None:
    with pytest.raises(InvalidKnowledgeError, match="timezone"):
        AcceptedFrom("c1", "m", "v", "amina", datetime(2026, 10, 21, 9, 0))
    with pytest.raises(InvalidKnowledgeError, match="Model"):
        AcceptedFrom("c1", " ", "v", "amina", NOW)


def _recorded_everywhere() -> ArchitectureKnowledge:
    """The committed catalogue with one acceptance on an entity of every kind that carries
    them, and two on one."""
    catalogue = knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))
    first, second, *rest = catalogue.systems
    capable = next(item for item in rest if item.capabilities)
    first = replace(first, components=(SystemComponent("quotes", "Quotes"),))
    release = replace(
        catalogue,
        systems=tuple(item if item.id != first.id else first for item in (first, second, *rest)),
        relationships=(SystemRelationship(first.id, second.id, "Looks customers up"),),
    )
    keys = (
        ("system", first.id),
        ("component", first.id, "quotes"),
        ("capability", capable.id, capable.capabilities[0].id),
        ("relationship", first.id, second.id, "unspecified"),
        ("landscape_domain", release.landscape_domains[0].id),
        ("offering", release.products[0].id),
        ("journey", release.journeys[0].id),
        ("channel", release.channels[0].id),
        ("concept", release.business_capabilities[0].id),
        ("term", release.vocabulary[0].id),
    )
    recorded: dict[tuple[str, ...], tuple[AcceptedFrom, ...]] = {
        key: (_entry(f"c{number}"),) for number, key in enumerate(keys, start=1)
    }
    recorded[("system", first.id)] = (_entry("c0", NOW - timedelta(days=1)), _entry("c1"))
    return with_recorded_acceptances(release, recorded)


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_carries_the_acceptances(
    file_format: CatalogueFileFormat,
) -> None:
    release = _recorded_everywhere()
    assert len(recorded_acceptances(release)) == 10

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert recorded_acceptances(read) == recorded_acceptances(release)


def test_a_file_from_before_acceptances_were_kept_reads_as_none_recorded() -> None:
    release = _recorded_everywhere()
    written = ADAPTER.write(CatalogueFileFormat.YAML, release).decode()
    older = written[: written.index("acceptances:")]

    read = ADAPTER.read(CatalogueFileFormat.YAML, older.encode())

    assert recorded_acceptances(read) == {}
    assert len(read.systems) == len(release.systems)


def test_an_acceptance_naming_nothing_in_the_file_is_left_out() -> None:
    text = (
        "systems:\n  - id: crm\n    name: CRM\n"
        "acceptances:\n"
        "  - entity: system\n    key: [gone]\n    candidate_id: c1\n    model: m\n"
        "    prompt_version: v\n    decided_by: amina\n    decided_at: 2026-10-21T09:00:00Z\n"
        "  - entity: system\n    key: [crm]\n    candidate_id: c2\n    model: m\n"
        "    prompt_version: v\n    decided_by: amina\n    decided_at: 2026-10-21T09:00:00Z\n"
    )

    read = ADAPTER.read(CatalogueFileFormat.YAML, text.encode())

    assert recorded_acceptances(read) == {
        ("system", "crm"): (AcceptedFrom("c2", "m", "v", "amina", NOW),)
    }


def test_a_malformed_acceptance_names_its_row() -> None:
    text = (
        "systems:\n  - id: crm\n    name: CRM\n"
        "acceptances:\n  - entity: system\n    key: [crm]\n    candidate_id: c1\n"
        "    model: m\n    prompt_version: v\n    decided_by: amina\n"
    )

    with pytest.raises(InvalidKnowledgeError, match="acceptances entry 1: decided_at"):
        ADAPTER.read(CatalogueFileFormat.YAML, text.encode())


def test_importing_a_file_into_a_draft_keeps_what_the_file_recorded() -> None:
    world = _World()
    file = ADAPTER.write(
        CatalogueFileFormat.JSON,
        with_recorded_acceptances(
            replace(
                world.draft,
                systems=(*world.draft.systems, SystemDefinition("hub", "Order Hub")),
            ),
            {("system", "hub"): (_entry("c9"),)},
        ),
    )

    imported = world.manage.apply_file_import(
        world.draft.id, world.draft.revision, "catalogue.json", file, MAINTAINER
    )

    assert _system(imported, "hub").accepted == (_entry("c9"),)


def test_the_explorer_reads_content_without_who_accepted_what() -> None:
    release = _recorded_everywhere()

    explored = ExplorerReleaseResponse.from_domain(release).model_dump(mode="json")

    def recorded(value: object) -> bool:
        if isinstance(value, dict):
            return bool(value.get("accepted")) or any(recorded(item) for item in value.values())
        if isinstance(value, list):
            return any(recorded(item) for item in value)
        return False

    assert not recorded(explored)


def test_a_stored_release_keeps_its_acceptances_and_older_ones_still_load() -> None:
    adapter: TypeAdapter[ArchitectureKnowledge] = TypeAdapter(ArchitectureKnowledge)
    release = _recorded_everywhere()
    stored = adapter.dump_python(release, mode="json")

    assert recorded_acceptances(adapter.validate_python(stored)) == recorded_acceptances(release)

    def forget(value: object) -> object:
        if isinstance(value, dict):
            return {key: forget(item) for key, item in value.items() if key != "accepted"}
        if isinstance(value, list):
            return [forget(item) for item in value]
        return value

    assert recorded_acceptances(adapter.validate_python(forget(stored))) == {}


def test_a_file_adds_its_history_to_what_the_draft_holds_and_removes_none() -> None:
    world = _World()
    world.propose(CandidateContent(CandidateKind.CONSTRAINT, "bcrm", text="Closes at midnight"))
    accepted = world.accept("c1")
    # Exported elsewhere, with its own history for BCRM; the draft's own stays first.
    elsewhere = with_recorded_acceptances(accepted, {("system", "bcrm"): (_entry("x7"),)})
    file = ADAPTER.write(CatalogueFileFormat.YAML, elsewhere)

    imported = world.manage.apply_file_import(
        world.draft.id, accepted.revision, "catalogue.yaml", file, MAINTAINER
    )
    assert _system(imported, "bcrm").accepted == (_entry("c1"), _entry("x7"))

    # A file that records nothing takes nothing away.
    again = world.manage.apply_file_import(
        world.draft.id,
        imported.revision,
        "catalogue.yaml",
        ADAPTER.write(
            CatalogueFileFormat.YAML,
            replace(
                imported, systems=tuple(replace(item, accepted=()) for item in imported.systems)
            ),
        ),
        MAINTAINER,
    )
    assert _system(again, "bcrm").accepted == (_entry("c1"), _entry("x7"))
