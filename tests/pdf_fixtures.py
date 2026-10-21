"""A small, valid PDF for tests: one page per list of lines, in Helvetica."""

from __future__ import annotations


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_document(*pages: list[str]) -> bytes:
    """A PDF whose pages hold these lines, top to bottom, each its own text line."""
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # filled in once the page tree's number is known
    tree = add(b"")
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    kids: list[int] = []
    for lines in pages:
        stream = (
            "BT /F1 11 Tf 14 TL 56 780 Td "
            + " ".join(f"({_escape(line)}) Tj T*" for line in lines)
            + " ET"
        )
        content = add(
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream.encode()), stream.encode())
        )
        kids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (tree, font, content)
            )
        )
    objects[catalog - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % tree
    objects[tree - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (
        b" ".join(b"%d 0 R" % kid for kid in kids),
        len(kids),
    )

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    start = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        catalog,
        start,
    )
    return bytes(out)
