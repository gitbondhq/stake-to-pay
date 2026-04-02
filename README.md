# stake-mpp

Stake-based access control using the [MPP (Micropayment Protocol)](https://github.com/gitbondhq/mppx-escrow) and on-chain escrow contracts. Built for [GitBond](https://gitbond.com).

This monorepo combines the escrow smart contracts, the MPP stake TypeScript SDK, a demo app, and CLI tooling into a single workspace.

## How it works

1. A client requests a protected resource
2. The server responds with `402 Payment Required` and an MPP challenge (`method="tempo"`, `intent="stake"`)
3. The client creates an on-chain escrow (stablecoin deposit) via the GitSwarm Escrow contract
4. The client retries the request with a credential proving the escrow was created
5. The server verifies the escrow on-chain and grants access
6. The escrow is later resolved out-of-band — refunded if the action was legitimate, slashed if not

## Repository structure

```
stake-mpp/
├── contracts/                      # Solidity (Foundry)
│   ├── src/                        # Contract sources
│   ├── test/                       # Forge tests
│   └── script/                     # Deploy & admin scripts
│
├── apps/
│   ├── demo/                       # Next.js + Privy demo app
│   └── cli/                        # CLI agent tools
│
├── packages/
│   ├── mppx-escrow/                # @gitbondhq/mppx-escrow — MPP stake TS SDK
│   ├── ui/                         # Shared UI components
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

# Run the demo app
npm run dev --workspace=@stake-mpp/demo

# Build contracts
forge build

# Run contract tests
forge test
```

## Contracts

The escrow contracts use the UUPS upgradeable proxy pattern and are designed for the [Tempo](https://tempo.xyz) blockchain. Key operations:

- `createEscrow` / `createEscrowWithPermit` — deposit stablecoins into escrow
- `refundEscrow` — return principal minus fee to beneficiary
- `slashEscrow` — split principal between counterparty and treasury

See `contracts/` for sources and `contracts/script/` for deployment helpers.

## Packages

### @gitbondhq/mppx-escrow

TypeScript SDK that extends MPP with the `stake` intent. Provides client-side credential building and server-side verification for escrow-backed access control.

```ts
import { Stake } from "@gitbondhq/mppx-escrow/client";
import { Stake as StakeServer } from "@gitbondhq/mppx-escrow/server";
```

### Demo app

Next.js app with Privy wallet integration demonstrating the full stake flow end-to-end.

### CLI

Command-line tools for interacting with the escrow contracts and MPP stake flow, designed for agentic use.

## License

MIT
