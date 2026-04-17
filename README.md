# stake-mpp

Starter kit for building **stake-to-pay** apps with [MPP](https://github.com/anthropics/mpp). Clone, customize, and deploy your own stake-gated service.

> **Stake-to-pay flips the model**: users lock tokens in an on-chain escrow to gain access. Well-behaved users get their stake back (zero-cost access). Bad actors get slashed. Servers can capture yield on locked collateral.

> [!WARNING]
> Experimental and unaudited. Do not treat this as production-ready without your own review, testing, and security assessment.

## What's in the box

| Directory              | What it is                                               | When you'll touch it                                                                       |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/mpp-server/`     | Express server with a working 402 stake paywall          | **Start here** — add routes, swap content, wire up your own backend                        |
| `packages/mppx-stake/` | `@gitbondhq/mppx-stake` TypeScript SDK (client + server) | When integrating stake into a different app or changing the stake escrow verification flow |
| `contracts/`           | `MPPEscrow` Solidity contract (Foundry)                  | When customizing escrow logic (tiers, partial slash, multi-token)                          |
| `apps/cli/`            | CLI for escrow lifecycle + challenge-response operations | For testing and scripting against your server                                              |
| `specs/intents/`       | IETF-style stake intent specification                    | Reference only — describes the protocol in detail                                          |
| `config.json`          | Shared network + escrow defaults                         | Whenever you change chain, contract address, or stake terms                                |

## How it works

```
Client                         Server                      Chain
  |                              |                           |
  |-- GET /resource ------------>|                           |
  |<---- 402 + stake challenge --|                           |
  |                              |                           |
  |-- ensure active escrow ------+-------------------------->|
  |<-----------------------------+---- active stake exists --|
  |                              |                           |
  |-- GET /resource + credential>|                           |
  |                       verify |-- isEscrowActive(scope) ->|
  |                              |<-- active escrow record --|
  |<---- 200 + content ---------|                           |
  |                              |                           |
  |          (later)             |                           |
  |                              |-- refundEscrow(id) ------>|  happy path
  |                              |-- slashEscrow(id) ------->|  violation
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)

## Quick start

```sh
git clone <this-repo> && cd stake-mpp

# One-command setup
npm run bootstrap

# Or step by step
npm install
npm run build
```

`npm install` at the repo root installs dependencies for every workspace. Foundry libs are vendored in `lib/`, so no separate `forge install` is needed.

### Run the demo

```sh
# 1. Configure
cp example.env .env
# Edit .env: set MPP_SECRET_KEY to any random string
# config.json has working defaults for Tempo Moderato testnet

# 2. Start the server
npm run dev:server

# 3. In another terminal — try the paywall
curl http://127.0.0.1:4020/documents/document/preview   # public preview
npx mppx http://127.0.0.1:4020/documents/document       # triggers 402 -> stake -> access
```

## Build your own app

### 1. Change the protected content

Edit `apps/mpp-server/content/document.md`. The H1 heading becomes the document title, the first paragraph becomes the public preview, and everything after is the protected body. The filename becomes the route slug (`/documents/<filename>`).

### 2. Add routes or change server behavior

The server entry point is `apps/mpp-server/src/index.ts`. Key files:

| File                                  | Purpose                               |
| ------------------------------------- | ------------------------------------- |
| `apps/mpp-server/src/index.ts`        | Express routes and MPP wiring         |
| `apps/mpp-server/src/config.ts`       | Reads `.env` and `config.json`        |
| `apps/mpp-server/src/content.ts`      | Loads and parses the content markdown |
| `apps/mpp-server/content/document.md` | The gated document itself             |

The server uses `mppx` server SDK to issue 402 challenges and verify credentials. The stake method is configured once and applied per-route:

```ts
import { serverStake } from '@gitbondhq/mppx-stake/server'
import { Mppx } from 'mppx/server'

const mppx = Mppx.create({
  methods: [serverStake({ contract, counterparty, token, chainId })],
  secretKey: process.env.MPP_SECRET_KEY!,
})
```

### 3. Configure stake terms

Edit `config.json` at the repo root:

```json
{
  "chainId": 42431,
  "escrow": {
    "contract": "0x3E7f...",
    "counterparty": "0x589B...",
    "token": "0x20c0...",
    "tokenWhitelist": ["0x20c0..."],
    "amount": "5000000",
    "description": "Stake required to unlock the full incident report",
    "policy": "demo-document-v1"
  }
}
```

Key fields:

- **`contract`** — deployed `MPPEscrow` address
- **`counterparty`** — address authorized to refund/slash escrows
- **`token`** — whitelisted ERC-20 token address
- **`amount`** — required stake in base units (e.g. `"5000000"` = 5 USDC with 6 decimals)
- **`policy`** — included in scope derivation; change it when stake terms change

### 4. Integrate the SDK into your own app

**Client side** — sign a `scope-active` proof after ensuring an escrow exists:

```ts
import { Mppx } from 'mppx/client'
import { clientStake } from '@gitbondhq/mppx-stake/client'

const mppx = Mppx.create({
  methods: [clientStake({ beneficiaryAccount })],
})
```

**Server side** — verify active stake on-chain:

```ts
import { Mppx } from 'mppx/server'
import { serverStake } from '@gitbondhq/mppx-stake/server'

const mppx = Mppx.create({
  methods: [serverStake({ contract, counterparty, token, chainId })],
  secretKey: process.env.MPP_SECRET_KEY!,
})
```

### 5. Deploy your own escrow contract

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

After deploying, update the `contract` address in `config.json`.

Default testnet: [Tempo Moderato](https://tempo.xyz) (chain 42431).

### 6. Customize escrow logic

The `MPPEscrow` contract in `contracts/src/MPPEscrow.sol` is designed to be edited. Some patterns:

- **Tiered access** — read the staked amount server-side and map it to access levels
- **Multi-collateral vaults** — accept multiple token deposits under one stake key
- **Partial slash** — penalize a fraction of the stake while keeping the rest active
- **Yield routing** — override lifecycle hooks to deposit locked tokens into yield protocols

Only whitelist tokens you have reviewed for decimals, fee-on-transfer behavior, rebasing mechanics, and hooks.

## Root scripts

| Command                       | What it does                           |
| ----------------------------- | -------------------------------------- |
| `npm run bootstrap`           | Install deps + full build              |
| `npm run build`               | Build contracts ABI, SDK, and all apps |
| `npm run build:contracts`     | `forge build`                          |
| `npm run build:mppx-stake`    | Regenerate ABI + build the SDK         |
| `npm run build:server`        | Build the demo server                  |
| `npm run build:cli`           | Build the CLI                          |
| `npm run dev:server`          | Run demo server in watch mode          |
| `npm run start:server`        | Run demo server                        |
| `npm run stake-mpp -- <args>` | Run the CLI                            |
| `npm run lint`                | ESLint + type checking                 |
| `npm run format`              | Prettier                               |

## Environment variables

Copy `example.env` to `.env`. Required and optional variables:

| Variable             | Required   | Default     | Purpose                                     |
| -------------------- | ---------- | ----------- | ------------------------------------------- |
| `MPP_SECRET_KEY`     | Yes        | —           | Secret for signing/verifying MPP challenges |
| `HOST`               | No         | `127.0.0.1` | Server bind address                         |
| `PORT`               | No         | `4020`      | Server port                                 |
| `RPC_URL`            | For deploy | —           | Chain RPC endpoint                          |
| `CHAIN_ID`           | For deploy | —           | Target chain ID                             |
| `CAST_ACCOUNT`       | For deploy | —           | Cast keystore account name                  |
| `SENDER_ADDRESS`     | For deploy | —           | Deployer address                            |
| `WHITELISTED_TOKENS` | For deploy | —           | Comma-separated token addresses             |

## Key concepts

- **Scope** — a stable 32-byte identifier for the protected resource. The demo server derives it from `sha256(policy:resource)`. Changing stake terms (amount, token, counterparty) may warrant a new scope version.
- **Beneficiary** — the address that holds the active stake and gains access. Can differ from the payer (sponsored access).
- **Counterparty** — the address authorized to refund or slash escrows.
- **Credential** — a `scope-active` EIP-712 signature proving the beneficiary controls the staked address. Stateless verification — the server always checks on-chain state.

## Specification

The stake intent is formally defined in [`specs/intents/draft-payment-intent-stake-00.md`](specs/intents/draft-payment-intent-stake-00.md), an IETF-style RFC covering request schemas, credential formats, verification rules, and security considerations.

## License

MIT
