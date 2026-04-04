# Skill: APP_MPP_SERVER

## Scope

Use this playbook for requests in the `apps/mpp-server` domain.

## Common intent

- Run the standalone Express MPP server locally.
- Adjust env configuration for the fake document paywall.
- Change the fake document copy, title, or public preview metadata.
- Debug why a protected request returns `402` or why a credential fails verification.
- Keep the server aligned with `@gitbondhq/mppx-escrow/server`.

## Server shape

- The app is intentionally tiny.
- Public routes:
  - `GET /healthz`
  - `GET /`
  - `GET /documents/:slug/preview`
- Protected route:
  - `GET /documents/:slug`
- The protected route returns a `tempo/stake` challenge until the caller submits a valid credential.
- The full document response is JSON and carries a `Payment-Receipt` header on success.

## Config

Required env vars:

- `MPP_SECRET_KEY`
- `STAKE_CONTRACT`
- `STAKE_COUNTERPARTY`

Common optional env vars:

- `PORT`
- `HOST`
- `STAKE_CHAIN_ID`
- `STAKE_CURRENCY`
- `STAKE_AMOUNT`
- `DOCUMENT_TITLE`
- `DOCUMENT_SLUG`
- `STAKE_DESCRIPTION`
- `STAKE_POLICY`
- `STAKE_BENEFICIARY`

Use `apps/mpp-server/.env.example` as the starting point.

## Helpful commands

- `npm run check-types --workspace=@stake-mpp/mpp-server`
- `npm run build --workspace=@stake-mpp/mpp-server`
- `npm run dev --workspace=@stake-mpp/mpp-server`
- `npm run start --workspace=@stake-mpp/mpp-server`

If you change `packages/mppx-escrow`, rebuild it before testing the server:

- `npm run build:mppx-escrow`

## Agent expectations

- Preserve the intentionally small shape of the server unless the user explicitly asks for more.
- Do not add databases, sessions, or background jobs unless requested.
- Keep secrets out of public responses and logs.
- Generate a fresh `stakeKey` for new challenges.
- When a credential comes back, reuse the echoed challenge request values that must stay stable, especially `stakeKey`.
- Register only `stake()` from `@gitbondhq/mppx-escrow/server` unless the user explicitly wants charge or session flows; `tempo()` pulls in extra methods that need additional configuration.
