# Business areas and portfolio places suggested from documents

## Objective

The second of the suggestion kinds ADR-0123 adds as the owner decided ("every remaining
type"): capability domains (business areas) and portfolio nodes. Strategy and product
documents name the business areas capabilities belong to and where offerings sit in the
portfolio (Enterprise › Fixed › SMB); until now a curator typed each into a catalogue file.

## User Outcome

A curator reads a portfolio paper into a draft. Decide lists, under Portfolio, "Adds SMB
(Segment) to the portfolio, under Fixed", waiting for Fixed if the draft lacks it, and,
under Business areas, "Adds the business area Onboarding, inside Partners". Accepting all
adds the whole tree, parents first, each node carrying the suggestion it came from.

## Business Rules

1. A capability-domain suggestion holds a whole domain: its name, the domain it sits inside
   and what it covers. A portfolio suggestion holds a whole node: its name, its level in the
   document's own words, the node it sits under and what it is. Parents are named as the
   document names them until the draft resolves them, by id or by a name only one node has.
2. One per tree, parent and name: readings of one node are one suggestion, the first's facts
   kept, gaps filled from the others, every citation kept.
3. A node waits for its parent: `needs_domain` for a business area, `needs_portfolio_node`
   for a portfolio node.
4. Accepting adds it, or fills an existing node of the same id, or of the same name under
   the same parent: an unset description (and a portfolio node's confidence and source) is
   filled; a level, a parent or anything else set is never replaced.
5. Accepting records it on the node (ADR-0120), and every catalogue file carries it.
6. Accepting all tries again while a round accepts something, so a node waits for the one
   above it only until that one is accepted, however deep the tree.
7. A portfolio node needs its level: a reading without one is left out.

## Domain

- `candidates.py`: `CandidateKind.CAPABILITY_DOMAIN` and `PORTFOLIO_NODE`,
  `CandidateMatch.NEEDS_PORTFOLIO_NODE`, `CandidateContent.capability_domain` and
  `portfolio_node`, `find_capability_domain`, `find_portfolio_node`, `_resolved_node`,
  `_current_node`, `_with_capability_domain`, `_with_portfolio_node`; classify, apply, missing
  systems and possible matches.
- `knowledge.py`, `portfolio.py`: `accepted` on `CapabilityDomain` and `PortfolioNode`.
- `acceptance.py`: both carry provenance.

## Application

- `catalogue_candidates.py`: both first in accepting order, parents before children
  (`_nested`); one per node (`_subject`, `_merged_content`); accepting all repeats while it
  makes progress (rule 6).

## Ports

None.

## Adapters

- The extraction prompt (`catalogue-extraction-v18`, full readings only, as interfaces):
  `capability_domain` and `portfolio_node` items with `parent_domain` and the new
  `portfolio_level`.
- The offline extractor reads `Capability domain: Name under Parent` and
  `Portfolio: Name (Level) under Parent`.

## API

- `capability_domain` and `portfolio_node` on `CandidateContentSchema`; read-only `accepted`
  on `CapabilityDomainSchema` and `PortfolioNodeSchema`. Public contract, additive.

## UI

- `suggestions.ts`: the sentences, what each waits for, the Business areas and Portfolio
  sections, their dependency keys, the lexicon's `area` and `portfolio`, and `inWords`.
- The suggestion editor: name, parent ("Inside", "Under", with a parent the document named
  that the draft lacks offered as written), level and description.

## In Scope / Out of Scope

- In: rules 1 to 7.
- Out: realisation records, sources and conflicts, each a slice of its own; showing a
  domain's or node's provenance on a page (as for landscape domains and interfaces, it is in
  the API and every catalogue file).

## Acceptance Criteria

- Classify and apply as rules 3 and 4; a missing parent refuses with its name.
- Through the API, a document with a three-level portfolio and a business area inside
  another suggests each once; accepting all adds every node under its parent with its
  provenance; every file format keeps the provenance.
- Decide shows them under Business areas and Portfolio with what they wait for; axe finds
  nothing.

## Tests

- `tests/unit/test_tree_suggestions.py`; `frontend/src/catalogue/suggestions.test.ts`.

## Validation Evidence

- `uv run pytest`: 1379 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts and the catalogue fixture regenerated.
- Frontend: `lint`, `typecheck`, `test` (922 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean. CI's e2e is the authority for the route journeys.
- Live check against the offline stack: a document with a three-level portfolio
  (Enterprise › Fixed › SMB) and a business area inside another gave five suggestions under
  Business areas and Portfolio ("Adds SMB (Segment) to the portfolio, under Fixed", "Waits
  for Fixed in the portfolio"); Decide offered "Accept the 2 ready and the 3 that wait on
  them"; the editor offered SMB's parent as the document names it. Accepting all added all
  five in one go, each under its parent and recording its suggestion, none left. axe
  (WCAG 2.2 AA) found nothing on Decide or the editor in light, dark or at 600px.
