"""The catalogue workbook's sheets: their names, headers and instructions, and its
rows read by header."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from smb_kernel.documents.extraction_base import MAX_WORKBOOK_ROWS

from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.domain.architecture.lifecycle import MAX_TABLE_COLUMNS
from knowledge_portal.infrastructure.architecture.catalogue_files.fields import _KINDS

SYSTEMS = "Systems"
COMPONENTS = "Components"
CAPABILITIES = "Capabilities"
CONSTRAINTS = "Constraints"
RELATIONSHIPS = "Relationships"
DOMAINS = "Domains"
LANDSCAPE = "LandscapeDomains"
PRODUCTS = "Products"
ORDER_TYPES = "OrderTypes"
OFFERING_COMPONENTS = "OfferingComponents"
RESPONSIBILITIES = "Responsibilities"
PRODUCT_POINTS = "ProductPoints"
JOURNEYS = "Journeys"
ACTIVITIES = "Activities"
FLOW_RULES = "FlowRules"
ACTIVITY_INTEGRATIONS = "ActivityIntegrations"
CHANNELS = "Channels"
REALISATION = "Realisation"
NFRS = "NFRs"
TRACKING = "Tracking"
TRACKING_FLOWS = "TrackingFlows"
TRACKING_CHANNELS = "TrackingChannels"
TRACKING_EVENTS = "TrackingEvents"
LIFECYCLE_NOTES = "LifecycleNotes"
LIFECYCLE_BLOCKS = "LifecycleBlocks"
SOURCES = "Sources"
CONFLICTS = "Conflicts"
CONFLICT_SCOPES = "ConflictScopes"
QUESTIONS = "Questions"
DECISIONS = "Decisions"
BOUNDARIES = "Boundaries"
CHANGE_HISTORY = "ChangeHistory"
CHANGE_ITEMS = "ChangeItems"
PORTFOLIO = "Portfolio"
PLANS = "Plans"
PLAN_CHARACTERISTICS = "PlanCharacteristics"
BUSINESS_RULES = "BusinessRules"
CONCEPTS = "Concepts"
VOCABULARY = "Vocabulary"
SCHEMES = "Schemes"
INTERFACES = "Interfaces"
REALISATION_RECORDS = "RealisationRecords"
ACCEPTANCES = "Acceptances"
MASTERY_NOTES = "MasteryNotes"
_CELLS = tuple(f"cell_{number}" for number in range(1, MAX_TABLE_COLUMNS + 1))
INSTRUCTIONS = "Instructions"
_DOMAIN_HEADERS = ("domain_id", "name", "name_ar", "parent_id", "description")
_HEADERS: dict[str, tuple[str, ...]] = {
    SYSTEMS: (
        "system_id",
        "name",
        "name_ar",
        "aliases",
        "description",
        "landscape_domain_id",
        "owner",
        "external",
        "roadmap",
        "placement_from",
        "placement_reason",
        "confidence",
        "source",
        "masters",
        "reads",
        "deprecated",
        "replaced_by",
    ),
    COMPONENTS: (
        "system_id",
        "component_id",
        "name",
        "name_ar",
        "aliases",
        "technology",
        "description",
        "confidence",
        "source",
        # The term of a curated vocabulary the technology means (review recommendation 9).
        "technology_term",
    ),
    CAPABILITIES: (
        "system_id",
        "capability_id",
        "name",
        "triggers",
        "domain_id",
        "component_id",
        "concept_id",
        "unlinked_reason",
        "confidence",
        "source",
    ),
    CONSTRAINTS: ("system_id", "constraint"),
    RELATIONSHIPS: (
        "source_system_id",
        "target_system_id",
        "description",
        "kind",
        "confidence",
        "source",
    ),
    DOMAINS: _DOMAIN_HEADERS,
    # layout (optional): bus, above_bus or side, where the map draws a top domain.
    LANDSCAPE: (*_DOMAIN_HEADERS, "cross_cutting", "layout"),
    PRODUCTS: (
        "product_id",
        "name",
        "code",
        "family",
        "version",
        "lifecycle",
        "proposition",
        "rules",
        "confidence",
        "source",
        "sources",
        "primary_source",
        "portfolio",
        "purpose",
        # Ids it was known by before a rename, by ;.
        "former_ids",
        # Retired, and the offering that takes its place (review recommendation 7).
        "deprecated",
        "replaced_by",
        # The terms of curated vocabularies its family and lifecycle mean (recommendation 9).
        "family_term",
        "lifecycle_term",
    ),
    ORDER_TYPES: (
        "product_id",
        "code",
        "name",
        "enabled",
        "description",
        "confidence",
        "source",
        "channels",
        "delivery_drop",
        "stage",
    ),
    OFFERING_COMPONENTS: (
        "product_id",
        "component_id",
        "name",
        "code",
        "type",
        "mandatory",
        "customer_visible",
        "description",
        "commercial_spec",
        "technical_spec",
        "technical_details",
        "confidence",
        "source",
        "capability_ids",
        "unlinked_reason",
        "type_term",
        "hub",
    ),
    RESPONSIBILITIES: (
        "product_id",
        "component_id",
        "system_id",
        "role",
        "description",
        "order_types",
        "confidence",
        "source",
        "role_term",
    ),
    PRODUCT_POINTS: ("product_id", "kind", "name", "description", "confidence", "source"),
    JOURNEYS: (
        "journey_id",
        "name",
        "product_id",
        "order_type_code",
        "description",
        "confidence",
        "source",
        "former_ids",
    ),
    ACTIVITIES: (
        "journey_id",
        "number",
        "name",
        "phase",
        "track",
        "performing_system_id",
        "supporting_system_ids",
        "system_function",
        "mode",
        "customer_visible",
        "description",
        "component_ids",
        "input",
        "output",
        "etom",
        "confidence",
        "source",
        "channels",
        "channel_entry",
        "performer",
        "point_of_no_return",
        "role",
        "etom_term",
        "role_term",
        # The terms of curated vocabularies its mode and phase mean (recommendation 9).
        "mode_term",
        "phase_term",
    ),
    FLOW_RULES: (
        "journey_id",
        "kind",
        "from_activity",
        "to_activity",
        "condition",
        "branch",
        "parallel_group",
        "rejoin_at",
        "confidence",
        "source",
        "channel_id",
    ),
    ACTIVITY_INTEGRATIONS: (
        "journey_id",
        "from_activity",
        "to_activity",
        "interaction",
        "interface",
        "payload",
        "timing",
        "correlation_key",
        "confidence",
        "source",
        "from_system",
        "to_system",
        "via",
        "purpose",
        "style",
        "tmf_equivalent",
        "open_apis",
        # The interface record the call goes through, by id (review recommendation 8).
        "interface_id",
    ),
    CHANNELS: (
        "channel_id",
        "name",
        "kind",
        "entry_system_id",
        "description",
        "confidence",
        "source",
        "kind_term",
    ),
    REALISATION: (
        "product_id",
        "component_id",
        "layer",
        "name",
        "confidence",
        "source",
        "record_id",
    ),
    NFRS: (
        "product_id",
        "quality",
        "coverage",
        "statement",
        "confidence",
        "source",
        "quality_term",
    ),
    TRACKING: (
        "product_id",
        "order_types",
        "scope_note",
        "not_applicable_note",
        "confidence",
        "source",
    ),
    TRACKING_FLOWS: (
        "product_id",
        "from_system_id",
        "to_system_id",
        "label",
        "interface",
        "confidence",
        "source",
        "interface_id",
    ),
    TRACKING_CHANNELS: (
        "product_id",
        "channel_id",
        "correlation_key",
        "ui_system_id",
        "story",
        "read_system_id",
        "read_interface",
        "ui_note",
        "confidence",
        "source",
    ),
    TRACKING_EVENTS: (
        "product_id",
        "kind",
        "label",
        "detail",
        "system_id",
        "confidence",
        "source",
    ),
    LIFECYCLE_NOTES: (
        "product_id",
        "note_id",
        "title",
        "kind",
        "summary",
        "order_types",
        "channels",
        "confidence",
        "source",
    ),
    LIFECYCLE_BLOCKS: (
        "product_id",
        "note_id",
        "kind",
        "title",
        "text",
        *_CELLS,
        "confidence",
        "source",
        "to_verify",
    ),
    SOURCES: (
        "source_id",
        "level",
        "title",
        "short",
        "version",
        "file",
        "supplied",
        "authority",
        "scope",
        "boundary",
    ),
    CONFLICTS: (
        "conflict_id",
        "title",
        "a_source_id",
        "a_reference",
        "a_statement",
        "b_source_id",
        "b_reference",
        "b_statement",
        "difference",
        "impact",
        "decision",
        "confidence",
        "source",
    ),
    CONFLICT_SCOPES: ("conflict_id", "product_id", "order_types", "question_id"),
    QUESTIONS: (
        "product_id",
        "question_id",
        "text",
        "impact",
        "confidence",
        "source",
        "order_types",
        "title",
    ),
    DECISIONS: ("product_id", "decision_id", "title", "text", "confidence", "source"),
    BOUNDARIES: ("product_id", "kind", "text"),
    CHANGE_HISTORY: (
        "change_request_id",
        "title",
        "origin",
        "product_id",
        "requester",
        "reason",
        "priority",
        "target_date",
        "created_at",
        "applied_at",
        "gaps",
        "requirement_id",
        "breakdown_revision",
        "approval_id",
        "approved_by",
        "approved_at",
        "epic_id",
        "epic_name",
        "features",
        "export_schema",
        "knowledge_version",
    ),
    CHANGE_ITEMS: ("change_request_id", "kind", "summary", "status", "feature_id"),
    PORTFOLIO: (
        "node_id",
        "name",
        "level",
        "parent_id",
        "description",
        "confidence",
        "source",
        "deprecated",
        "replaced_by",
        "level_term",
    ),
    PLANS: ("product_id", "plan", "description", "confidence", "source"),
    PLAN_CHARACTERISTICS: ("product_id", "plan", "characteristic", "value"),
    BUSINESS_RULES: (
        "product_id",
        "rule_id",
        "statement",
        "kind",
        "confidence",
        "source",
        "kind_term",
    ),
    CONCEPTS: (
        "concept_id",
        "pref_label",
        "alt_labels",
        "definition",
        "broader_id",
        "domain_id",
        "exact_match",
        "confidence",
        "source",
        "deprecated",
        "replaced_by",
        # Outside references near enough to read across, by ; (SKOS closeMatch).
        "close_match",
    ),
    # The vocabularies curators define (review recommendation 9): fields by ;.
    SCHEMES: ("scheme_id", "name", "definition", "fields"),
    VOCABULARY: (
        "term_id",
        "scheme",
        "pref_label",
        "alt_labels",
        "notation",
        "definition",
        "broader_id",
        "exact_match",
        "confidence",
        "source",
        "deprecated",
        "replaced_by",
        # Outside references near enough to read across, by ; (SKOS closeMatch).
        "close_match",
        # Its place among its scheme's terms, 1 first, such as roles strongest first.
        "rank",
    ),
    INTERFACES: (
        "interface_id",
        "name",
        "system_id",
        "style",
        "consumers",
        "open_apis",
        "entities",
        "description",
        "confidence",
        "source",
        "relays",
    ),
    REALISATION_RECORDS: (
        "record_id",
        "layer",
        "name",
        "aliases",
        "systems",
        "realised_by",
        "description",
        "confidence",
        "source",
    ),
    MASTERY_NOTES: ("system_id", "entity_id", "note"),
    ACCEPTANCES: (
        "entity",
        "key",
        "candidate_id",
        "model",
        "prompt_version",
        "decided_by",
        "decided_at",
        "citations",
    ),
}
# Headers a sheet cannot do without. Columns added later stay optional, so
# workbooks filled from an older template still import.
_REQUIRED_HEADERS: dict[str, tuple[str, ...]] = {
    SYSTEMS: ("system_id", "name"),
    COMPONENTS: ("system_id", "component_id", "name"),
    CAPABILITIES: ("system_id", "capability_id", "name", "triggers"),
    CONSTRAINTS: _HEADERS[CONSTRAINTS],
    RELATIONSHIPS: ("source_system_id", "target_system_id", "description"),
    DOMAINS: ("domain_id", "name"),
    LANDSCAPE: ("domain_id", "name"),
    PRODUCTS: ("product_id", "name"),
    ORDER_TYPES: ("product_id", "code", "name"),
    OFFERING_COMPONENTS: ("product_id", "component_id", "name"),
    RESPONSIBILITIES: ("product_id", "component_id", "system_id", "role", "description"),
    PRODUCT_POINTS: ("product_id", "kind", "name"),
    JOURNEYS: ("journey_id", "name"),
    ACTIVITIES: ("journey_id", "number", "name"),
    FLOW_RULES: ("journey_id", "kind", "from_activity", "to_activity"),
    ACTIVITY_INTEGRATIONS: ("journey_id", "from_activity", "to_activity"),
    CHANNELS: ("channel_id", "name"),
    REALISATION: ("product_id", "component_id", "layer", "name"),
    NFRS: ("product_id", "quality", "coverage"),
    TRACKING: ("product_id",),
    TRACKING_FLOWS: ("product_id", "from_system_id", "to_system_id", "label"),
    TRACKING_CHANNELS: ("product_id", "channel_id"),
    TRACKING_EVENTS: ("product_id", "kind", "label"),
    LIFECYCLE_NOTES: ("product_id", "note_id", "title"),
    LIFECYCLE_BLOCKS: ("product_id", "note_id", "kind"),
    SOURCES: ("source_id", "level", "title"),
    CONFLICTS: (
        "conflict_id",
        "title",
        "a_source_id",
        "a_statement",
        "b_source_id",
        "b_statement",
    ),
    CONFLICT_SCOPES: ("conflict_id", "product_id"),
    QUESTIONS: ("product_id", "question_id", "text"),
    DECISIONS: ("product_id", "decision_id", "title"),
    BOUNDARIES: ("product_id", "kind", "text"),
    CHANGE_HISTORY: ("change_request_id", "title"),
    CHANGE_ITEMS: ("change_request_id", "kind", "summary"),
    PORTFOLIO: ("node_id", "name", "level"),
    PLANS: ("product_id", "plan"),
    PLAN_CHARACTERISTICS: ("product_id", "plan", "characteristic", "value"),
    BUSINESS_RULES: ("product_id", "rule_id", "statement"),
    CONCEPTS: ("concept_id", "pref_label"),
    SCHEMES: ("scheme_id", "name"),
    VOCABULARY: ("term_id", "scheme", "pref_label"),
    INTERFACES: ("interface_id", "name", "system_id"),
    REALISATION_RECORDS: ("record_id", "layer", "name"),
    MASTERY_NOTES: _HEADERS[MASTERY_NOTES],
    ACCEPTANCES: _HEADERS[ACCEPTANCES],
}
_REQUIRED_SHEETS = (SYSTEMS,)
_INSTRUCTIONS = (
    ("How to fill this catalogue",),
    ("Systems: one row per system. system_id is a short stable key such as bcrm.",),
    ("aliases and triggers: several values separated by semicolons (;).",),
    ("Capabilities: one row per capability; triggers are the phrases that point to it.",),
    ("Constraints: one row per constraint of a system.",),
    ("Relationships: one row per dependency between two systems listed on Systems.",),
    (f"kind (optional): how the source depends on the target, one of {_KINDS}.",),
    ("Domains (optional): business areas such as Order capture; parent_id nests one in another.",),
    ("Capabilities domain_id (optional): the domain a capability belongs to.",),
    ("Components (optional): the parts of a system, such as a module or service.",),
    ("Capabilities component_id (optional): the component of its system that delivers it.",),
    (
        "LandscapeDomains (optional): where systems sit, such as Customer; parent_id makes a "
        "sub-domain such as Customer > Assisted; cross_cutting yes for one that serves every "
        "other domain, such as the integration layer; layout (optional, top domains) bus for "
        "the integration layer the map draws as a bus, above_bus for the layer it runs under, "
        "side for one drawn last beside another.",
    ),
    ("Systems description and landscape_domain_id (optional): what it is for, and where.",),
    (
        "Products (optional): product offerings such as Business Pro Plus; rules separated by ;; "
        "purpose (optional) is why a customer buys it, beside the proposition.",
    ),
    (
        "OrderTypes: how each offering is ordered; enabled is yes or no; delivery_drop (optional) "
        "is the drop it comes in, such as P2 / P3; stage (optional) is join, change, support or "
        "leave.",
    ),
    (
        "OfferingComponents: the parts of each offering; mandatory and customer_visible yes or "
        "no; hub yes for the one device the bundle is built on.",
    ),
    (
        "Responsibilities: which system does what for a component, in which role; order_types "
        "names order type codes separated by ;.",
    ),
    ("ProductPoints: kind value (what it gives customers) or audience (who it is for).",),
    ("confidence (optional): confirmed, inferred or gap, as the source says.",),
    ("Journeys (optional): the activities that fulfil an offering's order type.",),
    (
        "Activities: one row per numbered activity; track is MAIN or a side track; systems and "
        "component_ids separated by ;.",
    ),
    ("FlowRules: kind decision, loop or parallel, from one activity number to another.",),
    ("ActivityIntegrations: how one activity hands over to another.",),
    (
        "Channels (optional): where orders are placed, such as B2B Web or a shop; "
        "entry_system_id is the system that takes the order in.",
    ),
    ("OrderTypes channels (optional): the channel ids it can be ordered through, by ;.",),
    (
        "Activities channels (optional): the channel ids the step happens in, by ; (none: every "
        "channel); channel_entry yes when the order's channel entry system performs it.",
    ),
    (
        "Realisation (optional): how a component is realised; layer is CFS (what the customer "
        "is sold), RFS (what delivers it) or resource (what it runs on). record_id: the "
        "RealisationRecords row the name means, of the same layer.",
    ),
    (
        "NFRs (optional): an offering's non-functional requirements, one row per quality such "
        "as Availability; coverage is defined, partial or missing.",
    ),
    (
        "Tracking (optional): one row per product whose order tracking its sources describe; "
        "order_types are the codes it is specified for, by ; (none: every order type).",
    ),
    (
        "TrackingFlows: order and milestone events from one system to another (the same "
        "system twice: it logs them); interface is the API or message used.",
    ),
    (
        "TrackingChannels: per channel, the correlation_key tying its order to the fulfilment "
        "order, the ui_system_id the customer follows progress in, and what it reads from.",
    ),
    (
        "TrackingEvents: kind milestone (seen by the customer), status (internal) or fallout "
        "(label is what makes the order fall out, detail how it is handled).",
    ),
    (
        "LifecycleNotes (optional): what happens to a product over its life, one row per "
        "topic; order_types and channels by ; (none: every one).",
    ),
    (
        "LifecycleBlocks: each note's content in order. kind text (text), list then one item "
        "row per item (text), table (column heads in cell_1…, caption in text) then one row "
        "row per table row (cells in cell_1…). to_verify yes: carried over from another "
        "source, to re-verify.",
    ),
    (
        "Sources (optional): the sources the catalogue is read from; level is L1 (the "
        "canonical landscape), L2 (a primary source for its scope) or L3 (a baseline carried "
        "forward); supplied no when it was not supplied and is carried forward unread.",
    ),
    (
        "Conflicts: two sources contradicting each other, a and b each a source_id, where it "
        "says so (reference) and what it says (statement); never reconciled by the catalogue.",
    ),
    (
        "ConflictScopes: the products a conflict affects, its order types by ; (none: every "
        "one), and the question_id it raises for that product.",
    ),
    (
        "Products sources and primary_source (optional): the source_ids a product is read "
        "from, by ;. Questions, Decisions: its open questions and architecture decisions. "
        "Boundaries: kind boundary (what its sources cover) or not_used (what it no longer uses).",
    ),
    (
        "ChangeHistory (optional): the change requests applied to this version, one row each, "
        "with the approved requirement they come from; features as id: name by ;, gaps by ;. "
        "ChangeItems: what each asked for. Leave both out to keep the version's own history.",
    ),
    (
        "Portfolio (optional): where offerings sit, such as Enterprise > Fixed > SMB; level "
        "is the operator's own word for it, parent_id nests one node under another. Products "
        "portfolio: the node_id an offering sits in. Products and Journeys former_ids: the ids "
        "an offering or journey had before it was renamed, by ;.",
    ),
    (
        "Plans (optional): an offering's plans as its sources describe them; "
        "PlanCharacteristics: one row per stated fact of a plan, such as Download 200 Mbps. "
        "Prices are read live from the product catalog, never kept here.",
    ),
    ("BusinessRules (optional): the rules an offering is sold and fulfilled by, with a kind.",),
    (
        "Concepts (optional): business capability concepts such as Managed Wi-Fi; alt_labels "
        "by ;. A top concept names its domain_id; a narrower one names its broader_id instead.",
    ),
    (
        "Capabilities concept_id and OfferingComponents capability_ids (by ;) link them to "
        "concepts; unlinked_reason says why none fits.",
    ),
    (
        "Vocabulary (optional): controlled terms, each in one scheme: etom_process, "
        "channel_kind, component_kind, responsibility_role or open_api; notation is a code "
        "such as TMF622. Activities etom_term and role_term, Channels kind_term, "
        "OfferingComponents type_term, Responsibilities role_term and ActivityIntegrations "
        "open_apis (by ;) name the term beside the text.",
    ),
    (
        "Schemes (optional): vocabularies a curator defines beside the built-in ones, such as "
        "nfr_quality; fields by ;, among nfr_quality, offering_family, offering_lifecycle, "
        "rule_kind, activity_mode, activity_phase, portfolio_level and component_technology. "
        "Its terms go on Vocabulary with scheme its scheme_id; Nfrs quality_term, Products "
        "family_term and lifecycle_term, BusinessRules kind_term, Activities mode_term and "
        "phase_term, Portfolio level_term and Components technology_term name them.",
    ),
    (
        "Concepts and Vocabulary close_match (optional): outside references near enough to "
        "read across, by ;; exact_match is the one that means the same. Vocabulary rank "
        "(optional): a term's place in its scheme, 1 first, such as roles strongest first.",
    ),
    (
        "Vocabulary scheme information_entity: the data systems master or read, such as "
        "Customer or Product order. Systems masters and reads: the entity term ids it is the "
        "system of record for, and those it reads, by ;.",
    ),
    (
        "Interfaces (optional): an API, event or file contract one system_id exposes; style is "
        "api, event, file or unspecified; consumers are the system ids that call or receive "
        "it, open_apis the Open API term ids and entities the information entity term ids it "
        "carries, each by ;. relays: the interface ids it passes on, by ;, each one its "
        "system consumes, as an integration layer does.",
    ),
    (
        "RealisationRecords (optional): one row per CFS, RFS or resource; systems are the "
        "system ids that deliver or hold it, and realised_by the record ids one layer down "
        "that realise it (a CFS by RFSs or resources, an RFS by resources), each by ;.",
    ),
    (
        "Systems owner, external (yes or no), roadmap, and placement_from with "
        "placement_reason when a system sits elsewhere than a source put it.",
    ),
    (
        "Activities performer (a team or the customer, when no system performs it), "
        "point_of_no_return and role. ActivityIntegrations from_system, to_system, via, "
        "purpose, style and tmf_equivalent; a call to a system with no step of its own has "
        "to_activity equal to from_activity.",
    ),
    (
        "Acceptances (kept by the portal): which accepted suggestions produced an entry, one "
        "row each, naming the entry by entity and key. Leave it as exported; a row naming "
        "nothing in the file is ignored.",
    ),
    (
        "MasteryNotes: where several systems master one information entity, one row per system "
        "saying which part of it that system is the system of record for.",
    ),
    (
        "Systems, Concepts and Vocabulary deprecated (yes or no) and replaced_by (optional): a "
        "retired entry stays in the catalogue but is never matched again; replaced_by names the "
        "entry of the same sheet that takes its place, and implies deprecated.",
    ),
    ("Row 1 of each sheet holds the headers; keep them as they are.",),
)


def _rows(workbook: Any, sheet: str) -> Iterator[tuple[int, dict[str, object]]]:
    if sheet not in workbook.sheetnames:
        if sheet in _REQUIRED_SHEETS:
            raise InvalidKnowledgeError(f"The workbook needs a '{sheet}' sheet.")
        return
    rows = workbook[sheet].iter_rows(values_only=True)
    header_row = next(rows, None) or ()
    headers = [str(value).strip().casefold() if value is not None else "" for value in header_row]
    if any(name not in headers for name in _REQUIRED_HEADERS[sheet]):
        raise InvalidKnowledgeError(
            f"{sheet} row 1 must have the headers {', '.join(_HEADERS[sheet])}."
        )
    for number, values in enumerate(rows, start=2):
        if number > MAX_WORKBOOK_ROWS:
            raise InvalidKnowledgeError(f"{sheet} has more rows than can be imported.")
        cells: dict[str, object] = {
            header: value for header, value in zip(headers, values, strict=False) if header
        }
        if all(value is None or str(value).strip() == "" for value in cells.values()):
            continue
        yield number, cells
