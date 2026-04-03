# `@stake-mpp/mpp-server`

Tiny Express server that gates a fake document behind a `tempo/stake`
challenge using `@gitbondhq/mppx-escrow/server`.

## Routes

- `GET /healthz`
  Basic health response.
- `GET /`
  Public server metadata plus the protected path and a sample `mppx` command.
- `GET /documents/:slug/preview`
  Public teaser for the fake document.
- `GET /documents/:slug`
  Protected route. Returns a `402 Payment Required` stake challenge until the
  caller submits a valid `tempo/stake` credential.

## Quick start

```sh
cp apps/mpp-server/.env.example apps/mpp-server/.env
npm run dev --workspace=@stake-mpp/mpp-server
```

Then, in another shell:

```sh
curl http://127.0.0.1:4020/
npx mppx http://127.0.0.1:4020/documents/incident-report-7b
```

## Config

Required:

- `MPP_SECRET_KEY`
- `STAKE_CONTRACT`
- `STAKE_COUNTERPARTY`

Common optional settings:

- `PORT` / `HOST`
- `STAKE_CHAIN_ID`
- `STAKE_TOKEN`
- `STAKE_AMOUNT`
- `DOCUMENT_TITLE`
- `DOCUMENT_SLUG`
- `STAKE_DESCRIPTION`
- `STAKE_POLICY`
- `STAKE_BENEFICIARY`

## Notes

- The server generates a fresh `stakeKey` for each new challenge.
- When a credential comes back, it reuses the challenge's original `stakeKey`
  so verification remains stateless.
- The protected route returns JSON with the fake document body and includes a
  `Payment-Receipt` header on success.
