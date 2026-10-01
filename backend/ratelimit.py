"""A small dependency-free rate limiter for the public auth/feedback endpoints.

Counts hits per key in a sliding window held in memory. That is deliberate:
the app runs as a single Cloud Run instance under light demo traffic, so a
shared store (Redis) would be more moving parts than the problem deserves. The
trade-off is that limits are *per instance* — if Cloud Run ever scales out, an
attacker gets the limit multiplied by the instance count. Still turns an
unlimited brute-force into a slow one; revisit if the app ever needs real
horizontal scale.

Usage:

    login_limit = RateLimit(10, 900, "login")          # 10 per 15 min

    @app.post("/auth/login")
    def login(body: LoginBody, _=Depends(login_limit)):
        ...
"""
import time
import threading
from collections import deque

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: dict[str, deque] = {}
_last_sweep = 0.0
_SWEEP_EVERY = 300.0          # seconds between stale-key sweeps


def client_ip(request: Request) -> str:
    """Best-effort caller identity.

    Cloud Run (like any reverse proxy) puts the real client first in
    X-Forwarded-For and appends its own hops, so take the leftmost entry.
    A client can forge this header, but forging it only ever splits an
    attacker's own budget across more keys — it cannot raise anyone else's.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    """Drop keys whose windows are long empty so memory stays bounded.
    Caller must hold the lock."""
    global _last_sweep
    if now - _last_sweep < _SWEEP_EVERY:
        return
    _last_sweep = now
    for key in [k for k, dq in _hits.items() if not dq or now - dq[-1] > 3600]:
        del _hits[key]


def check(key: str, times: int, seconds: float) -> None:
    """Record a hit for `key`; raise 429 if it exceeds `times` per `seconds`."""
    now = time.monotonic()
    with _lock:
        _sweep(now)
        dq = _hits.setdefault(key, deque())
        cutoff = now - seconds
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= times:
            retry = max(1, int(dq[0] + seconds - now) + 1)
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait and try again.",
                headers={"Retry-After": str(retry)},
            )
        dq.append(now)


class RateLimit:
    """FastAPI dependency limiting `times` requests per `seconds` per client IP."""

    def __init__(self, times: int, seconds: float, scope: str):
        self.times = times
        self.seconds = seconds
        self.scope = scope

    def __call__(self, request: Request) -> None:
        check(f"{self.scope}:ip:{client_ip(request)}", self.times, self.seconds)
