"""One error body for every refusal: ``{code, message, correlation_id}`` (review recommendation 12).

The public error catalogue already answers in this shape. Three refusals in the auth layer did
not: the 404 the internal API answers when it is not served, the kernel guard's 401 and 503 for
a missing or unreadable service token, and FastAPI's own ``HTTPException`` (an unknown path, a
method the route does not take). They answered ``{"detail": ...}`` with no correlation id, so a
refused internal call could not be traced to its log line.

``enveloped`` wraps an ASGI ``send`` so a ``{"detail": ...}`` refusal written below it, such as
the kernel guard's, reaches the caller in this shape; the kernel's code stays the kernel's.
"""

from __future__ import annotations

import json
import uuid
from http import HTTPStatus
from typing import Any

from starlette.types import Message, Scope, Send

# Codes for a refusal by status, matching the public catalogue's where it has one.
_CODES = {
    401: "authentication_required",
    403: "authorization_denied",
    404: "not_found",
    405: "method_not_allowed",
    503: "service_unavailable",
}


def code_for(status: int) -> str:
    return _CODES.get(status, f"http_{status}")


def correlation_id_of(scope: Scope) -> str:
    """The request's correlation id, as the trace middleware set it; a new one without."""
    state = scope.get("state") or {}
    found = state.get("correlation_id") if isinstance(state, dict) else None
    return found if isinstance(found, str) and found else str(uuid.uuid4())


def message_for(status: int, detail: object) -> str:
    if isinstance(detail, str) and detail.strip():
        return detail
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return "The request was refused."


def error_content(status: int, detail: object, correlation_id: str) -> dict[str, Any]:
    return {
        "code": code_for(status),
        "message": message_for(status, detail),
        "correlation_id": correlation_id,
    }


async def send_error(send: Send, scope: Scope, status: int, detail: str) -> None:
    """Answer the request with a refusal in the one error shape."""
    body = json.dumps(error_content(status, detail, correlation_id_of(scope))).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


def enveloped(send: Send, scope: Scope) -> Send:
    """``send``, with any error answered as ``{"detail": ...}`` rewritten to the one shape.

    Every other response, including the application's own errors, passes through unchanged.
    """
    held: Message | None = None
    chunks: list[bytes] = []

    async def wrapped(message: Message) -> None:
        nonlocal held
        if message["type"] == "http.response.start" and message["status"] >= 400:
            held = message
            return
        if held is None or message["type"] != "http.response.body":
            await send(message)
            return
        chunks.append(message.get("body", b""))
        if message.get("more_body", False):
            return
        start, body = held, b"".join(chunks)
        held = None
        rewritten = _rewritten(start["status"], body, scope)
        if rewritten is None:
            await send(start)
            await send({"type": "http.response.body", "body": body})
            return
        headers = [
            (name, value)
            for name, value in start.get("headers", [])
            if name.lower() not in {b"content-length", b"content-type"}
        ]
        headers += [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(rewritten)).encode()),
        ]
        await send({**start, "headers": headers})
        await send({"type": "http.response.body", "body": rewritten})

    return wrapped


def _rewritten(status: int, body: bytes, scope: Scope) -> bytes | None:
    try:
        content = json.loads(body)
    except ValueError:
        return None
    if not isinstance(content, dict) or set(content) != {"detail"}:
        return None
    return json.dumps(error_content(status, content["detail"], correlation_id_of(scope))).encode()
