"""Customer-facing services, resource-facing services and resources as records of their own
(ontology plan Phase 8, ADR-0114).

A component used to name what realises it as text alone, such as the CFS
"CFSS_ONPREM_FIREWALL_HE". A realisation record gives that name an id, the systems that
deliver or hold it, and what realises it one layer down: a CFS is realised by RFSs or
resources, an RFS by resources. A component's realisation keeps the name its source wrote
and gains the id of the record it means, as a vocabulary field gains a term.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.products import (
    ProductOffering,
    RealisationLayer,
    realisation_layer,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source

# What may realise each layer: the layers below it.
_BELOW = {
    RealisationLayer.CFS: frozenset({RealisationLayer.RFS, RealisationLayer.RESOURCE}),
    RealisationLayer.RFS: frozenset({RealisationLayer.RESOURCE}),
    RealisationLayer.RESOURCE: frozenset(),
}


def _ids(values: Iterable[str], label: str) -> tuple[str, ...]:
    return tuple(required(item, label) for item in values)


@dataclass(frozen=True)
class RealisationRecord:
    """One CFS, RFS or resource, such as the CFS "CFSS_ONPREM_FIREWALL_HE"."""

    id: str
    layer: RealisationLayer
    name: str
    # Other names its sources write for it.
    aliases: tuple[str, ...] = ()
    # The systems that deliver it, or hold it when it is a resource, by id.
    system_ids: tuple[str, ...] = ()
    # What realises it one layer down, by record id.
    realised_by: tuple[str, ...] = ()
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Realisation record id"))
        object.__setattr__(self, "layer", realisation_layer(self.layer))
        object.__setattr__(self, "name", required(self.name, "Realisation record name"))
        object.__setattr__(self, "aliases", _ids(self.aliases, "Other name"))
        object.__setattr__(self, "system_ids", _ids(self.system_ids, "Delivering system"))
        object.__setattr__(self, "realised_by", _ids(self.realised_by, "Realising record"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        check_source(self)
        keys = [label_key(item) for item in self.labels]
        if len(set(keys)) != len(keys):
            raise InvalidKnowledgeError(f"{self.name}: each name must differ from the rest.")
        if len(set(self.system_ids)) != len(self.system_ids):
            raise InvalidKnowledgeError(f"{self.name} names a system more than once.")
        if len(set(self.realised_by)) != len(self.realised_by) or self.id in self.realised_by:
            raise InvalidKnowledgeError(
                f"{self.name} names what realises it more than once, or itself."
            )
        if self.layer is RealisationLayer.RESOURCE and self.realised_by:
            raise InvalidKnowledgeError(
                f"{self.name} is a resource, so nothing below it realises it."
            )

    @property
    def labels(self) -> tuple[str, ...]:
        return (self.name, *self.aliases)


def check_realisations(
    records: tuple[RealisationRecord, ...],
    system_ids: set[str],
    products: Iterable[ProductOffering],
) -> dict[str, RealisationRecord]:
    """Unique ids, each name naming one record of its layer, catalogued systems, records
    realised only by records of a lower layer, and components' realisations naming records
    of their own layer. Returns the records by id."""
    by_id = {item.id: item for item in records}
    if len(by_id) != len(records):
        raise InvalidKnowledgeError("Realisation record ids must be unique.")
    names: dict[tuple[RealisationLayer, str], RealisationRecord] = {}
    for record in records:
        for label in record.labels:
            owner = names.setdefault((record.layer, label_key(label)), record)
            if owner.id != record.id:
                raise InvalidKnowledgeError(
                    f"{label!r} already names the {owner.layer.value.upper()} {owner.name}, "
                    f"so it cannot also name {record.name}."
                )
        unknown = [item for item in record.system_ids if item not in system_ids]
        if unknown:
            raise InvalidKnowledgeError(
                f"{record.name} names system {unknown[0]!r}, which is not in the catalogue."
            )
        for below_id in record.realised_by:
            below = by_id.get(below_id)
            if below is None:
                raise InvalidKnowledgeError(
                    f"{record.name} is realised by {below_id!r}, which is not in the catalogue."
                )
            if below.layer not in _BELOW[record.layer]:
                raise InvalidKnowledgeError(
                    f"{record.name} is a {record.layer.value.upper()}, so it is realised by a "
                    f"layer below it, not by the {below.layer.value.upper()} {below.name}."
                )
    for product in products:
        for component in product.components:
            for item in component.realisation:
                if item.record_id is None:
                    continue
                linked = by_id.get(item.record_id)
                if linked is None or linked.layer is not item.layer:
                    raise InvalidKnowledgeError(
                        f"{product.name} › {component.name} is realised as "
                        f"{item.record_id!r}, which is not a "
                        f"{item.layer.value.upper()} in the catalogue."
                    )
    return by_id


def realisation_chains(
    records: dict[str, RealisationRecord], record_id: str
) -> tuple[tuple[RealisationRecord, ...], ...]:
    """Each chain from a record down through what realises it, the record first: the
    path from a CFS to the resources under it."""
    record = records[record_id]
    below = [chain for item in record.realised_by for chain in realisation_chains(records, item)]
    return tuple((record, *chain) for chain in below) or ((record,),)
