"""Short-term memory — Redis-backed ephemeral key-value store per session.

Falls back automatically to an in-process dict when Redis is unreachable,
so the desktop app works with zero external services installed.
Redis availability is probed once per instance (0.5 s timeout) and cached;
a previously-unavailable Redis is rechecked every 30 s so a late-starting
service is picked up without an app restart.

Keys follow the namespace convention used by the retrieval pipeline::

    cf:stm:{session_id}:{key}

Usage::

    stm = ShortTermMemory(redis_url="redis://localhost:6379")
    await stm.store("user-123", "last_topic", "Python async", ttl=3600)
    value = await stm.get("user-123", "last_topic")
    all_items = await stm.get_all("user-123")
    await stm.delete("user-123", "last_topic")
    await stm.clear_session("user-123")
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

_KEY_PREFIX = "cf:stm"
_DEFAULT_TTL = 3600  # 1 hour

# Seconds to wait before re-probing Redis after a failed attempt.
_REDIS_RECHECK_INTERVAL = 30.0


def _key(session_id: str, field: str) -> str:
    return f"{_KEY_PREFIX}:{session_id}:{field}"


def _pattern(session_id: str) -> str:
    return f"{_KEY_PREFIX}:{session_id}:*"


# ---------------------------------------------------------------------------
# In-process fallback store
# {session_id: {field: (value, expires_at_monotonic_or_None)}}
# ---------------------------------------------------------------------------
_MEM_STORE: dict[str, dict[str, tuple[Any, float | None]]] = {}
_MEM_LOCK = threading.Lock()


def _mem_set(session_id: str, key: str, value: Any, ttl: int | None) -> None:
    expires_at = (time.monotonic() + ttl) if ttl else None
    with _MEM_LOCK:
        if session_id not in _MEM_STORE:
            _MEM_STORE[session_id] = {}
        _MEM_STORE[session_id][key] = (value, expires_at)


def _mem_get(session_id: str, key: str) -> Any | None:
    now = time.monotonic()
    with _MEM_LOCK:
        session = _MEM_STORE.get(session_id, {})
        entry = session.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if expires_at is not None and now > expires_at:
            session.pop(key, None)
            return None
        return value


def _mem_get_all(session_id: str, limit: int = 50) -> dict[str, Any]:
    now = time.monotonic()
    result: dict[str, Any] = {}
    with _MEM_LOCK:
        session = _MEM_STORE.get(session_id, {})
        expired = [k for k, (_, exp) in session.items() if exp is not None and now > exp]
        for k in expired:
            session.pop(k, None)
        for key, (value, _) in list(session.items())[:limit]:
            result[key] = value
    return result


def _mem_delete(session_id: str, key: str) -> bool:
    with _MEM_LOCK:
        return _MEM_STORE.get(session_id, {}).pop(key, None) is not None


def _mem_clear(session_id: str) -> int:
    with _MEM_LOCK:
        return len(_MEM_STORE.pop(session_id, {}))


# ---------------------------------------------------------------------------
# ShortTermMemory
# ---------------------------------------------------------------------------

class ShortTermMemory:
    """Session memory with automatic TTL expiry.

    Uses Redis when available; falls back to an in-process dict otherwise.
    The fallback is transparent to callers — all methods always succeed and
    return the same types regardless of which backend is active.

    Args:
        redis_url:   Redis connection URL. Default: ``redis://localhost:6379``.
        default_ttl: Seconds until a stored entry expires (default 3600).
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        default_ttl: int = _DEFAULT_TTL,
    ) -> None:
        self._redis_url = redis_url
        self._default_ttl = default_ttl
        # Probe cache: True = available, False = unavailable, None = unchecked
        self._redis_ok: bool | None = None
        self._redis_check_at: float = 0.0

    # ------------------------------------------------------------------
    # Internal probe (cached, 0.5 s timeout)
    # ------------------------------------------------------------------

    async def _probe_redis(self) -> bool:
        """Return True if Redis is reachable; cache result to avoid per-call RTTs."""
        now = time.monotonic()
        if self._redis_ok is True:
            return True
        if self._redis_ok is False and now - self._redis_check_at < _REDIS_RECHECK_INTERVAL:
            return False
        try:
            import redis.asyncio as aioredis  # type: ignore[import]

            r = aioredis.from_url(
                self._redis_url,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
                decode_responses=True,
            )
            await r.ping()
            await r.aclose()
            if self._redis_ok is not True:
                logger.info(
                    "stm: Redis available at %s — using Redis backend", self._redis_url
                )
            self._redis_ok = True
        except Exception:
            if self._redis_ok is not False:
                logger.info(
                    "stm: Redis unavailable at %s — using in-memory fallback", self._redis_url
                )
            self._redis_ok = False
            self._redis_check_at = now
        return bool(self._redis_ok)

    def _on_redis_error(self, exc: Exception, op: str) -> None:
        logger.warning("stm.%s redis error (falling back to memory): %s", op, exc)
        self._redis_ok = None  # force re-probe next call

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def store(
        self,
        session_id: str,
        key: str,
        value: Any,
        ttl: int | None = None,
    ) -> bool:
        """Store *value* under *key* for *session_id*.

        Returns True always — the in-memory fallback is always available.
        """
        effective_ttl = ttl if ttl is not None else self._default_ttl
        if await self._probe_redis():
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    await r.set(_key(session_id, key), json.dumps(value), ex=effective_ttl)
                finally:
                    await r.aclose()
                logger.debug("stm.stored (redis) session=%s key=%s", session_id, key)
                return True
            except Exception as exc:
                self._on_redis_error(exc, "store")

        _mem_set(session_id, key, value, effective_ttl)
        logger.debug("stm.stored (memory) session=%s key=%s", session_id, key)
        return True

    async def delete(self, session_id: str, key: str) -> bool:
        """Delete a single entry. Returns True if the key existed."""
        if await self._probe_redis():
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    removed = await r.delete(_key(session_id, key))
                finally:
                    await r.aclose()
                return bool(removed)
            except Exception as exc:
                self._on_redis_error(exc, "delete")

        return _mem_delete(session_id, key)

    async def clear_session(self, session_id: str) -> int:
        """Delete all keys belonging to *session_id*. Returns count deleted."""
        if await self._probe_redis():
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    keys = await r.keys(_pattern(session_id))
                    removed = await r.delete(*keys) if keys else 0
                finally:
                    await r.aclose()
                logger.debug(
                    "stm.clear_session (redis) session=%s removed=%d", session_id, removed
                )
                return removed
            except Exception as exc:
                self._on_redis_error(exc, "clear_session")

        count = _mem_clear(session_id)
        logger.debug("stm.clear_session (memory) session=%s removed=%d", session_id, count)
        return count

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self, session_id: str, key: str) -> Any | None:
        """Retrieve a single entry by key. Returns None if missing."""
        if await self._probe_redis():
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    raw = await r.get(_key(session_id, key))
                finally:
                    await r.aclose()
                return json.loads(raw) if raw is not None else None
            except Exception as exc:
                self._on_redis_error(exc, "get")

        return _mem_get(session_id, key)

    async def get_all(self, session_id: str, limit: int = 50) -> dict[str, Any]:
        """Return all entries for a session as a ``{key: value}`` dict."""
        if await self._probe_redis():
            result: dict[str, Any] = {}
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    keys = await r.keys(_pattern(session_id))
                    for redis_key in keys[:limit]:
                        raw = await r.get(redis_key)
                        if raw is not None:
                            bare = redis_key.removeprefix(f"{_KEY_PREFIX}:{session_id}:")
                            try:
                                result[bare] = json.loads(raw)
                            except json.JSONDecodeError:
                                result[bare] = raw
                finally:
                    await r.aclose()
                return result
            except Exception as exc:
                self._on_redis_error(exc, "get_all")

        return _mem_get_all(session_id, limit)

    async def ttl(self, session_id: str, key: str) -> int | None:
        """Return remaining TTL in seconds for *key*, or None if not found / no TTL."""
        if await self._probe_redis():
            try:
                import redis.asyncio as aioredis  # type: ignore[import]

                r = aioredis.from_url(self._redis_url, decode_responses=True)
                try:
                    remaining = await r.ttl(_key(session_id, key))
                finally:
                    await r.aclose()
                # Redis returns -2 for missing keys, -1 for no TTL set
                return remaining if remaining >= 0 else None
            except Exception as exc:
                self._on_redis_error(exc, "ttl")

        with _MEM_LOCK:
            entry = _MEM_STORE.get(session_id, {}).get(key)
        if entry is None:
            return None
        _, expires_at = entry
        if expires_at is None:
            return None
        remaining_secs = int(expires_at - time.monotonic())
        return remaining_secs if remaining_secs > 0 else None
