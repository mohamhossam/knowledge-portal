# Architecture catalogue: capability concepts (addendum to plan 03)

**Status:** proposed 2026-10-10, for the build on `feat/kb-redesign-architecture`.
**Adds to:** [03-architecture-catalogue.md](03-architecture-catalogue.md), which replaces plans 03
and 04.
**Backend:** ontology plan Phase 1 (`docs/slices/ontology-phase-1-concepts.md`, ADR-0114). It is
already in the API, so this addendum needs no backend or contract change.
**Owner's decision (2026-10-10):** the concept screens are built here, with the redesign's gates.
Today's catalogue UI gets no new concept screens.

## 1. Job

Curators keep a short scheme of **business capability concepts**: what the business needs done,
in words people use. Impact analysis then goes from a requirement to concepts, and from concepts
to systems and offering components. Curators need to do three things:

1. Build the scheme once from what the catalogue already says. The backfill proposes one concept
   per distinct capability name.
2. Keep it clean: one meaning per concept, every label naming one concept, and every concept placed
   in a capability domain.
3. Link every system capability and every offering component to concepts, or say why none fits.
   Most links arrive as AI suggestions a curator decides.

## 2. The model

```
Capability domain (Market and sales · Product · Customer · Service · Resource)
  └─ Concept  (top concept: names its domain)        e.g. cap-wifi-access
       ├─ preferred label                             "Managed Wi-Fi access points"
       ├─ other labels                                Wi-Fi · access point · wireless LAN
       ├─ definition, outside match (TM Forum ODA), confidence, source
       └─ narrower concepts (at most 3 levels)        inherit the domain

System capability  ──concept_id──▶ Concept     or "unlinked_reason"
Offering component ──capability_ids──▶ Concepts  or "unlinked_reason"
```

Labels are compared by their letters and digits alone, so "Wi-Fi" and "WiFi" are the same label,
and the API refuses a second concept that uses it.

## 3. Where it lives

| View | What it shows | Primary interaction |
|---|---|---|
| **Concepts** (a new Catalogue view, after Systems) | A dense table grouped by capability domain: preferred label, other labels, linked systems and components (counts, expandable), confidence and source. A narrower concept is indented under its broader one. | Find by any label. Select a row to open its record panel: definition, labels, outside match, linked capabilities and components, governance. Edit in the draft. |
| **Decide** (step 2 of a draft) | Concept and component-link suggestions in the same grid as every other suggestion, with a filter chip for each kind. | Accept, reject, or accept with edits. |
| **Offering › Components** | Each component's concepts as chips, or its "none fits" reason. | Edit the links in the draft. "Suggest links" starts the AI suggestions for the offering's unlinked components. |
| **Systems › record panel** | Each capability's concept, or "not linked". | Link to a concept, or mark it as having none. |
| **Check** (step 4 of a draft) | After a build, one line on how far the evidence links reach: "33 of 80 passages name no concept · 18 concepts appear in no passage", with the concepts listed (ontology plan Phase 2). | Open a concept from the list. "Not linked" when the index predates links. |
| **Concepts › empty state** | "No capability concepts yet." The primary action is "Propose concepts from this catalogue". | Starts the backfill. |

## 4. Example data (the committed SMB catalogue)

The Concepts table, for the Service domain (part):

| Concept | Other labels | Linked |
|---|---|---|
| Managed Wi-Fi access points | Wi-Fi · access point · wireless LAN | Business Pro Plus › Access point (FortiAP) |
| SD-WAN service | SD-WAN · software-defined WAN | Business Pro Plus › SD-WAN |
| Managed firewall | firewall · UTM licence · network security policy | Business Pro Plus › Firewall |
| Fibre broadband access | GPON · fibre internet · broadband access | Business Pro Plus › Fibre internet (GPON) on the CPE |
| Mobile backup access | backup 5G · 4G backup · failover connectivity · mobile failover | Business Pro Plus › Backup 5G |

A backfill suggestion in Decide, on the packaged seed:

> **Adds the capability concept Billing, linking 1 capability.**
> Stated · from the catalogue · Catalogue › BSCS › capability billing: "Billing; billing update;
> customer billing; charging". The triggers become its other labels.

A component-link suggestion in Decide:

> **Links Business Pro Plus › Access point (FortiAP) to Managed Wi-Fi access points.**
> Inferred, not stated in the source · prompt `capability-links-v1` · the model's reason, such as
> "The component is a managed Wi-Fi access point."

## 5. States

- **No concepts yet:** the empty state above. "Suggest links" is unavailable, and says why: "Add
  capability concepts first."
- **Every capability linked:** the backfill answers with no suggestions and the warning "Every
  capability in this draft is linked to a concept or marked as having none." Show it as a
  neutral notice, not an error.
- **Label clash (422):** "'billing' already names Billing, so it cannot also name Invoicing. Each
  label must identify one concept." Show
  it inline on the label field, and keep the curator's input.
- **A suggestion waiting on a concept** (match `needs_concept`): "Waits for the concept …". It
  becomes decidable once that concept is accepted.
- **Component links are inferred**, so "Accept the safe set" never includes them. The grid's
  inferred tone and words apply ("inferred, not stated in the source").
- **The model answer is unusable** (`capability_linking`, a provider failure): "The AI couldn't
  suggest links this time. Nothing changed." Show it with a retry.
- **Unlinked with a reason:** show the reason in place of chips, in muted text, never as an error.

## 6. Interaction

- The Concepts table is the editor. A row edits in the record panel, not in the cells, because
  each label change is checked against every other concept.
- Linking a component uses a combobox searching every label. It shows each concept's path
  ("Service › Managed Wi-Fi access points") so two similar concepts can be told apart.
- "Mark as none fits" asks for the reason in the same popover. A link and a reason never show
  together, which the API enforces.
- The Changes step reports concept changes ("capability concept") and link changes ("capability
  links") with `changeSentence()`.

## 7. API (already shipped)

| Call | Use |
|---|---|
| `GET /architecture-knowledge/releases/{id}` | `business_capabilities`; each capability's `concept_id` and `unlinked_reason`; each component's `capability_ids` and `unlinked_reason` |
| `PUT /architecture-knowledge/releases/{id}` | `business_capabilities` (left as is when omitted) |
| `POST …/releases/{id}/concept-proposals` | The backfill. Its run has `reading: "concept_backfill"` |
| `POST …/releases/{id}/component-link-suggestions` | The AI link suggestions. Its run has `reading: "component_links"` |
| `GET …/releases/{id}/index-coverage` | After a build: chunks without a concept, and concepts no chunk speaks of (Phase 2) |
| `GET …/suggestions`, `POST …/suggestions/{id}/decision`, `POST …/suggestions/acceptance` | The kinds `concept` and `component_link` |

## 8. Acceptance criteria (area-specific)

- **C.1** On the packaged seed, keyboard only: propose concepts, show the safe set, accept it, and
  see every system capability linked in the Systems view (e2e).
- **C.2** On the committed SMB catalogue, after its links are removed: suggest links, then accept
  "Access point (FortiAP) → Managed Wi-Fi access points" one by one. It is never part of the safe set
  (e2e).
- **C.3** A label clash keeps the input and names the concept that owns the label (unit).
- **C.4** The Concepts table reaches every row and its record panel by keyboard, and meets the
  inherited WCAG 2.2 AA criteria (axe plus manual check).

## 9. Out of scope

- Using concepts in impact analysis (ontology plan Phases 2 and 3).
- A drawn concept graph. The table with indentation is the view.
- Concept usage counts from mapping (Phase 5).
