"""
Generic async circuit breaker.

States:
  CLOSED   — normal operation; failures increment counter
  OPEN     — requests blocked; a recovery timeout lets one probe through
  HALF_OPEN — single probe allowed; success resets, failure re-opens
"""
from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Coroutine, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerError(Exception):
    """Raised when the circuit is OPEN and the call is rejected."""


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    async def call(
        self,
        coro_fn: Callable[..., Coroutine[Any, Any, T]],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        async with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed = time.monotonic() - self._last_failure_time
                if elapsed >= self.recovery_timeout:
                    logger.info(
                        "Circuit %s transitioning OPEN → HALF_OPEN",
                        self.name,
                    )
                    self._state = CircuitState.HALF_OPEN
                else:
                    raise CircuitBreakerError(
                        f"Circuit {self.name!r} is OPEN. "
                        f"Retry in {self.recovery_timeout - elapsed:.0f}s"
                    )

        try:
            result: T = await coro_fn(*args, **kwargs)
        except Exception as exc:
            await self._on_failure(exc)
            raise
        else:
            await self._on_success()
            return result

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                logger.info("Circuit %s HALF_OPEN probe succeeded → CLOSED", self.name)
            self._state = CircuitState.CLOSED
            self._failure_count = 0

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            if (
                self._state in (CircuitState.CLOSED, CircuitState.HALF_OPEN)
                and self._failure_count >= self.failure_threshold
            ):
                logger.error(
                    "Circuit %s tripping OPEN after %d failures. Last: %s",
                    self.name,
                    self._failure_count,
                    exc,
                )
                self._state = CircuitState.OPEN

    def reset(self) -> None:
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0.0
