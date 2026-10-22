"""The offering sheets of a workbook gathered into the YAML/JSON shape."""

from __future__ import annotations

from typing import Any

from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.infrastructure.architecture.catalogue_files.fields import _split, _text
from knowledge_portal.infrastructure.architecture.catalogue_files.workbook_sheets import (
    _CELLS,
    _HEADERS,
    BOUNDARIES,
    BUSINESS_RULES,
    DECISIONS,
    LIFECYCLE_BLOCKS,
    LIFECYCLE_NOTES,
    NFRS,
    OFFERING_COMPONENTS,
    ORDER_TYPES,
    PLAN_CHARACTERISTICS,
    PLANS,
    PRODUCT_POINTS,
    PRODUCTS,
    QUESTIONS,
    REALISATION,
    RESPONSIBILITIES,
    TRACKING,
    TRACKING_CHANNELS,
    TRACKING_EVENTS,
    TRACKING_FLOWS,
    _rows,
)

_VALUE_KINDS = frozenset({"value", "values", "customer value"})
_EVENT_KINDS = {
    "milestone": "milestones",
    "status": "statuses",
    "internal status": "statuses",
    "fallout": "fallout",
}
# The lists a product's tracking gathers from the TrackingFlows, TrackingChannels and
# TrackingEvents sheets.
_TRACKING_LISTS = ("flows", "channels", "milestones", "statuses", "fallout")
_AUDIENCE_KINDS = frozenset({"audience", "audiences", "who it is for"})


def _sheet_offerings(workbook: Any) -> list[dict[str, Any]]:
    """The offering sheets gathered into the YAML/JSON shape, each entry knowing its row."""
    offerings = _sheet_products(workbook)
    _sheet_order_types(workbook, offerings)
    parts = _sheet_offering_components(workbook, offerings)
    _sheet_responsibilities(workbook, offerings, parts)
    _sheet_realisation(workbook, offerings, parts)
    _sheet_nfrs(workbook, offerings)
    _sheet_plans(workbook, offerings)
    _sheet_entries(workbook, offerings, BUSINESS_RULES, "business_rules", "rule_id")
    _sheet_lifecycle_notes(workbook, offerings)
    _sheet_tracking(workbook, offerings)
    _sheet_points(workbook, offerings)
    _sheet_entries(workbook, offerings, QUESTIONS, "questions", "question_id")
    _sheet_entries(workbook, offerings, DECISIONS, "decisions", "decision_id")
    _sheet_boundaries(workbook, offerings)
    return list(offerings.values())


def _sheet_products(workbook: Any) -> dict[str, dict[str, Any]]:
    offerings: dict[str, dict[str, Any]] = {}
    for number, cells in _rows(workbook, PRODUCTS):
        where = f"{PRODUCTS} row {number}"
        product_id = _text(cells.get("product_id"), where, "product_id")
        if product_id in offerings:
            raise InvalidKnowledgeError(f"{where}: product {product_id!r} is listed twice.")
        offerings[product_id] = {
            **{
                key: cells.get(key)
                for key in _HEADERS[PRODUCTS][1:]
                if key not in {"rules", "sources", "former_ids"}
            },
            "_where": where,
            "id": product_id,
            "rules": list(_split(cells.get("rules"), where, "rules")),
            "sources": list(_split(cells.get("sources"), where, "sources")),
            "former_ids": list(_split(cells.get("former_ids"), where, "former_ids")),
            "questions": [],
            "decisions": [],
            "boundaries": [],
            "not_used": [],
            "order_types": [],
            "components": [],
            "values": [],
            "audiences": [],
            "nfrs": [],
            "lifecycle_notes": [],
            "plans": [],
            "business_rules": [],
        }
    return offerings


def _owning_offering(
    offerings: dict[str, dict[str, Any]], cells: dict[str, object], where: str
) -> dict[str, Any]:
    product_id = _text(cells.get("product_id"), where, "product_id")
    if product_id not in offerings:
        raise InvalidKnowledgeError(
            f"{where}: product {product_id!r} is not listed on the {PRODUCTS} sheet."
        )
    return offerings[product_id]


def _sheet_order_types(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    for number, cells in _rows(workbook, ORDER_TYPES):
        where = f"{ORDER_TYPES} row {number}"
        _owning_offering(offerings, cells, where)["order_types"].append(
            {
                **cells,
                "_where": where,
                "channels": list(_split(cells.get("channels"), where, "channels")),
            }
        )


def _sheet_offering_components(
    workbook: Any, offerings: dict[str, dict[str, Any]]
) -> dict[tuple[str, str], dict[str, Any]]:
    """Each offering's components, by product and component, for the rows that follow."""
    parts: dict[tuple[str, str], dict[str, Any]] = {}
    for number, cells in _rows(workbook, OFFERING_COMPONENTS):
        where = f"{OFFERING_COMPONENTS} row {number}"
        owner = _owning_offering(offerings, cells, where)
        part = {
            **cells,
            "_where": where,
            "id": cells.get("component_id"),
            "capabilities": list(_split(cells.get("capability_ids"), where, "capability_ids")),
            "responsibilities": [],
            "realisation": [],
        }
        parts[(owner["id"], _text(cells.get("component_id"), where, "component_id"))] = part
        owner["components"].append(part)
    return parts


def _owning_component(
    offerings: dict[str, dict[str, Any]],
    parts: dict[tuple[str, str], dict[str, Any]],
    cells: dict[str, object],
    where: str,
) -> dict[str, Any]:
    key = (
        _owning_offering(offerings, cells, where)["id"],
        _text(cells.get("component_id"), where, "component_id"),
    )
    if key not in parts:
        raise InvalidKnowledgeError(
            f"{where}: component {key[1]!r} is not listed on the {OFFERING_COMPONENTS} sheet."
        )
    return parts[key]


def _sheet_responsibilities(
    workbook: Any,
    offerings: dict[str, dict[str, Any]],
    parts: dict[tuple[str, str], dict[str, Any]],
) -> None:
    for number, cells in _rows(workbook, RESPONSIBILITIES):
        where = f"{RESPONSIBILITIES} row {number}"
        _owning_component(offerings, parts, cells, where)["responsibilities"].append(
            {
                **cells,
                "_where": where,
                "system": cells.get("system_id"),
                "order_types": list(_split(cells.get("order_types"), where, "order_types")),
            }
        )


def _sheet_realisation(
    workbook: Any,
    offerings: dict[str, dict[str, Any]],
    parts: dict[tuple[str, str], dict[str, Any]],
) -> None:
    for number, cells in _rows(workbook, REALISATION):
        where = f"{REALISATION} row {number}"
        _owning_component(offerings, parts, cells, where)["realisation"].append(
            {**cells, "_where": where, "record": cells.get("record_id")}
        )


def _sheet_nfrs(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    for number, cells in _rows(workbook, NFRS):
        where = f"{NFRS} row {number}"
        _owning_offering(offerings, cells, where)["nfrs"].append({**cells, "_where": where})


def _sheet_plans(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    plans: dict[tuple[str, str], dict[str, Any]] = {}
    for number, cells in _rows(workbook, PLANS):
        where = f"{PLANS} row {number}"
        owner = _owning_offering(offerings, cells, where)
        plan = {**cells, "_where": where, "name": cells.get("plan"), "characteristics": {}}
        plans[(owner["id"], _text(cells.get("plan"), where, "plan"))] = plan
        owner["plans"].append(plan)
    for number, cells in _rows(workbook, PLAN_CHARACTERISTICS):
        where = f"{PLAN_CHARACTERISTICS} row {number}"
        key = (
            _owning_offering(offerings, cells, where)["id"],
            _text(cells.get("plan"), where, "plan"),
        )
        if key not in plans:
            raise InvalidKnowledgeError(f"{where}: plan {key[1]!r} is not listed on {PLANS}.")
        name = _text(cells.get("characteristic"), where, "characteristic")
        if name in plans[key]["characteristics"]:
            raise InvalidKnowledgeError(f"{where}: {name!r} is given twice for {key[1]!r}.")
        plans[key]["characteristics"][name] = cells.get("value")


def _sheet_entries(
    workbook: Any, offerings: dict[str, dict[str, Any]], sheet: str, key: str, id_header: str
) -> None:
    """A sheet of an offering's identified entries: business rules, questions or decisions."""
    for number, cells in _rows(workbook, sheet):
        where = f"{sheet} row {number}"
        _owning_offering(offerings, cells, where)[key].append(
            {**cells, "_where": where, "id": cells.get(id_header)}
        )


def _sheet_lifecycle_notes(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    notes: dict[tuple[str, str], dict[str, Any]] = {}
    for number, cells in _rows(workbook, LIFECYCLE_NOTES):
        where = f"{LIFECYCLE_NOTES} row {number}"
        owner = _owning_offering(offerings, cells, where)
        note = {
            **cells,
            "_where": where,
            "id": cells.get("note_id"),
            "order_types": list(_split(cells.get("order_types"), where, "order_types")),
            "channels": list(_split(cells.get("channels"), where, "channels")),
            "blocks": [],
        }
        notes[(owner["id"], _text(cells.get("note_id"), where, "note_id"))] = note
        owner["lifecycle_notes"].append(note)
    for number, cells in _rows(workbook, LIFECYCLE_BLOCKS):
        where = f"{LIFECYCLE_BLOCKS} row {number}"
        key = (
            _owning_offering(offerings, cells, where)["id"],
            _text(cells.get("note_id"), where, "note_id"),
        )
        if key not in notes:
            raise InvalidKnowledgeError(
                f"{where}: note {key[1]!r} is not listed on the {LIFECYCLE_NOTES} sheet."
            )
        _block_row(notes[key]["blocks"], cells, where)


def _block_row(blocks: list[dict[str, Any]], cells: dict[str, object], where: str) -> None:
    """A LifecycleBlocks row: a block, or an item or table row of the block before it."""
    kind = _text(cells.get("kind"), where, "kind").casefold()
    row = [cells.get(name) for name in _CELLS]
    while row and (row[-1] is None or str(row[-1]).strip() == ""):
        row.pop()
    if kind in {"item", "row"}:
        opener = "list" if kind == "item" else "table"
        if not blocks or blocks[-1].get("kind") != opener:
            what = "a list item" if kind == "item" else "a table row"
            raise InvalidKnowledgeError(f"{where}: {what} must follow its {opener}.")
        if kind == "item":
            blocks[-1]["items"].append(cells.get("text"))
        else:
            blocks[-1]["rows"].append(["" if cell is None else cell for cell in row])
        return
    if kind not in {"text", "list", "table"}:
        raise InvalidKnowledgeError(f"{where}: kind must be text, list, item, table or row.")
    blocks.append(
        {
            **cells,
            "_where": where,
            "kind": kind,
            "text": cells.get("text") if kind == "text" else None,
            "caption": cells.get("text") if kind == "table" else None,
            "items": [],
            "columns": row if kind == "table" else [],
            "rows": [],
        }
    )


def _tracking_entry(
    offerings: dict[str, dict[str, Any]], cells: dict[str, object], where: str
) -> dict[str, Any]:
    owner = _owning_offering(offerings, cells, where)
    if owner.get("tracking") is None:
        owner["tracking"] = {"_where": where, **{key: [] for key in _TRACKING_LISTS}}
    found: dict[str, Any] = owner["tracking"]
    return found


def _sheet_tracking(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    for number, cells in _rows(workbook, TRACKING):
        where = f"{TRACKING} row {number}"
        if _owning_offering(offerings, cells, where).get("tracking") is not None:
            raise InvalidKnowledgeError(f"{where}: a product's tracking is one row.")
        # A column named for one of the lists is ignored like any other unknown column; the
        # tracking sheets below append to those lists.
        _tracking_entry(offerings, cells, where).update(
            {
                **{key: value for key, value in cells.items() if key not in _TRACKING_LISTS},
                "_where": where,
                "order_types": list(_split(cells.get("order_types"), where, "order_types")),
            }
        )
    for number, cells in _rows(workbook, TRACKING_FLOWS):
        where = f"{TRACKING_FLOWS} row {number}"
        _tracking_entry(offerings, cells, where)["flows"].append(
            {
                **cells,
                "_where": where,
                "from_system": cells.get("from_system_id"),
                "to_system": cells.get("to_system_id"),
            }
        )
    for number, cells in _rows(workbook, TRACKING_CHANNELS):
        where = f"{TRACKING_CHANNELS} row {number}"
        _tracking_entry(offerings, cells, where)["channels"].append(
            {
                **cells,
                "_where": where,
                "channel": cells.get("channel_id"),
                "ui_system": cells.get("ui_system_id"),
                "read_system": cells.get("read_system_id"),
            }
        )
    for number, cells in _rows(workbook, TRACKING_EVENTS):
        where = f"{TRACKING_EVENTS} row {number}"
        kind = _text(cells.get("kind"), where, "kind").casefold()
        if kind not in _EVENT_KINDS:
            raise InvalidKnowledgeError(f"{where}: kind must be milestone, status or fallout.")
        entry = {**cells, "_where": where, "system": cells.get("system_id")}
        if kind == "fallout":
            entry = {**entry, "trigger": cells.get("label"), "handling": cells.get("detail")}
        _tracking_entry(offerings, cells, where)[_EVENT_KINDS[kind]].append(entry)


def _sheet_points(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    for number, cells in _rows(workbook, PRODUCT_POINTS):
        where = f"{PRODUCT_POINTS} row {number}"
        kind = (_text(cells.get("kind"), where, "kind")).casefold()
        if kind not in _VALUE_KINDS | _AUDIENCE_KINDS:
            raise InvalidKnowledgeError(f"{where}: kind must be value or audience.")
        bucket = "values" if kind in _VALUE_KINDS else "audiences"
        _owning_offering(offerings, cells, where)[bucket].append({**cells, "_where": where})


def _sheet_boundaries(workbook: Any, offerings: dict[str, dict[str, Any]]) -> None:
    for number, cells in _rows(workbook, BOUNDARIES):
        where = f"{BOUNDARIES} row {number}"
        kind = _text(cells.get("kind"), where, "kind").casefold().replace(" ", "_")
        if kind not in {"boundary", "not_used"}:
            raise InvalidKnowledgeError(f"{where}: kind must be boundary or not_used.")
        bucket = "boundaries" if kind == "boundary" else "not_used"
        _owning_offering(offerings, cells, where)[bucket].append(
            _text(cells.get("text"), where, "text")
        )
