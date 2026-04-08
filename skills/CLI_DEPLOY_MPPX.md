# Skill: CLI_DEPLOY_MPPX

## Scope

Use this playbook for CLI-related tasks: escrow operations, the challenge-response flow, and CLI tooling maintenance.

## Package location

- `apps/cli` — workspace `@stake-mpp/cli`
- Binary: `stake-mpp`
- Repo-root wrapper after build: `npm run stake-mpp -- <command> [flags]`
- ABI auto-regenerated from Foundry build output on each `npm run build`

## Build

```sh
npm run build --workspace @stake-mpp/cli
npm run stake-mpp -- --help
npm run lint --workspace @stake-mpp/cli
```

## Agent runtime note

In the Codex sandbox, local `challenge fetch` / `challenge submit` requests against `127.0.0.1` can fail with a generic `fetch failed` even when the CLI defaults are correct. If that happens, rerun the command unsandboxed before treating it as a CLI bug.

After the CLI is built, prefer running it from the repo root with:

```sh
npm run stake-mpp -- <command> [flags]
```

## Environment variables

These serve as defaults when flags are omitted:

```sh
export MPP_ESCROW_RPC_URL=https://rpc.moderato.tempo.xyz
export MPP_ESCROW_CONTRACT=0xd334C82df572789E1EEF2eF7814dF6f6aE2D7Cce
export MPP_ESCROW_ACCOUNT=tempo-tester
export MPP_ESCROW_PASSWORD_FILE=/absolute/path/to/password.txt
export MPP_RESOURCE_URL=http://127.0.0.1:4020/documents/document
```

---

## Challenge flow

The challenge commands form a pipeline. Each step's output feeds the next.

### 1. Fetch a challenge

Hit a protected endpoint and capture the 402 challenge:

```sh
stake-mpp challenge fetch \
  --out challenges/custom-challenge.json
```

With repo-root `.env` defaults loaded, the shortest demo path is simply:

```sh
stake-mpp challenge fetch
```

**Flags:** optional `--url`, optional `--out` (defaults to a timestamped file under `challenges/`).

**Output:** JSON with `challenge` object (parsed from 402 response), `outputPath` if saved.
The default `challenges/` directory is gitignored.

### 2. Inspect the challenge

Parse and display challenge details:

```sh
stake-mpp challenge inspect
```

**Flags:** optional `--file` (defaults to the latest saved file in `challenges/`).

**Output:** JSON with `description`, `id`, `intent`, `method`, `opaque`, `realm`, `request` (contains `amount`, `contract`, `counterparty`, `stakeKey`, `token`, etc.).

### 3. Respond to the challenge

Create the on-chain escrow and build a credential:

```sh
stake-mpp challenge respond \
  --account "$MPP_ESCROW_ACCOUNT"
```

Default behavior:
- writes `credential.txt`
- uses the latest saved challenge in `challenges/` if one exists
- otherwise fetches a fresh challenge from the default demo URL

**Flags:** optional `--challenge-file <path>` OR optional `--url <url>` (mutually exclusive), one signing method (`--private-key`, `--account`, or `--keystore`), optional `--password-file`, optional `--out` (defaults to `credential.txt`).

**Output:** JSON with `credential` (serialized string), `txHash`, `challengeId`, `payloadType` ("hash" — client broadcasts tx).

**What happens:** The CLI broadcasts a `createEscrow` transaction on-chain, waits for confirmation, then produces a hash credential. It forces `feePayer = false` (client always broadcasts).

### 4. Submit the credential

Retry the protected request with the credential:

```sh
stake-mpp challenge submit
```

**Flags:** optional `--url`, optional `--credential-file` (defaults to `credential.txt`).

**Output:** JSON with the server response. On success, the response body contains the unlocked resource. On failure (if credential is invalid), another 402 challenge.

### Pipeline summary

```
fetch
  → inspect
  → respond
  → submit
```

The `respond` command can also skip the saved file and fetch a fresh challenge inline:

```sh
stake-mpp challenge respond \
  --url http://127.0.0.1:4020/documents/document \
  --account "$MPP_ESCROW_ACCOUNT"
```

---

## Escrow commands

The CLI intentionally exposes only the core escrow lifecycle:

- `escrow create-escrow`
- `escrow get-escrow`
- `escrow refund-escrow`
- `escrow slash-escrow`

All escrow commands share: `--rpc-url`, `--contract`. Write commands add signing flags (`--private-key`, `--account`, `--keystore`, optional `--password-file`) and `--no-wait`.

### Write operations

| Command | Key flags | Purpose |
|---------|-----------|---------|
| `escrow create-escrow` | `--key`, `--counterparty`, `--token`, `--amount`, `--beneficiary` (opt) | Lock tokens |
| `escrow refund-escrow` | `--key` | Return stake (happy path) |
| `escrow slash-escrow` | `--key` | Penalize payer |

All write commands return `functionName`, `hash`, and (unless `--no-wait`) `receipt` + `status`.

### Read operations

| Command | Key flags | Returns |
|---------|-----------|---------|
| `escrow get-escrow` | `--key` | Full escrow struct |

---

## Agent expectations

- All token amounts are base units (smallest denomination, no decimals).
- If `--beneficiary` is omitted on create commands, the contract defaults to the payer.
- Prefer `MPP_ESCROW_PASSWORD_FILE` or `--password-file` with cast wallets in non-interactive sessions.
- Prefer the challenge pipeline for end-to-end flows. Use escrow commands for direct contract interaction or debugging.
- If a user asks for "deployment," clarify whether they mean contract deployment (`CONTRACTS_DEPLOY_MPPESCROW` skill) or CLI setup.
- Keep command examples scoped to the exact task. Prefer non-destructive reads before writes.
