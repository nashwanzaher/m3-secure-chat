# How to add M3 secrets to GitHub (the right way)

> **NEVER** commit a real API key to git. Always use GitHub Secrets.

## One-time setup

1. Go to your repo: **https://github.com/nashwanzaher/m3-secure-chat**
2. Click **Settings** (top bar of the repo).
3. In the left sidebar, expand **Secrets and variables** and click **Actions**.
4. Click **New repository secret**.

Add these three secrets (use **Add secret** for each one):

| Name | Value | Notes |
|---|---|---|
| `M3_API_KEY` | `sk-...your real M3 key...` | Get it from the developer console |
| `ALLOWED_ORIGINS` | `https://your-frontend.example.com` | Your deployed frontend URL |
| `RATE_LIMIT_PER_MIN` | `60` | Optional, defaults to 60 |

## How the secret flows to your deploy

There are two common ways:

### Option A — Render (recommended for this template)

1. In Render, create a new **Blueprint Instance** and point it at this repo.
2. Render reads `render.yaml` from the repo.
3. In the Render dashboard for the new service, open **Environment** and
   set the same three values (`M3_API_KEY`, `ALLOWED_ORIGINS`, etc.).
4. Render injects them into the container at runtime. They never appear in
   the repo or in build logs.

### Option B — GitHub Actions + GHCR + your own host

The included workflow `.github/workflows/deploy-proxy.yml` builds the
Docker image and pushes it to GHCR. To use the secret during runtime, your
hosting platform must inject the GitHub secret as an env var at deploy time
(e.g. via Fly.io's GitHub Actions integration, or Cloud Run with Workload
Identity).

## How to verify the secret is loaded

Hit the health endpoint of your deployed proxy:

```bash
curl https://m3-proxy.onrender.com/health
```

Expected response:
```json
{
  "ok": true,
  "has_master_key": true,
  "upstream": "https://api.MiniMax.com",
  "rate_limit_per_min": 60
}
```

If `has_master_key` is `false`, the secret is not set in your hosting
environment.

## Rotation

When you rotate the M3 key:

1. Update the secret in GitHub **and** in your hosting dashboard.
2. Redeploy the proxy.
3. The old key is invalidated on M3's side; nothing leaks because the
   browser never sees the key.

## Auditing

GitHub keeps a sealed log of every secret access from Actions. From
**Settings -> Secrets and variables -> Actions**, click any secret to see
its usage history. Combine with branch protection on `main` to require
reviews before any code that touches deploys can be merged.
