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

Everyone else in the organisation never opens this portal. They read citations and
architecture evidence through read-only viewers in requirement-portal.

## Product Purpose

The knowledge portal is where the organisation's shared knowledge is curated before
requirement work relies on it. Requirement authors cite published library passages, and
architecture mapping matches requirements against the active catalogue release. What is
published here decides what those tools can cite and map against.

Success means that what requirement work relies on is reviewed, attributable and current. Every
published passage was approved by its owner. Every catalogue change reaches requirement work
only through a named, published release. Withdrawing or replacing a source shows its owner
exactly which requirements depended on it.

## Positioning

It is a curation desk, not a document store or a wiki. Nothing an extractor or a model
suggests is published until a person reviews it. Every change carries provenance: who approved
it, from which document version, in which release. Changes are made with their downstream
impact in view: which requirements cite a document, and how a draft release would change
existing architecture mappings.

## Operating Context

- **Two rhythms.** Heavy review bursts around a release or a new policy document: extracted
  passages, catalogue suggestions read from architecture documents, release comparison and
  mapping-impact previews. Light upkeep in between: approve a document, fix a system's owner,
  publish or activate a release.
- **Desktop, keyboard and mouse.** Long sessions at a large screen are normal during review
  bursts. Check-ins must still work quickly.
- **Mixed-language content.** Documents, passages and catalogue names may be English, Arabic or
  both, often within one table. The model evaluation behind architecture matching is
  English/Arabic.
- **Source formats:** PDF, Word, Excel, PowerPoint, CSV, Markdown and plain text, plus
  catalogue files (an Excel template, YAML and CSV).
- **Background work.** Ingestion, index builds, catalogue reading and impact previews run as
  jobs that take seconds to minutes and can fail, be retried or be cancelled.
- **Served under `/knowledge/`** on the same host as requirement-portal, with its API at
  `/knowledge-api/`. Sign-in uses the platform's OIDC provider (client `knowledge-spa`). There
  are offline fake personas for development.

## Capabilities and Constraints

- **Library:**
  - upload, with each file scanned for malware;
  - review of extracted blocks: exclude, edit or keep each, with warnings and a preview of the
    original source;
  - approval and publication of a revision;
  - index builds, previewed and then activated;
  - withdrawal and replacement;
  - ownership transfer, with its history;
  - dependencies: which requirements cite a document;
  - a read-only source-impact view. Retain-or-revise decisions are recorded in
    requirement-portal, not here.
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
- **Access:** every screen requires `knowledge_admin`. Anyone else gets a "no access" page.
- **Stack:** React + Vite + TypeScript, served under `base: "/knowledge/"`. The API contract is
  `contracts/knowledge-public.openapi.json`.
- **Its own design system.** Do not reuse requirement-portal's Working Paper tokens,
  primitives or shell.

## Brand Commitments

- It is part of the requirement platform, beside requirement-portal (product name
  "Requirement AI"). Users move between the two through links. The two share one sign-in and
  should feel like one family, but they have distinct design systems.
- The interface language is English. Content keeps its own language and direction.

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
5. **Content keeps its language.** Arabic and English sit side by side without either being
   mangled.

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

Mixed-direction text (Arabic and English) must render correctly in every field, table cell and
passage.
