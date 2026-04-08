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
| Escrow contract | `0xd334C82df572789E1EEF2eF7814dF6f6aE2D7Cce` |
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

Edit the repo-root `.env`:

```dotenv
MPP_SECRET_KEY=any-long-random-string-for-local-dev
```

Start:

```sh
npm run dev --workspace=@stake-mpp/mpp-server
```

Expected output:

```
[mpp-server] listening on http://127.0.0.1:4020
[mpp-server] preview route: http://127.0.0.1:4020/documents/document/preview
[mpp-server] protected route: http://127.0.0.1:4020/documents/document
```

## Step 3: Preview the paywalled content

```sh
curl http://127.0.0.1:4020/documents/document/preview
```

Returns a teaser — the document is locked.

## Step 4: Hit the paywall

```sh
curl -s http://127.0.0.1:4020/documents/document | jq .
```

Returns `402 Payment Required` with a stake challenge in the response headers/body.

## Step 5: Complete the flow with mppx CLI

The fastest path uses `npx mppx` which handles the full 402 negotiation automatically:

```sh
npx mppx http://127.0.0.1:4020/documents/document
```

This will prompt for wallet interaction, create the escrow, and return the unlocked content.

## Step 5 (alternative): Manual CLI pipeline

For understanding each step individually, use the stake-mpp CLI:

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0xd334C82df572789E1EEF2eF7814dF6f6aE2D7Cce
export MPP_ESCROW_ACCOUNT=tempo-tester
export MPP_ESCROW_PASSWORD_FILE=/absolute/path/to/password.txt
export MPP_RESOURCE_URL=http://127.0.0.1:4020/documents/document
```

### 5a. Fetch the challenge

```sh
npm run stake-mpp -- challenge fetch
```

This writes a timestamped challenge file under `challenges/` (gitignored).

### 5b. Inspect it

```sh
npm run stake-mpp -- challenge inspect
```

Shows: stake amount, token, counterparty, scope, and contract address from the latest saved challenge file.

### 5c. Create escrow and build credential

```sh
npm run stake-mpp -- challenge respond
```

This ensures an active escrow exists for the challenged `scope`, signs a `scope-active` credential, and writes `credential.txt`.

### 5d. Submit credential and get access

```sh
npm run stake-mpp -- challenge submit
```

Returns the full document content with a `Payment-Receipt` header.

## Step 6: Verify escrow state

```sh
npx --workspace @stake-mpp/cli stake-mpp escrow get-escrow \
  --escrow-id <escrowId> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Shows the escrow struct: scope, payer, beneficiary, counterparty, token, amount, status.

## Step 7: Resolve the escrow

As the counterparty, refund or slash:

```sh
# Happy path — return stake to user
npx --workspace @stake-mpp/cli stake-mpp escrow refund-escrow \
  --escrow-id <escrowId> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --account "$MPP_ESCROW_ACCOUNT" \
  --password-file password.txt

# Violation — slash stake to counterparty
npx --workspace @stake-mpp/cli stake-mpp escrow slash-escrow \
  --escrow-id <escrowId> \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --account "$MPP_ESCROW_ACCOUNT" \
  --password-file password.txt
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `402` after submitting credential | Escrow may not be confirmed yet, or the active escrow may not match the challenged `scope`. Check the on-chain active escrow for `(scope, beneficiary)`. |
| `MPP_SECRET_KEY` error on server start | Set it in the repo-root `.env`. |
| `createEscrow` reverts | Check: token is whitelisted, sufficient token balance, token approval in place. |
| `corrupt keystore` | If `cast wallet address --keystore ... --password-file ...` works, rebuild the CLI so it picks up the cast-wallet fix, then retry. |
| CLI says `No TTY available for passphrase prompt` | Set `MPP_ESCROW_PASSWORD_FILE` in the repo-root `.env`, or pass `--password-file`. |
| CLI says `fetch failed` against `127.0.0.1` | In Codex, rerun the CLI command unsandboxed before treating it as an application bug. |
| CLI can't find `stake-mpp` binary | Run `npm run build --workspace @stake-mpp/cli` first. |
| Server doesn't see `config.json` | Run from repo root, or check the relative path in `apps/mpp-server/src/config.ts`. |

---

## Agent expectations

- Walk users through steps sequentially. Don't skip ahead.
- If the user doesn't have a funded testnet wallet, help them set one up before starting.
- The manual CLI pipeline (5a–5d) is preferred when the user wants to understand the flow. `npx mppx` is preferred when they just want to see it work.
- All amounts are in base units. `5000000` pathUSD = 5 pathUSD (6 decimals).
- The server is stateless — it verifies escrow on-chain for every request. No session to manage.
- The stable `scope` from the challenge is the public identifier that links access checks together. The contract's internal `escrowId` is used for refund and slash operations.
