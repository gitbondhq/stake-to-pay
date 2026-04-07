# Skill: E2E_STAKE_DEMO

## Scope

Use this playbook when a user wants to run the stake demo end-to-end, try the product for the first time, or walk through the full 402 challenge → escrow → access flow.

## Prerequisites

- Node.js >= 24 recommended (`apps/mpp-server` and `packages/mppx-stake` require it; the root workspace and CLI currently declare `>=18`)
- Foundry installed (`forge`, `cast`)
- A funded wallet on Tempo Moderato testnet (chain 42431)
- The MPPEscrow contract deployed (or use the existing testnet deployment)

## Testnet defaults

| Item | Value |
|------|-------|
| Network | Tempo Moderato |
| Chain ID | 42431 |
| RPC | `https://rpc.moderato.tempo.xyz` |
| Escrow contract | `0x651B0DB0D25A49d0CBbF790a404cE10A3F401821` |
| Token (pathUSD) | `0x20c0000000000000000000000000000000000000` |
| Stake amount | `5000000` (base units) |

These are configured in the repo-level `config.json`.

---

## Step 1: Build the repo

```sh
npm install
npm run build
forge build
```

## Step 2: Start the demo server

```sh
cp apps/mpp-server/.env.example apps/mpp-server/.env
```

Edit `apps/mpp-server/.env`:

```dotenv
MPP_SECRET_KEY=any-long-random-string-for-local-dev
STAKE_CONTRACT=0x651B0DB0D25A49d0CBbF790a404cE10A3F401821
STAKE_COUNTERPARTY=<your-wallet-address>
```

Start:

```sh
npm run dev --workspace=@stake-mpp/mpp-server
```

Expected output:

```
[mpp-server] listening on http://127.0.0.1:4020
[mpp-server] preview route: http://127.0.0.1:4020/documents/incident-report-7b/preview
[mpp-server] protected route: http://127.0.0.1:4020/documents/incident-report-7b
```

## Step 3: Preview the paywalled content

```sh
curl http://127.0.0.1:4020/documents/incident-report-7b/preview
```

Returns a teaser — the document is locked.

## Step 4: Hit the paywall

```sh
curl -s http://127.0.0.1:4020/documents/incident-report-7b | jq .
```

Returns `402 Payment Required` with a stake challenge in the response headers/body.

## Step 5: Complete the flow with mppx CLI

The fastest path uses `npx mppx` which handles the full 402 negotiation automatically:

```sh
npx mppx http://127.0.0.1:4020/documents/incident-report-7b
```

This will prompt for wallet interaction, create the escrow, and return the unlocked content.

## Step 5 (alternative): Manual CLI pipeline

For understanding each step individually, use the stake-mpp CLI:

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0x651B0DB0D25A49d0CBbF790a404cE10A3F401821
export MPP_ESCROW_PRIVATE_KEY=0x<your-private-key>
```

### 5a. Fetch the challenge

```sh
npx --workspace @stake-mpp/cli stake-mpp challenge fetch \
  --url http://127.0.0.1:4020/documents/incident-report-7b \
  --out challenge.json
```

### 5b. Inspect it

```sh
npx --workspace @stake-mpp/cli stake-mpp challenge inspect \
  --file challenge.json
```

Shows: stake amount, token, counterparty, stakeKey, contract address.

### 5c. Create escrow and build credential

```sh
npx --workspace @stake-mpp/cli stake-mpp challenge respond \
  --challenge-file challenge.json \
  --private-key "$MPP_ESCROW_PRIVATE_KEY" \
  --out credential.txt
```

This broadcasts a `createEscrow` transaction on-chain, waits for confirmation, and outputs a hash credential.

### 5d. Submit credential and get access

```sh
npx --workspace @stake-mpp/cli stake-mpp challenge submit \
  --url http://127.0.0.1:4020/documents/incident-report-7b \
  --credential-file credential.txt
```

Returns the full document content with a `Payment-Receipt` header.

## Step 6: Verify escrow state

```sh
npx --workspace @stake-mpp/cli stake-mpp escrow get-escrow \
  --key <stakeKey-from-challenge> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Shows the escrow struct: payer, counterparty, token, amount, status.

## Step 7: Resolve the escrow

As the counterparty, refund or slash:

```sh
# Happy path — return stake to user
npx --workspace @stake-mpp/cli stake-mpp escrow refund-escrow \
  --key <stakeKey> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --private-key "$MPP_ESCROW_PRIVATE_KEY"

# Violation — slash stake to counterparty
npx --workspace @stake-mpp/cli stake-mpp escrow slash-escrow \
  --key <stakeKey> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --private-key "$MPP_ESCROW_PRIVATE_KEY"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `402` after submitting credential | Escrow may not be confirmed yet. Check tx hash on explorer. Verify `stakeKey` matches. |
| `STAKE_COUNTERPARTY` error on server start | Must be a valid EVM address in `.env`. |
| `createEscrow` reverts | Check: token is whitelisted, sufficient token balance, token approval in place. |
| CLI can't find `stake-mpp` binary | Run `npm run build --workspace @stake-mpp/cli` first. |
| Server doesn't see `config.json` | Run from repo root, or check the relative path in `apps/mpp-server/src/config.ts`. |

---

## Agent expectations

- Walk users through steps sequentially. Don't skip ahead.
- If the user doesn't have a funded testnet wallet, help them set one up before starting.
- The manual CLI pipeline (5a–5d) is preferred when the user wants to understand the flow. `npx mppx` is preferred when they just want to see it work.
- All amounts are in base units. `5000000` pathUSD = 5 pathUSD (6 decimals).
- The server is stateless — it verifies escrow on-chain for every request. No session to manage.
- The `stakeKey` from the challenge is the key that links everything together. It appears in the challenge, the escrow creation, and the on-chain state query.
