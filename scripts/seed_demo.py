"""Seed a running offline knowledge API with sample curation work. Development only.

Every record is synthetic and says so ("sample"). It gives the portal's screens
each state they must render: documents in service, awaiting review (yours and
another admin's), failed and withdrawn; a draft catalogue release with proposed
suggestions; squads that own some systems and leave others without an owner.

    uv run python -m knowledge_portal.interfaces.api.serve --port 8100   # fake, in memory
    uv run python scripts/seed_demo.py --api http://127.0.0.1:8100

Requires LLM_PROVIDER=fake, IDENTITY_PROVIDER=fake and LIBRARY_SCAN_MODE=offline.
The review material (a deck, a workbook) is built with the test suite's file
builders, so run it from the repository root.
"""

from __future__ import annotations

import argparse
import io
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.presentation_fixtures import PPTX_MIME, drawing_paragraph, presentation  # noqa: E402

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
REVIEWER = {"X-Fake-Actor-Id": "fake-reviewer"}


def wait_for(
    client: httpx.Client, path: str, headers: dict[str, str], ready: Any
) -> dict[str, Any]:
    for _ in range(200):
        view = client.get(path, headers=headers).json()
        if ready(view):
            return dict(view)
        time.sleep(0.1)
    raise RuntimeError(f"{path} never reached the expected state.")


def upload(
    client: httpx.Client, title: str, name: str, body: bytes, mime: str, headers: dict[str, str]
) -> str:
    response = client.post(
        "/library/ingestions",
        data={"title": title, "idempotency_key": str(uuid.uuid4())},
        files={"file": (name, body, mime)},
        headers=headers,
    )
    response.raise_for_status()
    return str(response.json()["id"])


def read(client: httpx.Client, document_id: str, headers: dict[str, str]) -> dict[str, Any]:
    return wait_for(
        client,
        f"/library/documents/{document_id}",
        headers,
        lambda view: view["versions"][-1]["stage"] in {"ready_for_review", "failed", "quarantined"},
    )


def publish(client: httpx.Client, document_id: str, headers: dict[str, str]) -> dict[str, Any]:
    path = f"/library/documents/{document_id}"
    view = read(client, document_id, headers)
    version = view["versions"][-1]
    reviewed = client.post(
        f"{path}/versions/{version['id']}/review",
        json={
            "expected_version": view["version"],
            "explanation": "Sample review",
            "passages": [
                {"block_id": b["id"], "text": b["text"], "included": True, "exclusion_reason": ""}
                for b in version["blocks"]
            ],
        },
        headers=headers,
    )
    reviewed.raise_for_status()
    updated = reviewed.json()
    client.post(
        f"{path}/versions/{version['id']}/approval",
        json={
            "expected_version": updated["version"],
            "revision_id": updated["versions"][-1]["revisions"][-1]["id"],
            "fingerprint": updated["review_fingerprint"],
        },
        headers=headers,
    ).raise_for_status()
    return wait_for(client, path, headers, lambda current: current["published_id"])


def seed_library(client: httpx.Client) -> None:
    text = "text/plain"
    for title, body in (
        (
            "XGPON coverage rules (sample)",
            b"High-speed bundles require XGPON coverage at the customer address.",
        ),
        (
            "Business bundle eligibility (sample)",
            b"An SMB customer may hold at most three bundles per site.",
        ),
        ("إجراءات نقل الأرقام (sample)", "يجب التحقق من هوية العميل قبل نقل الرقم.".encode()),
    ):
        publish(client, upload(client, title, "policy.txt", body, text, OWNER), OWNER)

    # A published procedure: its lines share one section, so search finds surrounding text.
    procedure = "\n".join(
        [
            "# Ordering a business fibre bundle (sample)",
            "Confirm XGPON coverage at the customer's address before quoting.",
            "Check the site has a free optical port; book a survey if it does not.",
            "Quote the bundle only after coverage and the port are confirmed.",
            "Record the coverage reference on the order.",
        ]
    ).encode()
    publish(
        client,
        upload(
            client,
            "Bundle ordering procedure (sample)",
            "ordering.md",
            procedure,
            "text/markdown",
            OWNER,
        ),
        OWNER,
    )

    # A published policy, then withdrawn.
    retired = publish(
        client,
        upload(
            client,
            "Legacy ADSL ordering (sample)",
            "adsl.txt",
            b"ADSL orders go through the legacy portal.",
            text,
            OWNER,
        ),
        OWNER,
    )
    client.post(
        f"/library/documents/{retired['id']}/withdrawal",
        json={"expected_version": retired["version"], "reason": "ADSL retired (sample)"},
        headers=OWNER,
    ).raise_for_status()

    # A published policy with a new version waiting for its owner's review.
    discount = publish(
        client,
        upload(
            client,
            "Invoice discount display (sample)",
            "discount.txt",
            b"Discounts show on the invoice line.",
            text,
            OWNER,
        ),
        OWNER,
    )
    client.post(
        "/library/ingestions",
        data={
            "title": discount["title"],
            "document_id": discount["id"],
            "expected_version": str(discount["version"]),
            "idempotency_key": str(uuid.uuid4()),
        },
        files={
            "file": (
                "discount-v2.txt",
                b"Discounts show on the invoice line and the summary.",
                text,
            )
        },
        headers=OWNER,
    ).raise_for_status()

    # Awaiting your review, titled in Arabic, so a cell renders right to left.
    read(
        client,
        upload(
            client,
            "سياسة التحقق من العنوان (sample)",
            "address.txt",
            "يجب التحقق من العنوان قبل تفعيل الخدمة.".encode(),
            text,
            OWNER,
        ),
        OWNER,
    )

    # Awaiting another admin's review, and an upload that cannot be read.
    read(
        client,
        upload(
            client,
            "Fault escalation matrix (sample)",
            "faults.txt",
            b"Severity 1 faults escalate within 15 minutes.",
            text,
            REVIEWER,
        ),
        REVIEWER,
    )
    read(
        client,
        upload(
            client,
            "Site survey checklist (sample)",
            "survey.csv",
            b"Step,Owner\nBroken",
            "text/csv",
            OWNER,
        ),
        OWNER,
    )


def workbook() -> bytes:
    """A 400-row eligibility matrix, with a hidden internal sheet."""
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.title = "Eligibility"
    sheet.append(["Product", "Segment", "Rule"])
    for row in range(1, 401):
        sheet.append(
            [
                f"Bundle {row:03d}",
                "SMB" if row % 3 else "Enterprise",
                f"Eligible where XGPON coverage is confirmed (sample rule {row}).",
            ]
        )
    hidden = book.create_sheet("Internal pricing")
    hidden.sheet_state = "hidden"
    hidden["A1"] = "Floor price is not for publication (sample)."
    stream = io.BytesIO()
    book.save(stream)
    return stream.getvalue()


def seed_review_material(client: httpx.Client) -> None:
    """Documents that exercise the review: a blocking chart, a hidden sheet, a long text."""
    deck = presentation(
        drawing_paragraph("Launch the SMB fibre bundle in Q1 (sample).")
        + '<p:graphicFrame><a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame>',
        drawing_paragraph("Sales qualify XGPON coverage before quoting (sample)."),
        drawing_paragraph("Care escalates installation faults within one day (sample)."),
    )
    read(
        client,
        upload(client, "Product launch deck (sample)", "launch.pptx", deck, PPTX_MIME, OWNER),
        OWNER,
    )
    read(
        client,
        upload(
            client,
            "Product eligibility matrix (sample)",
            "eligibility.xlsx",
            workbook(),
            XLSX_MIME,
            OWNER,
        ),
        OWNER,
    )
    handbook = "\n".join(
        f"Step {n}: confirm the customer's site and service before step {n + 1} (sample)."
        for n in range(1, 801)
    ).encode()
    read(
        client,
        upload(
            client, "Customer care handbook (sample)", "handbook.txt", handbook, "text/plain", OWNER
        ),
        OWNER,
    )


def seed_governance(client: httpx.Client) -> None:
    """A table-aware build awaiting activation, and a document handed between admins."""
    documents = client.get("/library/documents?limit=100", headers=OWNER).json()
    coverage = next(item for item in documents if item["title"].startswith("XGPON coverage"))
    path = f"/library/documents/{coverage['id']}"
    preview = client.get(f"{path}/builds/preview", headers=OWNER)
    preview.raise_for_status()
    body = preview.json()
    client.post(
        f"{path}/builds",
        json={
            "expected_version": body["document_version"],
            "fingerprint": body["fingerprint"],
            "index_identity": body["index_identity"],
        },
        headers=OWNER,
    ).raise_for_status()
    wait_for(
        client,
        path,
        OWNER,
        lambda view: any(
            item["built_at"] and not item["activated_at"] for item in view["publications"]
        ),
    )

    faults = next(
        item
        for item in client.get("/library/documents?limit=100", headers=REVIEWER).json()
        if item["title"].startswith("Fault escalation")
    )
    client.post(
        f"/library/documents/{faults['id']}/ownership",
        json={
            "expected_version": faults["version"],
            "actor_id": "fake-owner",
            "reason": "The care knowledge owner takes over escalation rules (sample).",
        },
        headers=REVIEWER,
    ).raise_for_status()


def seed_catalogue(client: httpx.Client) -> None:
    releases = "/architecture-knowledge/releases"
    draft = client.post(
        releases, json={"name": "October integration update (sample)"}, headers=OWNER
    )
    draft.raise_for_status()
    base = f"{releases}/{draft.json()['id']}"
    uploaded = client.post(
        f"{base}/documents",
        data={
            "title": "Integration design (sample)",
            "language": "en",
            "expected_revision": str(draft.json()["revision"]),
        },
        files={
            "file": (
                "design.txt",
                b"System: Order Hub\nSystem: Billing Gateway\n"
                b"Constraint: Order Hub only runs at night\n",
                "text/plain",
            )
        },
        headers=OWNER,
    )
    uploaded.raise_for_status()
    version_id = uploaded.json()["documents"][-1]["id"]
    client.post(f"{base}/documents/{version_id}/extractions", headers=OWNER).raise_for_status()
    wait_for(client, f"{base}/suggestions", OWNER, lambda view: view["suggestions"])


def seed_squads(client: httpx.Client) -> None:
    def post(path: str, body: dict[str, Any]) -> None:
        client.post(path, json=body, headers=OWNER).raise_for_status()

    post("/organisation/people", {"person": {"id": "layla", "name": "Layla Haddad (sample)"}})
    post("/organisation/people", {"person": {"id": "omar", "name": "Omar Saleh (sample)"}})
    post(
        "/organisation/value-streams",
        {"value_stream": {"id": "retail", "name": "Retail (sample)", "lead_person_id": "layla"}},
    )
    post(
        "/organisation/squads",
        {
            "squad": {
                "id": "sales",
                "name": "Sales squad (sample)",
                "value_stream_id": "retail",
                "scrum_master_person_id": "layla",
                "systems": [
                    {"system_id": "bcrm", "person_id": "layla"},
                    {"system_id": "b2b-web", "person_id": "layla"},
                ],
            }
        },
    )
    post(
        "/organisation/squads",
        {
            "squad": {
                "id": "care",
                "name": "Care squad (sample)",
                "value_stream_id": "retail",
                "systems": [{"system_id": "cim", "person_id": "omar"}],
            }
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default="http://127.0.0.1:8100")
    arguments = parser.parse_args()
    with httpx.Client(base_url=arguments.api, timeout=30) as client:
        # Both admins sign in once, so the portal can name them.
        client.get("/identity/me", headers=OWNER).raise_for_status()
        client.get("/identity/me", headers=REVIEWER).raise_for_status()
        seed_library(client)
        seed_review_material(client)
        seed_governance(client)
        seed_catalogue(client)
        seed_squads(client)
    print("Seeded sample curation work.")


if __name__ == "__main__":
    main()
