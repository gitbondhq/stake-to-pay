# @stake-mpp/mpp-server

Demo Express server that gates a document behind a `stake` challenge using [`@gitbondhq/mppx-stake`](../../packages/mppx-stake/).

## Quick start

```sh
# From repo root
# Edit the repo-root .env: set MPP_SECRET_KEY
# Edit config.json if you need different escrow/network values

npm run dev --workspace=@stake-mpp/mpp-server
```

Then in another terminal:

```sh
# Public preview
curl http://127.0.0.1:4020/documents/document/preview

# Hit the paywall (triggers 402 → escrow → access)
npx mppx http://127.0.0.1:4020/documents/document
```

## Routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET /healthz` | Public | Health check |
| `GET /` | Public | Server metadata + example commands |
| `GET /documents/document/preview` | Public | Document teaser |
| `GET /documents/document` | Stake | Full document (402 challenge if no credential) |

## Flow

1. Client requests `/documents/document`
2. Server returns `402 Payment Required` with a stake challenge (fresh `stakeKey` per challenge)
3. Client creates escrow on-chain, builds credential
4. Client retries with credential in request header
5. Server verifies escrow on-chain (stateless — no local escrow tracking)
6. Server returns document + `Payment-Receipt` header

## Configuration

**Required:**

| Variable | Description |
|----------|-------------|
| `MPP_SECRET_KEY` | Secret for signing/verifying MPP challenges |

**Optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4020` | Server port |
| `HOST` | `127.0.0.1` | Bind address |

Stake defaults are loaded directly from the repo-level `config.json`, including the explicit `networkPreset` object passed into the SDK. The paywalled content now lives in `apps/mpp-server/content/document.md`; the title comes from its H1 and the route slug comes from the filename.
