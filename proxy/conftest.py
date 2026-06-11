"""
pytest config for the M3 proxy tests (Phase 1).

- Ensures the env vars are set before any test module imports `main`.
- Stubs out the real httpx call by default with a passthrough that
  individual tests override by assigning `proxy._upstream`.
- Forces ``LOG_JSON=false`` so test output is human-readable.
"""

from __future__ import annotations

import os

# Force (not setdefault) so tests are deterministic regardless of caller env.
os.environ["M3_API_KEY"] = "sk-test-master"
os.environ["M3_BASE_URL"] = "https://upstream.test"
os.environ["ALLOWED_ORIGINS"] = "https://app.test,http://localhost:5173"
os.environ["RATE_LIMIT_PER_MIN"] = "3"
os.environ["M3_TIMEOUT_SECONDS"] = "5"
os.environ["LOG_JSON"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"
os.environ["CACHE_TTL_SECONDS"] = "60"
os.environ["CACHE_MAX_ENTRIES"] = "16"
