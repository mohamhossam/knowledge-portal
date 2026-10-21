# Handoff to requirement-portal: catalogue contract changes (October 2026)

The internal contract (`contracts/knowledge-internal.openapi.json`) changed in the catalogue
work merged to `Knowledge_Hub_V1`. Every change but one adds an optional field; nothing is
renamed or removed. requirement-portal should review them before it next regenerates its
client, and adopt the first item.

## To adopt

- **Former ids** (`former_ids` on offerings and journeys; `docs/architecture/adr-catalogue-versioning.md`).
  A renamed offering or journey keeps its old ids. Precedents, change requests and requirement
  work that stored an old id should resolve it through `former_ids` before treating it as gone.
  The knowledge portal already does this for its own precedents and change requests.

## One narrowed type

- **`timing` on a journey's calls** was any string up to 300 characters; it is now `Sync` or
  `Async` (`CallTiming`). Every catalogue so far wrote only those two values, so readers see no
  change. A writer that sends anything else is refused with 422. Tables read from documents keep
  any other wording out of the field rather than fail.

## Added, optional

- Offerings: `purpose` (why a customer buys it, beside `proposition`).
- Open questions: `title` (the question in a few words; `text` is its detail).
- Offering components: `hub` (the device the bundle is built on; at most one).
- Order types: `stage` (`join`, `change`, `support`, `leave`).
- Fallout cases: `system_id` (the catalogued system it falls out in).
- Flow rules: `channel_id` (the channel a branch is taken for).
- Plan characteristics: `amount` and `unit` (a measured value, such as `200` and `Mbps`).
- Evidence chunks (section-v4): `role`, `parent_id`, `aliases`, `focus`.

## Behaviour that changes without a field

- **Neighbours and dependencies in a match** are now read from every link between systems:
  the stated connections, the interfaces systems expose to their consumers, and the calls
  journey steps make (`domain/architecture/links.py`). A catalogue that states no connection,
  such as the SMB catalogue, now returns neighbours and dependencies where it returned none.
  The public release response carries the same links as `connections`.
- **A bare "yes" as a step's point of no return** is read as "Past this step, the order can no
  longer be cancelled."

## Contact

The catalogue maintainers (AGENTS.md §19 lists open debt).
