"""Azure DevOps rich text, as plain text an import can keep."""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser

from knowledge_portal.domain.historic.work_items import TEXT_MAX

_BREAKS = {"br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table"}
_SKIP = {"script", "style"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skipping = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP:
            self._skipping += 1
        elif tag in _BREAKS:
            self.parts.append("\n")
            if tag == "li":
                self.parts.append("- ")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self._skipping = max(0, self._skipping - 1)
        elif tag in _BREAKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skipping:
            self.parts.append(data)


def plain_text(value: object) -> str:
    """Tags dropped, entities read, blank lines collapsed, and bounded to what an import keeps."""
    if not isinstance(value, str) or not value.strip():
        return ""
    parser = _Text()
    parser.feed(value)
    parser.close()
    lines = [" ".join(unescape(line).split()) for line in "".join(parser.parts).splitlines()]
    text = "\n".join(line for line in lines if line)
    return text if len(text) <= TEXT_MAX else text[: TEXT_MAX - 1] + "…"
