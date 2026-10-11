"""Change requests from Requirement AI: kept as delivered, read into a draft by a person
(requirement-portal ADR-0101, step 7).

requirement-portal sends an approved backlog when its final approval is recorded. It is
kept once per approval. A knowledge admin then reads it into the draft (starting one if
none is open), where each approved feature becomes a suggested open question on the
offering it names, or dismisses it. When the decided product impact is a new offering, the
offering and journey the assessment drafted (ontology plan Phase 9) become two suggestions
as well. The reading is fixed rules, not a model: what the
approved backlog says, matched to the draft by id, then by name.

When the Epic closes, requirement-portal sends what it delivered (ontology plan Phase 7),
kept once per closure as a catalogue change. Reading one suggests that each delivered
system realises the concepts the requirement needed and the catalogue lacked, and asks
which component of the offering now delivers them. A removed Epic withdraws one still
waiting, and a later closure of the same Epic replaces it. Counted per release, the
closures say how often the systems an assessment predicted were the ones delivered.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
    ExtractionRun,
)
from knowledge_portal.application.ports.change_requests import (
    ChangeRequestConflictError,
    ChangeRequestInboxPort,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    CatalogueCandidate,
    ChangeRequestCitation,
    classify,
    draft_contents,
    find_concept,
    find_system,
)
from knowledge_portal.domain.architecture.change_requests import (
    ChangeRequestKind,
    ChangeRequestStateError,
    DeliveredChange,
    DeliveredChangeKind,
    DeliveryTrace,
    IncomingChangeRequest,
    IncomingFeature,
    IncomingStatus,
    ReleaseDeliveries,
    RequirementTrace,
    change_request_id,
    delivery_summaries,
)
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.drafts import OfferingDraft
from knowledge_portal.domain.architecture.governance import OpenQuestion
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.products import (
    ProductOffering,
    find_offering,
    find_order_type,
)

# Who read it, in the place a model's name goes: fixed rules over the approved backlog.
READER = "requirement-ai-export"
READER_VERSION = "export-1"


class ChangeRequestNotFoundError(Exception):
    """No change request has that id."""


@dataclass(frozen=True)
class DeliveredBacklog:
    """An approved backlog as requirement-portal sends it, before it has an id here."""

    approval_id: str
    subject_fingerprint: str
    title: str
    trace: RequirementTrace
    features: tuple[IncomingFeature, ...]
    reason: str | None = None
    # The offering and journey drafted for a new-offering verdict (ontology plan Phase 9).
    draft: OfferingDraft | None = None


def _most_named(backlog: DeliveredBacklog) -> str:
    """The offering the backlog names most, as it names it; the epic when it names none."""
    names = Counter(
        context.product_name or context.product_id or ""
        for feature in backlog.features
        for context in feature.contexts
    )
    named = [name for name, _ in names.most_common() if name]
    return named[0] if named else backlog.trace.epic_name


class ReceiveChangeRequest:
    """Behind the internal route requirement-portal delivers to."""

    def __init__(self, inbox: ChangeRequestInboxPort, clock: ClockPort) -> None:
        self._inbox = inbox
        self._clock = clock

    def execute(self, backlog: DeliveredBacklog) -> tuple[IncomingChangeRequest, bool]:
        """Keep it once per approval; returns it and whether it is new."""
        now = self._clock.now()
        day = (backlog.trace.approved_at or now).date()
        item = IncomingChangeRequest(
            id=change_request_id(day, _most_named(backlog), self._inbox.ids()),
            approval_id=backlog.approval_id,
            subject_fingerprint=backlog.subject_fingerprint,
            title=backlog.title,
            trace=backlog.trace,
            features=backlog.features,
            received_at=now,
            reason=backlog.reason,
            draft=backlog.draft,
        )
        return self._inbox.receive(item)


@dataclass(frozen=True)
class DeliveredEpic:
    """What a closed Epic delivered, as requirement-portal sends it, before it has an id here.

    The features are the delivered ones; those not delivered are in the trace.
    """

    delivery_id: str
    subject_fingerprint: str
    title: str
    trace: RequirementTrace
    features: tuple[IncomingFeature, ...]
    delivery: DeliveryTrace
    reason: str | None = None


def delivery_approval(delivery_id: str) -> str:
    """The inbox keeps each item once by this key; a closure's is its delivery id."""
    return f"delivery:{delivery_id}"


class ReceiveDelivery:
    """Behind the internal route requirement-portal sends closed and removed Epics to."""

    def __init__(self, inbox: ChangeRequestInboxPort, clock: ClockPort) -> None:
        self._inbox = inbox
        self._clock = clock

    def closed(self, delivered: DeliveredEpic) -> tuple[IncomingChangeRequest, bool]:
        """Keep it once per closure; returns it and whether it is new. A new closure replaces
        one of the same Epic still waiting, so the Epic is counted once."""
        now = self._clock.now()
        name = delivered.delivery.offering_name or delivered.trace.epic_name
        item = IncomingChangeRequest(
            id=change_request_id(delivered.delivery.closed_at.date(), name, self._inbox.ids()),
            approval_id=delivery_approval(delivered.delivery_id),
            subject_fingerprint=delivered.subject_fingerprint,
            title=delivered.title,
            trace=delivered.trace,
            features=delivered.features,
            received_at=now,
            reason=delivered.reason,
            kind=ChangeRequestKind.CATALOGUE_CHANGE,
            delivery=delivered.delivery,
        )
        kept, created = self._inbox.receive(item)
        if created:
            self._close_earlier(kept, "A later closure of its Epic replaced it.")
        return kept, created

    def removed(self, requirement_id: str, epic_external_id: str) -> tuple[str, ...]:
        """Withdraw the Epic's catalogue changes still waiting; returns their ids."""
        withdrawn: list[str] = []
        now = self._clock.now()
        for item in self._waiting(requirement_id, epic_external_id):
            try:
                self._inbox.save(item.withdraw(now), item.status)
            except ChangeRequestConflictError:
                # Read or dismissed meanwhile: a person has it now.
                continue
            withdrawn.append(item.id)
        return tuple(withdrawn)

    def _close_earlier(self, kept: IncomingChangeRequest, reason: str) -> None:
        delivery = kept.delivery
        if delivery is None:
            return
        now = self._clock.now()
        for item in self._waiting(kept.trace.requirement_id, delivery.epic_external_id):
            if item.id == kept.id:
                continue
            try:
                self._inbox.save(item.withdraw(now, reason), item.status)
            except ChangeRequestConflictError:
                continue

    def _waiting(
        self, requirement_id: str, epic_external_id: str
    ) -> tuple[IncomingChangeRequest, ...]:
        return tuple(
            item
            for item in self._inbox.list()
            if item.delivery is not None
            and item.status is IncomingStatus.WAITING
            and item.trace.requirement_id == requirement_id
            and item.delivery.epic_external_id == epic_external_id
        )


class ReadDeliverySummaries:
    """How often the systems an assessment predicted were the ones delivered, per release."""

    def __init__(self, inbox: ChangeRequestInboxPort) -> None:
        self._inbox = inbox

    def execute(self, actor: Actor) -> tuple[ReleaseDeliveries, ...]:
        require_maintainer(actor)
        return delivery_summaries(self._inbox.list())


class ListChangeRequests:
    def __init__(self, inbox: ChangeRequestInboxPort) -> None:
        self._inbox = inbox

    def execute(self, actor: Actor) -> tuple[IncomingChangeRequest, ...]:
        require_maintainer(actor)
        return self._inbox.list()


def _offering_named(
    release: ArchitectureKnowledge, *references: str | None
) -> ProductOffering | None:
    for reference in references:
        if reference:
            found = find_offering(release.products, reference)
            if found is not None:
                return found
    return None


def read_change_request(
    incoming: IncomingChangeRequest,
    release: ArchitectureKnowledge,
    at: datetime,
    active_id: str | None = None,
) -> tuple[tuple[CatalogueCandidate, ...], tuple[str, ...]]:
    """The questions a change request puts to the draft, and what the reading could not match.

    The drafted offering and journey first, when the decided product impact sent them, then
    one question for each approved feature and each offering it names, asked for the order
    types it names. A question already in the draft as it is now is left out. A catalogue
    change is read as `read_delivery` says.
    """
    if incoming.delivery is not None:
        return read_delivery(incoming, incoming.delivery, release, at, active_id)
    warnings: list[str] = []
    candidates: list[CatalogueCandidate] = []
    if incoming.draft is not None:
        candidates.extend(_drafted(incoming, incoming.draft, release, at, warnings))
    present = 0
    trace = incoming.trace
    if trace.knowledge_version and active_id and trace.knowledge_version != active_id:
        warnings.append(
            f"The requirement was mapped against catalogue version {trace.knowledge_version}, "
            "not the version in service; check the systems it names."
        )
    for feature in sorted(incoming.features, key=lambda item: item.sequence):
        groups: dict[str, tuple[ProductOffering | None, str, list[str]]] = {}
        for context in feature.contexts:
            offering = _offering_named(release, context.product_id, context.product_name)
            written = context.product_name or context.product_id or ""
            key = offering.id if offering else written.casefold()
            group = groups.setdefault(key, (offering, written, []))
            if context.order_type and context.order_type not in group[2]:
                group[2].append(context.order_type)
        if not groups:
            warnings.append(
                f"{feature.id}: its mapping names no offering, so “{feature.name}” asks "
                "nothing of the catalogue."
            )
            continue
        systems = [
            find_system(release, item.id or "") or find_system(release, item.name)
            for item in feature.systems
        ]
        unmatched = [
            item.name for item, found in zip(feature.systems, systems, strict=True) if found is None
        ]
        if unmatched:
            warnings.append(
                f"{feature.id}: {', '.join(unmatched)} {'is' if len(unmatched) == 1 else 'are'} "
                "not in the draft, so the question names "
                f"{'it' if len(unmatched) == 1 else 'them'} as the mapping wrote "
                f"{'it' if len(unmatched) == 1 else 'them'}."
            )
        names = list(
            dict.fromkeys(
                found.name if found else item.name
                for item, found in zip(feature.systems, systems, strict=True)
            )
        )
        impact = f"Systems the mapping names: {', '.join(names)}." if names else None
        for offering, written, order_names in groups.values():
            codes: list[str] = []
            if offering is None:
                warnings.append(
                    f"{feature.id}: the offering {written!r} is not in the draft; its question "
                    "waits for it."
                )
                # Kept as the requirement names them until the offering is in the draft.
                codes = list(order_names)
            else:
                for name in order_names:
                    order_type = find_order_type(offering, name)
                    if order_type is None:
                        warnings.append(
                            f"{feature.id}: {offering.name} has no order type {name!r}, so the "
                            "question is asked of the offering as a whole."
                        )
                    elif order_type.code not in codes:
                        codes.append(order_type.code)
            question = OpenQuestion(
                id=f"{trace.requirement_id}/{feature.id}",
                text=feature.asks(),
                impact=impact,
                source=f"{incoming.id} Feature {feature.id}",
                order_types=tuple(codes),
            )
            content = CandidateContent(
                kind=CandidateKind.QUESTION,
                system_id=offering.id if offering else written,
                question=question,
            )
            if classify(content, release) is CandidateMatch.ALREADY_PRESENT:
                present += 1
                continue
            candidates.append(
                CatalogueCandidate(
                    uuid4().hex,
                    release.id,
                    incoming.id,
                    content,
                    (CandidateCitation(f"Feature {feature.id}", feature.asks()),),
                    READER,
                    READER_VERSION,
                    at,
                    change_request=ChangeRequestCitation(incoming.id, feature.id),
                )
            )
    if present:
        warnings.append(
            f"{present} question{'s' if present != 1 else ''} already in the draft "
            f"{'were' if present != 1 else 'was'} left out."
        )
    return tuple(candidates), tuple(dict.fromkeys(warnings))


def _drafted(
    incoming: IncomingChangeRequest,
    draft: OfferingDraft,
    release: ArchitectureKnowledge,
    at: datetime,
    warnings: list[str],
) -> tuple[CatalogueCandidate, ...]:
    """The drafted offering and journey as two suggestions, the offering first. One already
    in the draft is left out; one that would replace an offering or journey there is
    suggested with a warning, and is accepted alone."""
    first = min(incoming.features, key=lambda item: item.sequence)
    based = find_offering(release.products, draft.based_on or "")
    quote = f"New offering for {incoming.title}" + (f", drafted from {based.name}" if based else "")
    found: list[CatalogueCandidate] = []
    for content in draft_contents(draft):
        if content.product is not None:
            what, name = "offering", content.product.name
        else:
            what, name = "journey", draft.journey.name if draft.journey else content.system_id
        match = classify(content, release)
        if match is CandidateMatch.ALREADY_PRESENT:
            warnings.append(
                f"The drafted {what} {name} is already in the draft, so it is left out."
            )
            continue
        if match is CandidateMatch.UPDATES_EXISTING:
            warnings.append(
                f"The drafted {what} {name} matches one already in the draft; accepting it "
                "replaces that one, so rename it first if it is new."
            )
        found.append(
            CatalogueCandidate(
                uuid4().hex,
                release.id,
                incoming.id,
                content,
                (CandidateCitation("Decided product impact", quote),),
                READER,
                READER_VERSION,
                at,
                change_request=ChangeRequestCitation(incoming.id, first.id),
            )
        )
    return tuple(found)


def capability_id(concept_id: str) -> str:
    """The id of the capability a delivered change suggests: the concept's, without its scheme.

    "cap:static-ip" gives "static-ip", so a second suggestion finds the same capability.
    """
    local = concept_id.rsplit(":", 1)[-1]
    return re.sub(r"[^a-z0-9]+", "-", local.casefold()).strip("-") or "capability"


def read_delivery(
    incoming: IncomingChangeRequest,
    delivery: DeliveryTrace,
    release: ArchitectureKnowledge,
    at: datetime,
    active_id: str | None = None,
) -> tuple[tuple[CatalogueCandidate, ...], tuple[str, ...]]:
    """The suggestions a closed Epic puts to the draft, and what the reading could not match.

    A system that delivered a needed concept the catalogue lacked is suggested as realising
    it, as a capability linked to the concept; an offering that now delivers it is asked which
    of its components does. A suggestion already in the draft as it is now is left out.
    """
    warnings: list[str] = []
    candidates: list[CatalogueCandidate] = []
    present = 0
    if active_id and delivery.release_id != active_id:
        warnings.append(
            f"The product impact was assessed against catalogue version {delivery.release_id}, "
            "not the version in service; check the systems and concepts it names."
        )
    if delivery.not_delivered:
        listed = ", ".join(
            f"{item.id} {item.name} ({item.state})" for item in delivery.not_delivered
        )
        warnings.append(f"Not delivered, so nothing is suggested from it: {listed}.")
    if not delivery.changes:
        warnings.append(
            "The decided product impact found no missing capability the delivered Features "
            "close, so there is nothing to suggest."
        )
    features = {item.id: item for item in incoming.features}
    for change in delivery.changes:
        delivered_by = [features[item] for item in change.feature_ids]
        citation = CandidateCitation(
            f"Feature {', '.join(change.feature_ids)}",
            "; ".join(item.asks() for item in delivered_by),
        )
        concept = find_concept(release, change.concept_id)
        if concept is None:
            warnings.append(
                f"The concept {change.concept_label} is not in the draft; what it suggests "
                "waits for it."
            )
        label = concept.pref_label if concept else change.concept_label
        content = (
            _realises(change, concept, label, release, warnings)
            if change.kind is DeliveredChangeKind.REALISE_CONCEPT
            else _offers(change, label, incoming, delivery, delivered_by, release, warnings)
        )
        if classify(content, release) is CandidateMatch.ALREADY_PRESENT:
            present += 1
            continue
        candidates.append(
            CatalogueCandidate(
                uuid4().hex,
                release.id,
                incoming.id,
                content,
                (citation,),
                READER,
                READER_VERSION,
                at,
                change_request=ChangeRequestCitation(incoming.id, change.feature_ids[0]),
            )
        )
    if present:
        warnings.append(
            f"{present} suggestion{'s' if present != 1 else ''} already in the draft "
            f"{'were' if present != 1 else 'was'} left out."
        )
    return tuple(candidates), tuple(dict.fromkeys(warnings))


def _realises(
    change: DeliveredChange,
    concept: BusinessCapability | None,
    label: str,
    release: ArchitectureKnowledge,
    warnings: list[str],
) -> CandidateContent:
    system = find_system(release, change.system_id or "") or (
        find_system(release, change.system_name) if change.system_name else None
    )
    if system is None:
        warnings.append(
            f"{change.system_name or change.system_id} is not in the draft; the capability it "
            "delivered waits for it."
        )
    return CandidateContent(
        kind=CandidateKind.CAPABILITY,
        system_id=system.id if system else change.system_id or "",
        capability_id=capability_id(concept.id if concept else change.concept_id),
        name=label,
        triggers=tuple(dict.fromkeys(concept.labels if concept else (label,))),
        concept_ids=(concept.id if concept else change.concept_id,),
    )


def _offers(
    change: DeliveredChange,
    label: str,
    incoming: IncomingChangeRequest,
    delivery: DeliveryTrace,
    delivered_by: list[IncomingFeature],
    release: ArchitectureKnowledge,
    warnings: list[str],
) -> CandidateContent:
    offering = _offering_named(release, change.offering_id, change.offering_name)
    written = change.offering_name or change.offering_id or ""
    if offering is None:
        warnings.append(f"The offering {written!r} is not in the draft; its question waits for it.")
    names = ", ".join(item.name for item in delivered_by)
    question = OpenQuestion(
        id=f"{incoming.trace.requirement_id}/{change.concept_id}",
        text=f"Which component of {offering.name if offering else written} now delivers {label}?",
        impact=f"Delivered by Epic {delivery.epic_external_id}, {incoming.trace.epic_name}: "
        f"{names}.",
        source=f"{incoming.id} Epic {delivery.epic_external_id}",
    )
    return CandidateContent(
        kind=CandidateKind.QUESTION,
        system_id=offering.id if offering else written,
        question=question,
    )


@dataclass(frozen=True)
class ChangeRequestReading:
    release: ArchitectureKnowledge
    run: ExtractionRun
    change_request: IncomingChangeRequest


class ReadChangeRequestIntoDraft:
    def __init__(
        self,
        inbox: ChangeRequestInboxPort,
        knowledge: ManageArchitectureKnowledge,
        repository: ArchitectureKnowledgeRepositoryPort,
        candidates: CatalogueCandidateRepositoryPort,
        clock: ClockPort,
    ) -> None:
        self._inbox = inbox
        self._knowledge = knowledge
        self._repository = repository
        self._candidates = candidates
        self._clock = clock

    def execute(self, change_request_id: str, actor: Actor) -> ChangeRequestReading:
        """Read it into the draft in progress, or into a new one named after it."""
        require_maintainer(actor)
        incoming = self._inbox.get(change_request_id)
        if incoming is None:
            raise ChangeRequestNotFoundError("This change request was not found.")
        if incoming.status is IncomingStatus.DISMISSED:
            raise ChangeRequestStateError(
                f"{incoming.id} was dismissed, so it cannot be read into a draft."
            )
        draft = next(
            (
                item
                for item in self._repository.list_all()
                if item.status is KnowledgeReleaseStatus.DRAFT
            ),
            None,
        ) or self._knowledge.create_draft(actor, incoming.id)
        now = self._clock.now()
        found, warnings = read_change_request(incoming, draft, now, self._repository.active().id)
        run = ExtractionRun(
            uuid4().hex,
            draft.id,
            incoming.id,
            READER,
            READER_VERSION,
            len(found),
            warnings,
            now,
            change_request_id=incoming.id,
        )
        self._candidates.replace_proposals(run, found)
        read = incoming.read(draft.id, actor.id, now)
        self._inbox.save(read, incoming.status)
        return ChangeRequestReading(draft, run, read)


class DismissChangeRequest:
    def __init__(self, inbox: ChangeRequestInboxPort, clock: ClockPort) -> None:
        self._inbox = inbox
        self._clock = clock

    def execute(self, change_request_id: str, reason: str, actor: Actor) -> IncomingChangeRequest:
        require_maintainer(actor)
        incoming = self._inbox.get(change_request_id)
        if incoming is None:
            raise ChangeRequestNotFoundError("This change request was not found.")
        dismissed = incoming.dismiss(reason, actor.id, self._clock.now())
        self._inbox.save(dismissed, incoming.status)
        return dismissed
