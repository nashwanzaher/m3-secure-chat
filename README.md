# M3 Secure Chat — Production-Ready Template

A complete, deployable reference integration of **MiniMax M3** that follows
production security best practices out of the box.

> 🔒 **Core principle:** the master M3 API key is held **server-side** by a
> FastAPI proxy. The browser never sees it.

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

---

## 🚀 Deploy

### Frontend (static, this repo)

The `dist/` folder is pre-built. Drag it onto Netlify, Vercel, Cloudflare
Pages, or any static host.

```bash
pnpm install
pnpm build
# upload the contents of ./dist/
```

### Backend (FastAPI proxy)

The proxy is a separate service. Two options:

**Option A — Render one-click:** use `render.yaml` in this repo.

**Option B — Docker anywhere:**

```bash
docker build -t m3-proxy .
docker run -p 8000:8000 -e M3_API_KEY=sk-... m3-proxy
```

The proxy source lives in `proxy/main.py` (or in the **Backend** tab of the
deployed UI).

---

## 🔐 Adding secrets to GitHub

Secrets are **never** committed. They are configured in the repo's settings:

1. Go to **Settings → Secrets and variables → Actions** (or **Environments**).
2. Click **New repository secret** and add:

| Name | Value |
|---|---|
| `M3_API_KEY` | Your real M3 key from the developer console |
| `ALLOWED_ORIGINS` | Your deployed frontend URL |
| `RATE_LIMIT_PER_MIN` | `60` (or your preference) |

3. Reference them in workflows as `${{ secrets.M3_API_KEY }}`.

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

## 🔐 Security checklist

- ✅ Master M3 key stored in proxy environment, never in the browser.
- ✅ CORS restricted to your frontend origin via `ALLOWED_ORIGINS`.
- ✅ Per-IP rate limiting (60 req/min by default — tune in `render.yaml`).
- ✅ Run as non-root user inside Docker.
- ✅ Upstream errors redacted (no internal stack traces leaked to the browser).
- ✅ LocalStorage values are base64-obfuscated, not encrypted — the **real**
  protection comes from the proxy holding the master key.
- ✅ No secrets in git: `.env` is git-ignored, GitHub Secrets are configured
  in the repo settings (never in workflow files).
