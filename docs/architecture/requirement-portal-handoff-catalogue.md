# Handoff to requirement-portal: catalogue contract changes (October 2026)

The internal contract (`contracts/knowledge-internal.openapi.json`) gains structured fields for
catalogue facts that used to live in prose, and former ids for renamed offerings and
journeys. Every change but one adds an optional field; nothing
is renamed or removed. requirement-portal should review them before it next regenerates its
client, adopt the first item, and answer the one question below before this change is
released.

## To adopt

- **Former ids** (`former_ids` on offerings and journeys; ADR 0124). A renamed offering or
  journey keeps the ids it had. A precedent, change request or saved assessment that stored
  an old id should resolve it through `former_ids` before treating the offering or journey
  as gone. This portal already does so for its own precedents, change requests and
  suggestions.

## One narrowed type: please confirm

- **`timing` on a journey's calls** was any string up to 300 characters. It is now `Sync` or
  `Async` (`CallTiming`), in both directions.
- **Reading** (`ActivityIntegration` in `POST /internal/architecture/assess`): compatible.
  Every catalogue so far wrote only those two values.
- **Writing** (`ActivityIntegrationSchema` in `POST /internal/change-requests`, inside an
  offering draft's journey): a call's timing is taken in any case and as sources write it:
  "sync", "Synchronous", "Sync (callback)", "Asynchronous via MQ". Text that names no timing,
  or names both ("Sync/Async"), is refused with 422.
- **The question.** Does requirement-portal hold change requests not yet sent whose offering
  drafts carry a timing other than those? Drafts it received from this portal carry only
  `Sync` or `Async`, so a 422 would mean a draft was edited on requirement-portal's side.
- **What this portal already stored** still loads: a stored release, suggestion or change
  request with any other wording reads it as the timing it names, or as unsaid.

## Added, optional

- Offerings: `purpose`, why a customer buys it, beside `proposition`.
- Open questions: `title`, the question in a few words; `text` is its detail.
- Offering components: `hub`, the device the bundle is built on; at most one per offering.
- Order types: `stage`, one of `join`, `change`, `support`, `leave`.
- Fallout cases: `system_id`, the catalogued system it falls out in.
- Flow rules: `channel_id`, the channel a branch is taken for.
- Plan characteristics: `amount` and `unit`, such as `200` and `Mbps`. Both are read from
  `value` when it is written as a number and a unit, and are absent otherwise. A writer may
  leave them out; one that sends a pair the value does not say gets 422.

## Behaviour that changes without a field

- **A step's point of no return.** A bare "yes" reads as "Past this step, the order can no
  longer be cancelled."; a "no", "N/A" or "-" reads as not a point of no return.

## Contract version and refusals (review recommendations 11 and 12)

- **Version.** The contract's `info.version` is 1.0.0 and now rises with every shape change:
  MAJOR for a breaking change, MINOR for an additive one. Pin your adapters to the major
  version.
- **Refusals.** A refused internal call answers `{code, message, correlation_id}` instead of
  `{"detail": ...}`, with the same status and headers: 401 `authentication_required` for a
  missing or invalid service token, 503 `service_unavailable` when the token cannot be checked,
  404 `not_found` when the internal API is not served. Read `message` where you read `detail`,
  and log `correlation_id`: it is the `X-Request-ID` this service logged the refusal under.

## Contact

The catalogue maintainers (AGENTS.md §19 lists open debt).
