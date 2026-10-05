"""Change requests from Requirement AI: kept as delivered, read into a draft by a person
(requirement-portal ADR-0101, step 7).

requirement-portal sends an approved backlog when its final approval is recorded. It is
kept once per approval. A knowledge admin then reads it into the draft (starting one if
none is open), where each approved feature becomes a suggested open question on the
offering it names, or dismisses it. The reading is fixed rules, not a model: what the
approved backlog says, matched to the draft by id, then by name.
"""

from __future__ import annotations

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
from knowledge_portal.application.ports.change_requests import ChangeRequestInboxPort
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
    find_system,
)
from knowledge_portal.domain.architecture.change_requests import (
    ChangeRequestStateError,
    IncomingChangeRequest,
    IncomingFeature,
    IncomingStatus,
    RequirementTrace,
    change_request_id,
)
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
        )
        return self._inbox.receive(item)


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

    One question for each approved feature and each offering it names, asked for the order
    types it names. A question already in the draft as it is now is left out.
    """
    warnings: list[str] = []
    candidates: list[CatalogueCandidate] = []
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
