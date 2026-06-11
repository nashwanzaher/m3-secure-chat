# Contributing to M3 Secure Chat

Thank you for your interest in contributing! This document explains how to
set up the project locally, the workflow we use, and the standards we expect.

## 🚀 Quick start

```bash
git clone https://github.com/nashwanzaher/m3-secure-chat.git
cd m3-secure-chat
pnpm install
pnpm dev          # frontend on http://localhost:5173
```

To run the proxy locally:

```bash
cd proxy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then put your M3_API_KEY in .env
uvicorn main:app --reload --port 8000
```

## 📋 Workflow

1. **Fork** the repo and create a feature branch from `main`:
   `git checkout -b feat/short-description`
2. Make your changes. Keep commits small and messages imperative
   (`feat: add per-user rate limiting`, `fix: handle empty stream chunk`).
3. Run the checks **before** pushing:
   ```bash
   pnpm lint
   pnpm test
   pnpm typecheck
   pnpm build
   ```
4. Push your branch and open a Pull Request against `main`.
5. Make sure CI is green. A maintainer will review and merge.

## 🧪 Tests

- Unit tests live next to the source: `src/lib/__tests__/*.test.ts`
- We use **Vitest** + **Testing Library** (when DOM is involved).
- Aim for ≥80% coverage on `src/lib/**`.

## 🎨 Code style

- TypeScript **strict** mode (already enabled).
- ESLint + Prettier (run `pnpm format` before committing).
- One component per file. Co-locate styles and small helpers.
- No `any` in new code — use `unknown` and narrow with type guards.

## 🔐 Security

**Never** commit secrets, real API keys, customer data, or `.env` files.
The CI will fail the build if a secret is detected.

If you discover a vulnerability, **do not open a public issue**. Follow
[`SECURITY.md`](./SECURITY.md).

## 📝 Commit message format

We loosely follow Conventional Commits:

| Prefix | Use for |
|---|---|
| `feat:` | New user-visible feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, refactors with no behavior change |
| `docs:` | Documentation only |
| `test:` | Adding or fixing tests |
| `perf:` | Performance improvement |
| `security:` | Security fix or hardening |

## 📄 License

By contributing, you agree that your contributions will be licensed under
the [MIT License](./LICENSE).
