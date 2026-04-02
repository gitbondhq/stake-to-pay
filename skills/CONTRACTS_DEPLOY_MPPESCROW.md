# Skill: CONTRACTS_DEPLOY_MPPESCROW

## Scope

Deployment playbook for `MPPEscrow` using cast keystore wallets.

- Use case: smart-contract deployment
- Domain: contracts
- Tooling: `forge`, `cast`
- Prerequisites: `RPC_URL`, `CHAIN_ID`, `CAST_ACCOUNT`, `SENDER_ADDRESS`, `WHITELISTED_TOKENS`

## Objective

Deploy `MPPEscrow` on a target chain using an encrypted cast wallet, then report the deployed address.

## Required `.env`

- `RPC_URL` — JSON-RPC endpoint.
- `CHAIN_ID` — numeric chain ID.
- `CAST_ACCOUNT` — cast keystore account name.
- `SENDER_ADDRESS` — deployment sender address.
- `WHITELISTED_TOKENS` — comma-separated token addresses.

## Base chain defaults

- Base mainnet: `CHAIN_ID=8453`
- Base Sepolia: `CHAIN_ID=84532`

## Preflight checklist

1. Verify `.env` exists and source it:
   ```sh
   if [ -f .env ]; then source .env; else echo ".env not found"; exit 1; fi
   ```
2. Verify placeholders are replaced:
   - `RPC_URL` is not `https://your-rpc-endpoint`
   - `CHAIN_ID` is not `your-chain-id`
   - `SENDER_ADDRESS` is not `0x0000000000000000000000000000000000000000`
3. Confirm selected account exists:
   ```sh
   cast wallet list | rg -q "^$CAST_ACCOUNT$" || (echo "Account not found"; exit 1)
   ```
4. Confirm sender matches account:
   ```sh
   cast wallet inspect "$CAST_ACCOUNT" | rg -q "$SENDER_ADDRESS" || (echo "Sender mismatch"; exit 1)
   ```
5. Confirm sender has balance for deployment:
   ```sh
   cast balance "$SENDER_ADDRESS" --rpc-url "$RPC_URL"
   ```
6. Optional dry-run:
   ```sh
   forge script contracts/script/DeployMPPEscrow.s.sol \
     --rpc-url "$RPC_URL" \
     --chain "$CHAIN_ID" \
     --account "$CAST_ACCOUNT" \
     --sender "$SENDER_ADDRESS"
   ```

## Deployment command

```sh
forge script contracts/script/DeployMPPEscrow.s.sol \
  --rpc-url "$RPC_URL" \
  --chain "$CHAIN_ID" \
  --account "$CAST_ACCOUNT" \
  --sender "$SENDER_ADDRESS" \
  --broadcast
```

## Expected output

- `MPPEscrow deployed to: <address>`
- Transaction hash lines from forge broadcast output

## Template placeholders only

```dotenv
RPC_URL=https://your-rpc-endpoint
CHAIN_ID=8453
CAST_ACCOUNT=base-deployer
SENDER_ADDRESS=0x0000000000000000000000000000000000000000
WHITELISTED_TOKENS=0x0000000000000000000000000000000000000000
```

Use this file as the single source of truth for contract-deployment instructions.
