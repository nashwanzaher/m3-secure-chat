# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Vitest + Testing Library setup with example unit tests
- GitHub Actions CI workflow (lint, typecheck, test, build)
- Dependabot configuration for npm, pip, and GitHub Actions
- Issue and Pull Request templates
- CODEOWNERS file
- LICENSE (MIT)
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
- .editorconfig and Prettier configuration
- docker-compose.yml for local dev (frontend + proxy)
- Frontend Dockerfile + nginx config (for self-hosting the SPA)
- ARCHITECTURE.md with deep-dive diagrams
- FAQ.md
- API usage examples in `examples/` (curl, Python, JavaScript)
- DEPLOYMENT.md guide (Render, Fly, Railway, Cloud Run, GHCR, Netlify, Vercel)
- PRODUCTION_CHECKLIST.md
- Pre-commit hook (husky + lint-staged)

### Changed
- README.md expanded with detailed setup, screenshots placeholder, and
  comparison vs. calling M3 directly from the browser

## [1.0.0] — 2026-06-11

### Added
- Initial public release.
- React 18 + Vite + TypeScript SPA with 4 views: Chat, Settings, Security,
  Backend Guide.
- FastAPI proxy (`proxy/main.py`) with rate limiting, CORS, Pydantic
  validation, structured logging, and a non-root Dockerfile.
- `render.yaml` for one-click Render deployment.
- GitHub Actions workflow to build and push the proxy image to GHCR.
- GitHub Secrets guide (`SECRETS.md`).
- Base64 obfuscation for the per-user key in `localStorage` (defence in
  depth — the real protection is the proxy holding the master key).
- Usage tracking (token counts + estimated cost) per browser.
- Markdown rendering for assistant messages with copy-to-clipboard code
  blocks.
- `ErrorBoundary`, `Toaster` (event-based), and a settings export/import
  feature.
