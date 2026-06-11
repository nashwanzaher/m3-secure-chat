# M3 Secure Chat — Production-Ready Template

A complete, deployable reference integration of **MiniMax M3** that follows
production security best practices out of the box.

> 🔒 **Core principle:** the master M3 API key is held **server-side** by a
> FastAPI proxy. The browser never sees it.

[![CI](https://github.com/nashwanzaher/m3-secure-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/nashwanzaher/m3-secure-chat/actions/workflows/ci.yml)
[![Test proxy](https://github.com/nashwanzaher/m3-secure-chat/actions/workflows/test-proxy.yml/badge.svg)](https://github.com/nashwanzaher/m3-secure-chat/actions/workflows/test-proxy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

---

## ✨ Features

- ⚡ **React 18 + Vite + TypeScript** SPA — no build step for users, fast HMR
- 🛡️ **Server-side key** — master `M3_API_KEY` lives only in the proxy's env
- 🧪 **Tested end-to-end** — Vitest for the SPA, pytest for the proxy
- 🚦 **CI** — lint, typecheck, test, build, secret scan on every push
- 🐳 **One-line deploy** — `docker compose up` for the full stack
- 📦 **12-factor config** — every tunable is an env var
- 🤖 **Dependabot** — npm, pip, Docker, and GitHub Actions PRs weekly
- 🌗 **Dark mode** — follows system preference
- 🧰 **Production-grade extras** — nginx SPA config, security headers,
  pre-commit hooks, PR/issue templates, CORS, rate limiting, redacted errors
- 📚 **Docs** — [ARCHITECTURE](./ARCHITECTURE.md), [FAQ](./FAQ.md),
  [DEPLOYMENT](./docs/DEPLOYMENT.md), [PRODUCTION_CHECKLIST](./docs/PRODUCTION_CHECKLIST.md)

---

## 🏗️ Architecture

```
┌────────────┐     POST /v1/chat     ┌──────────────────┐     Bearer M3_API_KEY     ┌─────────────────┐
│  Browser   │ ───────────────────▶ │  Your Proxy      │ ──────────────────────▶  │  M3 API         │
│  (this UI) │   X-User-Api-Key?    │  (FastAPI)       │                          │  api.MiniMax.com│
└────────────┘ ◀─────────────────── │  holds master key│ ◀──────────────────────  └─────────────────┘
                                    └──────────────────┘
```

- **Browser** sends user prompts to the proxy.
- **Proxy** adds the master M3 key (from env) and forwards to M3.
- **Per-user keys** (optional) can be passed as `X-User-Api-Key`.
- **No key** is ever exposed to the browser, logged, or echoed in errors.

For a deep-dive (sequence diagram, trust boundaries, threat model, extension
points) see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 🚀 Quick start

### Try the UI (no setup)

The pre-built SPA is deployed at
**https://ua4k3ch3fid2.space.minimax.io** — it boots in **Demo Mode** out
of the box. You can click around, change settings, and see usage stats
without deploying anything.

### Local development (full stack)

```bash
git clone https://github.com/nashwanzaher/m3-secure-chat.git
cd m3-secure-chat

# 1. Frontend
pnpm install
pnpm dev          # http://localhost:5173

# 2. Proxy (in another shell)
cd proxy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # put your M3_API_KEY in .env
uvicorn main:app --reload --port 8000
```

Then in the SPA, go to **Settings → Proxy URL** and set it to
`http://localhost:8000/v1/chat`. Click **Test connection**.

### One-command production stack

```bash
cp proxy/.env.example proxy/.env      # put M3_API_KEY in proxy/.env
docker compose up --build
# SPA on http://localhost:8080
# Proxy on http://localhost:8000
```

---

## 🧪 Tests

```bash
# Frontend (Vitest)
pnpm test
pnpm test:coverage

# Proxy (pytest)
cd proxy
pip install -r requirements-dev.txt
M3_API_KEY=sk-test pytest
```

Both run in CI on every push and PR.

---

## 🚀 Deploy

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for step-by-step guides
for **Render**, **Fly.io**, **Cloud Run**, **GHCR + any Docker host**,
**Netlify**, **Vercel**, **Cloudflare Pages**, and **GitHub Pages**.

TL;DR:

| Component | One-click |
|---|---|
| Proxy | Render Blueprint reads `render.yaml` automatically |
| SPA | Netlify drag-and-drop of `dist/` |

---

## 🔐 Adding secrets to GitHub

Secrets are **never** committed. They are configured in the repo's settings:

1. Go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add:

| Name | Value |
|---|---|
| `M3_API_KEY` | Your real M3 key from the developer console |
| `ALLOWED_ORIGINS` | Your deployed frontend URL |
| `RATE_LIMIT_PER_MIN` | `60` (or your preference) |

3. Reference them in workflows as `${{ secrets.M3_API_KEY }}`.

The complete security guide is in [`SECURITY.md`](./SECURITY.md).

---

## ⚙️ Configure the UI

1. Open the deployed frontend.
2. Go to **Settings**.
3. Paste your proxy URL (e.g. `https://m3-proxy.onrender.com/v1/chat`).
4. Click **Test connection** to verify.
5. Save.
6. Go to **Chat** and start talking to M3.

The header switches from `● Demo Mode` to `● Live` once a proxy is configured.

---

## 📁 Project structure

```
m3-secure-chat/
├── src/                       # React SPA
│   ├── components/            # Chat, Settings, Security, Backend Guide
│   ├── lib/                   # api.ts, markdown.tsx, backendCode.ts, utils.ts
│   ├── lib/__tests__/         # Vitest unit tests
│   ├── test/setup.ts          # Vitest global setup
│   ├── App.tsx
│   └── main.tsx
├── proxy/                     # FastAPI proxy
│   ├── main.py                #   - CORS, rate limit, Pydantic, redacted errors
│   ├── test_main.py           #   - pytest suite
│   ├── conftest.py
│   ├── pytest.ini
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pyproject.toml         #   - ruff config
│   ├── Dockerfile             #   - non-root, multi-stage
│   └── .env.example
├── .github/
│   ├── workflows/
│   │   ├── ci.yml             #   - lint, typecheck, test, build, secret scan
│   │   ├── test-proxy.yml     #   - pytest + ruff for the proxy
│   │   ├── deploy-proxy.yml   #   - build & push proxy to GHCR
│   │   └── release-drafter.yml
│   ├── ISSUE_TEMPLATE/        #   - bug, feature, question
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── release-drafter.yml
│   └── FUNDING.yml
├── docs/
│   ├── DEPLOYMENT.md          # Render, Fly, Cloud Run, Netlify, Vercel, ...
│   └── PRODUCTION_CHECKLIST.md
├── examples/                  # curl.sh, python_client.py, js_client.mjs
├── .husky/                    # pre-commit, commit-msg
├── .vscode/                   # recommended extensions and settings
├── docker-compose.yml         # local full stack
├── frontend.Dockerfile        # nginx SPA image
├── nginx.conf                 # SPA + security headers
├── vitest.config.ts
├── ARCHITECTURE.md
├── FAQ.md
├── LICENSE                    # MIT
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── CHANGELOG.md
```

---

## 🛡️ Security checklist

- ✅ Master M3 key stored in proxy environment, never in the browser.
- ✅ CORS restricted to your frontend origin via `ALLOWED_ORIGINS`.
- ✅ Per-IP rate limiting (60 req/min by default — tune via env).
- ✅ Run as non-root user inside Docker.
- ✅ Upstream errors redacted (no internal stack traces leaked to the browser).
- ✅ LocalStorage values are base64-obfuscated, not encrypted — the **real**
  protection comes from the proxy holding the master key.
- ✅ No secrets in git: `.env` is git-ignored; GitHub Secrets are configured
  in the repo settings (never in workflow files).
- ✅ CI runs **gitleaks** to detect leaked secrets on every push.
- ✅ Dependabot opens weekly PRs for npm/pip/Docker/GitHub Actions.
- ✅ Pre-commit hooks run lint-staged + typecheck + tests.

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). By participating, you agree to
abide by the [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## 📄 License

[MIT](./LICENSE) © 2026 nashwanzaher

## 🆘 Support

- Bug? → [open an issue](../../issues/new?template=bug_report.md)
- Question? → [Q&A](../../issues/new?template=question.md)
- Vulnerability? → see [`SECURITY.md`](./SECURITY.md) — **do not** file a
  public issue.
