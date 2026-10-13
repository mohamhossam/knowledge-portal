"""Interfaces systems expose and consume, and the information entities systems master or
read (ontology plan Phase 8, ADR-0114).

An interface is an API, event or file contract one system exposes and others consume. It
names the Open API terms that do the same job and the information entities it carries,
from the release's own vocabularies. A system masters an entity when it is the system of
record for it, and reads one it keeps a copy of or looks up.

An interface may relay others: an integration layer such as TIBCO exposes a contract that
passes another system's on, so a change to the one it relays reaches its own consumers too.

These are what a data or contract change reaches beyond the system it changes: the systems
of record of the data, and every consumer of the interfaces that carry it, through every
layer that relays them.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    check_terms,
)


class InterfaceStyle(StrEnum):
    """How an interface is called, when its sources say."""

    API = "api"
    EVENT = "event"
    FILE = "file"
    UNSPECIFIED = "unspecified"


def interface_style(value: InterfaceStyle | str) -> InterfaceStyle:
    try:
        return InterfaceStyle(str(value).strip().casefold())
    except ValueError as exc:
        names = ", ".join(item.value for item in InterfaceStyle)
        raise InvalidKnowledgeError(
            f"An interface style is one of {names}, not {value!r}."
        ) from exc


def _ids(values: Iterable[str], label: str) -> tuple[str, ...]:
    return tuple(required(item, label) for item in values)


@dataclass(frozen=True)
class SystemInterface:
    """One contract a system exposes, such as CBCM's "CRM GW API", and who consumes it."""

    id: str
    name: str
    # The system that exposes it.
    system_id: str
    style: InterfaceStyle = InterfaceStyle.UNSPECIFIED
    # The systems that call it or receive it, by id.
    consumer_ids: tuple[str, ...] = ()
    # The Open API terms that do the same job, such as TMF622 Product Ordering.
    open_api_ids: tuple[str, ...] = ()
    # The information entities it carries, such as Customer or Product order.
    entity_ids: tuple[str, ...] = ()
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None
    # The interfaces it passes on, by id: its system consumes each of them.
    relays: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Interface id"))
        object.__setattr__(self, "name", required(self.name, "Interface name"))
        object.__setattr__(self, "system_id", required(self.system_id, "Exposing system"))
        object.__setattr__(self, "style", interface_style(self.style))
        object.__setattr__(self, "consumer_ids", _ids(self.consumer_ids, "Consuming system"))
        object.__setattr__(self, "open_api_ids", _ids(self.open_api_ids, "Open API term"))
        object.__setattr__(self, "entity_ids", _ids(self.entity_ids, "Information entity"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        object.__setattr__(self, "relays", _ids(self.relays, "Relayed interface"))
        check_source(self)
        if len(set(self.relays)) != len(self.relays) or self.id in self.relays:
            raise InvalidKnowledgeError(
                f"{self.name} relays an interface more than once, or relays itself."
            )
        if len(set(self.consumer_ids)) != len(self.consumer_ids):
            raise InvalidKnowledgeError(f"{self.name} names a consuming system more than once.")
        if self.system_id in self.consumer_ids:
            raise InvalidKnowledgeError(
                f"{self.name}: a system does not consume its own interface."
            )


def check_interfaces(
    interfaces: tuple[SystemInterface, ...],
    system_ids: set[str],
    terms: dict[str, VocabularyTerm],
) -> dict[str, SystemInterface]:
    """Unique ids, one name per exposing system, catalogued systems, Open API and entity
    terms from their own vocabularies, and relayed interfaces its system consumes. Returns
    the interfaces by id."""
    by_id = {item.id: item for item in interfaces}
    if len(by_id) != len(interfaces):
        raise InvalidKnowledgeError("Interface ids must be unique.")
    names: set[tuple[str, str]] = set()
    for item in interfaces:
        key = (item.system_id, label_key(item.name))
        if key in names:
            raise InvalidKnowledgeError(
                f"Two interfaces of {item.system_id!r} are named {item.name!r}."
            )
        names.add(key)
        unknown = [
            system for system in (item.system_id, *item.consumer_ids) if system not in system_ids
        ]
        if unknown:
            raise InvalidKnowledgeError(
                f"Interface {item.name} names system {unknown[0]!r}, which is not in the catalogue."
            )
        where = f"Interface {item.name}"
        check_terms(item.open_api_ids, VocabularyScheme.OPEN_API, terms, where)
        check_terms(item.entity_ids, VocabularyScheme.INFORMATION_ENTITY, terms, where)
        for relayed_id in item.relays:
            relayed = by_id.get(relayed_id)
            if relayed is None:
                raise InvalidKnowledgeError(
                    f"{where} relays {relayed_id!r}, which is not in the catalogue."
                )
            if item.system_id not in relayed.consumer_ids:
                raise InvalidKnowledgeError(
                    f"{where} relays {relayed.name}, which its system does not consume."
                )
    return by_id


def check_data_roles(
    system_name: str,
    masters: tuple[str, ...],
    reads: tuple[str, ...],
    terms: dict[str, VocabularyTerm],
) -> None:
    """A system masters or reads information entities, each once, never both."""
    where = f"System {system_name}"
    check_terms(masters, VocabularyScheme.INFORMATION_ENTITY, terms, where)
    check_terms(reads, VocabularyScheme.INFORMATION_ENTITY, terms, where)
    both = set(masters) & set(reads)
    if both:
        raise InvalidKnowledgeError(
            f"{system_name} both masters and reads {sorted(both)[0]!r}; a system of record "
            "does not also read its own data."
        )
