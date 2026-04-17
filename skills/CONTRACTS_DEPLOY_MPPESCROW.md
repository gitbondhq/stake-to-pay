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

You should keep deployment secrets out of `.env` for execution.

- `RPC_URL` — JSON-RPC endpoint used for this session.
- `CHAIN_ID` — numeric chain ID.
- `CAST_ACCOUNT` — cast keystore account name.
- `SENDER_ADDRESS` — deployment sender address.
- `WHITELISTED_TOKENS` — comma-separated token addresses.
- `ETH_PASSWORD` — optional path to a file containing the keystore password for non-interactive runs.

Important:

- Never read `.env` contents during deployment.
- Never store private keys, mnemonics, or plaintext secrets in `.env`.
- Use cast keystore wallets only (`cast wallet import` + passphrase flow).
- `ETH_PASSWORD` is a file path, not the password string. Prefer a temporary `chmod 600` file outside the repo.

## Chain metadata lookup

When the user asks for deployment on a named chain (for example, “Base”), use `chain.list` first to resolve both `RPC_URL` and `CHAIN_ID`, then export them only for the current shell session:

```text
chain.list base
```

Expected response pattern (fields to use):

```text
{
  "name": "base",
  "chainId": "0x2105",
  "rpcUrls": ["https://mainnet.base.org", "..."]
}
```

Use these values as:

```sh
export CHAIN_ID=<resolved decimal chain id>
export RPC_URL=<selected-rpc-url>
```

Do not write these exports back to `.env` unless explicitly requested later for non-sensitive metadata only.

## Tempo-specific toolchain check

If the user asks for deployment on **tempo**, add this mandatory preflight before running any forge script:

```sh
forge --version
```

Interpretation:

- If the output indicates the Tempo-supported Foundry fork is active, continue.
- If output is standard upstream `forge` (or a version string the team does not recognize for tempo), stop and ask the user to approve an upgrade before making any toolchain changes.

If approval is granted, install/upgrade with the `-n` flag before deployment:

```sh
foundryup -n tempo
```

This installs the latest Tempo nightly toolchain (`forge`, `cast`, `anvil`, and `chisel`). Confirm the active binary ends with `-tempo` before moving on.

Then re-run:

```sh
forge --version
```

and confirm the forked binary is active before moving to dry-run/broadcast.

## Tempo testnet defaults

- Tempo testnet (`Moderato`): `CHAIN_ID=42431`
- Tempo testnet RPC: `https://rpc.moderato.tempo.xyz`
- Confirmed faucet token: `pathUSD=0x20c0000000000000000000000000000000000000`
- Do not assume `USDC.e` exists on Tempo testnet without verifying on-chain first.

## Base chain defaults

- Base mainnet: `CHAIN_ID=8453`
- Base Sepolia: `CHAIN_ID=84532`

## Preflight checklist

1. Ensure runtime environment has all required variables set:
   ```sh
   : "${CAST_ACCOUNT:?CAST_ACCOUNT is required}"
   : "${SENDER_ADDRESS:?SENDER_ADDRESS is required}"
   : "${RPC_URL:?RPC_URL is required}"
   : "${CHAIN_ID:?CHAIN_ID is required}"
   : "${WHITELISTED_TOKENS:?WHITELISTED_TOKENS is required}"
   ```
2. Verify placeholders are replaced:
   - `RPC_URL` is not `https://your-rpc-endpoint`
   - `CHAIN_ID` is not `your-chain-id`
   - `SENDER_ADDRESS` is not `0x0000000000000000000000000000000000000000`
3. Confirm selected account exists:
   ```sh
   cast wallet list | rg -q "^${CAST_ACCOUNT}( \\(Local\\))?$" || (echo "Account not found"; exit 1)
   ```
4. Optional non-interactive password setup for automation:
   ```sh
   export ETH_PASSWORD=/absolute/path/to/keystore-password.txt
   ```
   `ETH_PASSWORD` is a file path, not the password string. Prefer a temporary `chmod 600` file outside the repo.
5. Confirm sender matches account:
   Interactive:
   ```sh
   [ "$(cast wallet address --account "$CAST_ACCOUNT")" = "$SENDER_ADDRESS" ] || (echo "Sender mismatch"; exit 1)
   ```
   Non-interactive / macOS fallback:
   ```sh
   [ "$(cast wallet address --keystore "$HOME/.foundry/keystores/$CAST_ACCOUNT" --password-file "$ETH_PASSWORD")" = "$SENDER_ADDRESS" ] || (echo "Sender mismatch"; exit 1)
   ```
   Prefer the keystore form in non-interactive sessions; on some macOS setups `cast wallet address --account ...` can fail with `Device not configured (os error 6)`.
6. Confirm sender has balance for deployment:
   ```sh
   cast balance "$SENDER_ADDRESS" --rpc-url "$RPC_URL"
   ```
7. Optional dry-run:
   ```sh
   forge script contracts/script/DeployMPPEscrow.s.sol \
     --rpc-url "$RPC_URL" \
     --chain "$CHAIN_ID" \
     --account "$CAST_ACCOUNT" \
     --sender "$SENDER_ADDRESS"
   ```

## Agent runtime note

When running Foundry under the Codex macOS sandbox, RPC-backed `cast` / `forge` commands may panic in `system_configuration::dynamic_store` with `Attempted to create a NULL object`. Re-run the same command unsandboxed; dry-run and broadcast work normally outside the sandbox.

## Deployment command

```sh
forge script contracts/script/DeployMPPEscrow.s.sol \
  --rpc-url "$RPC_URL" \
  --chain "$CHAIN_ID" \
  --account "$CAST_ACCOUNT" \
  --sender "$SENDER_ADDRESS" \
  --broadcast
```

Non-interactive equivalent:

```sh
forge script contracts/script/DeployMPPEscrow.s.sol \
  --rpc-url "$RPC_URL" \
  --chain "$CHAIN_ID" \
  --keystore "$HOME/.foundry/keystores/$CAST_ACCOUNT" \
  --password-file "$ETH_PASSWORD" \
  --sender "$SENDER_ADDRESS" \
  --broadcast
```

## Expected output

- `MPPEscrow deployed to: <address>`
- Transaction hash lines from forge broadcast output

If Tempo `forge script --broadcast` does not print the transaction hash to stdout, read it from the broadcast artifact instead:

```sh
sed -n '1,220p' broadcast/DeployMPPEscrow.s.sol/$CHAIN_ID/run-latest.json
```

Return both:

- `transactions[0].hash` as the deployment transaction hash
- `transactions[0].contractAddress` / `receipts[0].contractAddress` as the deployed escrow address

## Template placeholders only

```dotenv
RPC_URL=https://your-rpc-endpoint
CHAIN_ID=8453
CAST_ACCOUNT=base-deployer
SENDER_ADDRESS=0x0000000000000000000000000000000000000000
WHITELISTED_TOKENS=0x0000000000000000000000000000000000000000
```

Use this file as the single source of truth for contract-deployment instructions.
