# UPSTREAM.md

This repository is imported fresh, with no history, from
[`mohamhossam/smb-ai-requirement-agent`](https://github.com/mohamhossam/smb-ai-requirement-agent)
(requirement-portal ADR-0098). The original stays maintained and deployed in parallel.

## Synced to

| Field | Value |
|---|---|
| Original commit | `d5cfb57` |
| Imported | 2026-10-02. The library and catalogue code came by way of requirement-portal `539e174` (its Stage 2 untangling of `d5cfb57`), so fixes from the original reach it through that history |

## How to port a fix

1. List the original commits after "Synced to" that touch the library, the architecture
   catalogue or the organisation catalogue:
   `git -C ../smb-ai-requirement-agent log --oneline d5cfb57..origin/main`.
2. Port each one in its own pull request, titled `port: <original subject> (<original sha>)`.
3. Add a row below. Move "Synced to" forward only when every commit up to the new point has a
   row.

## Ported changes

| Original commit | Decision | Pull request |
|---|---|---|
| — | — | — |
