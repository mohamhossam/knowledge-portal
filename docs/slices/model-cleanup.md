# Model clean-up: one way to compare names, capabilities in their concept's domain

## Objective

Close the code items of review item O7. Systems, components and domains compare their
names across entities the way concepts and terms already do (`label_key`), and a
capability may not sit in a domain other than the one its concept sits in. The item's
three decisions (co-mastery, the remaining suggestion kinds, library classification) are
proposed in ADR-0123 for the owner.

## User Outcome

A maintainer can no longer give one system "Wi-Fi Hub" and another "WiFi hub", which a
reader cannot tell apart and matching would refuse to choose between. Nor can they place a
capability in Billing while it realises an Orders concept. Each is refused with a message
naming both sides. Spellings of one system's own name ("CRMGW", "CRM GW") stay allowed.

## Business Rules

1. Between two systems, two components of one system, or two sibling domains, labels are
   compared by `label_key`: letters and digits alone, ignoring case. A label naming one may
   not name the other.
2. Within one system or one component, its own names and aliases differ by more than case
   and surrounding space, as before, so punctuation variants of one name may be kept.
3. A capability linked to a concept sits in that concept's domain (a narrower concept's is
   its top concept's) or in none.

## Domain

- `knowledge.py`: `_compared` (one entity's own labels), `label_key` between entities, in
  the system, component and sibling-domain checks; the capability-domain check in the
  aggregate.
- `concepts.py`: `concept_domain`.

## Application

None.

## Ports

None.

## Adapters

None.

## API

None. A save the new rules refuse answers 422 like any other invariant.

## UI

None.

## In Scope / Out of Scope

- In: rules 1 to 3.
- Out: co-mastery, suggestion kinds for the remaining entity types, and library
  classification (ADR-0123, proposed).

## Acceptance Criteria

- The committed SMB catalogue and the seed load unchanged: neither has a collision or a
  mismatch the rules refuse, as checked when writing them.
- Two systems or two components differing only in punctuation are refused; one system
  keeps "WiFi Hub" and "Wi Fi Hub" as aliases of "Wi-Fi Hub".
- Sibling domains "Order-Capture" and "Order capture" are refused.
- A capability in Billing realising a concept under Orders is refused; in Orders, or in
  none, it is kept.

## Tests

- `tests/unit/test_model_cleanup.py`.
- Two tests built a release the rules now refuse, to show lookups refusing to choose
  between two systems spelled alike; each now asserts the refusal instead
  (`test_catalogue_matching.py`, `test_catalogue_table_reading.py`).
  `test_system_components.py` names the clearer message for a component repeating its
  own name.

## Validation Evidence

- `uv run pytest`: 1360 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean.
- The committed SMB catalogue and the seed checked before the rules were written: no
  label shared between two systems or two components by `label_key`, no sibling domains
  alike, and all 48 linked capabilities in their concept's domain.
