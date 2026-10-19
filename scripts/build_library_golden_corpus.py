"""Write the library golden set's fixture files: one product per document, one format each.

    uv run python scripts/build_library_golden_corpus.py

Every document is synthetic and titled "(fixture)". They exist so the retrieval evaluation
(`python -m knowledge_portal.interfaces.evaluate --mapper library`) reads the formats a library
really holds, each with its own structure: a Word guide with headings and a table, a PDF
service description, a slide deck, a spreadsheet, a CSV procedure and a long policy in
Markdown. The files are committed; run this again only to change them, then check that every
case of `tests/fixtures/golden/library_golden_set.json` still resolves.

It uses the test suite's own file builders, so run it from the repository root.
"""

from __future__ import annotations

import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.presentation_fixtures import (  # noqa: E402
    drawing_paragraph,
    drawing_table,
    presentation,
    table_cell,
)
from tests.spreadsheet_fixtures import spreadsheet_document  # noqa: E402
from tests.word_table_fixtures import (  # noqa: E402
    word_cell,
    word_document,
    word_paragraph,
    word_row,
    word_table,
)

OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "golden" / "library"


def mobile_fleet_guide() -> bytes:
    """A Word product guide: headings, prose and an allowance table."""
    body = "".join(
        [
            word_paragraph("Mobile fleet plan: product guide (fixture)", heading=True),
            word_paragraph(
                "The mobile fleet plan gives a business one bill for every employee line. "
                "Lines share a pooled data allowance, and an administrator moves lines "
                "between tiers from the business portal."
            ),
            word_paragraph("Eligibility", heading=True),
            word_paragraph(
                "A fleet starts at five lines. Each line needs a named user, and the account "
                "holder's trade licence must be valid for the whole contract term."
            ),
            word_paragraph("Tiers", heading=True),
            word_table(
                word_row(word_cell("Tier"), word_cell("Pooled data"), word_cell("Roaming")),
                word_row(
                    word_cell("Fleet Essential"),
                    word_cell("10 GB per line"),
                    word_cell("Pay as you go"),
                ),
                word_row(
                    word_cell("Fleet Plus"),
                    word_cell("25 GB per line"),
                    word_cell("GCC roaming bundle included"),
                ),
                columns=3,
            ),
            word_paragraph("Roaming", heading=True),
            word_paragraph(
                "Roaming is barred on new lines until the administrator enables it for that "
                "line. Usage abroad is capped at the daily roaming limit set on the account."
            ),
        ]
    )
    return word_document(body)


def _pdf(pages: list[list[str]]) -> bytes:
    """A small text PDF: one Helvetica line per entry, one page per list."""
    objects: list[bytes] = []
    page_ids = [3 + 2 * index for index in range(len(pages))]
    font_id = 3 + 2 * len(pages)
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{page} 0 R" for page in page_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    for index, lines in enumerate(pages):
        content = "BT /F1 11 Tf 14 TL 56 790 Td " + " ".join(
            "(" + line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") ' "
            for line in lines
        )
        stream = zlib.compress((content + "ET").encode("latin-1"))
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> "
            f"/Contents {page_ids[index] + 1} 0 R >>".encode()
        )
        objects.append(
            f"<< /Length {len(stream)} /Filter /FlateDecode >>\nstream\n".encode()
            + stream
            + b"\nendstream"
        )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    output = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    table = len(output)
    output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    output += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    output += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{table}\n%%EOF\n"
    ).encode()
    return bytes(output)


def cloud_backup_description() -> bytes:
    """A PDF service description over two pages."""
    return _pdf(
        [
            [
                "Cloud backup service description (fixture)",
                "Scope",
                "Cloud backup copies servers and laptops to a data centre in the country.",
                "Backups run every night and keep thirty daily restore points.",
                "Monthly restore points are kept for twelve months.",
            ],
            [
                "Restores",
                "A customer restores a single file from the self-service console.",
                "A full server restore is completed within four hours of the request.",
                "Security",
                "Backup data is encrypted with AES-256 before it leaves the customer site.",
            ],
        ]
    )


def managed_security_deck() -> bytes:
    """A sales deck: titles, bullets and a comparison table across slides."""
    return presentation(
        drawing_paragraph("Managed security for small offices (fixture)")
        + drawing_paragraph("A firewall, web filtering and monitoring, run by our SOC."),
        drawing_paragraph("How changes work")
        + drawing_paragraph("Customers request firewall rule changes in the business portal.")
        + drawing_paragraph("Standard rule changes are applied within one working day."),
        drawing_paragraph("Packages")
        + drawing_table(
            *(
                tuple(table_cell(text) for text in row)
                for row in (
                    ("Package", "Includes"),
                    ("Secure Start", "Firewall and web filtering"),
                    ("Secure Pro", "Firewall, web filtering and 24x7 threat monitoring"),
                )
            )
        ),
    )


def sip_trunk_rate_card() -> bytes:
    """A spreadsheet: a rate card, one row per plan."""
    return spreadsheet_document(
        {
            "A1": "Plan",
            "B1": "Concurrent channels",
            "C1": "Included minutes",
            "D1": "Rule",
            "A2": "SIP Trunk 10",
            "B2": 10,
            "C2": 3000,
            "D2": "Emergency calls are always routed, even when the trunk is suspended.",
            "A3": "SIP Trunk 30",
            "B3": 30,
            "C3": 10000,
            "D3": "Extra channels are sold in blocks of five.",
        }
    )


def number_porting_steps() -> bytes:
    """A CSV procedure: one step per row, with its owner."""
    return (
        b"Step,Owner,Action\n"
        b"1,Sales,Collect the letter of authority signed by the account holder\n"
        b"2,Back office,Submit the port request to the donor operator\n"
        b"3,Back office,Agree the port date with the customer\n"
        b"4,Network,Activate the ported numbers on the agreed date\n"
    )


def data_retention_policy() -> bytes:
    """A long Markdown policy that applies to every product. Its paragraphs exceed one chunk,
    so an answer can sit in the middle of a paragraph the chunker splits."""
    filler = (
        "Records are kept in the system that created them and are not copied to personal "
        "storage, shared drives or email folders. Each business unit names a records owner "
        "who answers questions about the records it holds and who approves any exception. "
    )
    return "\n".join(
        [
            "# Customer data retention policy (fixture)",
            "",
            "## Scope",
            "",
            filler
            * 3
            + "This policy applies to every product the business sells, fixed and mobile, "
            "and to every channel that captures customer data. " + filler * 2,
            "",
            "## Retention periods",
            "",
            filler * 2
            + "Call detail records are kept for twelve months and then deleted. "
            + filler
            + "Customer identity documents are deleted ninety days after the account closes, "
            "unless a dispute or a legal hold is open. " + filler * 2,
            "",
            "## Requests from customers",
            "",
            "A customer may ask for a copy of the personal data held about them. "
            "The copy is sent within thirty days of the request.",
        ]
    ).encode()


FILES = {
    "mobile-fleet-guide.docx": mobile_fleet_guide,
    "cloud-backup-service.pdf": cloud_backup_description,
    "managed-security-deck.pptx": managed_security_deck,
    "sip-trunk-rate-card.xlsx": sip_trunk_rate_card,
    "number-porting-steps.csv": number_porting_steps,
    "data-retention-policy.md": data_retention_policy,
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, build in FILES.items():
        (OUTPUT / name).write_bytes(build())
        print(f"wrote {OUTPUT / name}")


if __name__ == "__main__":
    main()
