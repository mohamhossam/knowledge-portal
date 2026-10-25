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
from dataclasses import dataclass, replace

from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.products import (
    LAYER_LABEL,
    ProductOffering,
    RealisationLayer,
    realisation_layer,
)
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
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
    """One CFSS, RFSS or resource, such as the CFSS "CFSS_ONPREM_FIREWALL_HE".

    A service specification (a CFSS or an RFSS) also holds its rules, such as "One
    Service Order should include from one to two Uplink uCPE Services" (ADR-0127);
    a resource holds none.
    """

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
    # The accepted suggestions that created or extended it, oldest first (ADR-0120).
    accepted: tuple[AcceptedFrom, ...] = ()
    # What the specification requires, as its sources state it (ADR-0127).
    rules: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Realisation record id"))
        object.__setattr__(self, "layer", realisation_layer(self.layer))
        object.__setattr__(self, "name", required(self.name, "Realisation record name"))
        object.__setattr__(self, "aliases", _ids(self.aliases, "Other name"))
        object.__setattr__(self, "system_ids", _ids(self.system_ids, "Delivering system"))
        object.__setattr__(self, "realised_by", _ids(self.realised_by, "Realising record"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        object.__setattr__(self, "rules", _ids(self.rules, "Rule"))
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
        if self.layer is RealisationLayer.RESOURCE and self.rules:
            raise InvalidKnowledgeError(
                f"{self.name} is a resource; rules belong to a CFSS or an RFSS."
            )
        if len({" ".join(rule.casefold().split()) for rule in self.rules}) != len(self.rules):
            raise InvalidKnowledgeError(f"{self.name} states a rule more than once.")

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
                    f"{label!r} already names the {LAYER_LABEL[owner.layer]} {owner.name}, "
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
                    f"{record.name} is a {LAYER_LABEL[record.layer]}, so it is realised by a "
                    f"layer below it, not by the {LAYER_LABEL[below.layer]} {below.name}."
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
                        f"{LAYER_LABEL[item.layer]} in the catalogue."
                    )
    return by_id


def record_id(layer: RealisationLayer, slugged_name: str) -> str:
    """A record's id from its layer and its name as a slug: the layer in front, once, so
    "RFS_POLICY" gives "rfs-policy" and "POLICY" gives "rfs-policy" too."""
    prefix = f"{layer.value}-"
    return slugged_name if slugged_name.startswith(prefix) else f"{prefix}{slugged_name}"


def find_realisation_among(
    records: tuple[RealisationRecord, ...],
    reference: str,
    layers: Iterable[RealisationLayer] | None = None,
) -> RealisationRecord | None:
    """A record named by id or, when only one has it, by one of its names, ignoring case and
    punctuation; ``layers`` narrows a name to records of those layers."""
    exact = next((item for item in records if item.id == reference.strip()), None)
    if exact is not None:
        return exact
    allowed = None if layers is None else frozenset(layers)
    key = label_key(reference)
    named = [
        item
        for item in records
        if (allowed is None or item.layer in allowed)
        and key in {label_key(label) for label in item.labels}
    ]
    return named[0] if len(named) == 1 else None


def merge_realisations(first: RealisationRecord, second: RealisationRecord) -> RealisationRecord:
    """Two readings of one record as one: the first's layer, name and facts win; the second
    adds names, systems, what realises it and rules, and fills what the first leaves unset."""

    def joined(one: tuple[str, ...], other: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*one, *other)))

    names = {label_key(first.name)}
    aliases = []
    for alias in (*first.aliases, second.name, *second.aliases):
        if label_key(alias) not in names:
            names.add(label_key(alias))
            aliases.append(alias)
    return replace(
        first,
        aliases=tuple(aliases),
        system_ids=joined(first.system_ids, second.system_ids),
        realised_by=tuple(
            item for item in joined(first.realised_by, second.realised_by) if item != first.id
        ),
        description=first.description or second.description,
        confidence=first.confidence or second.confidence,
        source=first.source or second.source,
        rules=with_rules(first, second.rules).rules,
    )


def with_rules(record: RealisationRecord, rules: Iterable[str]) -> RealisationRecord:
    """The record with ``rules`` added after its own, each once, however it is spaced or cased."""
    held = {" ".join(rule.casefold().split()) for rule in record.rules}
    added: list[str] = []
    for rule in rules:
        key = " ".join(rule.casefold().split())
        if key and key not in held:
            held.add(key)
            added.append(rule.strip())
    return replace(record, rules=(*record.rules, *added)) if added else record


def specification_named(
    records: tuple[RealisationRecord, ...], reference: str
) -> RealisationRecord | None:
    """The CFSS or RFSS a reference names, by id or by one of its names: what a rule is of."""
    return find_realisation_among(records, reference, (RealisationLayer.CFS, RealisationLayer.RFS))


def realisation_chains(
    records: dict[str, RealisationRecord], record_id: str
) -> tuple[tuple[RealisationRecord, ...], ...]:
    """Each chain from a record down through what realises it, the record first: the
    path from a CFS to the resources under it."""
    record = records[record_id]
    below = [chain for item in record.realised_by for chain in realisation_chains(records, item)]
    return tuple((record, *chain) for chain in below) or ((record,),)
