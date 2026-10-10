"""Suggesting which business capability concepts an offering component delivers (ADR-0114)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class CapabilityLinkingError(Exception):
    """The linking model produced nothing usable; the provider is at fault."""


@dataclass(frozen=True)
class LinkableComponent:
    """An offering component as the catalogue records it, with the systems that deliver it."""

    offering_id: str
    offering_name: str
    component_id: str
    name: str
    description: str | None
    kind: str | None
    systems: tuple[str, ...]


@dataclass(frozen=True)
class ConceptChoice:
    """A concept the model may choose, with where it sits in the scheme."""

    id: str
    label: str
    other_labels: tuple[str, ...]
    definition: str | None
    path: str


@dataclass(frozen=True)
class LinkSuggestion:
    offering_id: str
    component_id: str
    concept_ids: tuple[str, ...]
    reason: str


@dataclass(frozen=True)
class LinkResult:
    suggestions: tuple[LinkSuggestion, ...]
    warnings: tuple[str, ...] = ()


class CapabilityLinkSuggesterPort(Protocol):
    @property
    def model(self) -> str: ...

    @property
    def prompt_version(self) -> str: ...

    def suggest(
        self, components: tuple[LinkableComponent, ...], concepts: tuple[ConceptChoice, ...]
    ) -> LinkResult:
        """The concepts each component delivers, never one outside ``concepts``.

        Raises CapabilityLinkingError when the model's answer cannot be used.
        """
        ...
