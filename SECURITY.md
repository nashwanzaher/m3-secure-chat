# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` branch | ✅ Active development, security patches applied |
| Latest tagged release | ✅ Backported fixes for 30 days |
| Older releases | ❌ No backports — please upgrade |

## Reporting a vulnerability

**Please do not file a public issue for security reports.** This makes the
vulnerability visible to attackers before a fix is shipped.

Instead, use one of these private channels:

1. **GitHub private vulnerability reporting** (preferred):
   https://github.com/nashwanzaher/m3-secure-chat/security/advisories/new
2. **Email**: open a security advisory in the repo, then coordinate via the
   contact address on the maintainer's GitHub profile.

You should receive an acknowledgement within **72 hours**.

## What to include

- A clear description of the issue and its impact.
- A proof-of-concept or steps to reproduce (in a private Gist is fine).
- The affected version / commit SHA.
- Your assessment of severity (Critical / High / Medium / Low).

We follow [CVSS 3.1](https://www.first.org/cvss/calculator/3.1) for triage.

## Disclosure timeline

1. **Day 0** — you report the issue privately.
2. **Day 1–3** — we acknowledge and start triage.
3. **Day 1–14** — we develop a fix. Critical issues are fast-tracked.
4. **Day 14–30** — coordinated disclosure: we publish the advisory and a
   patched release simultaneously, crediting you (unless you prefer to stay
   anonymous).

## Security model

This app holds **no long-lived secrets in the browser**. The master
`M3_API_KEY` is read by the FastAPI proxy from its environment. The browser
can store a per-user key (base64-obfuscated) that is forwarded as
`X-User-Api-Key`, but the real protection comes from the proxy:

- CORS restricted to your frontend origin (`ALLOWED_ORIGINS`).
- Per-IP rate limiting (default 60 req/min).
- Non-root user inside the Docker container.
- Errors from upstream are redacted before being returned to the browser.

If you have ideas to harden this further, please open a security advisory
or a private PR.
