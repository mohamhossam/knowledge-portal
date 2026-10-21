# WORKSPACE.md — the slice spec template

Every slice in `docs/slices/` follows this shape (AGENTS.md §18). Sections the slice
genuinely does not need are dropped, never left as "None." — dropping roadmap scope is a
decision raised with the user first (§15.1).

```markdown
# <Slice name>

## Objective

Why this slice exists: the capability it delivers, in one or two sentences, with the
roadmap entry, plan or ADR it implements.

## User Outcome

What a named kind of user can do after this slice that they could not before, written as
the screens and answers they see.

## Business Rules

The invariants and decisions the slice encodes, each one testable.

## Domain

New or changed entities, value objects and invariants.

## Application

Use cases, commands and queries.

## Ports

Outbound ports the slice introduces or extends.

## Adapters

The smallest adapters the ports need, including the offline fakes.

## API

Routes and schema changes, with the contract files touched.

## UI

Screens and components; the UI line has the same standing as the API line (§15.1).

## In Scope / Out of Scope

The boundary, stated both ways, naming what is deliberately deferred and where it is
carried to.

## Acceptance Criteria

Checkable statements a reviewer can walk through.

## Tests

The cheapest tests that prove the behaviour, per the §13 pyramid.

## Validation Evidence

The commands actually run and their recorded results. A claim without recorded output
does not count (§14).
```
