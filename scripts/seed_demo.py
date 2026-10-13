"""Seed a running offline knowledge API with sample curation work. Development only.

Every record is synthetic and says so ("sample"). It gives the portal's screens
each state they must render: documents in service, awaiting review (yours and
another admin's), failed and withdrawn; a published catalogue version placed in a
landscape, with an offering and its journey; a draft catalogue release with proposed
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


PLACES = {
    "channels-digital": ["b2b-web", "smb-app", "saas-self-service-portal", "b2b-bff"],
    "channels-assisted": ["bcrm", "cim", "dcrm"],
    "customer-sales": ["cbcm-crmgw", "netcracker-crm", "oracle-atg-bcc", "netcracker-cpm"],
    "orchestration": ["rtf", "cwom", "ibm-bpm", "felix", "wfm", "sla-management"],
    "network": ["ericsson-ecm", "gis", "network-inventory", "service-activation"],
    "assurance-ops": ["service-now", "hpsm", "remedy"],
    "billing-revenue": ["bscs"],
    "integration-platform": ["tibco", "cns", "edms", "ocr", "adfs"],
}

ARABIC = {
    "b2b-web": "بوابة الأعمال الإلكترونية",
    "smb-app": "تطبيق الأعمال الصغيرة",
    "cwom": "إدارة أوامر العمل",
    "bscs": "نظام الفوترة",
}


def activity(
    number: str,
    name: str,
    phase: str,
    performing: str,
    supporting: tuple[str, ...] = (),
    visible: bool | None = None,
    track: str | None = None,
) -> dict[str, Any]:
    return {
        "number": number,
        "name": name,
        "phase": phase,
        "track": track,
        "performing_system_id": performing,
        "supporting_system_ids": list(supporting),
        "customer_visible": visible,
        "component_ids": [],
    }


def sample_catalogue(release: dict[str, Any]) -> dict[str, Any]:
    """The initial catalogue, placed in a landscape, with one offering and its journey.

    EIDA is left unplaced on purpose, so the catalogue shows a system without a place.
    """
    domains = [
        {"id": "channels", "name": "Customer channels (sample)", "name_ar": "قنوات العملاء"},
        {
            "id": "channels-digital",
            "name": "Digital channels",
            "parent_id": "channels",
            "name_ar": "القنوات الرقمية",
        },
        {"id": "channels-assisted", "name": "Assisted channels", "parent_id": "channels"},
        {"id": "customer-sales", "name": "Customer and sales (sample)"},
        {"id": "orchestration", "name": "Order orchestration (sample)"},
        {"id": "network", "name": "Network and resources (sample)"},
        {"id": "assurance-ops", "name": "Service assurance (sample)"},
        {
            "id": "billing-revenue",
            "name": "Billing and revenue (sample)",
            "name_ar": "الفوترة والإيرادات",
        },
        {"id": "integration-platform", "name": "Integration and enabling (sample)"},
    ]
    place = {system: domain for domain, systems in PLACES.items() for system in systems}
    systems = []
    for original in release["systems"]:
        system = {**original, "landscape_domain_id": place.get(original["id"])}
        if system["id"] in ARABIC:
            system["name_ar"] = ARABIC[system["id"]]
        if system["id"] == "cwom":
            system["description"] = (
                "Orchestrates fixed-line orders from capture to closure (sample)."
            )
            system["components"] = [
                {
                    "id": "milestones",
                    "name": "Milestone tracker",
                    "technology": "Java",
                    "aliases": ["order milestones"],
                    "name_ar": "متتبع المراحل",
                },
                {"id": "decomposition", "name": "Order decomposition", "aliases": []},
            ]
            system["capabilities"] = [
                *system["capabilities"],
                {
                    "id": "milestone-tracking",
                    "name": "Order milestone tracking",
                    "triggers": ["order milestones", "installation milestones"],
                    "domain_id": "order-fulfilment",
                    "component_id": "milestones",
                    "concept_id": "cap-order-tracking",
                },
            ]
            system["constraints"] = ["Fixed-line orders only (sample)."]
        systems.append(system)
    relationships = [
        *release["relationships"],
        {
            "source_system_id": "bscs",
            "target_system_id": "cns",
            "kind": "publishes_events_to",
            "description": "A completed bill run notifies the customer (sample).",
        },
        {
            "source_system_id": "b2b-web",
            "target_system_id": "gis",
            "kind": "calls_api",
            "description": "The web checkout checks fibre coverage at the address (sample).",
        },
    ]
    offering = {
        "id": "business-fibre",
        "name": "Business fibre bundle (sample)",
        "code": "BFB-1",
        "family": "Fixed broadband",
        "lifecycle": "In market",
        "confidence": "confirmed",
        "proposition": "Fibre broadband and a managed router for small businesses (sample).",
        "rules": ["Coverage is confirmed at the address before a quote (sample)."],
        "order_types": [
            {"code": "NEW", "name": "New connection", "enabled": True},
            {"code": "MOD", "name": "Change speed", "enabled": True},
            {"code": "CEASE", "name": "Cease", "enabled": False},
        ],
        "components": [
            {
                "id": "fibre-line",
                "name": "Fibre line",
                "kind": "Service",
                "mandatory": True,
                "customer_visible": True,
                "responsibilities": [
                    {
                        "system_id": "cwom",
                        "role": "Fulfils",
                        "order_types": ["NEW", "MOD"],
                        "description": "Orchestrates the installation and its milestones.",
                    },
                    {
                        "system_id": "bscs",
                        "role": "Bills",
                        "order_types": [],
                        "description": "Charges the monthly rental.",
                    },
                ],
            },
            {
                "id": "router",
                "name": "Managed router",
                "kind": "Device",
                "mandatory": False,
                "customer_visible": True,
                "responsibilities": [
                    {
                        "system_id": "network-inventory",
                        "role": "Allocates",
                        "order_types": ["NEW"],
                        "description": "Reserves the router and its serial number.",
                    }
                ],
            },
        ],
        "values": [{"name": "Installation within five working days (sample)"}],
        "audiences": [{"name": "Small businesses"}],
    }
    journey = {
        "id": "order-business-fibre",
        "name": "Ordering a business fibre bundle (sample)",
        "product_id": "business-fibre",
        "order_type_code": "NEW",
        "confidence": "confirmed",
        "description": "From the customer's order on the web to the first bill (sample).",
        "activities": [
            activity("10", "Capture the order", "Order capture", "b2b-web", ("b2b-bff",), True),
            activity(
                "20", "Check coverage and eligibility", "Order capture", "cbcm-crmgw", ("gis",)
            ),
            activity("30", "Orchestrate fulfilment", "Fulfilment", "cwom", ("rtf",)),
            activity("40", "Install the line", "Fulfilment", "wfm", (), True),
            activity("50", "Activate the service", "Fulfilment", "service-activation"),
            activity("60", "Start billing", "Billing", "bscs"),
            activity("70", "Tell the customer", "Billing", "cns", (), True),
            activity("80", "Explain the refusal", "Order capture", "cim", (), True, "REFUSAL"),
        ],
        "flow_rules": [
            {
                "kind": "decision",
                "from_activity": "20",
                "to_activity": "30",
                "condition": "Covered",
            },
            {
                "kind": "decision",
                "from_activity": "20",
                "to_activity": "80",
                "condition": "Not covered",
                "branch": "REFUSAL",
            },
        ],
        "integrations": [
            {
                "from_activity": "30",
                "to_activity": "60",
                "interaction": "Order closure",
                "interface": "Billing order API",
                "timing": "Async",
            }
        ],
    }
    return {
        "expected_revision": release["revision"],
        "systems": systems,
        "relationships": relationships,
        "capability_domains": release.get("capability_domains", []),
        "business_capabilities": [
            {"id": "cap-order-fulfilment", "pref_label": "Order fulfilment (sample)"},
            {
                "id": "cap-order-tracking",
                "pref_label": "Order tracking (sample)",
                "alt_labels": ["Order milestones"],
                "broader_id": "cap-order-fulfilment",
            },
        ],
        "landscape_domains": domains,
        "products": [offering],
        "journeys": [journey],
    }


def seed_published_catalogue(client: httpx.Client) -> None:
    """A second published version, now in service; the initial catalogue stays as replaced."""
    releases = "/architecture-knowledge/releases"
    draft = client.post(
        releases, json={"name": "September landscape and offerings (sample)"}, headers=OWNER
    )
    draft.raise_for_status()
    base = f"{releases}/{draft.json()['id']}"
    saved = client.put(base, json=sample_catalogue(draft.json()), headers=OWNER)
    saved.raise_for_status()
    revision = saved.json()["revision"]
    client.post(
        f"{base}/build", json={"expected_revision": revision}, headers=OWNER
    ).raise_for_status()
    wait_for(client, f"{base}/build", OWNER, lambda job: job and job["status"] == "succeeded")
    client.post(
        f"{base}/publish",
        json={
            "expected_revision": revision,
            "rationale": "Placed the systems in the landscape; added the fibre offering (sample).",
        },
        headers=OWNER,
    ).raise_for_status()


DESIGN = """System: Order Hub
Component: Order API [Microservice]
Component: Order Store [PostgreSQL]
Capability: Order capture (capture order, new business order) @ Order API
Constraint: Read-only between midnight and 2am
System: Dynamics CRM
Order Hub depends on Dynamics CRM for quotes
Order Hub calls TIBCO for event routing
Order Hub sends work orders to CWOMS
Order Hub depends on fixed order orchestration for activation
System: CWOM
Capability: Fault intake (raise fault, fault ticket) @ Ticket Engine
"""

# A systems-table row, too wide for one source line.
PORTAL_ROW = " | ".join(
    [
        "",
        "Partner Portal",
        "partner-portal",
        "Partner ordering",
        "Order Hub via REST",
        "reseller portal",
        "Partner channels",
        "Resellers",
        "CONFIRMED",
        "",
    ]
).strip()

LANDSCAPE = f"""# Partner landscape (sample)

## Domains

| Domain | ID | Code |
| --- | --- | --- |
| Partner channels | partner-channels | PC |

## Systems

| System | ID | Function | Integrations | Aliases | Domain | Sub-domain | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
{PORTAL_ROW}

## Product: Business voice line (sample)

| Code | Family | Version | Lifecycle |
| --- | --- | --- | --- |
| BVL-1 | Voice | 1 | Planned |

| Order type | Code | Enabled | Description |
| --- | --- | --- | --- |
| New line | NEW | Yes | A new voice line |

Product rules: A voice line needs a fibre bundle at the same address.

## Journey: Ordering a business voice line (sample)

| # | Activity | Performing system | Supporting systems |
| --- | --- | --- | --- |
| 10 | Capture the order | Partner Portal | |
| 20 | Activate the line | CWOM | |
| 30 | Start billing | BSCS | |
"""


def seed_catalogue(client: httpx.Client) -> None:
    """The draft in preparation, fed from two documents read for suggestions.

    The design note yields a new system with its parts, a name that may be an
    existing system, an inferred dependency and a capability waiting for its
    component; the landscape's tables yield a domain, a placement, an offering
    and its journey.
    """
    releases = "/architecture-knowledge/releases"
    draft = client.post(
        releases, json={"name": "October integration update (sample)"}, headers=OWNER
    )
    draft.raise_for_status()
    base = f"{releases}/{draft.json()['id']}"
    revision = draft.json()["revision"]
    for title, name, body, mime in (
        ("Integration design (sample)", "design.txt", DESIGN, "text/plain"),
        ("Partner landscape (sample)", "landscape.md", LANDSCAPE, "text/markdown"),
    ):
        uploaded = client.post(
            f"{base}/documents",
            data={"title": title, "language": "en", "expected_revision": str(revision)},
            files={"file": (name, body.encode(), mime)},
            headers=OWNER,
        )
        uploaded.raise_for_status()
        revision = uploaded.json()["revision"]
        version_id = uploaded.json()["documents"][-1]["id"]
        client.post(f"{base}/documents/{version_id}/extractions", headers=OWNER).raise_for_status()
    wait_for(client, f"{base}/suggestions", OWNER, lambda view: len(view["runs"]) >= 2)
    # The team's sample requirements, for checking a draft before it is published.
    samples = client.get("/architecture-knowledge/sample-requirements", headers=OWNER)
    samples.raise_for_status()
    client.put(
        "/architecture-knowledge/sample-requirements",
        json={
            "expected_revision": samples.json()["revision"],
            "items": [
                {"text": text}
                for text in (
                    "Business customers order a fibre bundle through B2B Web (sample).",
                    "Track installation milestones in CWOM (sample).",
                    "Order Hub captures business orders from the web (sample).",
                    "Partners order a voice line through the Partner Portal (sample).",
                )
            ],
        },
        headers=OWNER,
    ).raise_for_status()


def seed_squads(client: httpx.Client) -> None:
    def post(path: str, body: dict[str, Any]) -> None:
        client.post(path, json=body, headers=OWNER).raise_for_status()

    for person in (
        {"id": "layla", "name": "Layla Haddad (sample)", "team": "Digital sales"},
        {"id": "omar", "name": "Omar Saleh (sample)", "team": "Fulfilment"},
        {"id": "rana", "name": "Rana Aziz (sample)", "email": "rana@example.com"},
    ):
        post("/organisation/people", {"person": person})
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
                "resources": [
                    {"system_id": "bcrm", "role": "system_contact", "person_id": "layla"},
                    {"system_id": "b2b-web", "role": "system_contact", "person_id": "layla"},
                    {"system_id": "b2b-web", "role": "developer"},
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
                "resources": [{"system_id": "cim", "role": "system_contact", "person_id": "omar"}],
            }
        },
    )
    post(
        "/organisation/value-streams",
        {"value_stream": {"id": "business", "name": "Business (sample)", "lead_person_id": "omar"}},
    )
    post(
        "/organisation/squads",
        {
            "squad": {
                "id": "fulfilment",
                "name": "Fulfilment squad (sample)",
                "value_stream_id": "business",
                "scrum_master_person_id": "omar",
                "resources": [
                    {"system_id": "cwom", "role": "system_contact", "person_id": "omar"},
                    {"system_id": "cwom", "role": "tester", "person_id": "layla"},
                    {
                        "system_id": "cwom",
                        "role": "developer",
                        "person_id": "omar",
                        "capability_id": "cap-order-tracking",
                    },
                    {"system_id": "wfm", "role": "system_contact"},
                ],
            }
        },
    )
    for product in (
        {
            "id": "fibre-ordering",
            "value_stream_id": "retail",
            "name": "Fibre bundle ordering (sample)",
            "description": "Ordering a business fibre bundle online (sample).",
            "system_ids": ["b2b-web", "b2b-bff", "cbcm-crmgw", "cwom", "bscs"],
            "offering_ids": ["business-fibre"],
        },
        {
            "id": "care",
            "value_stream_id": "retail",
            "name": "Customer care (sample)",
            "system_ids": ["cim", "service-now"],
        },
        {
            "id": "partner-channel",
            "value_stream_id": "business",
            "name": "Partner channel (sample)",
            "system_ids": ["bcrm", "dcrm"],
        },
    ):
        post("/organisation/products", {"product": product})
    # Someone who has left: inactive, holding no role, still named in history.
    rana = client.get("/organisation", headers=OWNER).json()["people"][-1]
    client.put(
        "/organisation/people/rana",
        json={"expected_revision": rana["revision"], "person": {**rana, "active": False}},
        headers=OWNER,
    ).raise_for_status()


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
        seed_published_catalogue(client)
        seed_catalogue(client)
        seed_squads(client)
    print("Seeded sample curation work.")


if __name__ == "__main__":
    main()
