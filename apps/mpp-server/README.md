# @stake-mpp/mpp-server

Demo Express server that gates a document behind a `stake` challenge using [`@gitbondhq/mppx-stake`](../../packages/mppx-stake/).

## Quick start

```sh
# From repo root
cp apps/mpp-server/.env.example apps/mpp-server/.env
# Edit .env: set MPP_SECRET_KEY, STAKE_CONTRACT, STAKE_COUNTERPARTY

npm run dev --workspace=@stake-mpp/mpp-server
```

Then in another terminal:

```sh
# Public preview
curl http://127.0.0.1:4020/documents/incident-report-7b/preview

# Hit the paywall (triggers 402 → escrow → access)
npx mppx http://127.0.0.1:4020/documents/incident-report-7b
```

## Routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET /healthz` | Public | Health check |
| `GET /` | Public | Server metadata + example commands |
| `GET /documents/:slug/preview` | Public | Document teaser |
| `GET /documents/:slug` | Stake | Full document (402 challenge if no credential) |

## Flow

1. Client requests `/documents/:slug`
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
| `STAKE_CONTRACT` | Deployed MPPEscrow contract address |
| `STAKE_COUNTERPARTY` | Address authorized to refund/slash |

**Optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4020` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `STAKE_CHAIN_ID` | `42431` | Chain ID (from network preset) |
| `STAKE_TOKEN` | pathUSD | ERC-20 token address |
| `STAKE_AMOUNT` | `5000000` | Stake amount in base units |
| `STAKE_BENEFICIARY` | Payer | Refund recipient (defaults to payer) |
| `DOCUMENT_TITLE` | `Incident Report 7B` | Document title |
| `DOCUMENT_SLUG` | `incident-report-7b` | URL slug |
| `STAKE_DESCRIPTION` | — | Human-readable stake description |
| `STAKE_POLICY` | `demo-document-v1` | Policy identifier |

Defaults are also loaded from the repo-level `config.json`.
