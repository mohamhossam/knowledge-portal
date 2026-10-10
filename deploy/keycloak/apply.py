"""Adds the knowledge portal's sign-in entities to a Keycloak realm (ADR-0104).

The portal shares a realm with requirement work, so people keep one account,
but defines its own client, audience and roles here. knowledge-portal.json
holds them; this script fills in where the portal is served and hands the file
to Keycloak's partial import. Entities that already exist are kept as they are
unless --overwrite is given. docs/operations/deployment.md, "Sign-in".

    KEYCLOAK_URL=https://login.example.com KEYCLOAK_REALM=requirement-ai \
    KEYCLOAK_ADMIN=... KEYCLOAK_ADMIN_PASSWORD=... \
    KNOWLEDGE_APP_ORIGIN=https://knowledge.example.com \
    python deploy/keycloak/apply.py

Standard library only, so it runs wherever Python 3.12 does.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from typing import Any

ENTITIES = Path(__file__).with_name("knowledge-portal.json")
# The path the browser app is served under; Phase 5 makes it configurable.
DEFAULT_APP_PATH = "/knowledge"
PLACEHOLDER = re.compile(r"\$\{([A-Z_]+)\}")
# Values that may be empty: the root path.
MAY_BE_EMPTY = frozenset({"KNOWLEDGE_APP_PATH"})


def render(text: str, values: Mapping[str, str]) -> dict[str, Any]:
    """The entities with every ${NAME} filled in; a missing value is an error."""
    missing = sorted(
        {
            name
            for name in PLACEHOLDER.findall(text)
            if name not in values or (not values[name] and name not in MAY_BE_EMPTY)
        }
    )
    if missing:
        raise SystemExit(f"Set {', '.join(missing)}.")
    rendered: dict[str, Any] = json.loads(
        PLACEHOLDER.sub(lambda match: values[match.group(1)], text)
    )
    return rendered


def settings(environ: Mapping[str, str]) -> dict[str, str]:
    """Where the portal is served, from the environment, without trailing slashes."""
    return {
        "KNOWLEDGE_APP_ORIGIN": environ.get("KNOWLEDGE_APP_ORIGIN", "").strip().rstrip("/"),
        "KNOWLEDGE_APP_PATH": (
            environ.get("KNOWLEDGE_APP_PATH", DEFAULT_APP_PATH).strip().rstrip("/")
        ),
    }


def _post(url: str, body: bytes, headers: dict[str, str]) -> Any:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - operator's URL
        return json.loads(response.read() or b"null")


def apply(entities: dict[str, Any], environ: Mapping[str, str], *, overwrite: bool) -> Any:
    base = environ.get("KEYCLOAK_URL", "").strip().rstrip("/")
    realm = environ.get("KEYCLOAK_REALM", "").strip()
    user = environ.get("KEYCLOAK_ADMIN", "")
    password = environ.get("KEYCLOAK_ADMIN_PASSWORD", "")
    if not (base and realm and user and password):
        raise SystemExit(
            "Set KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD."
        )
    token = _post(
        f"{base}/realms/master/protocol/openid-connect/token",
        urllib.parse.urlencode(
            {
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": user,
                "password": password,
            }
        ).encode(),
        {"Content-Type": "application/x-www-form-urlencoded"},
    )["access_token"]
    body = {**entities, "ifResourceExists": "OVERWRITE" if overwrite else "SKIP"}
    return _post(
        f"{base}/admin/realms/{urllib.parse.quote(realm)}/partialImport",
        json.dumps(body).encode(),
        {"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dry-run", action="store_true", help="print what would be imported, and stop"
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="replace entities that already exist"
    )
    args = parser.parse_args(argv)
    entities = render(ENTITIES.read_text(encoding="utf-8"), settings(os.environ))
    if args.dry_run:
        json.dump(entities, sys.stdout, indent=2)
        print()
        return 0
    result = apply(entities, os.environ, overwrite=args.overwrite)
    print(
        f"Added {result.get('added', 0)}, overwrote {result.get('overwritten', 0)}, "
        f"kept {result.get('skipped', 0)}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
