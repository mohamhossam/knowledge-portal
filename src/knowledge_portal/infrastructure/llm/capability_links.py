"""Suggesting which business capability concepts an offering component delivers (ADR-0114).

The model reads each unlinked component beside the whole concept scheme and names
the concepts it delivers, with a reason. Nothing here links anything: each answer
becomes a suggestion a maintainer accepts or rejects.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field, ValidationError
from smb_kernel.llm.structured_output import (
    StructuredOutputClient,
    StructuredOutputError,
)

from knowledge_portal.application.errors import ModelTransportError
from knowledge_portal.application.ports.capability_link_suggester import (
    CapabilityLinkingError,
    ConceptChoice,
    LinkableComponent,
    LinkResult,
    LinkSuggestion,
)
from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.infrastructure.llm.prompts.capability_links_prompt import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_prompt,
)

# Components per call, so a large offering still fits a small model beside the scheme.
_MAX_COMPONENTS_PER_CALL = 15
_MAX_LINKS = 3
_MAX_REASON = 300


class LinkOutput(BaseModel):
    number: int
    concept_ids: list[str] = Field(max_length=_MAX_LINKS)
    reason: str = Field(max_length=_MAX_REASON)


class LinkingOutput(BaseModel):
    links: list[LinkOutput] = Field(max_length=_MAX_COMPONENTS_PER_CALL)


_SCHEMA_TEXT = json.dumps(LinkingOutput.model_json_schema())


def _tokens(text: str) -> int:
    return len(text) // 4 + 1


class StructuredCapabilityLinkSuggester:
    def __init__(
        self, client: StructuredOutputClient, *, max_input_tokens: int | None = None
    ) -> None:
        """``max_input_tokens`` is the prompt room the client allows; None means ample."""
        self._client = client
        self._max_input_tokens = max_input_tokens

    @property
    def model(self) -> str:
        return self._client.model

    @property
    def prompt_version(self) -> str:
        return PROMPT_VERSION

    def _batches(
        self, items: list[tuple[int, LinkableComponent]], concepts: tuple[ConceptChoice, ...]
    ) -> list[list[tuple[int, LinkableComponent]]]:
        room = (
            int(self._max_input_tokens * 0.9) - _tokens(SYSTEM_PROMPT) - _tokens(_SCHEMA_TEXT)
            if self._max_input_tokens is not None
            else 10**9
        )
        if _tokens(build_user_prompt([], concepts)) > room:
            raise CapabilityLinkingError("The concept scheme is too large for the linking model.")
        batches: list[list[tuple[int, LinkableComponent]]] = []
        current: list[tuple[int, LinkableComponent]] = []
        for item in items:
            candidate = [*current, item]
            if current and (
                len(candidate) > _MAX_COMPONENTS_PER_CALL
                or _tokens(build_user_prompt(candidate, concepts)) > room
            ):
                batches.append(current)
                candidate = [item]
            current = candidate
        if current:
            batches.append(current)
        return batches

    def suggest(
        self, components: tuple[LinkableComponent, ...], concepts: tuple[ConceptChoice, ...]
    ) -> LinkResult:
        items = list(enumerate(components, 1))
        known = {item.id for item in concepts}
        suggestions: list[LinkSuggestion] = []
        for batch in self._batches(items, concepts):
            try:
                output = self._client.parse(
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=build_user_prompt(batch, concepts),
                    schema_type=LinkingOutput,
                )
            except (StructuredOutputError, ValidationError, ModelTransportError) as exc:
                raise CapabilityLinkingError("The linking model's answer was unusable.") from exc
            asked = dict(batch)
            usable = [
                LinkSuggestion(
                    asked[item.number].offering_id,
                    asked[item.number].component_id,
                    tuple(dict.fromkeys(i for i in item.concept_ids if i in known)),
                    item.reason.strip(),
                )
                for item in output.links
                if item.number in asked
                and any(i in known for i in item.concept_ids)
                and item.reason.strip()
            ]
            if output.links and not usable:
                raise CapabilityLinkingError(
                    "The linking model named no listed concept with a reason."
                )
            suggestions.extend(usable)
        return LinkResult(tuple(suggestions))


class FakeCapabilityLinkSuggester:
    """Deterministic offline linking: a concept whose label's words all appear in the
    component's name or description. Not a language model."""

    model = "fake-capability-linker"
    prompt_version = PROMPT_VERSION

    def suggest(
        self, components: tuple[LinkableComponent, ...], concepts: tuple[ConceptChoice, ...]
    ) -> LinkResult:
        suggestions = []
        for component in components:
            words = set(label_key(f"{component.name} {component.description or ''}").split())
            found = [
                (concept.id, label)
                for concept in concepts
                for label in (concept.label, *concept.other_labels)
                if label_key(label) and set(label_key(label).split()) <= words
            ]
            ids = tuple(dict.fromkeys(concept_id for concept_id, _ in found))[:_MAX_LINKS]
            if ids:
                suggestions.append(
                    LinkSuggestion(
                        component.offering_id,
                        component.component_id,
                        ids,
                        f"Its name or description says {found[0][1]!r}.",
                    )
                )
        return LinkResult(tuple(suggestions))
