# Architecture catalogue, rebuilt from scratch: design brief

**Status:** being built on `feat/kb-redesign-architecture` (frontend first, with the data in `frontend/src/architecture/data/`); see `docs/redesign/STATUS.md`.
**Replaces:** plans 03 (catalogue curation) and 04 (catalogue browsing). The current catalogue
content and pages are discarded; nothing in them is carried over as data.
**Date:** 2026-10-09.

## 0. Decisions already taken (user, 2026-10-09)

| # | Decision |
|---|---|
| D1 | Curators (`knowledge_admin`) author in the **Catalogue**. Everyone signed in reads the published version in the **Explorer** and exports from there. |
| D2 | Build **Business Pro Plus only** now. The design is **generic for any telecom product**: nothing is shaped around one product. |
| D3 | Sources are the **SDD** (Business Pro Plus Non-MVP, v2.3) and the **SMB reference MD**. The HTML explorer is not a data source. Siebel CRM and Central OM are ignored; the HTML's other added systems are removed because they have no integration without those two. |
| D4 | **Additive backend and API changes are approved** for the Catalogue. Nothing existing is removed; requirement-portal's internal API stays compatible. |

## 1. Job and audience

| Who | Where | Job | Mode |
|---|---|---|---|
| Architects / curators | Catalogue (edit) | Build and keep the model true: systems, portfolio, offerings, journeys, integrations. Publish it as a version. | Operate |
| Integration team | Explorer (read + export) | For one journey: who calls whom, for what, with which API and style, in what order. | Read |
| Order-management team | Explorer (read + export) | Import a journey's flow into their own tool; see order types, PONR, sub-orders and milestones. | Read |
| Solution architects, product owners | Explorer (read) | For a product + channel + order type: which systems are impacted, and why. | Read |

## 2. Outcome and proof

- **One connected model, many views.** Every view reads the same model, so a system renamed
  once is renamed everywhere, and the impact view is computed, not drawn by hand.
- **Standards, not pictures.** Flows are BPMN 2.0, integrations are UML sequence diagrams and an
  integration register, the portfolio follows TM Forum SID / TMF620, systems sit in TM Forum TAM
  domains, and every journey step carries its eTOM process.
- **Evidence on every fact.** Each fact is *Confirmed* (with its source and section), *Inferred*
  or a *Gap*. Unknown values show as gaps, never as invented values. Prices with no source show
  "not provided yet".

## 3. The model (generic)

```
Portfolio node (data-driven levels: Business unit › Line of business › Segment › Family …)
  └─ Product offering                      TMF620 ProductOffering
       ├─ Purpose and customer value        why it exists, what the customer gains
       ├─ Eligibility / sellable to         segment, customer type, premises, conditions
       ├─ Plans and prices                  TMF620 ProductOfferingPrice (read live from the product catalog; "as read at")
       ├─ Business rules                    mandatory components, compatibility, pending-order validation
       ├─ Components                         PO / CFSS / PRS codes, each with system responsibilities
       └─ Journeys: one per Order type × Channel
            ├─ Steps (BPMN tasks)           performing system (lane), eTOM process, PONR marker
            ├─ Gateways and branches        decision, parallel split/join, error return
            ├─ Integrations                 from → to, operation/API, style, sync/async, payload, correlation key
            └─ Order tracking               notify-creation, milestone producers, read API, milestone list, known gaps

System (TAM domain, owner, aliases, function)  ←  referenced by steps, integrations, responsibilities
Version (published release)  ·  Draft (work in progress)  ·  Governance (owner, status, evidence, review)
```

**Order types** are a catalogue-wide list with their codes (from the SDD: New Activation,
Migration `MIGRATE`/`MIGTOEXSTNGAC`, `UPDOWNGRD`, `CESSREQ`, `EXTSHIFTSITE`, `RENEWAL`, `CHGDOMN`,
`CHGSUBDOMN`, `CHGPSWD`, `CHINTUSRN`, `CHNUMBER`, `TECHVISIT`, `DVCREP`, `FLEXIMINMOV`, `MODSUBS`,
`ADDDELETE`, port-in/out, dunning, amendment and cancellation). An offering says which apply,
and through which channels.

**Channels:** BCRM, B2B Web, SMB App (+ CIM/UCMS, NPS and EHS where the SDD names them as
request sources).

## 4. Information architecture

**Catalogue** (curators), with a persistent **context bar**: *Version · Product · Order type ·
Channel*. The bar filters and highlights every view below.

| View | What it shows | Primary interaction |
|---|---|---|
| **Landscape** | TAM map: domains as columns (Market & Sales, Customer, Product, Service, Resource, Engaged Party, Enterprise), the integration layer as a band beneath. Systems as tiles. | Select a system: its record panel (owner, function, integrations in and out, journeys it appears in). With a context set, impacted systems light up and the rest recede. |
| **Portfolio** | The hierarchy, left to right: Enterprise › Fixed › SMB › family › offerings, as an editable structure. | Add, rename and move nodes in place; open an offering. |
| **Offering** | Tabs: Overview (purpose, value, eligibility) · Plans & prices · Rules · Components · Journeys (an Order type × Channel matrix) · Impact | The Journeys matrix opens the journey for one cell; empty cells say "no journey defined". |
| **Journey** | Tabs: **Flow** (BPMN swimlanes, one lane per system) · **Integrations** (sequence diagram + register table) · **Tracking** (the order-tracking flow and milestones) | Select a step: its integrations, eTOM process, evidence. Export BPMN / sequence / register. |
| **Systems** | A dense table of every system: domain, owner, aliases, number of integrations and journeys. | Find by name or alias; edit. |
| **Versions** | Every published version, compare two, put back in service. | Compare from the context bar's version. |
| **Governance** | Ownership, open questions, conflicts between sources, the source register, review status. | Resolve or assign. |

**Explorer** (everyone signed in): the same Landscape, Portfolio, Offering and Journey views,
read-only, on the version in service, with the exports.

### Recommendation: where the impact view lives

Not as a separate page. Impact is a **lens**, set by the context bar's *Product + Channel +
Order type*:

1. **On the Landscape**, the TAM map highlights the impacted systems with their role
   (orchestrates · integrates · activates · notifies · bills) and dims the rest. This answers
   "which TAM systems are impacted" in the architecture's own picture.
2. **On the Offering**, the Impact tab lists the same systems grouped by TAM domain, with the
   journey step and integration that pulls each one in, and exports the list.

Both are computed from the journey's steps and integrations, so they can never disagree with
the flow.

### Recommendation: where governance and versions live

- **Version** is global context: the first item of the context bar, on every view. A version
  that isn't in service reads on the "proof" tint with a fixed line saying so. *Versions* is
  its own view for listing and comparing.
- **Governance per fact** sits in the record panel of whatever is selected: owner, evidence
  status, source and section, last change, who decided it. One step, never a separate trip.
- **Governance across the catalogue** (open questions, source conflicts, the source register)
  is its own view, and its count shows in the navigation, like a queue.
- **Editing** happens in a draft. Publishing a draft creates a version; the change list and the
  impact on requirement mapping show before publishing (PRODUCT.md principle 2).

## 5. Standards, tools and exports

| Need | Standard | In the portal | Export, for their tools |
|---|---|---|---|
| Journey flow | **BPMN 2.0** (OMG, ISO/IEC 19510): pools/lanes per system, tasks, gateways, message flows, PONR as an annotated event | Rendered with **bpmn-js** (bpmn.io) | `.bpmn` XML (Camunda Modeler, Signavio, ARIS, Bizagi, Visio via BPMN import), SVG, PNG |
| Integrations | **UML sequence diagram** + an integration register | Rendered sequence diagram + table | PlantUML and Mermaid text, SVG, CSV / Excel register |
| Integration style | Each call states protocol/style (REST, SOAP, event/message, DB, file, SAML SSO), sync/async, callback | Labels on every arrow and row | In the register |
| TMF alignment | TMF Open APIs as **"TMF equivalent"** per call (e.g. TMF622 Product Ordering, TMF641 Service Ordering, TMF620 Catalog, TMF681 Communication) | A column, marked **HYPOTHESIS** until the integration team confirms | In the register |
| Portfolio | **TM Forum SID / TMF620** (category → offering → specification → price) | Hierarchy + offering record | JSON |
| Landscape | **TM Forum TAM** domains | Landscape map | SVG / PNG, CSV of placements |
| Process layer | **eTOM** process area and name per step | A label on every step | In the BPMN as documentation |

## 6. Seed content (from scratch, Business Pro Plus only)

- **Systems:** the reference MD's directory, plus the systems the SDD uses that the MD lacks
  (Automation Portal (BFM), WFMS, NPS, EHS, HPSM, FortiPortal/Fortinet (external)). Each one
  cites its source.
- **Offering:** Business Pro Plus. Components and PO/CFSS codes, mandatory components, CPE/AP
  model rules, Backup 5G, from SDD §§P1–P1.1.
- **Journeys:** New Activation and `UPDOWNGRD` first (the two the SDD details most), per
  channel. Steps and APIs from the SDD (`retrieveAccount`, `evaluateOrder`,
  `createShoppingCart`/`refreshShoppingCart`, the RTF order interface `PRSU0001`, CWOM → E2ESO /
  WFMS / vEDA / IN, `NotifyOrderCreationRequest`, `getRealTimeOrderDetails`,
  `ShipmentOrder`/`ShipmentConfirmation`).
- **Tracking:** from the SDD (RTF → TIBCO/BPM notify-creation; CWOM milestones per sub-order;
  channels read `getRealTimeOrderDetails`), with the MD's Felix gap kept as a known issue.
- **Rules:** the SDD's pending-order validation matrix (order types × sub-orders) and the
  add-on dependency matrix.
- **Prices:** not in either source → "not provided yet".

## 7. States and ranges

- About 45 systems; 1 offering now (tens later); about 20 order types × 3–6 channels; a journey
  of 10–40 steps, 5–15 lanes and 10–40 integrations.
- Empty: no journey for this Order type × Channel; a system with no integrations; a gap value.
- A journey whose systems are missing from the landscape (shown, flagged).
- Version not in service (proof). Draft with unpublished changes.
- Export fails, or the BPMN is too large to lay out (fallback: the step table).
- Arabic names, right to left.

## 8. Interaction and layout intent

- The context bar is sticky and keyboard-reachable; every view keeps its selection in the URL.
- Diagrams are always paired with an accessible **table view** of the same data (steps,
  integrations, impacted systems). The table is the source for screen readers and for 400% zoom.
- Diagram navigation: pan and zoom with the keyboard, fit to view, focus a lane, select with
  Enter, and a visible focus ring on the selected element.
- Editing a journey: a step table is the editor (rows = steps; lane, eTOM, next steps, gateway);
  the BPMN diagram updates from it. Free drawing is out of scope (it doesn't keep the model
  consistent).
- Calm Ledger rules apply: maroon for selection and focus, red only as a brand accent, status as
  icon + words, motion ≤ 200 ms, dark mode warm charcoal. Diagram colours come from the muted
  chart palette; TAM domains are told apart by labels and position, not by colour alone.

## 9. Backend (additive)

- `PortfolioNode` (id, level label, name, parent, order); `offering.portfolio_node_id`.
- `offering.eligibility` (structured conditions) beside the existing values and audiences.
- Journey scope: `order_type_code` and `channel_id` per journey (today channels sit on steps).
- Integration fields: `style` (REST, SOAP, message, DB, file, SSO), `operation`, `direction`,
  `callback`, `tmf_equivalent` (beside the existing `timing`, `payload`, `correlation_key`).
- Tracking: a milestone list and producers per journey (beside the existing tracking model).
- System: TAM domain and subdomain kept; an `external` flag.
- Exports (BPMN XML, PlantUML/Mermaid, CSV) are generated **in the browser** from the model, so
  they need no new endpoints.
- A new seed replaces the sample catalogue in `scripts/seed_demo.py`.

## 10. Delivery estimate

| Step | Content | Estimate |
|---|---|---|
| 1 | Backend model, API and contract; seed from the SDD and MD | 1 day |
| 2 | Landscape, Systems, Portfolio, Offering | 1 day |
| 3 | Journey: BPMN flow, integrations, tracking, exports | 1.5 days |
| 4 | Impact lens, Versions, Governance, Explorer read views | 1 day |
| Gate | One critique, fix the serious findings, ~6 screenshots | 0.5 day |

**About 5 working days.**

## 11. Open decisions (the builder must not invent these)

1. **TAM placement corrections.** Apply these, each recorded with its reason?
   - Move BSCS (billing) from Resource to Customer.
   - Move SLA Management out of Resource.
   - Treat TIBCO as the integration layer, not a business domain.
2. **Order tracking source.** Use the SDD's description (TIBCO/BPM), keeping the MD's Felix
   gap as a known issue?
3. **bpmn-js licence.** The bpmn.io licence requires its small logo to stay visible on the
   diagram. Acceptable?
4. **The order-management team's tool** (Camunda, Signavio, ARIS, Visio, other), to test the
   BPMN import against it.
