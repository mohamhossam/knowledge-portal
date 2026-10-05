"""The Product Architecture Explorer's model, read into a catalogue file.

The explorer (``smb-ai-requirement-agent``, ``tools/architecture-explorer``) kept a
hand-curated model in one JSON file, schema 6. This reads it once into the catalogue
file's JSON shape (``catalogue_files.content_from_mapping``). An admin then previews
the file against a draft and imports it, and from then on the catalogue is the only
home of these facts (requirement-portal ADR-0101).

It is a seed, not a sync. Nothing is invented: a fact the catalogue cannot hold yet
(lifecycle notes, source levels and conflicts, and so on) is counted in the
report, not squeezed into a field that means something else. Plans and prices are never
carried over: the explorer reads them live from the product catalog by the offering's code.
Channels carry
over (step 3): each channel with its entry system, the channels each order type can
be ordered through, the channels each step happens in, and the steps the order's
channel entry system performs. So do each component's CFS, RFS and resource layers,
as its realisation, each offering's NFRs with how far their sources define them, and
how its orders are tracked (step 4).
Evidence keeps its confidence (CONFIRMED, INFERRED and GAP) and names its source.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from knowledge_portal.domain.architecture.channels import check_channels
from knowledge_portal.domain.architecture.journeys import (
    MAIN_TRACK,
    check_journeys,
    journey_edges,
)
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.domain.architecture.products import check_offerings
from knowledge_portal.infrastructure.architecture.catalogue_files import content_from_mapping

SCHEMA_MAJOR = "6"
ENTRY = "@ENTRY"
# A main-track activity the flow ends at, moved off the main track so the
# catalogue's derived flow does not run on from it to the next activity.
END_TRACK = "END"
_CONFIDENCE = {"CONFIRMED": "confirmed", "INFERRED": "inferred", "GAP": "gap"}
_TIMING = {"SYNC": "Sync", "ASYNC": "Async"}
_ROLE_BY_SCOPE = {"DESIGN": "DESIGN_TIME", "OPS": "OPERATIONS"}
_FULFILMENT = "FULFILMENT"
# A correlation key the source says it does not define ("Correlation key not defined by …").
_NOT_DEFINED = re.compile(r"not defined", re.IGNORECASE)
# How far the explorer's sources define an NFR, as the catalogue says it.
_COVERAGE = {"DEFINED": "defined", "MET": "defined", "PARTIAL": "partial", "GAP": "missing"}
# What the explorer curated by hand that the product catalog states instead: the explorer
# reads plans and prices live from it, by the offering's code, and keeps no copy.
_READ_LIVE = (
    ("planColumns", "plan columns"),
    ("plans", "plans and prices"),
    ("planNotes", "plan notes"),
    ("commitments", "commitments"),
    ("charges", "charges"),
)
# What the explorer holds and the catalogue cannot yet, per product.
_NOT_YET = (
    ("info", "information objects"),
    ("lifecycle", "lifecycle notes"),
    ("crossProduct", "cross-product notes"),
    ("designTime", "design-time steps"),
)


@dataclass(frozen=True)
class ExplorerSeed:
    """The catalogue file's content and what the reading could not carry over."""

    mapping: dict[str, Any]
    report: tuple[str, ...]


def read_explorer_model(model: Mapping[str, Any]) -> ExplorerSeed:
    """The explorer model as a catalogue file; refuses another schema or invalid content."""
    version = str(model.get("schemaVersion") or "")
    if version.split(".")[0] != SCHEMA_MAJOR:
        raise InvalidKnowledgeError(
            f"This reads the explorer's schema {SCHEMA_MAJOR}.x, not {version or 'none'}."
        )
    return _Reader(model).read()


class _Reader:
    def __init__(self, model: Mapping[str, Any]) -> None:
        self.model = model
        self.sources = {item["id"]: item for item in model.get("sources") or ()}
        landscape = model.get("landscape") or {}
        self.domains = list(landscape.get("domains") or ())
        self.systems = list(landscape.get("systems") or ())
        self.system_ids = {item["id"] for item in self.systems}
        self.channels = {item["id"]: item for item in model.get("channels") or ()}
        self.phases = {item["id"]: item for item in model.get("phases") or ()}
        self.names = {item["id"]: item["name"] for item in self.systems}
        self.report: list[str] = []
        self.dropped: Counter[str] = Counter()
        self.read_live: Counter[str] = Counter()

    def read(self) -> ExplorerSeed:
        products = list(self.model.get("products") or ())
        mapping: dict[str, Any] = {
            "landscape_domains": [self._domain(item) for item in self.domains],
            "systems": self._systems(),
            "dependencies": self._dependencies(products),
            "products": [self._product(item) for item in products],
            "journeys": [journey for product in products for journey in self._journeys(product)],
            "channels": [self._channel(item) for item in self.channels.values()],
        }
        self._check(mapping, products)
        self._count_dropped()
        return ExplorerSeed(mapping, tuple(self.report))

    # Evidence ---------------------------------------------------------------

    def _evidence(self, ev: Mapping[str, Any] | None) -> dict[str, str]:
        if not ev:
            return {}
        out: dict[str, str] = {}
        confidence = _CONFIDENCE.get(str(ev.get("s") or "").upper())
        if confidence:
            out["confidence"] = confidence
        elif ev.get("s"):
            self.dropped[f"evidence status {ev['s']} (read as no confidence)"] += 1
        source = self.sources.get(ev.get("src") or "")
        ref = str(ev.get("ref") or "").strip()
        label = str(source.get("short") or source["id"]) if source else ""
        text = " ".join(part for part in (label, ref) if part)
        if text:
            out["source"] = text
        return out

    # Landscape --------------------------------------------------------------

    @staticmethod
    def _domain(item: Mapping[str, Any]) -> dict[str, Any]:
        return _present(id=item["id"], name=item["name"], description=item.get("code"))

    def _systems(self) -> list[dict[str, Any]]:
        domains = {item["id"] for item in self.domains}
        # A name or alias identifies one system across the catalogue.
        owners = {
            label.casefold().strip(): item["id"]
            for item in self.systems
            for label in (item["id"], item["name"])
        }
        systems = []
        for item in self.systems:
            aliases: list[str] = []
            for alias in item.get("aliases") or ():
                key = str(alias).casefold().strip()
                if not key:
                    continue
                if owners.setdefault(key, item["id"]) != item["id"]:
                    self.report.append(
                        f"Alias {alias!r} of {item['name']} dropped: it already names "
                        f"{self.names[owners[key]]}."
                    )
                    continue
                if key not in {value.casefold() for value in (item["name"], *aliases)}:
                    aliases.append(str(alias).strip())
            for field, label in (
                ("owner", "system owners"),
                ("integrations", "system integration notes"),
            ):
                if item.get(field):
                    self.dropped[label] += 1
            systems.append(
                _present(
                    id=item["id"],
                    name=item["name"],
                    aliases=aliases,
                    description=item.get("function"),
                    landscape_domain=item.get("domain") if item.get("domain") in domains else None,
                )
            )
        return systems

    def _dependencies(self, products: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
        """Each named API, as each consumer calling its provider."""
        seen: set[tuple[str, str, str]] = set()
        dependencies = []
        for product in products:
            for api in product.get("apis") or ():
                provider = api.get("provider")
                kind = "unspecified" if api.get("kind") == "OPERATIONS" else "calls_api"
                for consumer in api.get("consumers") or ():
                    if consumer == provider:
                        continue
                    if {consumer, provider} - self.system_ids:
                        self.dropped["API links to an uncatalogued party"] += 1
                        continue
                    key = (consumer, provider, str(api["name"]).casefold())
                    if key in seen:
                        continue
                    seen.add(key)
                    dependencies.append(
                        {
                            "source_system_id": consumer,
                            "target_system_id": provider,
                            "description": api["name"],
                            "kind": kind,
                        }
                    )
        return dependencies

    def _channel(self, channel: Mapping[str, Any]) -> dict[str, Any]:
        entry = channel.get("systemId")
        return _present(
            id=channel["id"],
            name=channel.get("label") or channel["id"],
            kind=str(channel.get("kind") or "").capitalize() or None,
            entry_system=entry if entry in self.system_ids else None,
            description=channel.get("desc"),
        )

    def _supported(self, order_type: Mapping[str, Any]) -> list[str]:
        """The channels the order type can be ordered through; notes on support are counted."""
        supported = []
        for channel, support in (order_type.get("channels") or {}).items():
            if channel not in self.channels:
                continue
            if (support or {}).get("note") or (support or {}).get("reason"):
                self.dropped["notes on channel support"] += 1
            if (support or {}).get("supported"):
                supported.append(channel)
        return supported

    # Products ---------------------------------------------------------------

    def _product(self, product: Mapping[str, Any]) -> dict[str, Any]:
        order_types = [item["id"] for item in product.get("orderTypes") or ()]
        for key, label in _NOT_YET:
            if product.get(key):
                self.dropped[label] += 1
        for key, label in _READ_LIVE:
            if product.get(key):
                self.read_live[label] += 1
        if (product.get("gov") or {}).get("decisions") or (product.get("gov") or {}).get(
            "questions"
        ):
            self.dropped["governance decisions and questions"] += 1
        return {
            **_present(
                id=product["id"],
                name=product["name"],
                code=product.get("code"),
                family=product.get("family"),
                version=product.get("version"),
                lifecycle=product.get("status"),
                proposition=product.get("description") or product.get("tagline"),
                rules=[_rule_text(item) for item in product.get("rules") or ()],
            ),
            **self._evidence(product.get("descEv")),
            "order_types": [
                {
                    **_present(
                        code=item["id"],
                        name=item["label"],
                        enabled=True,
                        description=item.get("desc"),
                        channels=self._supported(item),
                    ),
                    **self._evidence(item.get("ev")),
                }
                for item in product.get("orderTypes") or ()
            ],
            "components": [
                self._component(item, order_types) for item in product.get("components") or ()
            ],
            "values": [self._point(item) for item in product.get("values") or ()],
            "audiences": [self._point(item) for item in product.get("fits") or ()],
            "nfrs": self._nfrs(product),
            **self._tracking(product, order_types),
        }

    def _point(self, item: Mapping[str, Any]) -> dict[str, Any]:
        return {
            **_present(name=item.get("title") or item.get("text"), description=item.get("desc")),
            **self._evidence(item.get("ev")),
        }

    def _component(self, part: Mapping[str, Any], order_types: list[str]) -> dict[str, Any]:
        # The explorer's third obligation: neither always in nor an add-on.
        configurable = part.get("mandatory") == "CONFIGURABLE"
        return {
            **_present(
                id=part["id"],
                name=part["name"],
                code="; ".join(part.get("codes") or ()),
                type=part.get("cat"),
                mandatory=part.get("mandatory")
                if isinstance(part.get("mandatory"), bool)
                else None,
                commercial_spec="Configurable" if configurable else None,
                customer_visible=part.get("visible"),
                description=part.get("desc"),
            ),
            **self._evidence(part.get("ev")),
            "responsibilities": self._responsibilities(part, order_types),
            "realisation": self._realisation(part),
        }

    def _realisation(self, part: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Its CFS, RFS and resource layers, each named once per layer."""
        found: dict[tuple[str, str], dict[str, Any]] = {}
        for key, layer in (("cfs", "cfs"), ("rfs", "rfs"), ("res", "resource")):
            for entry in part.get(key) or ():
                name = str(entry.get("name") or "").strip()
                if name:
                    found.setdefault(
                        (layer, name.casefold()),
                        {"layer": layer, "name": name, **self._evidence(entry.get("ev"))},
                    )
        return list(found.values())

    def _tracking(self, product: Mapping[str, Any], order_types: list[str]) -> dict[str, Any]:
        """How its orders are tracked: the order types tracking is specified for, the core
        flows, each channel's correlation and tracking screen, milestones, internal statuses
        and fallout. A correlation key the source says is not defined is left blank."""
        raw = product.get("tracking") or {}
        if not raw:
            return {}
        apis = {item["id"]: item.get("name") or item["id"] for item in product.get("apis") or ()}
        known = set(order_types)

        def system(system_id: object) -> str | None:
            if system_id in (None, ""):
                return None
            if system_id in self.system_ids:
                return str(system_id)
            self.dropped["tracking facts naming an uncatalogued system"] += 1
            return None

        flows = []
        for flow in raw.get("core") or ():
            source, target = system(flow.get("from")), system(flow.get("to"))
            if source and target:
                flows.append(
                    {
                        "from_system": source,
                        "to_system": target,
                        "label": flow.get("label") or "Order events",
                        **_present(interface=apis.get(flow.get("api") or "", flow.get("api"))),
                        **self._evidence(flow.get("ev")),
                    }
                )
        channels = []
        for channel_id, entry in (raw.get("entry") or {}).items():
            if channel_id not in self.channels:
                self.dropped["tracking of an uncatalogued channel"] += 1
                continue
            read = entry.get("read") or {}
            key = str(entry.get("id") or "").strip()
            channels.append(
                {
                    "channel": channel_id,
                    **_present(
                        correlation_key=None if _NOT_DEFINED.search(key) else key,
                        ui_system=system(entry.get("ui")),
                        story=entry.get("story"),
                        read_system=system(read.get("to")),
                        read_interface=read.get("label")
                        or apis.get(read.get("api") or "", read.get("api")),
                        ui_note=entry.get("uiGap"),
                    ),
                    **self._evidence(entry.get("corrEv")),
                }
            )

        def events(key: str) -> list[dict[str, Any]]:
            return [
                {
                    **_present(
                        label=item.get("label"),
                        detail=item.get("detail"),
                        system=system(item.get("sys")),
                    ),
                    **self._evidence(item.get("ev")),
                }
                for item in raw.get(key) or ()
                if item.get("label")
            ]

        return {
            "tracking": {
                **_present(
                    order_types=[item for item in raw.get("applies") or () if item in known],
                    scope_note=raw.get("scopeNote"),
                    not_applicable_note=raw.get("notApplicable"),
                ),
                "flows": flows,
                "channels": channels,
                "milestones": events("milestones"),
                "statuses": events("internal"),
                "fallout": [
                    {
                        **_present(trigger=item.get("trigger"), handling=item.get("handling")),
                        **self._evidence(item.get("ev")),
                    }
                    for item in raw.get("fallout") or ()
                    if item.get("trigger")
                ],
            }
        }

    def _nfrs(self, product: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Each quality once, with how far the sources define it; a gap stays a gap."""
        found: dict[str, dict[str, Any]] = {}
        for item in product.get("nfr") or ():
            quality = str(item.get("attr") or "").strip()
            if quality and quality.casefold() not in found:
                found[quality.casefold()] = {
                    "quality": quality,
                    "coverage": _COVERAGE.get(str(item.get("status") or ""), "partial"),
                    **_present(statement=item.get("text")),
                    **self._evidence(item.get("ev")),
                }
        return list(found.values())

    def _responsibilities(
        self, part: Mapping[str, Any], order_types: list[str]
    ) -> list[dict[str, Any]]:
        """One per system and role; the explorer's own words become the description.

        The role is read from the scope the explorer gives: design time, operations,
        or fulfilment of the order types it names.
        """
        merged: dict[tuple[str, str], dict[str, Any]] = {}
        known = {code.casefold() for code in order_types}
        for duty in part.get("sys") or ():
            scope = list(duty.get("ots") or ())
            role = next((_ROLE_BY_SCOPE[item] for item in scope if item in _ROLE_BY_SCOPE), None)
            role = role or _FULFILMENT
            orders = [] if "*" in scope else [item for item in scope if item.casefold() in known]
            entry = merged.get((duty["id"], role))
            evidence = self._evidence(duty.get("ev"))
            if entry is None:
                merged[(duty["id"], role)] = {
                    "system": duty["id"],
                    "role": role,
                    "description": duty.get("role") or role,
                    "order_types": orders,
                    "all": not orders and role == _FULFILMENT,
                    **evidence,
                }
                continue
            entry["description"] = f"{entry['description']}; {duty.get('role') or role}"
            entry["all"] = entry["all"] or (not orders and role == _FULFILMENT)
            entry["order_types"] = list(dict.fromkeys([*entry["order_types"], *orders]))
            entry["confidence"] = _weaker(entry.get("confidence"), evidence.get("confidence"))
            sources = [entry.get("source"), evidence.get("source")]
            entry["source"] = " / ".join(dict.fromkeys(item for item in sources if item)) or None
        return [
            _present(
                **{key: value for key, value in entry.items() if key not in {"all", "order_types"}},
                order_types=[] if entry["all"] else entry["order_types"],
            )
            for entry in merged.values()
        ]

    # Journeys ---------------------------------------------------------------

    def _journeys(self, product: Mapping[str, Any]) -> list[dict[str, Any]]:
        components = {item["id"] for item in product.get("components") or ()}
        apis = {item["id"]: item for item in product.get("apis") or ()}
        journeys = []
        for order_type in product.get("orderTypes") or ():
            graph = (product.get("journeys") or {}).get(order_type["id"])
            if not graph or not graph.get("nodes"):
                self.report.append(f"{product['name']} › {order_type['label']}: no journey.")
                continue
            journeys.append(self._journey(product, order_type, graph, components, apis))
        return journeys

    def _journey(
        self,
        product: Mapping[str, Any],
        order_type: Mapping[str, Any],
        graph: Mapping[str, Any],
        components: set[str],
        apis: Mapping[str, Mapping[str, Any]],
    ) -> dict[str, Any]:
        nodes = _ordered(graph["nodes"], graph.get("edges") or ())
        number = {node["id"]: str(index) for index, node in enumerate(nodes, start=1)}
        labels = {key: str(item.get("label") or key) for key, item in self.channels.items()}
        edges = _merged_edges(graph.get("edges") or (), labels)
        leaving: dict[str, list[dict[str, Any]]] = {}
        for edge in edges:
            leaving.setdefault(edge["from"], []).append(edge)
        tracks = {node["id"]: node.get("track") or MAIN_TRACK for node in nodes}
        main = [node["id"] for node in nodes if tracks[node["id"]] == MAIN_TRACK]
        for node_id in main[:-1]:
            if not leaving.get(node_id):
                tracks[node_id] = END_TRACK
        main = [node_id for node_id in main if tracks[node_id] == MAIN_TRACK]
        following = dict(zip(main, main[1:], strict=False))
        activities = [
            self._activity(node, number[node["id"]], tracks[node["id"]], components, apis)
            for node in nodes
        ]
        rules: list[dict[str, Any]] = []
        for node in nodes:
            out = leaving.get(node["id"], [])
            derived = (
                len(out) == 1
                and out[0]["kind"] == "seq"
                and not out[0].get("channels")
                and following.get(node["id"]) == out[0]["to"]
            )
            if derived:
                continue
            rules.extend(self._flow_rule(node, edge, number, tracks) for edge in out)
        integrations = [
            self._integration(edge, number, apis)
            for edge in edges
            if edge.get("api") or edge.get("cat") == "handoff" or edge.get("payload")
        ]
        name = f"{product['name']} — {order_type['label']}"
        return {
            "id": f"{product['id']}.{order_type['id']}",
            "name": name,
            "product": product["id"],
            "order_type": order_type["id"],
            **_present(description=order_type.get("desc")),
            **self._evidence(order_type.get("ev")),
            "activities": activities,
            "flow_rules": rules,
            "integrations": integrations,
            "_edges": [(number[edge["from"]], number[edge["to"]]) for edge in edges],
        }

    def _activity(
        self,
        node: Mapping[str, Any],
        number: str,
        track: str,
        components: set[str],
        apis: Mapping[str, Mapping[str, Any]],
    ) -> dict[str, Any]:
        notes: list[str] = []
        system = node.get("sys")
        # Performed by whichever channel the order came through (step 3).
        entry = system == ENTRY
        channels = [item for item in node.get("ch") or () if item in self.channels]
        if node.get("actor"):
            notes.append(f"Actor: {node['actor']}.")
        if node.get("sysGap"):
            notes.append(f"System gap: {node['sysGap']}")
        called = _listed(node.get("api"))
        if called:
            notes.append(
                "Calls " + ", ".join(apis.get(item, {}).get("name", item) for item in called) + "."
            )
        if node.get("note"):
            notes.append(str(node["note"]))
        supporting = [
            item["id"]
            for item in node.get("sup") or ()
            if item["id"] in self.system_ids and item["id"] != system
        ]
        named = [item for item in node.get("comp") or () if item in components]
        if len(named) != len(node.get("comp") or ()):
            self.dropped["step components outside the product"] += 1
        phase = self.phases.get(node.get("phase") or "", {})
        return {
            **_present(
                number=number,
                name=node["label"],
                phase=phase.get("label") or node.get("phase"),
                track=track,
                system=system if system in self.system_ids else None,
                channel_entry=entry or None,
                channels=channels,
                supporting=supporting,
                system_function=node.get("fn"),
                customer_visible=node.get("cv"),
                description=" ".join(notes),
                components=named,
                etom=node.get("etom") or phase.get("etom"),
            ),
            **self._evidence(node.get("ev")),
        }

    def _flow_rule(
        self,
        node: Mapping[str, Any],
        edge: Mapping[str, Any],
        number: Mapping[str, str],
        tracks: Mapping[str, str],
    ) -> dict[str, Any]:
        if edge["kind"] == "loop":
            kind = "loop"
        elif node.get("kind") == "and":
            kind = "parallel"
        else:
            kind = "decision"
        condition = " / ".join(
            item
            for item in (
                edge.get("label") or ("Fail" if edge["kind"] == "fail" else None),
                edge.get("channels"),
            )
            if item
        )
        branch = tracks[edge["to"]] if tracks[edge["to"]] != tracks[edge["from"]] else None
        return {
            "kind": kind,
            "from": number[edge["from"]],
            "to": number[edge["to"]],
            **_present(condition=condition, branch=branch),
            **self._evidence(edge.get("ev")),
        }

    def _integration(
        self,
        edge: Mapping[str, Any],
        number: Mapping[str, str],
        apis: Mapping[str, Mapping[str, Any]],
    ) -> dict[str, Any]:
        named = [apis[item] for item in _listed(edge.get("api")) if item in apis]
        return {
            "from": number[edge["from"]],
            "to": number[edge["to"]],
            **_present(
                interaction=edge.get("label") or "Handoff",
                interface=", ".join(item["name"] for item in named),
                payload=edge.get("payload") or (named[0].get("payload") if named else None),
                timing=_TIMING.get(str(edge.get("sync") or "").upper()),
            ),
            **self._evidence(edge.get("ev")),
        }

    # Checks -----------------------------------------------------------------

    def _check(self, mapping: dict[str, Any], products: list[Mapping[str, Any]]) -> None:
        """Refuses content the catalogue would refuse; reports a flow that differs."""
        expected = {item["id"]: item.pop("_edges") for item in mapping["journeys"]}
        content = content_from_mapping(mapping)
        system_ids = {item.id for item in content.systems}
        channel_ids = check_channels(content.channels, system_ids)
        check_offerings(content.products, system_ids, channel_ids)
        check_journeys(content.journeys, system_ids, content.products, channel_ids)
        for journey in content.journeys:
            derived = {(edge.from_activity, edge.to_activity) for edge in journey_edges(journey)}
            wanted = set(expected[journey.id])
            if derived != wanted:
                self.report.append(
                    f"{journey.name}: the catalogue's flow differs from the explorer's "
                    f"({len(wanted - derived)} arrows missing, {len(derived - wanted)} extra)."
                )
        self.report.insert(
            0,
            f"Read {len(content.systems)} systems, {len(content.relationships)} API links, "
            f"{len(content.products)} products and {len(content.journeys)} journeys "
            f"from {len(products)} explorer products.",
        )

    def _count_dropped(self) -> None:
        for section, label in (
            ("conflicts", "source conflicts"),
            ("changeHistory", "applied change requests"),
        ):
            if self.model.get(section):
                self.dropped[label] += len(self.model[section])
        library = self.model.get("library") or {}
        if library.get("capabilities"):
            self.dropped["capability-library entries"] += len(library["capabilities"])
        if self.sources:
            self.dropped["source levels (L1/L2/L3)"] += len(self.sources)
        for label, count in sorted(self.dropped.items()):
            self.report.append(f"Not carried over yet: {label} ({count}).")
        for label, count in sorted(self.read_live.items()):
            self.report.append(
                f"Not carried over: {label} ({count}); the explorer reads them live from the "
                "product catalog by the offering's code."
            )


def _present(**values: Any) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value not in (None, "", [], ())}


def _listed(value: object) -> list[str]:
    if not value:
        return []
    return [str(item) for item in value] if isinstance(value, list) else [str(value)]


def _rule_text(item: Mapping[str, Any]) -> str:
    title, text = item.get("title"), item.get("text") or item.get("desc")
    return f"{title}: {text}" if title and text else str(title or text)


_STRENGTH = {"gap": 0, "inferred": 1, "confirmed": 2}


def _weaker(first: str | None, second: str | None) -> str | None:
    known = [item for item in (first, second) if item]
    return min(known, key=_STRENGTH.__getitem__) if known else None


def _merged_edges(
    edges: Iterable[Mapping[str, Any]], labels: Mapping[str, str]
) -> list[dict[str, Any]]:
    """One edge per pair of steps; channel-scoped copies keep every channel."""
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for edge in edges:
        key = (edge["from"], edge["to"])
        channels = list(edge.get("ch") or ())
        if key in merged:
            merged[key]["_ch"].extend(item for item in channels if item not in merged[key]["_ch"])
            merged[key]["_all"] = merged[key]["_all"] or not channels
            continue
        merged[key] = {**edge, "_ch": channels, "_all": not channels}
    for edge in merged.values():
        channels, every = edge.pop("_ch"), edge.pop("_all")
        if channels and not every:
            edge["channels"] = "Channels: " + ", ".join(labels.get(item, item) for item in channels)
    return list(merged.values())


def _ordered(
    nodes: list[Mapping[str, Any]], edges: Iterable[Mapping[str, Any]]
) -> list[Mapping[str, Any]]:
    """The steps in flow order: each after the steps leading to it (loops aside), ties
    in the explorer's own order."""
    position = {node["id"]: index for index, node in enumerate(nodes)}
    incoming: dict[str, set[str]] = {node["id"]: set() for node in nodes}
    for edge in edges:
        if edge["kind"] != "loop" and edge["from"] in position and edge["to"] in position:
            incoming[edge["to"]].add(edge["from"])
    done: list[str] = []
    placed: set[str] = set()
    while len(done) < len(nodes):
        ready = [
            node_id for node_id in position if node_id not in placed and incoming[node_id] <= placed
        ]
        # A cycle the explorer did not mark as a loop: take the earliest step.
        step = min(ready or (set(position) - placed), key=position.__getitem__)
        done.append(step)
        placed.add(step)
    by_id = {node["id"]: node for node in nodes}
    return [by_id[node_id] for node_id in done]
