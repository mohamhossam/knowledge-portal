# ADR 0127 — CFSS and RFSS keep their own rules

## Status

Accepted 2026-10-25, by the product owner's decision of the same day.

## Context

Realisation records (ADR-0123, ontology plan Phase 8) are the TM Forum SID's service
specifications and the resources below them:

- a **CFSS**, customer facing service specification, defines a service as the customer or the
  business sees it, such as `CFSS_UPLINK_UCPE`;
- an **RFSS**, resource facing service specification, defines the technical service that
  delivers it;
- a **resource** is what it runs on.

The model held a record's name, layer, other names, delivering systems and what realises it,
but no rules. Design documents state many rules of a specification: "One Service Order should
include from one to two Uplink uCPE Services", "the vRouter uCPE Service must refer to a Place".
With only offerings holding rules, the reader filed each of them as an *offering rule* of an
offering named after the specification. In a first version that left 12 suggestions waiting for
offerings called "CFSS Uplink Ucpe" and the like. The Decide step offered "Suggest the
offering", which would have created fake products that requirement mapping treats as real.

The interface also named the layers CFS and RFS. The people who curate the catalogue say CFSS
and RFSS.

## Decision

1. **A CFSS or RFSS holds rules.** `RealisationRecord.rules` lists what the specification
   requires, each once, ignoring case and spacing. A resource holds none.
2. **A rule of a specification is its own suggestion kind.** `specification_rule` names its
   CFSS or RFSS (by record id or name) and the rule. It waits (`needs_realisation`) until the
   draft holds that specification, is accepted onto it, and is already present when the record
   states it.
3. **The reader files rules where they belong.** The prompt (catalogue-extraction-v22) defines
   CFSS and RFSS, says neither is ever a product offering, and adds `specification_rule`. A
   rule, constraint or offering rule said of a name that is a CFSS or RFSS in the draft or in
   the same reading becomes that specification's rule. A "system" named like one is dropped,
   as one named like an offering already is.
4. **What is already waiting can be settled.** The subject endpoint takes the kind
   `specification` with `specification_id`. The offering rules and constraints read of the name
   become the specification's rules; a suggestion to add the name as an offering or a system is
   rejected. On Decide, an offering nothing adds whose name is a CFSS or RFSS in the draft shows
   "It is the CFSS in the draft" instead of "Suggest the offering".
5. **CFSS and RFSS are the names people read.** Labels, sentences, messages, the workbook's
   guidance and the explorer document say CFSS and RFSS. The stored and transported layer values
   stay `cfs`, `rfs` and `resource`, so stored releases, catalogue files and requirement-portal
   are unchanged; "CFSS" and "RFSS" (and their full names) are also read as layers.
6. Rules travel everywhere a record does: the API, the YAML catalogue file (`rules`), the
   workbook (a `rules` column, `;`-separated like an offering's), and the version diff.

## Consequences

- The public contract widens: a record's `rules`, the suggestion kind `specification_rule`,
  and the subject kind `specification` with `specification_id`. Additive.
- Prompt version catalogue-extraction-v22: readings cached under v21 are read again.
- A specification's rules are not yet in the evidence index, so requirement mapping does not
  cite them; adding them changes the index text and its version.
- Renaming the stored layer values to `cfss` and `rfss` would be a breaking change for stored
  releases, files and requirement-portal; it is not made.

## Alternatives considered

- **Keep the rules as offering rules and stop offering "Suggest the offering".** Rejected: the
  rules are real design rules, and they would have nowhere to live.
- **Rename the layer values to `cfss` and `rfss`.** Deferred: the words people read change now;
  the stored values can follow with a migration and a coordinated requirement-portal release.
