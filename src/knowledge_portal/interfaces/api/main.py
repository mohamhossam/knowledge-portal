"""FastAPI application assembly."""

import logging
import re
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import asdict
from time import perf_counter

from fastapi import FastAPI, Request, Response
from smb_kernel.http.body_limit import BodyLimits, RequestBodyLimit
from smb_kernel.http.service_auth import INTERNAL_PREFIX, InternalRouteGuard, ServiceTokenVerifier
from smb_kernel.observability.correlation import correlation_scope
from starlette.middleware.base import RequestResponseEndpoint
from starlette.types import ASGIApp, Receive, Scope, Send

from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.error_handlers import register_error_handlers
from knowledge_portal.interfaces.api.routes.architecture_knowledge import (
    job_router as architecture_job_router,
)
from knowledge_portal.interfaces.api.routes.architecture_knowledge import (
    router as architecture_knowledge_router,
)
from knowledge_portal.interfaces.api.routes.explorer import router as explorer_router
from knowledge_portal.interfaces.api.routes.identity import (
    public_router as public_identity_router,
)
from knowledge_portal.interfaces.api.routes.identity import router as identity_router
from knowledge_portal.interfaces.api.routes.internal import router as internal_router
from knowledge_portal.interfaces.api.routes.knowledge_center import (
    router as knowledge_center_router,
)
from knowledge_portal.interfaces.api.routes.library import router as library_router
from knowledge_portal.interfaces.api.routes.library import search_router
from knowledge_portal.interfaces.api.routes.organisation import router as organisation_router
from knowledge_portal.interfaces.runtime import (
    start_metrics,
    start_workers,
    stop_workers_and_close,
)

_REQUESTS = logging.getLogger("knowledge_portal.http")


def _route_template(request: Request) -> str:
    """The matched route's path template: a bounded metric label, free of identifiers."""
    route = request.scope.get("route")
    return str(getattr(route, "path", "unmatched"))


class InternalAccess:
    """Service-token access to /internal (requirement-portal ADR-0099), per deployment.

    With no REQUIREMENT_SERVICE_TOKEN the internal API is not served: every
    /internal path answers 404. With one, the kernel's guard admits only that
    token, naming the caller "requirements".
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app
        self._guards: dict[str, InternalRouteGuard] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        internal = path == INTERNAL_PREFIX or path.startswith(INTERNAL_PREFIX + "/")
        if scope["type"] != "http" or not internal:
            await self._app(scope, receive, send)
            return
        token = scope["app"].state.container.settings.requirement_service_token
        if token is None:
            await send(
                {
                    "type": "http.response.start",
                    "status": 404,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": b'{"detail":"Not Found"}'})
            return
        guard = self._guards.get(token)
        if guard is None:
            guard = InternalRouteGuard(self._app, ServiceTokenVerifier({"requirements": token}))
            self._guards = {token: guard}
        await guard(scope, receive, send)


def _body_limits(scope: Scope) -> BodyLimits:
    """The request and per-file ceilings, read from this app's settings per request."""
    settings = scope["app"].state.container.settings
    return BodyLimits(
        request_max_body_bytes=settings.request_max_body_bytes,
        document_max_file_bytes=settings.document_max_file_bytes,
    )


def create_app(container_factory: Callable[[], Container] = build_container) -> FastAPI:
    """Create one application whose complete lifecycle shares one object graph."""

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        container = container_factory()
        # An API replica deployed with API_BACKGROUND_WORKERS=false leaves jobs to
        # the separate worker process and must not report them as its own.
        workers = container.background_workers if container.settings.api_background_workers else {}
        application.state.container = container
        application.state.workers = workers
        application.state.accepting_requests = False
        stop_metrics = start_metrics(container)
        try:
            container.debug_trace.record(
                "application.started",
                settings=asdict(container.settings),
            )
            start_workers(workers)
            application.state.accepting_requests = True
            yield
        finally:
            application.state.accepting_requests = False
            stop_metrics()
            stop_workers_and_close(container, workers)

    application = FastAPI(
        title="Knowledge portal",
        lifespan=lifespan,
    )
    register_error_handlers(application)
    # Registered before the trace middleware, so it runs inside it: a refused
    # body still gets a correlation ID, a log line and a metric.
    application.add_middleware(RequestBodyLimit, limits=_body_limits)
    application.add_middleware(InternalAccess)

    @application.middleware("http")
    async def trace_request(request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Trace one request without opening a database transaction around I/O."""
        supplied_id = request.headers.get("X-Request-ID", "").strip()
        correlation_id = (
            supplied_id
            if re.fullmatch(r"[A-Za-z0-9._:-]{1,80}", supplied_id)
            else str(uuid.uuid4())
        )
        request.state.correlation_id = correlation_id
        container: Container = request.app.state.container
        trace = container.debug_trace
        started = perf_counter()
        with correlation_scope(correlation_id):
            trace.record(
                "http.request_started",
                method=request.method,
                path=request.url.path,
                query=request.url.query,
                correlation_id=correlation_id,
            )
            try:
                response: Response = await call_next(request)
            except Exception as exc:
                elapsed = perf_counter() - started
                container.metrics.record_http(
                    request.method, _route_template(request), 500, elapsed
                )
                trace.record(
                    "http.request_failed",
                    method=request.method,
                    path=request.url.path,
                    duration_ms=round(elapsed * 1000, 3),
                    error_type=type(exc).__name__,
                    error=str(exc),
                    correlation_id=correlation_id,
                )
                raise
            elapsed = perf_counter() - started
            route = _route_template(request)
            container.metrics.record_http(request.method, route, response.status_code, elapsed)
            # The route template, never the path: paths carry identifiers and
            # queries carry search text.
            _REQUESTS.info(
                "%s %s %s",
                request.method,
                route,
                response.status_code,
                extra={
                    "method": request.method,
                    "route": route,
                    "status": response.status_code,
                    "duration_ms": round(elapsed * 1000, 1),
                },
            )
            trace.record(
                "http.request_completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(elapsed * 1000, 3),
                correlation_id=correlation_id,
            )
        response.headers["X-Request-ID"] = correlation_id
        return response

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/ready")
    def ready(request: Request, response: Response) -> dict[str, object]:
        container = getattr(request.app.state, "container", None)
        workers = getattr(request.app.state, "workers", {})
        checks = {
            "accepting_requests": bool(getattr(request.app.state, "accepting_requests", False)),
            "persistence": container is not None and container.readiness_check(),
            **{name: worker.healthy for name, worker in workers.items()},
        }
        available = all(checks.values())
        response.status_code = 200 if available else 503
        return {"status": "ready" if available else "unavailable", "checks": checks}

    for router in (
        public_identity_router,
        identity_router,
        library_router,
        search_router,
        architecture_knowledge_router,
        architecture_job_router,
        organisation_router,
        explorer_router,
        knowledge_center_router,
    ):
        application.include_router(router)
    application.include_router(internal_router, include_in_schema=False)
    return application


app = create_app()
