# Production Checklist

Run through this list before announcing the app to real users.

## Security

- [ ] `M3_API_KEY` lives only in the hosting platform's secret store
      (Render env, Fly secret, Cloud Run secret, GHCR + Vault, etc.).
- [ ] `ALLOWED_ORIGINS` is set to the exact deployed SPA origin — no
      `*`, no localhost.
- [ ] `RATE_LIMIT_PER_MIN` is set to a sane default for your traffic
      (e.g. 60 for a public demo, 600 for an internal tool).
- [ ] No `.env` file has been committed (verify with
      `git log --all -- .env` and `gitleaks detect`).
- [ ] CI's gitleaks step is green.
- [ ] Dependencies are up to date: Dependabot has no open critical
      security PRs.
- [ ] CSP header added at the CDN level (sample below).

## Functionality

- [ ] SPA's **Settings → Proxy URL** points to the production proxy.
- [ ] **Test connection** succeeds in the deployed SPA.
- [ ] Sending a chat round-trips and shows usage on the **Security** tab.
- [ ] Demo mode still works when the proxy URL is cleared.
- [ ] Settings persist across page reloads.
- [ ] Markdown rendering, code copy, and abort all work.
- [ ] Mobile layout is usable at 375 px width.

## Observability

- [ ] `/health` on the proxy is monitored (UptimeRobot / Better Stack).
- [ ] Logs are shipped to a central store.
- [ ] Alerts on `5xx > 1%` and `429 > 10%` over 5 min.
- [ ] Cost dashboard: compare the UI's per-user estimate against the
      M3 bill weekly.

## Documentation

- [ ] `README.md` has the deployed URLs and a screenshot.
- [ ] `SECRETS.md` reflects the actual secrets in use.
- [ ] A runbook (`docs/RUNBOOK.md`, optional) covers common failures.

## Suggested CSP (drop into your CDN)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';       /* Tailwind injects inline styles */
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' https://your-proxy.example.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

`unsafe-inline` for `style-src` is required by Tailwind's runtime
injection. If you switch to Tailwind v4 with the Oxide engine you can
drop it.
