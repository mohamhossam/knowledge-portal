# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A mixed curation team, every member holding the `knowledge_admin` role:

- **Architects** own the architecture catalogue and the squad catalogue: systems, their
  dependencies and capability domains, products, offerings and journeys, and which squads,
  value streams and people own each system.
- **Business analysts and knowledge owners** own shared library documents: they upload policy
  and reference documents, review what extraction read from them, publish approved passages,
  and withdraw or replace them.

Everyone else in the organisation reads the published catalogue in the explorer, open to
anyone signed in, or reads the knowledge base through the apps they work in, which call its
app API.

## Product Purpose

The knowledge portal is a stand-alone knowledge base: where the organisation's shared
knowledge is curated before anyone relies on it. People read it in the explorer; apps, such
as requirement-portal, read it through its app API: they cite published library passages and
match work against the active catalogue release. What is published here decides what they can
cite and match against. The knowledge base knows no app: it calls none, shows no app's data
and links to none (ADR-0126).

Success means that what people and apps rely on is reviewed, attributable and current. Every
published passage was approved by its owner. Every catalogue change reaches a reader only
through a named, published release, announced on the event feed apps follow.

## Positioning

It is a curation desk, not a document store or a wiki. Nothing an extractor or a model
suggests is published until a person reviews it. Every change carries provenance: who approved
it, from which document version, in which release. Changes are made with their impact in view: how a draft release differs from the one in
service, and what sample requirements it would match differently.

## Operating Context

- **Two rhythms.** Heavy review bursts around a release or a new policy document: extracted
  passages, catalogue suggestions read from architecture documents, release comparison and
  mapping-impact previews. Light upkeep in between: approve a document, fix a system's owner,
  publish or activate a release.
- **Desktop, keyboard and mouse.** Long sessions at a large screen are normal during review
  bursts. Check-ins must still work quickly.
- **English content.** Documents, passages and catalogue names are in English. The model
  evaluation behind architecture matching is English.
- **Source formats:** PDF, Word, Excel, PowerPoint, CSV, Markdown and plain text, plus
  catalogue files (an Excel template, YAML and CSV).
- **Background work.** Ingestion, index builds, catalogue reading and impact previews run as
  jobs that take seconds to minutes and can fail, be retried or be cancelled.
- **Served under `/knowledge/`**, or at the root of its own hostname, with its API at
  `/knowledge-api/` and the app API at `/knowledge-api/apps/v2`. Sign-in uses an OIDC provider
  (client `knowledge-spa`), its own realm or one shared with other apps. There are offline fake
  personas for development.

## Capabilities and Constraints

- **Library:**
  - upload, with each file scanned for malware;
  - review of extracted blocks: exclude, edit or keep each, with warnings and a preview of the
    original source;
  - approval and publication of a revision;
  - index builds, previewed and then activated;
  - withdrawal and replacement;
  - ownership transfer, with its history.
- **Library search:** search over published passages, with exact citations.
- **Architecture catalogue:** draft releases built from architecture documents and catalogue
  files.
  - AI-suggested systems, dependencies, domains, components and journeys, each accepted or
    rejected by a person;
  - release preview, the change list against the active release, and mapping-impact
    comparison;
  - naming, publishing, activating and auditing releases;
  - an evidence passage for each catalogue fact.
- **Squad catalogue:** squads, value streams, products and people, system ownership, and an
  audit history.
- **Access:** every curation screen requires `knowledge_admin`; the explorer is open to anyone
  signed in. Anyone else gets a "no access" page. Apps are registered by an operator and read
  through the app API, never through a person's sign-in.
- **Stack:** React + Vite + TypeScript, served under `base: "/knowledge/"`. The API contract is
  `contracts/knowledge-public.openapi.json`.
- **Its own design system.** Do not reuse requirement-portal's Working Paper tokens,
  primitives or shell.

## Brand Commitments

- It stands on its own: a knowledge base with its own name and design system, not part of any
  app's interface. Apps that read it link to it as they choose; it links to none of them.
- The portal is English only: its interface and the content it curates.
- **Brand: e& in calm mode.**
  - Mostly calm neutrals (white and beige-derived tints, warm greys), with maroon for actions,
    selection and focus.
  - e& red only as a brand accent: the logo, the active-navigation marker, and at most one focal
    accent per view. Never for status, errors or alerts.
  - Status uses its own low-saturation colours, always with an icon and words.
  - Flat surfaces; motion of 200 ms or less.
  - Brand values are the redesign brief's e& primitives, unverified against official guidelines
    (none are available). Fonts are self-hosted, because there is no e& font licence.
  - Details live in DESIGN.md.

## Evidence on Hand

- The backend, its API contract and its fake data run offline: in-memory storage, a fake model
  and fake personas, with `fake-owner` and `fake-reviewer` as admins.
- A seeded initial architecture catalogue release (`smb-source-reference-v1`, "Initial
  catalogue").
- No real customer content, screenshots, testimonials or metrics exist in this repository. Do
  not invent any.

## Product Principles

1. **Nothing is published unreviewed.** AI and extraction propose; a named person approves,
   and the approval is recorded.
2. **Show the consequence before the commit.** Dependents, mapping impact and release diffs sit
   beside the action that would change them.
3. **Provenance is always one step away.** Every published fact leads back to its source
   passage, document version and release.
4. **Built for both rhythms.** It must hold up for dense review sessions, and stay quick for a
   one-change check-in.
5. **One language, English.** The interface and the content it curates are English. Content
   in another language is refused with a reason, never stored half-handled.

## Success Signals

How we know the curation desk is working. User metrics are hypotheses until measured.

- **Reviewed means seen.** Every approval records how much a person actually looked at, and
  nothing AI-proposed is accepted in bulk without the set being inspectable.
- **Yours first.** A curator with five minutes reaches the most urgent item that needs them in
  one step from any page.
- **Consequence in view.** Every withdraw, replace, publish and put-back shows its dependants or
  mapping impact beside the action, before the commit.
- **Provenance in one step.** From any published fact or change, one step reaches who decided it
  and which passage, document version and release it came from.
- **Calm over long sessions.** A 60-minute review burst does not rely on colour alone, never
  loses the reviewer's place, and stays readable at 200% zoom.
- **Usability targets** (hypotheses, not yet measured):
  - task success of at least 90% on top tasks;
  - an SEQ of at least 5.5;
  - a SUS of at least 75.

## Accessibility & Inclusion

WCAG 2.2 AA:
- contrast ratios;
- keyboard reachability and visible focus;
- focus never obscured;
- a 24px minimum target size;
- semantic landmarks and headings;
- labelled controls;
- consistent help;
- respect for `prefers-reduced-motion`.

Content is English and runs left to right; the page declares its language (`lang="en"`).
