/**
 * Reference backend code for the M3 Secure Chat proxy.
 *
 * v1.1.0 (Phase 1) adds:
 *   • Server-Sent Events streaming at /v1/chat/stream
 *   • OpenAPI/Swagger docs at /docs and /redoc
 *   • Structured JSON logging with correlation IDs
 *   • Optional Sentry + OpenTelemetry
 *   • In-memory LRU+TTL cache
 *
 * The full source lives in the repo at `proxy/main.py`:
 *   https://github.com/nashwanzaher/m3-secure-chat/blob/main/proxy/main.py
 *
 * This file renders four runnable snippets the UI lets users copy:
 *   1. FASTAPI_BACKEND_CODE  — the complete Phase 1 reference server.
 *   2. SSE_ENDPOINT_CODE     — just the streaming endpoint, drop-in.
 *   3. DOCKERFILE             — production image for the proxy.
 *   4. ENV_EXAMPLE / RENDER_YAML — environment + Render deployment.
 */

export const FASTAPI_BACKEND_CODE = `"""
M3 Secure Proxy — production-ready reference implementation (Phase 1).

Features
--------
1. SSE streaming at /v1/chat/stream (OpenAI chunk format).
2. Auto-generated OpenAPI / Swagger at /docs, ReDoc at /redoc.
3. Structured JSON logging with structlog + correlation IDs.
4. Optional Sentry (set SENTRY_DSN) and OpenTelemetry (set OTEL_*).
5. In-memory LRU+TTL cache for non-streaming, no-user-key calls.
6. Per-IP sliding-window rate limiting, CORS, master-key enforcement.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env       # then put your M3 key in there
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import httpx
import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# ---- Optional observability imports (guarded) -------------------------------
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    _SENTRY_AVAILABLE = True
except Exception:
    _SENTRY_AVAILABLE = False

try:
    from opentelemetry import trace
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.semconv.resource import ResourceAttributes
    _OTEL_AVAILABLE = True
except Exception:
    _OTEL_AVAILABLE = False

# ---- Configuration ----------------------------------------------------------
M3_API_KEY = os.getenv("M3_API_KEY", "").strip()
M3_BASE_URL = os.getenv("M3_BASE_URL", "https://api.MiniMax.com").rstrip("/")
M3_TIMEOUT_SECONDS = float(os.getenv("M3_TIMEOUT_SECONDS", "60"))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))
CACHE_MAX_ENTRIES = int(os.getenv("CACHE_MAX_ENTRIES", "128"))
SERVICE_NAME = os.getenv("SERVICE_NAME", "m3-proxy")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_JSON = os.getenv("LOG_JSON", "false").lower() in ("1", "true", "yes")
SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
SENTRY_TRACES_SAMPLE_RATE = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()

# ---- Structured logging -----------------------------------------------------
def _configure_logging() -> None:
    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors: List[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    renderer = structlog.processors.JSONRenderer() if LOG_JSON else structlog.dev.ConsoleRenderer(colors=True)
    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, LOG_LEVEL, logging.INFO)),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    formatter = structlog.stdlib.ProcessorFormatter(foreign_pre_chain=shared_processors, processor=renderer)
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

_configure_logging()
log = structlog.get_logger(SERVICE_NAME)

# ---- Optional Sentry --------------------------------------------------------
def _init_sentry() -> None:
    if not (_SENTRY_AVAILABLE and SENTRY_DSN):
        return
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration(), StarletteIntegration()],
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        release=os.getenv("SENTRY_RELEASE", SERVICE_NAME),
        send_default_pii=False,
    )
    log.info("sentry_initialized")

# ---- Optional OpenTelemetry ------------------------------------------------
def _init_otel(app: FastAPI) -> None:
    if not _OTEL_AVAILABLE:
        return
    resource = Resource.create({ResourceAttributes.SERVICE_NAME: SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    if OTEL_EXPORTER_OTLP_ENDPOINT:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=OTEL_EXPORTER_OTLP_ENDPOINT, insecure=True)
        except Exception:
            exporter = ConsoleSpanExporter()
    else:
        exporter = ConsoleSpanExporter()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()

# ---- Rate limiter (in-memory sliding window) --------------------------------
_rate_buckets: Dict[str, List[float]] = {}

def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def rate_limit(ip: str) -> None:
    if RATE_LIMIT_PER_MIN <= 0:
        return
    now = time.time()
    bucket = _rate_buckets.setdefault(ip, [])
    bucket[:] = [t for t in bucket if now - t < 60]
    if len(bucket) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    bucket.append(now)

# ---- LRU+TTL cache ---------------------------------------------------------
class _LRUCache:
    """O(1) get/set, asyncio-locked, evicts oldest on overflow."""

    def __init__(self, max_entries: int, ttl_seconds: int) -> None:
        self.max_entries = max_entries
        self.ttl = ttl_seconds
        self._data: Dict[str, Tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            ts, value = entry
            if time.time() - ts > self.ttl:
                self._data.pop(key, None)
                return None
            self._data.pop(key, None)
            self._data[key] = (ts, value)
            return value

    async def set(self, key: str, value: Any) -> None:
        async with self._lock:
            if key in self._data:
                self._data.pop(key, None)
            elif len(self._data) >= self.max_entries:
                oldest = next(iter(self._data))
                self._data.pop(oldest, None)
            self._data[key] = (time.time(), value)

    def stats(self) -> Dict[str, int]:
        return {"size": len(self._data), "max": self.max_entries, "ttl": self.ttl}

_cache = _LRUCache(max_entries=CACHE_MAX_ENTRIES, ttl_seconds=CACHE_TTL_SECONDS)

# ---- Pydantic schemas -------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=200_000)

class ChatRequest(BaseModel):
    model: str = Field(default="MiniMax-M3", min_length=1, max_length=128)
    messages: List[ChatMessage] = Field(min_length=1, max_length=200)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=32768)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    stream: bool = Field(default=False, description="Reserved — use /v1/chat/stream for SSE.")

class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ChatResponse(BaseModel):
    id: str
    model: str
    choices: List[Dict[str, Any]]
    usage: UsageInfo

class HealthResponse(BaseModel):
    ok: bool
    has_master_key: bool
    upstream: str
    rate_limit_per_min: int
    cache: Dict[str, int]

OPENAPI_TAGS = [
    {"name": "chat", "description": "OpenAI-compatible chat completions, with optional SSE streaming."},
    {"name": "ops", "description": "Operational endpoints: health, cache stats."},
]

# ---- App factory ------------------------------------------------------------
@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    _init_sentry()
    _init_otel(app)
    if not M3_API_KEY:
        log.warning("m3_api_key_missing", hint="Set M3_API_KEY in the environment.")
    log.info("service_starting", upstream=M3_BASE_URL, rate_limit=RATE_LIMIT_PER_MIN)
    yield
    log.info("service_stopping")

app = FastAPI(
    title="M3 Secure Proxy",
    version="1.1.0",
    description="A thin, secure proxy in front of the MiniMax M3 API. The master M3 API key is held server-side; the browser only sees this proxy. Supports JSON and SSE streaming responses.",
    contact={"name": "M3 Secure Chat", "url": "https://github.com/nashwanzaher/m3-secure-chat"},
    license_info={"name": "MIT", "url": "https://opensource.org/licenses/MIT"},
    openapi_tags=OPENAPI_TAGS,
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "X-User-Api-Key", "X-Request-ID", "Authorization"],
    expose_headers=["X-Request-ID"],
    allow_credentials=False,
)

@app.middleware("http")
async def _request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, method=request.method, path=request.url.path, ip=client_ip(request))
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled_exception_middleware")
        return JSONResponse(status_code=500, content={"detail": "Internal error", "request_id": request_id})
    duration_ms = (time.perf_counter() - start) * 1000
    log.info("request_completed", status=response.status_code, duration_ms=round(duration_ms, 2))
    response.headers["X-Request-ID"] = request_id
    return response

def require_master_key() -> str:
    if not M3_API_KEY:
        raise HTTPException(status_code=503, detail="Server is missing M3_API_KEY environment variable.")
    return M3_API_KEY

# ---- Routes -----------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["ops"])
async def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        has_master_key=bool(M3_API_KEY),
        upstream=M3_BASE_URL,
        rate_limit_per_min=RATE_LIMIT_PER_MIN,
        cache=_cache.stats(),
    )

@app.post("/v1/chat", response_model=ChatResponse, tags=["chat"])
async def chat(req: ChatRequest, request: Request, _: str = Depends(require_master_key)) -> ChatResponse:
    ip = client_ip(request)
    rate_limit(ip)
    user_key = request.headers.get("x-user-api-key", "").strip()
    cacheable = not user_key and not req.stream
    cache_key = ""
    if cacheable:
        cache_key = json.dumps(
            {"model": req.model, "messages": [m.model_dump() for m in req.messages],
             "temperature": req.temperature, "max_tokens": req.max_tokens, "top_p": req.top_p},
            sort_keys=True, separators=(",", ":"),
        )
        cached = await _cache.get(cache_key)
        if cached is not None:
            log.info("cache_hit", bytes=len(cache_key))
            return ChatResponse(**cached)

    payload = {"model": req.model, "messages": [m.model_dump() for m in req.messages],
               "temperature": req.temperature, "max_tokens": req.max_tokens, "top_p": req.top_p, "stream": False}
    headers = {"Authorization": f"Bearer {user_key or M3_API_KEY}", "Content-Type": "application/json"}
    url = f"{M3_BASE_URL}/v1/text/chatcompletion_v2"

    try:
        async with httpx.AsyncClient(timeout=M3_TIMEOUT_SECONDS) as client:
            upstream = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upstream timeout")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Upstream transport error")

    if upstream.status_code >= 400:
        try:
            err = upstream.json()
        except Exception:
            err = {"detail": upstream.text[:500]}
        return JSONResponse(status_code=upstream.status_code, content=err)

    data = upstream.json()
    response = ChatResponse(
        id=data.get("id", "m3-" + str(int(time.time() * 1000))),
        model=data.get("model", req.model),
        choices=data.get("choices", []),
        usage=UsageInfo(**data.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})),
    )
    if cacheable:
        await _cache.set(cache_key, response.model_dump())
    return response

@app.post("/v1/chat/stream", tags=["chat"], response_class=StreamingResponse)
async def chat_stream(req: ChatRequest, request: Request, _: str = Depends(require_master_key)) -> StreamingResponse:
    """Stream the upstream response as Server-Sent Events."""
    ip = client_ip(request)
    rate_limit(ip)
    user_key = request.headers.get("x-user-api-key", "").strip()
    effective_key = user_key or M3_API_KEY

    payload = {"model": req.model, "messages": [m.model_dump() for m in req.messages],
               "temperature": req.temperature, "max_tokens": req.max_tokens, "top_p": req.top_p, "stream": True}
    headers = {"Authorization": f"Bearer {effective_key}", "Content-Type": "application/json", "Accept": "text/event-stream"}
    url = f"{M3_BASE_URL}/v1/text/chatcompletion_v2"
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex)

    async def _proxy_sse() -> AsyncIterator[bytes]:
        yield b": ping\\n\\n"
        try:
            timeout = httpx.Timeout(M3_TIMEOUT_SECONDS, read=M3_TIMEOUT_SECONDS)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as upstream:
                    if upstream.status_code >= 400:
                        body = await upstream.aread()
                        err = body.decode("utf-8", errors="replace")[:500]
                        yield _sse_error(upstream.status_code, err)
                        return
                    async for line in upstream.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            yield (line + "\\n\\n").encode("utf-8")
                            if line.strip() == "data: [DONE]":
                                return
                            continue
                        yield f"data: {line}\\n\\n".encode("utf-8")
                    yield b"data: [DONE]\\n\\n"
        except httpx.TimeoutException:
            yield _sse_error(504, "Upstream timeout")
        except httpx.HTTPError:
            yield _sse_error(502, "Upstream transport error")
        except asyncio.CancelledError:
            log.info("stream_cancelled_by_client")
            raise
        finally:
            log.info("stream_finished", request_id=request_id)

    return StreamingResponse(
        _proxy_sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "X-Request-ID": request_id},
    )

def _sse_error(status_code: int, message: str) -> bytes:
    payload = json.dumps({"error": True, "status": status_code, "message": message})
    return f"event: error\\ndata: {payload}\\n\\n".encode("utf-8")

@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal error"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False, log_config=None)
`

/**
 * Focused snippet — drop the chat_stream function + _sse_error helper into an
 * existing FastAPI app to add OpenAI-compatible SSE streaming.
 */
export const SSE_ENDPOINT_CODE = `"""
Add this to your existing main.py to enable SSE streaming at /v1/chat/stream.
Requires: fastapi, httpx. No other dependencies.
"""
import asyncio
import json
import uuid
from typing import AsyncIterator

import httpx
from fastapi import Request
from fastapi.responses import StreamingResponse

# Assumes these are defined elsewhere in your module:
#   M3_API_KEY, M3_BASE_URL, M3_TIMEOUT_SECONDS, require_master_key
#   ChatRequest, client_ip, rate_limit, log

def _sse_error(status_code: int, message: str) -> bytes:
    payload = json.dumps({"error": True, "status": status_code, "message": message})
    return f"event: error\\ndata: {payload}\\n\\n".encode("utf-8")


@app.post("/v1/chat/stream", response_class=StreamingResponse, tags=["chat"])
async def chat_stream(req: ChatRequest, request: Request, _: str = Depends(require_master_key)) -> StreamingResponse:
    """OpenAI-compatible SSE streaming endpoint.

    Yields \`data: {json}\\n\\n\` chunks and terminates with \`data: [DONE]\\n\\n\`.
    A heartbeat (": ping") is emitted first so the browser confirms the connection
    before the first upstream byte arrives.
    """
    ip = client_ip(request)
    rate_limit(ip)
    user_key = request.headers.get("x-user-api-key", "").strip()
    effective_key = user_key or M3_API_KEY

    payload = {
        "model": req.model,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "top_p": req.top_p,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {effective_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    url = f"{M3_BASE_URL}/v1/text/chatcompletion_v2"
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex)

    async def _proxy_sse() -> AsyncIterator[bytes]:
        yield b": ping\\n\\n"
        try:
            timeout = httpx.Timeout(M3_TIMEOUT_SECONDS, read=M3_TIMEOUT_SECONDS)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as upstream:
                    if upstream.status_code >= 400:
                        body = await upstream.aread()
                        err = body.decode("utf-8", errors="replace")[:500]
                        yield _sse_error(upstream.status_code, err)
                        return
                    async for line in upstream.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            yield (line + "\\n\\n").encode("utf-8")
                            if line.strip() == "data: [DONE]":
                                return
                            continue
                        # Raw JSON chunk from upstream — wrap it.
                        yield f"data: {line}\\n\\n".encode("utf-8")
                    yield b"data: [DONE]\\n\\n"
        except httpx.TimeoutException:
            yield _sse_error(504, "Upstream timeout")
        except httpx.HTTPError:
            yield _sse_error(502, "Upstream transport error")
        except asyncio.CancelledError:
            log.info("stream_cancelled_by_client")
            raise
        finally:
            log.info("stream_finished", request_id=request_id)

    return StreamingResponse(
        _proxy_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
            "X-Request-ID": request_id,
        },
    )
`

export const DOCKERFILE = `# syntax=docker/dockerfile:1.6
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

EXPOSE 8000

# Run as a non-root user for least privilege.
RUN useradd -m -u 10001 m3user
USER m3user

# Healthcheck for orchestrators (Render, Fly, Kubernetes, ECS, ...).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "null"]
`

export const ENV_EXAMPLE = `# Copy this file to .env and fill in real values.
# NEVER commit the real .env to git.

# --- Core --------------------------------------------------------------------
# Master M3 API key from the developer console.
M3_API_KEY=

# Upstream base URL (override only if you proxy M3 internally).
M3_BASE_URL=https://api.MiniMax.com

# Per-request timeout in seconds.
M3_TIMEOUT_SECONDS=60

# Comma-separated CORS origins. Use your deployed frontend URL.
ALLOWED_ORIGINS=https://your-frontend.example.com

# Per-IP requests per minute. Set to 0 to disable.
RATE_LIMIT_PER_MIN=60

# Port the server listens on.
PORT=8000

# --- Cache -------------------------------------------------------------------
# TTL for cached non-streaming responses, in seconds. Set 0 to disable cache.
CACHE_TTL_SECONDS=300

# Maximum number of cached responses. Oldest entry is evicted on overflow.
CACHE_MAX_ENTRIES=128

# --- Logging -----------------------------------------------------------------
# Service name (used in logs and as the OpenTelemetry service.name).
SERVICE_NAME=m3-proxy

# Log level: DEBUG, INFO, WARNING, ERROR.
LOG_LEVEL=INFO

# true => JSON logs (production). false => pretty console (development).
LOG_JSON=false

# --- Optional: Sentry ---------------------------------------------------------
# Leave SENTRY_DSN empty to disable Sentry entirely.
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=m3-proxy
SENTRY_TRACES_SAMPLE_RATE=0.1

# --- Optional: OpenTelemetry -------------------------------------------------
# Leave OTEL_EXPORTER_OTLP_ENDPOINT empty to fall back to a console exporter.
# Set to e.g. http://otel-collector:4317 to ship traces to a collector.
OTEL_EXPORTER_OTLP_ENDPOINT=
`

export const RENDER_YAML = `services:
  - type: web
    name: m3-proxy
    runtime: docker
    plan: starter
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: M3_API_KEY
        sync: false          # set in the Render dashboard, never in git
      - key: M3_BASE_URL
        value: https://api.MiniMax.com
      - key: ALLOWED_ORIGINS
        sync: false          # paste your frontend URL here in the dashboard
      - key: RATE_LIMIT_PER_MIN
        value: "60"
      - key: M3_TIMEOUT_SECONDS
        value: "60"
      - key: CACHE_TTL_SECONDS
        value: "300"
      - key: CACHE_MAX_ENTRIES
        value: "128"
      - key: LOG_JSON
        value: "true"
      - key: LOG_LEVEL
        value: "INFO"
      - key: SENTRY_DSN
        sync: false          # paste the Sentry DSN here
      - key: SENTRY_ENVIRONMENT
        value: production
      - key: OTEL_EXPORTER_OTLP_ENDPOINT
        sync: false          # paste your collector endpoint if you have one
      - key: PORT
        value: "8000"
`
