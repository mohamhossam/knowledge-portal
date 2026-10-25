"""A system's capabilities and components carry where they come from (review recommendation 4).

They are the facts that select systems (a capability's phrases and its concept, ADR-0114),
so they carry a confidence and a source like every other catalogue fact (ADR-0095).
"""

from __future__ import annotations

from dataclasses import replace

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateKind,
    apply_candidate,
)
from knowledge_portal.domain.architecture.citations import unregistered_citations
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeCapability,
    KnowledgeReleaseStatus,
    SystemComponent,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    KnowledgeCapabilitySchema,
    SystemComponentSchema,
)
from tests.catalogue_seed import seed_knowledge

ADAPTER = CatalogueFileAdapter()

TRACKING = KnowledgeCapability(
    "tracking",
    "Order tracking",
    ("track orders",),
    component_id="milestones",
    confidence=SourceConfidence.CONFIRMED,
    source="SDD v2.3 · §4.1",
)
MILESTONES = SystemComponent(
    "milestones",
    "Milestone tracker",
    confidence=SourceConfidence.INFERRED,
    source="Integration design · Figure 3",
)


def _with_sourced_system(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    system = SystemDefinition(
        "tracker", "Tracker", capabilities=(TRACKING,), components=(MILESTONES,)
    )
    return replace(release, systems=(*release.systems, system))


def _tracker(release: ArchitectureKnowledge) -> SystemDefinition:
    return next(item for item in release.systems if item.id == "tracker")


def test_a_capability_and_a_component_take_a_confidence_as_written_and_a_source() -> None:
    capability = KnowledgeCapability("c", "Billing", ("bill",), confidence=" Gap ", source=" BRD ")  # type: ignore[arg-type]
    component = SystemComponent("m", "Rating", confidence="confirmed")  # type: ignore[arg-type]

    assert (capability.confidence, capability.source) == (SourceConfidence.GAP, "BRD")
    assert component.confidence is SourceConfidence.CONFIRMED
    # Unsaid stays unsaid: neither is required.
    assert KnowledgeCapability("c", "Billing", ("bill",)).confidence is None


@pytest.mark.parametrize(
    "build",
    [
        lambda: KnowledgeCapability("c", "Billing", ("bill",), confidence="sure"),  # type: ignore[arg-type]
        lambda: SystemComponent("m", "Rating", confidence="likely"),  # type: ignore[arg-type]
        lambda: KnowledgeCapability("c", "Billing", ("bill",), source="   "),
        lambda: SystemComponent("m", "Rating", source=""),
    ],
)
def test_an_unknown_confidence_or_a_blank_source_is_refused(build: object) -> None:
    with pytest.raises(InvalidKnowledgeError):
        build()  # type: ignore[operator]


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_them(file_format: CatalogueFileFormat) -> None:
    release = _with_sourced_system(seed_knowledge())

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    tracker = next(item for item in content.systems if item.id == "tracker")
    assert tracker.capabilities == (TRACKING,)
    assert tracker.components == (MILESTONES,)


def test_the_api_carries_them_both_ways() -> None:
    assert KnowledgeCapabilitySchema.from_domain(TRACKING).to_domain() == TRACKING
    assert SystemComponentSchema.from_domain(MILESTONES).to_domain() == MILESTONES
    sent = KnowledgeCapabilitySchema.model_validate(
        {
            "id": "c",
            "name": "Billing",
            "triggers": ["bill"],
            "confidence": "inferred",
            "source": "BRD",
        }
    )
    assert sent.to_domain().source == "BRD"


def test_the_version_diff_names_a_changed_confidence_or_source() -> None:
    base = _with_sourced_system(seed_knowledge())
    tracker = _tracker(base)
    draft = replace(
        base,
        systems=tuple(
            replace(
                item,
                capabilities=(replace(TRACKING, confidence=SourceConfidence.GAP),),
                components=(replace(MILESTONES, source="Integration design · Figure 4"),),
            )
            if item is tracker
            else item
            for item in base.systems
        ),
    )

    changes = {(item.item, item.key): item for item in diff_releases(base, draft).changes}

    capability = changes[(ChangedItem.CAPABILITY, "tracker/tracking")]
    component = changes[(ChangedItem.COMPONENT, "tracker/milestones")]
    assert (capability.change, capability.fields) == (ChangeKind.CHANGED, ("confidence",))
    assert (component.change, component.fields) == (ChangeKind.CHANGED, ("source",))


def test_an_accepted_suggestion_keeps_the_source_a_maintainer_gave() -> None:
    release = replace(_with_sourced_system(seed_knowledge()), status=KnowledgeReleaseStatus.DRAFT)

    merged = apply_candidate(
        CandidateContent(
            CandidateKind.CAPABILITY,
            "tracker",
            name="Order tracking",
            capability_id="tracking",
            triggers=("where is my order",),
        ),
        release,
    )

    (capability,) = _tracker(merged).capabilities
    assert set(capability.triggers) == {"track orders", "where is my order"}
    assert (capability.confidence, capability.source) == (
        SourceConfidence.CONFIRMED,
        "SDD v2.3 · §4.1",
    )


def test_the_check_step_lists_a_source_they_cite_that_the_register_lacks() -> None:
    release = _with_sourced_system(seed_knowledge())

    cited = {item.cited for item in unregistered_citations(release)}

    assert {"SDD v2.3", "Integration design"} <= cited
