# `@stake-mpp/cli`

Command-line interface for the `MPPEscrow` contract.

This CLI is ABI-driven from local Foundry build output. On build and typecheck, it regenerates its ABI module from `out/MPPEscrow.sol/MPPEscrow.json`, so contract method drift is caught by TypeScript instead of a hand-maintained ABI copy silently going stale.

## Status

Experimental. This package is a development tool for the local escrow contract template and should not be treated as hardened production infrastructure.

## Install

From the monorepo root:

```bash
npm install --workspace @stake-mpp/cli
npm run build --workspace @stake-mpp/cli
```

## Environment variables

The CLI accepts flags, but these environment variables can be used as defaults:

```bash
export MPP_ESCROW_RPC_URL=https://your-rpc.example
export MPP_ESCROW_CONTRACT=0xYourEscrowContract
export MPP_ESCROW_PRIVATE_KEY=0xyourprivatekey
```

## Usage

General help:

```bash
npx --workspace @stake-mpp/cli stake-mpp --help
npx --workspace @stake-mpp/cli stake-mpp escrow --help
```

Example read:

```bash
npx --workspace @stake-mpp/cli stake-mpp escrow get-escrow \
  --key 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Example write:

```bash
npx --workspace @stake-mpp/cli stake-mpp escrow create-escrow \
  --key 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --counterparty 0x2222222222222222222222222222222222222222 \
  --beneficiary 0x3333333333333333333333333333333333333333 \
  --token 0x4444444444444444444444444444444444444444 \
  --amount 1000000 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --private-key "$MPP_ESCROW_PRIVATE_KEY"
```

If `--beneficiary` is omitted for create commands, the CLI passes `address(0)` and the contract defaults the beneficiary to the payer.

## Commands

Write methods:

- `escrow create-escrow`
- `escrow create-escrow-with-permit`
- `escrow refund-escrow`
- `escrow slash-escrow`
- `escrow set-counterparty`
- `escrow add-refund-delegate`
- `escrow remove-refund-delegate`
- `escrow add-slash-delegate`
- `escrow remove-slash-delegate`

Read methods:

- `escrow get-escrow`
- `escrow token-whitelist`
- `escrow total-escrowed`
- `escrow total-escrowed-by-token`
- `escrow refund-delegates`
- `escrow slash-delegates`

Challenge flow:

- `challenge fetch`
- `challenge inspect`
- `challenge respond`
- `challenge submit`

## Notes

- All token amounts must be provided in base units.
- The CLI uses `viem` for contract reads, simulation, and writes.
- `create-escrow-with-permit` expects a permit signature to be supplied explicitly as `--deadline`, `--v`, `--r`, and `--s`.
- Write commands wait for a receipt by default. Pass `--no-wait` to return immediately after broadcast.
- `challenge respond` is currently limited to signed transaction credentials (`payload.type = "transaction"`). It forces `submission: 'pull'` when creating the credential so the server can inspect and submit the signed transaction on retry.
