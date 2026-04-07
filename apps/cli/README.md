# @stake-mpp/cli

ABI-driven CLI for the `MPPEscrow` contract and the MPP stake challenge flow.

> Experimental. Development tool for the local escrow contract — not hardened production infrastructure.

## Install

From the monorepo root:

```sh
npm install --workspace @stake-mpp/cli
npm run build --workspace @stake-mpp/cli
```

## Environment

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0x651B0DB0D25A49d0CBbF790a404cE10A3F401821
export MPP_ESCROW_PRIVATE_KEY=0x...
```

## Commands

### Escrow lifecycle

```sh
stake-mpp escrow create-escrow       # Lock tokens in escrow
stake-mpp escrow refund-escrow       # Return stake to beneficiary
stake-mpp escrow slash-escrow        # Send stake to counterparty
```

Also: `create-escrow-with-permit`, `set-counterparty`, `add-refund-delegate`, `remove-refund-delegate`, `add-slash-delegate`, `remove-slash-delegate`.

### Escrow queries

```sh
stake-mpp escrow get-escrow           # Read escrow state
stake-mpp escrow token-whitelist      # List whitelisted tokens
stake-mpp escrow total-escrowed       # Total locked value
```

Also: `total-escrowed-by-token`, `refund-delegates`, `slash-delegates`.

### Challenge flow

```sh
stake-mpp challenge fetch     # Get 402 challenge from server
stake-mpp challenge inspect   # Parse challenge details
stake-mpp challenge respond   # Build credential (broadcasts tx, returns hash credential)
stake-mpp challenge submit    # Post credential to server
```

## Examples

Read escrow state:

```sh
stake-mpp escrow get-escrow \
  --key 0xaaaa...aaaa \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT"
```

Create escrow:

```sh
stake-mpp escrow create-escrow \
  --key 0xaaaa...aaaa \
  --counterparty 0x2222...2222 \
  --token 0x20C0...0000 \
  --amount 5000000 \
  --rpc-url "$MPP_ESCROW_RPC_URL" \
  --contract "$MPP_ESCROW_CONTRACT" \
  --private-key "$MPP_ESCROW_PRIVATE_KEY"
```

## Notes

- All token amounts are in base units
- Write commands wait for a receipt by default (`--no-wait` to skip)
- `challenge respond` uses client-side broadcast (`feePayer = false`)
- ABI is auto-regenerated from Foundry build output on each `npm run build`
