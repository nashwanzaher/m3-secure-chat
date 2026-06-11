"""
pytest config for the M3 proxy tests.

- Ensures the env vars are set before any test module imports `main`.
- Stubs out the real httpx call by default with a passthrough that
  individual tests override by assigning `proxy._upstream`.
"""

from __future__ import annotations

import os

# Set BEFORE importing the app
os.environ.setdefault("M3_API_KEY", "sk-test-master")
os.environ.setdefault("M3_BASE_URL", "https://upstream.test")
os.environ.setdefault("ALLOWED_ORIGINS", "https://app.test,http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_PER_MIN", "3")
os.environ.setdefault("M3_TIMEOUT_SECONDS", "5")
