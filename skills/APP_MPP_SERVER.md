# Skill: APP_MPP_SERVER

## Scope

Use this playbook for requests in the `apps/mpp-server` domain.

## Common intent

- Run the standalone Express MPP server locally.
- Adjust host/port or repo config for the markdown-backed document paywall.
- Change the paywalled document copy, title, or public preview metadata.
- Debug why a protected request returns `402` or why a credential fails verification.
- Keep the server aligned with `@gitbondhq/mppx-stake`.

## Server shape

- The app is intentionally tiny.
- Public routes:
  - `GET /healthz`
  - `GET /`
  - `GET /documents/document/preview`
- Protected route:
  - `GET /documents/document`
- The protected route returns a `tempo/stake` challenge until the caller submits a valid credential.
- The full document response is JSON and carries a `Payment-Receipt` header on success.

## Config

Required env vars:

- `MPP_SECRET_KEY`

Common optional env vars:

- `PORT`
- `HOST`

Stake and network defaults come from the repo-level `config.json`.

Runtime env is loaded from the repo-root `.env` when using the workspace scripts:

- `npm run start:server`
- `npm run dev:server`
- `npm run dev --workspace=@stake-mpp/mpp-server`
- `npm run start --workspace=@stake-mpp/mpp-server`

Do not rely on `apps/mpp-server/.env` for normal local runs unless the user explicitly asks for per-app overrides. Update `apps/mpp-server/content/document.md` when changing the paywalled document.

## Agent runtime note

In the Codex sandbox, localhost `curl` / `fetch` checks may fail with `EPERM` even when the server boot logs look correct. If that happens, rerun the server and HTTP verification unsandboxed before treating it as an application bug.

On some machines, `node --watch` can also fail with `EMFILE: too many open files, watch`. If that happens, use the non-watch path (`npm run start:server`) after building instead of treating it as an app bug.

## Helpful commands

- `npm run check-types --workspace=@stake-mpp/mpp-server`
- `npm run build --workspace=@stake-mpp/mpp-server`
- `npm run start:server`
- `npm run dev:server`
- `npm run dev --workspace=@stake-mpp/mpp-server`
- `npm run start --workspace=@stake-mpp/mpp-server`

If you change `packages/mppx-stake`, rebuild it before testing the server:

- `npm run build:mppx-stake`

## Agent expectations

- Preserve the intentionally small shape of the server unless the user explicitly asks for more.
- Do not add databases, sessions, or background jobs unless requested.
- Keep secrets out of public responses and logs.
- Derive a stable `scope` for each protected resource or policy.
- Let `serverStake()` reuse echoed challenge values that must stay stable on credential retries, especially `scope`.
- Register only `serverStake()` from `@gitbondhq/mppx-stake` unless the user explicitly wants charge or session flows; `tempo()` pulls in extra methods that need additional configuration.
