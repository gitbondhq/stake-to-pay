# Skill: CLI_DEPLOY_MPPX

## Scope

Use this playbook for CLI-related tasks: escrow operations, the challenge-response flow, and CLI tooling maintenance.

## Package location

- `apps/cli` — workspace `@stake-mpp/cli`
- Binary: `stake-mpp`
- ABI auto-regenerated from Foundry build output on each `npm run build`

## Build

```sh
npm run build --workspace @stake-mpp/cli
npm run lint --workspace @stake-mpp/cli
```

## Environment variables

These serve as defaults when flags are omitted:

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0xd334C82df572789E1EEF2eF7814dF6f6aE2D7Cce
export MPP_ESCROW_ACCOUNT=tempo-tester
export MPP_ESCROW_PASSWORD_FILE=/absolute/path/to/password.txt
```

---

## Challenge flow

The challenge commands form a pipeline. Each step's output feeds the next.

### 1. Fetch a challenge

Hit a protected endpoint and capture the 402 challenge:

```sh
stake-mpp challenge fetch \
  --url http://127.0.0.1:4020/documents/document \
  --out challenge.json
```

**Flags:** `--url` (required), `--method` (default GET), `--header <name:value>` (repeatable), `--out <path>` (save challenge to file).

**Output:** JSON with `challenge` object (parsed from 402 response), `outputPath` if saved.

### 2. Inspect the challenge

Parse and display challenge details:

```sh
stake-mpp challenge inspect --file challenge.json
```

**Flags:** `--file` (required — path from fetch `--out`).

**Output:** JSON with `description`, `id`, `intent`, `method`, `opaque`, `realm`, `request` (contains `amount`, `contract`, `counterparty`, `stakeKey`, `token`, etc.).

### 3. Respond to the challenge

Create the on-chain escrow and build a credential:

```sh
stake-mpp challenge respond \
  --challenge-file challenge.json \
  --account "$MPP_ESCROW_ACCOUNT" \
  --password-file "$MPP_ESCROW_PASSWORD_FILE" \
  --out credential.txt
```

**Flags:** `--challenge-file <path>` OR `--url <url>` (mutually exclusive — use file from fetch, or fetch fresh), one signing method (`--private-key`, `--account`, or `--keystore`), optional `--password-file`, `--method`, `--header`, `--out`.

**Output:** JSON with `credential` (serialized string), `txHash`, `challengeId`, `payloadType` ("hash" — client broadcasts tx).

**What happens:** The CLI broadcasts a `createEscrow` transaction on-chain, waits for confirmation, then produces a hash credential. It forces `feePayer = false` (client always broadcasts).

### 4. Submit the credential

Retry the protected request with the credential:

```sh
stake-mpp challenge submit \
  --url http://127.0.0.1:4020/documents/document \
  --credential-file credential.txt
```

**Flags:** `--url` (required), `--credential-file <path>` OR `--credential <string>` (mutually exclusive), `--method`, `--header`.

**Output:** JSON with the server response. On success, the response body contains the unlocked resource. On failure (if credential is invalid), another 402 challenge.

### Pipeline summary

```
fetch --out challenge.json
  → inspect --file challenge.json
  → respond --challenge-file challenge.json --out credential.txt
  → submit --url <same-url> --credential-file credential.txt
```

The `respond` command can also skip the saved file and fetch a fresh challenge inline:

```sh
stake-mpp challenge respond \
  --url http://127.0.0.1:4020/documents/document \
  --account "$MPP_ESCROW_ACCOUNT" \
  --password-file "$MPP_ESCROW_PASSWORD_FILE" \
  --out credential.txt
```

---

## Escrow commands

All escrow commands share: `--rpc-url`, `--contract`. Write commands add signing flags (`--private-key`, `--account`, `--keystore`, optional `--password-file`) and `--no-wait`.

### Write operations

| Command | Key flags | Purpose |
|---------|-----------|---------|
| `escrow create-escrow` | `--key`, `--counterparty`, `--token`, `--amount`, `--beneficiary` (opt) | Lock tokens |
| `escrow create-escrow-with-permit` | Same + `--deadline`, `--v`, `--r`, `--s` | Lock with ERC-2612 permit |
| `escrow refund-escrow` | `--key` | Return stake (happy path) |
| `escrow slash-escrow` | `--key` | Penalize payer |
| `escrow set-counterparty` | `--key`, `--new-counterparty` | Transfer authority |
| `escrow add-refund-delegate` | `--delegate` | Authorize refund delegate |
| `escrow remove-refund-delegate` | `--delegate` | Revoke refund delegate |
| `escrow add-slash-delegate` | `--delegate` | Authorize slash delegate |
| `escrow remove-slash-delegate` | `--delegate` | Revoke slash delegate |

All write commands return `functionName`, `hash`, and (unless `--no-wait`) `receipt` + `status`.

### Read operations

| Command | Key flags | Returns |
|---------|-----------|---------|
| `escrow get-escrow` | `--key` | Full escrow struct |
| `escrow token-whitelist` | `--token` | Boolean whitelist check |
| `escrow total-escrowed` | (none) | Total locked value |
| `escrow total-escrowed-by-token` | `--token` | Per-token locked value |
| `escrow refund-delegates` | `--counterparty`, `--delegate` | Boolean delegate check |
| `escrow slash-delegates` | `--counterparty`, `--delegate` | Boolean delegate check |

---

## Agent expectations

- All token amounts are base units (smallest denomination, no decimals).
- If `--beneficiary` is omitted on create commands, the contract defaults to the payer.
- Prefer `--password-file` with cast wallets in non-interactive sessions.
- Prefer the challenge pipeline for end-to-end flows. Use escrow commands for direct contract interaction or debugging.
- If a user asks for "deployment," clarify whether they mean contract deployment (`CONTRACTS_DEPLOY_MPPESCROW` skill) or CLI setup.
- Keep command examples scoped to the exact task. Prefer non-destructive reads before writes.
