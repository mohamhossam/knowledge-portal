"""Check the app contract (review recommendation 11, ADR-0126): regenerated, and versioned.

1. The committed `contracts/knowledge-apps.openapi.json` is what the code generates now.
2. Against the base it replaces (a git revision, by default `origin/main`), every change is
   sorted into breaking or additive, and the contract's version is raised to match: a breaking
   change raises MAJOR, an additive one MINOR (AGENTS.md §2.1).

    uv run python scripts/check_app_contract.py [--base REVISION]

A base that has the contract only under its earlier name (the internal API's,
`contracts/knowledge-internal.openapi.json`) is compared under that name. A base with no
contract file, or a revision git cannot read, is reported and skipped: there is nothing to
pin against. Exit status 1 on any problem.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from knowledge_portal.interfaces.api.contract_compat import (
    Bump,
    compare,
    required_bump,
    version_problems,
)
from knowledge_portal.interfaces.api.routes.apps import contract_openapi

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "contracts/knowledge-apps.openapi.json"
# Where the contract lived before, newest first: the internal API's, until ADR-0126.
EARLIER = ("contracts/knowledge-internal.openapi.json",)


def _base(revision: str) -> dict[str, Any] | None:
    problem = ""
    for path in (CONTRACT, *EARLIER):
        shown = subprocess.run(
            ["git", "show", f"{revision}:{path}"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if shown.returncode == 0:
            loaded: dict[str, Any] = json.loads(shown.stdout)
            return loaded
        problem = problem or shown.stderr.strip()
    print(f"No contract at {revision} to compare against: {problem}")
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="origin/main", help="the git revision it replaces")
    arguments = parser.parse_args(argv)

    committed = json.loads((ROOT / CONTRACT).read_text(encoding="utf-8"))
    generated = json.loads(json.dumps(contract_openapi(), sort_keys=True))
    if committed != generated:
        print(
            f"{CONTRACT} is stale: regenerate it with "
            "`uv run python scripts/dump_apps_openapi.py` and review the change."
        )
        return 1

    base = _base(arguments.base)
    if base is None:
        return 0
    found = compare(base, committed)
    bump = required_bump(found)
    base_version, version = base["info"]["version"], committed["info"]["version"]
    for line in found.breaking:
        print(f"breaking  {line}")
    for line in found.additive:
        print(f"additive  {line}")
    problems = version_problems(base_version, version, bump)
    summary = {
        Bump.MAJOR: "breaking: every app that calls it must release with it",
        Bump.MINOR: "additive",
        Bump.PATCH: "descriptions only",
        Bump.NONE: "unchanged",
    }[bump]
    print(f"{CONTRACT}: {summary}; version {base_version} at {arguments.base}, {version} now.")
    for problem in problems:
        print(f"error: {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
