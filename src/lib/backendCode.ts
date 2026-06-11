/**
 * Reference backend code for the M3 Secure Chat proxy.
 */

export const FASTAPI_BACKEND_CODE = `"""
M3 Secure Proxy - production-ready reference implementation.

Run locally:
    pip install -r requirements.txt
    export M3_API_KEY=sk-...
    uvicorn main:app --reload --port 8000

The browser talks to /v1/chat. This server holds the master M3 key in its
own environment and never returns it to the client.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Configuration

M3_API_KEY = os.getenv("M3_API_KEY", "").strip()
M3_BASE_URL = os.getenv("M3_BASE_URL", "https://api.MiniMax.com").rstrip("/")
M3_TIMEOUT_SECONDS = float(os.getenv("M3_TIMEOUT_SECONDS", "60"))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))

if not M3_API_KEY:
    logging.warning("M3_API_KEY is not set. /v1/chat will return 503 until you configure it.")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("m3-proxy")

app = FastAPI(title="M3 Secure Proxy", version="1.0.0",
              description="Holds the master M3 API key. Exposes a single /v1/chat endpoint.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "X-User-Api-Key", "Authorization"],
    allow_credentials=False,
)

_rate_buckets: Dict[str, List[float]] = {}


# Schemas

class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str

class ChatRequest(BaseModel):
    model: str = "MiniMax-M3"
    messages: List[ChatMessage]
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=32768)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    stream: bool = False

class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ChatResponse(BaseModel):
    id: str
    model: str
    choices: List[Dict[str, Any]]
    usage: UsageInfo


# Helpers

def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd: return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def rate_limit(ip: str) -> None:
    if RATE_LIMIT_PER_MIN <= 0: return
    now = time.time()
    bucket = _rate_buckets.setdefault(ip, [])
    bucket[:] = [t for t in bucket if now - t < 60]
    if len(bucket) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    bucket.append(now)

def require_master_key() -> str:
    if not M3_API_KEY:
        raise HTTPException(status_code=503, detail="Server is missing M3_API_KEY environment variable.")
    return M3_API_KEY


# Routes

@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "has_master_key": bool(M3_API_KEY), "upstream": M3_BASE_URL, "rate_limit_per_min": RATE_LIMIT_PER_MIN}


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, _: str = Depends(require_master_key)) -> ChatResponse:
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
        "stream": False,
    }
    url = f"{M3_BASE_URL}/v1/text/chatcompletion_v2"
    headers = {"Authorization": f"Bearer {effective_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=M3_TIMEOUT_SECONDS) as client:
            upstream = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        log.error("upstream timeout ip=%s model=%s", ip, req.model)
        raise HTTPException(status_code=504, detail="Upstream timeout")
    except httpx.HTTPError as e:
        log.error("upstream transport error ip=%s err=%s", ip, e)
        raise HTTPException(status_code=502, detail="Upstream transport error")

    if upstream.status_code >= 400:
        try: err = upstream.json()
        except Exception: err = {"detail": upstream.text[:500]}
        log.warning("upstream %s ip=%s model=%s body=%s", upstream.status_code, ip, req.model, err)
        return JSONResponse(status_code=upstream.status_code, content=err)

    data = upstream.json()
    return ChatResponse(
        id=data.get("id", "m3-" + str(int(time.time() * 1000))),
        model=data.get("model", req.model),
        choices=data.get("choices", []),
        usage=UsageInfo(**data.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})),
    )


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal error"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
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

RUN useradd -m -u 10001 m3user
USER m3user

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`

export const ENV_EXAMPLE = `# Copy this file to .env and fill in real values.
# NEVER commit the real .env to git.

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
`

export const RENDER_YAML = `services:
  - type: web
    name: m3-proxy
    runtime: docker
    plan: starter
    healthCheckPath: /health
    envVars:
      - key: M3_API_KEY
        sync: false
      - key: M3_BASE_URL
        value: https://api.MiniMax.com
      - key: ALLOWED_ORIGINS
        sync: false
      - key: RATE_LIMIT_PER_MIN
        value: "60"
      - key: M3_TIMEOUT_SECONDS
        value: "60"
      - key: PORT
        value: "8000"
`
