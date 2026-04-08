# stake-mpp

Reference implementation of the **stake** payment intent for [MPP](https://github.com/anthropics/mpp) — a new payment primitive where users lock collateral instead of spending tokens.

> **Stake-to-pay flips the model**: users lock tokens in an on-chain escrow to gain access. Well-behaved users get their stake back (zero-cost access). Bad actors get slashed. Servers can capture yield on locked collateral.

> [!WARNING]
> Experimental and unaudited. Do not treat this as production-ready without your own review, testing, and security assessment.

## How it works

```
Client                         Server                      Chain
  │                              │                           │
  ├── GET /resource ────────────>│                           │
  │<──── 402 + stake challenge ──┤                           │
  │                              │                           │
  ├── ensure active escrow ──────┼──────────────────────────>│
  │<─────────────────────────────┼──── active stake exists ──┤
  │                              │                           │
  ├── GET /resource + credential>│                           │
  │                       verify │── getActiveEscrow(scope, beneficiary) ─────>│
  │                              │<──── active escrow record ──────────────────┤
  │<──── 200 + content ─────────┤                           │
  │                              │                           │
  │          (later)             │                           │
  │                              ├── refundEscrow(escrowId) ─>│  happy path
  │                              ├── slashEscrow(escrowId) ──>│  violation
```

## Quick start

```sh
# One-command fresh clone setup
npm run bootstrap

# Or step through it manually
npm install
npm run build
forge test
```

`npm install` at the repo root installs the JavaScript dependencies for every workspace under `apps/*` and `packages/*`. Foundry libs are already vendored in `lib/`, so there is no separate `forge install` step for a normal clone.

### Useful root scripts

- `npm run bootstrap` - install workspace deps and build the repo
- `npm run build` - build contracts-derived SDK artifacts and workspace apps
- `npm run build:contracts` - run `forge build`
- `npm run build:mppx-stake` - regenerate the ABI package output and build the SDK
- `npm run build:cli` - build `@stake-mpp/cli`
- `npm run stake-mpp -- <args>` - run the built CLI from the repo root
- `npm run build:server` - build `@stake-mpp/mpp-server`
- `npm run start:server` - run the demo server from the repo root
- `npm run dev:server` - run the demo server in watch mode from the repo root

### Run the demo

Start the stake-gated server:

```sh
cp example.env .env
# Edit .env: set MPP_SECRET_KEY
# Edit config.json if you need different escrow/network values
npm run start:server
```

If you want watch mode while editing the server, use `npm run dev:server`.

In another terminal, hit the paywall:

```sh
# Preview (public)
curl http://127.0.0.1:4020/documents/document/preview

# Protected (triggers 402 → stake → access flow)
npx mppx http://127.0.0.1:4020/documents/document

# Or use the repo's own built CLI with demo defaults
npm run stake-mpp -- challenge fetch
npm run stake-mpp -- challenge respond
npm run stake-mpp -- challenge submit
```

## Repository structure

```
stake-mpp/
├── contracts/               # Solidity escrow contract (Foundry)
├── packages/mppx-stake/     # @gitbondhq/mppx-stake — TypeScript SDK
├── apps/mpp-server/         # Demo: stake-gated Express server
├── apps/cli/                # CLI for escrow + challenge operations
├── specs/intents/           # Draft IETF-style stake intent spec
├── config.json              # Shared networkPreset + escrow defaults
└── foundry.toml             # Solidity compiler config
```

## Packages

### [`@gitbondhq/mppx-stake`](packages/mppx-stake/)

TypeScript SDK extending MPP with the `stake` intent. Separate entry points for client and server:

```ts
// Client: ensure active stake, then sign a scope-active credential
import { stake } from "@gitbondhq/mppx-stake/client";

// Server: verify active stake on-chain
import { serverStake } from "@gitbondhq/mppx-stake";
```

### [`@stake-mpp/mpp-server`](apps/mpp-server/)

Minimal Express server that gates a document behind a stake challenge. Shows the full 402 flow end-to-end.

### [`@stake-mpp/cli`](apps/cli/)

ABI-driven CLI for escrow lifecycle operations (`create`, `refund`, `slash`) and the challenge-response flow (`fetch`, `inspect`, `respond`, `submit`).

## Contracts

The `MPPEscrow` contract provides:

- **`createEscrow`** — lock whitelisted ERC-20 tokens for a `scope`
- **`refundEscrow`** — return stake to the beneficiary (happy path)
- **`slashEscrow`** — send stake to the counterparty (violation)
- **`getActiveEscrow`** / **`isEscrowActive`** — verify active stake by `(scope, beneficiary)`
- **`getEscrow`** — returns the full historical escrow record by `escrowId`
- Delegate pattern for operational separation of refund/slash authority

> Only whitelist tokens you have reviewed for decimals, fee-on-transfer behavior, rebasing mechanics, and hooks. The contract assumes exact-transfer ERC-20 behavior.

### Escrow design patterns

The stake spec intentionally leaves escrow contract design to the implementer. The reference `MPPEscrow` contract exposes `isEscrowActive(scope, beneficiary)` for a fast active-state check and `getActiveEscrow(scope, beneficiary)` for the canonical active record, which enables several patterns:

**Tiered access** — The server reads the staked amount and maps it to access levels. For example, 100 USDC could grant basic API access while 1000 USDC unlocks premium rate limits. The contract doesn't need to know about tiers; the server applies its own policy based on the on-chain state.

**Multi-collateral vaults** — An escrow contract could accept multiple token deposits under a single stake key, returning an array of `{ token, amount }` positions. This lets servers require collateral in more than one asset (e.g., a stablecoin plus a governance token) or accept alternative tokens for the same tier (e.g., USDC or DAI).

**Partial slash** — When `getEscrow` returns the full record including the current amount, a contract could support partial slashing — penalizing a fraction of the stake while leaving the remainder active. The server detects the reduced amount and adjusts access accordingly.

## Deploy MPPEscrow

Deployment uses cast keystore accounts (no raw private keys in scripts):

```sh
cp example.env .env
# Edit: RPC_URL, CHAIN_ID, CAST_ACCOUNT, SENDER_ADDRESS, WHITELISTED_TOKENS

cast wallet import my-deployer --interactive

forge script contracts/script/DeployMPPEscrow.s.sol \
  --rpc-url "$RPC_URL" \
  --chain "$CHAIN_ID" \
  --account "$CAST_ACCOUNT" \
  --sender "$SENDER_ADDRESS" \
  --broadcast
```

Default testnet: [Tempo Moderato](https://tempo.xyz) (chain 42431).

## Specification

The stake intent is defined in [`specs/intents/draft-payment-intent-stake-00.md`](specs/intents/draft-payment-intent-stake-00.md) — an IETF-style RFC covering request schemas, credential formats, verification rules, and security considerations. Targeting acceptance into [`tempoxyz/mpp-specs`](https://github.com/tempoxyz/mpp-specs).

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)

## License

MIT
