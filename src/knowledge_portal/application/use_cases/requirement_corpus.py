"""The Requirement knowledge table on the Knowledge Center: its counts (A′), its rows and
findings, and the nudge that asks owners to decide a finding (B2).

Requirement work owns all of it; these read it on demand and keep nothing. Every route that
calls them needs a knowledge admin.
"""

from __future__ import annotations

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.requirement_corpus import (
    CorpusFindingsPage,
    CorpusQuery,
    CorpusRequirementsPage,
    CorpusSummary,
    FindingQuery,
    MembershipResult,
    NudgeReceipt,
    ReindexResult,
    ReindexScope,
    RequirementCorpusPort,
)
from knowledge_portal.domain.identity.entities import ActorProfile


class ReadRequirementCorpus:
    """Counts, rows and findings, read from requirement work."""

    def __init__(self, corpus: RequirementCorpusPort) -> None:
        self._corpus = corpus

    def execute(self, actor: Actor) -> CorpusSummary:
        del actor  # Admitted as a knowledge admin before any route runs.
        return self._corpus.summary()

    def requirements(
        self, actor: Actor, query: CorpusQuery, offset: int, limit: int
    ) -> CorpusRequirementsPage:
        del actor
        return self._corpus.requirements(query, offset, limit)

    def findings(
        self, actor: Actor, query: FindingQuery, offset: int, limit: int
    ) -> CorpusFindingsPage:
        del actor
        return self._corpus.findings(query, offset, limit)


class NudgeFindingOwners:
    """Ask both Requirements' owners to decide a finding, in the admin's name.

    Requirement work sends the notifications, records the nudge and enforces the weekly limit;
    decisions stay with the owners.
    """

    def __init__(self, corpus: RequirementCorpusPort) -> None:
        self._corpus = corpus

    def execute(self, actor: ActorProfile, finding_id: str) -> NudgeReceipt:
        return self._corpus.nudge(finding_id, actor.id.value, actor.display_name)


class ActOnRequirementCorpus:
    """A knowledge admin's corpus actions, sent to requirement work in their name (B3).

    Requirement work applies the rules, records each action and tells the owner.
    """

    def __init__(self, corpus: RequirementCorpusPort) -> None:
        self._corpus = corpus

    def retire(self, actor: ActorProfile, requirement_id: str, reason: str) -> MembershipResult:
        return self._corpus.retire(requirement_id, actor.id.value, actor.display_name, reason)

    def reinstate(self, actor: ActorProfile, requirement_id: str, reason: str) -> MembershipResult:
        return self._corpus.reinstate(requirement_id, actor.id.value, actor.display_name, reason)

    def reindex(
        self, actor: ActorProfile, scope: ReindexScope, requirement_ids: tuple[str, ...]
    ) -> ReindexResult:
        return self._corpus.reindex(scope, requirement_ids, actor.id.value, actor.display_name)
