# Realisation records suggested from documents

## Objective

The third of the suggestion kinds ADR-0123 adds as the owner decided ("every remaining
type"): realisation records (ontology plan Phase 8, ADR-0114). Technical specifications name
the customer-facing services an offering is sold as, the resource-facing services under them
and the resources that realise those; until now a curator typed each record into a catalogue
file.

## User Outcome

A curator reads a technical specification into a draft. Decide lists, under Realisations,
"Adds the CFS CFSS_ONPREM_FIREWALL_HE, delivered by CWOM, realised by FORTINET_CPE", waiting
for FORTINET_CPE if the draft lacks it. Accepting all adds the resources first, then the RFSs,
then the CFSs, each carrying the suggestion it came from.

## Business Rules

1. A realisation suggestion holds a whole record: its name, its layer (CFS, RFS or resource),
   the systems that deliver it or hold it, the records one layer down that realise it and what
   it is. Systems and realising records are named as the document names them until the draft
   resolves them.
2. A record is realised only by a lower layer: a CFS by RFSs or resources, an RFS by
   resources, a resource by nothing. A name is looked up among the lower layers only.
3. One per layer and name: readings of one record are one suggestion, the first's facts kept,
   names, systems and realising records joined, every citation kept.
4. It waits for every system it names (`needs_system`) and every record that realises it
   (`needs_realisation`).
5. Accepting adds it, or fills an existing record of the same id, or of its layer answering to
   its name: names, systems and realising records are added, an unset description, confidence
   or source is filled, the layer and name are never replaced.
6. Accepting records it on the record (ADR-0120), and every catalogue file carries it.
7. Accepting all takes resources, then RFSs, then CFSs, and repeats while it makes progress.
8. A record's id is its layer and its name, with the layer in front once ("RFS_POLICY" and
   "POLICY" as an RFS both give "rfs-policy").

## Domain

- `realisations.py`: `RealisationRecord.accepted`, `record_id`, `find_realisation_among`,
  `merge_realisations`.
- `candidates.py`: `CandidateKind.REALISATION_RECORD`, `CandidateMatch.NEEDS_REALISATION`,
  `CandidateContent.realisation`, `_resolved_realisation`, `_current_realisation`,
  `_with_realisation`; classify, apply, missing systems and possible matches.
- `acceptance.py`: realisation records carry provenance.

## Application

- `catalogue_candidates.py`: its place in accepting order (after interfaces), its systems
  resolved against the provisional draft, one per record (`_subject`, `_merged_content`), and
  the layer order within accepting all (`_nested`).

## Ports

None.

## Adapters

- The extraction prompt (`catalogue-extraction-v19`, full readings only): `realisation_record`
  items with the new `realisation_layer` and `realised_by`.
- The offline extractor reads `Realisation: NAME [cfs] realised by A, B` (delivered by the last
  system named, if any).

## API

- `realisation` on `CandidateContentSchema`; read-only `accepted` on `RealisationRecordSchema`.
  Public contract, additive.

## UI

- `suggestions.ts`: the sentence ("delivered by", "held by" for a resource), what it waits
  for, the Realisations section, its dependency keys, the lexicon's `realisation`, `inWords`.
- The suggestion editor: name, layer and what it is; its systems and realising records as the
  document says.

## In Scope / Out of Scope

- In: rules 1 to 8.
- Out: sources and conflicts (the next slice); linking an offering component's realisation to
  a suggested record (a catalogue file does); showing a record's provenance on a page (it is
  in the API and every catalogue file).

## Acceptance Criteria

- Classify and apply as rules 2, 4 and 5; a missing realising record refuses with its name.
- Through the API, a document with a CFS, the RFS realising it and the resource realising
  that suggests each once; accepting all adds all three, linked, with their provenance; every
  file format keeps the provenance.
- Decide shows them under Realisations with what they wait for; axe finds nothing.

## Tests

- `tests/unit/test_realisation_suggestions.py`; `frontend/src/catalogue/suggestions.test.ts`.

## Validation Evidence

- `uv run pytest`: 1388 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts and the catalogue fixture regenerated.
- Frontend: `lint`, `typecheck`, `test` (925 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean. CI's e2e is the authority for the route journeys.
- Live check against the offline stack: a document naming CFSS_QUOKKA_FIREWALL realised by
  RFS_QUOKKA_POLICY, realised by QUOKKA_APPLIANCE, under Quokka Firewall Manager, gave three
  suggestions under Realisations ("Adds the resource QUOKKA_APPLIANCE, held by Quokka Firewall
  Manager"); Decide offered "Accept the one ready and the 3 that wait on it". Accepting all
  added the resource, the RFS realised by it and the CFS realised by the RFS, each recording its
  suggestion. axe (WCAG 2.2 AA) found nothing on Decide or the editor in light, dark or at
  600px.
