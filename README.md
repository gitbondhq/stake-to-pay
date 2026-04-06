# stake-mpp

Stake-based access control for the [MPP (Micropayment Protocol)](https://github.com/gitbondhq/mppx-escrow), built for [GitBond](https://gitbond.com).  
Use this repo to deploy and use `MPPEscrow` across chains with Foundry and encrypted cast wallets.

> [!WARNING]
> Experimental and unaudited. This repo is for demo and template purposes only. Do not treat it as production-ready smart contract infrastructure without your own review, testing, and professional security assessment.

## Overview

- This repo includes Solidity contracts, a TypeScript SDK, and CLI tooling.
- A protected request creates an on-chain escrow, then the server verifies the escrow proof on-chain.
- After validation, the resource is granted and the escrow is resolved out-of-band.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Repository structure](#repository-structure)
- [Deploy MPPEscrow (any chain)](#deploy-mppeescrow-any-chain)
- [Contract deployment skill](#contract-deployment-skill)
- [Agent skills](#agent-skills)
- [Contracts](#contracts)
- [Packages](#packages)
- [License](#license)

## Repository structure

```
stake-mpp/
├── contracts/                      # Solidity (Foundry)
│   ├── src/                        # Contract sources
│   ├── test/                       # Forge tests
│   └── script/                     # Deploy & admin scripts
│
├── apps/
│   └── cli/                        # CLI agent tools
│
├── packages/
│   ├── mppx-stake/                 # @gitbondhq/mppx-stake — MPP stake TS SDK
│   ├── eslint-config/              # Shared ESLint config
│   └── typescript-config/          # Shared TypeScript config
│
├── lib/                            # Foundry dependencies (git submodules)
├── foundry.toml                    # Foundry configuration
├── turbo.json                      # Turborepo task orchestration
└── package.json                    # npm workspaces root
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)

## Getting started

```sh
# Install JS dependencies
npm install

# Build all packages
npm run build

# Build contracts
forge build

# Run contract tests
forge test
```

## Deploy MPPEscrow (any chain)

Deployment uses a cast keystore account, no raw private keys in scripts.

1. Prepare `.env` from the template:

```sh
cp example.env .env
```

2. Edit `.env`:

```dotenv
RPC_URL=https://your-rpc-endpoint
CHAIN_ID=8453
CAST_ACCOUNT=base-deployer
SENDER_ADDRESS=0x0000000000000000000000000000000000000000
WHITELISTED_TOKENS=0x0000000000000000000000000000000000000000,0x1111111111111111111111111111111111111111
```

3. Set up a cast wallet if needed:

```sh
cast wallet import base-deployer --interactive
```

4. Confirm wallet and sender:

```sh
cast wallet list
cast wallet inspect base-deployer
```

5. Deploy:

```sh
source .env
forge script contracts/script/DeployMPPEscrow.s.sol \
  --rpc-url "$RPC_URL" \
  --chain "$CHAIN_ID" \
  --account "$CAST_ACCOUNT" \
  --sender "$SENDER_ADDRESS" \
  --broadcast
```

6. Capture the deployed address from output:

```text
MPPEscrow deployed to: 0x...
```

## Contract deployment skill

For agent-focused deployment workflows (Claude/Codex-friendly), use:
[CONTRACTS_DEPLOY_MPPESCROW](skills/CONTRACTS_DEPLOY_MPPESCROW.md).

## Agent skills

- Smart contracts deployment and cast-wallet workflow: [CONTRACTS_DEPLOY_MPPESCROW](skills/CONTRACTS_DEPLOY_MPPESCROW.md)
- CLI workflow and command tasks: [CLI_DEPLOY_MPPX](skills/CLI_DEPLOY_MPPX.md)
- MPP package and SDK guidance: [MPP_PACKAGE_OVERVIEW](skills/MPP_PACKAGE_OVERVIEW.md)

## Contracts

The escrow contracts are shipped as a simple escrow template for the [Tempo](https://tempo.xyz) blockchain. Key operations:

- `createEscrow` / `createEscrowWithPermit` — deposit whitelisted ERC20 principal into escrow. If `beneficiary` is `address(0)`, the contract defaults it to the payer.
- `refundEscrow` — return the escrow principal to the beneficiary
- `slashEscrow` — send the escrow principal to the counterparty

Template warning:

- Only whitelist tokens you have reviewed carefully for decimals and base-unit handling, fee-on-transfer behavior, rebasing/share mechanics, hooks/callbacks, and any other non-standard settlement logic.
- This template assumes exact-transfer ERC20 behavior for escrow accounting. Non-standard tokens can produce undercollateralization, stuck funds, or incorrect totals unless you customize the contract accordingly.

See `contracts/` for sources and `contracts/script/` for deployment helpers.

## Packages

### @gitbondhq/mppx-stake

TypeScript SDK that extends MPP with the `stake` intent. Provides client-side credential building and server-side verification for escrow-backed access control.

```ts
import { Stake } from "@gitbondhq/mppx-stake/client";
import { Stake as StakeServer } from "@gitbondhq/mppx-stake/server";
```

### CLI

Command-line tools for interacting with the escrow contracts and MPP stake flow, designed for agentic use.

## License

MIT
