"""Bounded request bodies for the internal match and assess routes.

The wire shape and the component names in
`contracts/knowledge-internal.openapi.json` stay exactly the application's
`ArchitectureQuery` and `AssessmentQuery`; these add the field maxima the
interface boundary owes (AGENTS section 17), because every text item reaches a
model prompt. The sizes are far above anything requirement-portal sends, so
the added constraints only document and enforce what already holds.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from knowledge_portal.application.ports import architecture_knowledge, requirement_assessment
from knowledge_portal.interfaces.api.schemas.bounds import MAX_ITEMS, Identifier, Text


class ArchitectureQuery(BaseModel):
    """Provider-neutral evidence used to find likely architecture impact."""

    text: tuple[Text, ...] = Field(max_length=MAX_ITEMS)
    declared_systems: tuple[Identifier, ...] = Field(default=(), max_length=MAX_ITEMS)
    release_id: Identifier | None = None

    def to_query(self) -> architecture_knowledge.ArchitectureQuery:
        return architecture_knowledge.ArchitectureQuery(
            text=self.text, declared_systems=self.declared_systems, release_id=self.release_id
        )


class AssessmentQuery(BaseModel):
    """A requirement as requirement-portal holds it: its text and its analysed facts."""

    text: tuple[Text, ...] = Field(max_length=MAX_ITEMS)
    declared_systems: tuple[Identifier, ...] = Field(default=(), max_length=MAX_ITEMS)
    release_id: Identifier | None = None
    requirement_id: Identifier | None = None

    def to_query(self) -> requirement_assessment.AssessmentQuery:
        return requirement_assessment.AssessmentQuery(
            text=self.text,
            declared_systems=self.declared_systems,
            release_id=self.release_id,
            requirement_id=self.requirement_id,
        )
