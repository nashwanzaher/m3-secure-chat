# Deployment Guide

This guide covers deploying the **proxy** (FastAPI) and the **frontend**
(React SPA) to common platforms. Pick one combination — they are
independent.

## TL;DR

| Component | Recommended host | Why |
|---|---|---|
| Proxy | Render, Fly.io, Railway, Cloud Run, Fly GHCR | One-container, no DB |
| Frontend | Netlify, Vercel, Cloudflare Pages, GitHub Pages | Pure static |

---

## 1. Proxy (FastAPI)

### Option A — Render (easiest)

1. Push this repo to GitHub.
2. Sign in to https://render.com → **New → Blueprint**.
3. Point it at the repo. Render reads `render.yaml` and creates the
   service for you.
4. In Render's dashboard, set the secret env vars (these are
   `sync: false` so they never appear in logs or git):
   - `M3_API_KEY` = `sk-...`
   - `ALLOWED_ORIGINS` = `https://your-spa.example.com`
   - `RATE_LIMIT_PER_MIN` = `60`
5. Wait for the deploy to finish. Health check: `GET /health` → `200`.

### Option B — Fly.io

```bash
# one-time
fly launch --no-deploy --copy-config
fly secrets set M3_API_KEY=sk-... ALLOWED_ORIGINS=https://your-spa.example.com
fly deploy
```

`fly.toml` will need a `[services.http_service]` block on port 8000 with
a `/health` check.

### Option C — Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/$PROJECT/m3-proxy proxy/
gcloud run deploy m3-proxy \
  --image gcr.io/$PROJECT/m3-proxy \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-secrets=M3_API_KEY=M3_API_KEY:latest
gcloud run services add-iam-policy-binding m3-proxy \
  --member=allUsers --role=roles.run.invoker
```

### Option D — GHCR + any Docker host

The included `.github/workflows/deploy-proxy.yml` builds and pushes the
image to `ghcr.io/<you>/m3-proxy:latest` on every push to `main`. Pull
and run it anywhere that runs Docker:

```bash
docker pull ghcr.io/nashwanzaher/m3-proxy:latest
docker run -d -p 8000:8000 \
  -e M3_API_KEY=sk-... \
  -e ALLOWED_ORIGINS=https://your-spa.example.com \
  ghcr.io/nashwanzaher/m3-proxy:latest
```

### Option E — Bare metal / VM

```bash
cd proxy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

For a robust setup, put it behind `systemd` and `nginx` with TLS via
Let's Encrypt.

---

## 2. Frontend (React SPA)

### Option A — Netlify (drag-and-drop)

```bash
pnpm build
# then drag the dist/ folder to https://app.netlify.com/drop
```

Or connect the repo and set:
- Build command: `pnpm build`
- Publish directory: `dist`

### Option B — Vercel

```bash
npm i -g vercel
vercel --prod
```

### Option C — Cloudflare Pages

Connect the repo, set:
- Build command: `pnpm build`
- Build output: `dist`

### Option D — GitHub Pages

Add this workflow (`.github/workflows/deploy-pages.yml`):

```yaml
name: Deploy SPA to Pages
on:
  push: { branches: [main] }
permissions: { pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then enable Pages → Source = "GitHub Actions" in repo settings.

### Option E — Self-hosted (nginx)

```bash
docker compose up --build frontend
# SPA on http://localhost:8080
```

The included `frontend.Dockerfile` + `nginx.conf` produce a ~30 MB
non-root image with proper SPA fallback, gzip, and security headers.

---

## 3. Wire them together

1. Deploy the proxy. Note its URL, e.g. `https://m3-proxy.onrender.com`.
2. Deploy the SPA. Note its URL, e.g. `https://m3-chat.example.com`.
3. Set the SPA's CORS env on the proxy: `ALLOWED_ORIGINS=https://m3-chat.example.com`.
4. In the deployed SPA, open **Settings** and paste
   `https://m3-proxy.onrender.com/v1/chat` into **Proxy URL**.
5. Click **Test connection**. The status should switch from
   `● Demo Mode` to `● Live`.

## 4. Hardening checklist

- [ ] TLS everywhere (managed platforms do this for you).
- [ ] `ALLOWED_ORIGINS` set to **exactly** your SPA's origin, no
  wildcards.
- [ ] `RATE_LIMIT_PER_MIN` tuned to your expected traffic.
- [ ] `M3_API_KEY` stored as a secret, never in env files in git.
- [ ] Monitoring on `/health` (UptimeRobot, Better Stack, etc.).
- [ ] Logs collected centrally; alert on `5xx > 1%` and `429 > 10%`.
- [ ] Repository secrets rotated every 90 days.
- [ ] Dependabot PRs reviewed weekly.
