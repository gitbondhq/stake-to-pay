# @stake-mpp/cli

ABI-driven CLI for the `MPPEscrow` contract and the MPP stake challenge flow.

> Experimental. Development tool for the local escrow contract — not hardened production infrastructure.

## Install

From the monorepo root:

```sh
npm install --workspace @stake-mpp/cli
npm run build --workspace @stake-mpp/cli
npm run stake-mpp -- --help
```

After the CLI is built, the repo root exposes a convenience wrapper:

```sh
npm run stake-mpp -- <command> [flags]
```

## Environment

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0xd334C82df572789E1EEF2eF7814dF6f6aE2D7Cce
export MPP_ESCROW_ACCOUNT=tempo-tester
export MPP_ESCROW_PASSWORD_FILE=/absolute/path/to/password.txt
export MPP_RESOURCE_URL=http://127.0.0.1:4020/documents/document
```

## Commands

### Escrow lifecycle

```sh
stake-mpp escrow create-escrow       # Lock tokens in escrow
stake-mpp escrow get-active-escrow-id # Resolve active escrow id from scope + beneficiary
stake-mpp escrow get-active-escrow    # Read active escrow by scope + beneficiary
stake-mpp escrow get-escrow          # Read escrow state
stake-mpp escrow refund-escrow       # Return stake to beneficiary
stake-mpp escrow slash-escrow        # Send stake to counterparty
```

### Challenge flow

```sh
stake-mpp challenge fetch     # Get the 402 challenge and save it under challenges/
stake-mpp challenge inspect   # Parse the latest saved challenge
stake-mpp challenge respond   # Build credential.txt (ensures stake, returns scope-active signature)
stake-mpp challenge submit    # Post credential.txt to the server
```

With the repo-root `.env` loaded, the demo flow works from the repo root with:

```sh
npm run stake-mpp -- challenge fetch
npm run stake-mpp -- challenge inspect
npm run stake-mpp -- challenge respond
npm run stake-mpp -- challenge submit
```

## Examples

Resolve the active escrow id:

```sh
stake-mpp escrow get-active-escrow-id \
  --scope 0xaaaa...aaaa \
  --beneficiary 0x1111...1111 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Read the active escrow directly:

```sh
stake-mpp escrow get-active-escrow \
  --scope 0xaaaa...aaaa \
  --beneficiary 0x1111...1111 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Read escrow state by id:

```sh
stake-mpp escrow get-escrow \
  --escrow-id 1 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Create escrow:

```sh
stake-mpp escrow create-escrow \
  --scope 0xaaaa...aaaa \
  --counterparty 0x2222...2222 \
  --token 0x20C0...0000 \
  --amount 5000000 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --account "$MPP_ESCROW_ACCOUNT"
```

## Notes

- The CLI intentionally exposes only the core challenge flow and core escrow lifecycle commands.
- `escrow get-active-escrow-id` is the lookup step before `get-escrow`, `refund-escrow`, or `slash-escrow` when you only have `(scope, beneficiary)`.
- `escrow get-active-escrow` mirrors the contract’s active lookup and returns the resolved active escrow record in one read.
- `challenge fetch` defaults to the demo URL and writes a timestamped file under `challenges/`, which is gitignored.
- `challenge inspect` defaults to the latest file in `challenges/`.
- `challenge respond` defaults to writing `credential.txt`, and will use the latest saved challenge in `challenges/` before fetching a fresh challenge.
- `challenge submit` defaults to the demo URL and `credential.txt`.
- All token amounts are in base units
- Write commands wait for a receipt by default (`--no-wait` to skip)
- Write commands and `challenge respond` accept `--private-key`, `--account`, or `--keystore`; use `MPP_ESCROW_PASSWORD_FILE` or `--password-file` for non-interactive keystore unlocks
- `challenge respond` uses the `scope-active` signature flow and will create escrow only when no active stake already exists for the challenged scope
- ABI is auto-regenerated from Foundry build output on each `npm run build`
