"""Every configured credential is redacted from the debug trace, by value."""

from dataclasses import replace
from pathlib import Path

from knowledge_portal.interfaces.api.container import build_container
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "tmf-bearer-secret-1234567890"


def test_product_catalog_token_never_reaches_the_debug_trace(tmp_path: Path) -> None:
    trace_path = tmp_path / "trace.jsonl"
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        debug_trace_enabled=True,
        debug_trace_path=str(trace_path),
        product_catalog_token=TOKEN,
    )
    container = build_container(settings)
    try:
        # A provider log line carrying the bearer token in its text, as an HTTP
        # client's log would; only value-based redaction can catch it here.
        container.debug_trace.record("probe.request", message=f"Bearer {TOKEN} for plan read")
    finally:
        container.close_resources()

    text = trace_path.read_text(encoding="utf-8")
    assert "probe.request" in text
    assert TOKEN not in text
