"""
Global exception handler middleware.
Catches unhandled exceptions, logs them with full context, and returns a safe
JSON error response. Never leaks stack traces to clients in production.
"""
from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ExceptionHandlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception(
                "Unhandled exception",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "error": str(exc),
                },
            )
            body: dict = {"detail": "Internal server error"}
            if settings.DEBUG:
                body["debug"] = str(exc)
            return JSONResponse(status_code=500, content=body)
