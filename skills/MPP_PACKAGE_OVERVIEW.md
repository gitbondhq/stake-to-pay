# Skill: MPP_PACKAGE_OVERVIEW

## Scope

Use this playbook for `@gitbondhq/mppx-stake` SDK work: integration, configuration, exports, ABI updates, and client/server wiring.

## Package location

- `packages/mppx-stake` — workspace `@gitbondhq/mppx-stake`

## Build

```sh
npm run build:mppx-stake          # Build (includes ABI generation)
npm run lint --workspace=@gitbondhq/mppx-stake
```

Regenerate ABI only when the contract interface changes.

---

## Entry points

| Import | Exports |
|--------|---------|
| `@gitbondhq/mppx-stake` | `Methods.stake`, `MPPEscrowAbi`, network preset helpers |
| `@gitbondhq/mppx-stake/client` | `stake()` — client credential builder |
| `@gitbondhq/mppx-stake/server` | `stake()` — server verification |
| `@gitbondhq/mppx-stake/abi` | `MPPEscrowAbi` only |

---

## Client integration

### Basic setup

```ts
import { stake } from "@gitbondhq/mppx-stake/client";

const method = stake({ account });
```

### With other mppx methods

```ts
import { Mppx, tempo } from "mppx/client";
import { stake } from "@gitbondhq/mppx-stake/client";

const mppx = Mppx.create({
  methods: [[...tempo({ account }), stake({ account })]],
});
```

### Client config

```ts
stake({
  account,              // Address or Account — the payer
  provider,             // Optional EIP-1193 provider (wallet)
  feeToken,             // Optional fee token address
})
```

### How client credentials work

1. Client receives a 402 challenge with stake request (amount, contract, counterparty, stakeKey, token).
2. SDK detects whether the token supports ERC-2612 permits (`detectTransportPolicy`).
3. **Permit path:** Single `createEscrowWithPermit` call.
4. **Legacy path:** Two calls — `approve` then `createEscrow`.
5. On Tempo chains, calls are batched into a single transaction (type 0x76).
6. SDK produces a credential:
   - `type: "hash"` — client broadcasts tx, credential contains tx hash.
   - `type: "transaction"` — client signs tx, credential contains signed payload for server to broadcast.

### Gotchas

- **Fee-payer + wallet provider conflict:** If the challenge has `feePayer=true`, an EIP-1193 provider cannot be used (can't sign Tempo batch txs). Use an account directly.
- **Fee-payer on non-Tempo chains:** Silently disabled — only Tempo supports batch cosigning.
- **Permit deadline:** Defaults to 1 hour.

---

## Server integration

### Basic setup

```ts
import { stake } from "@gitbondhq/mppx-stake/server";

const method = stake({
  chainId: 42431,
  contract: "0x651B...",
  token: "0x20C0...0000",
});
```

### With mppx server

```ts
import { Mppx } from "mppx/server";
import { stake } from "@gitbondhq/mppx-stake/server";

const mppx = Mppx.create({
  methods: [
    stake({
      chainId: 42431,
      contract: "0x651B...",
      counterparty: "0x...",
      token: "0x20C0...0000",
      description: "Stake to unlock report",
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});
```

### Server config

```ts
stake({
  chainId,          // Required — no default
  contract,         // MPPEscrow address
  counterparty,     // Address authorized to refund/slash
  token,            // ERC-20 token address
  beneficiary,      // Optional — defaults to payer
  description,      // Optional — human-readable
  feePayer,         // Optional — ViemAccount or fee-payer RPC URL string
  name,             // Optional — method name (default: inferred)
})
```

### How server verification works

1. Server issues 402 challenge with stake request fields.
2. Client submits credential (hash or transaction type).
3. Server processes credential:
   - **Hash credential:** Fetches tx receipt by hash, verifies escrow creation events.
   - **Transaction credential:** Deserializes signed tx, optionally applies fee-payer cosigning, broadcasts, verifies receipt.
4. Server checks on-chain escrow state via `isEscrowActive(stakeKey, payer)` and then validates the full escrow record with `getEscrow(stakeKey)`.
5. Verification is **stateless** — no local escrow tracking, always queries chain.

### Fee-payer configuration

```ts
// Option A: Local account cosigns
stake({ ..., feePayer: viemAccount })

// Option B: External fee-payer RPC
stake({ ..., feePayer: "https://fee-payer.example.com" })
```

Fee-payer is auto-disabled on non-Tempo chains. When enabled, the server cosigns the client's batch transaction to cover gas.

---

## Request schema

Challenge requests contain:

```ts
{
  action: "createEscrow",     // Default, currently the only supported action
  amount: "5000000",          // Base-unit integer string
  beneficiary?: "0x...",      // Optional — defaults to payer
  contract: "0x...",
  counterparty: "0x...",
  policy?: "demo-document-v1",
  resource?: "documents/slug",
  stakeKey: "0xabcd...",      // 32-byte hex — binds challenge to escrow
  token: "0x...",
  description?: "...",
  methodDetails: {
    chainId: 42431,
    feePayer?: true,
  }
}
```

**Immutable fields** (must match exactly): `amount`, `counterparty`, `contract`, `stakeKey`, `token`, `action`, `chainId`, `feePayer`.

**Mutable fields** (can differ): `beneficiary`, `policy`, `resource`, `description`.

---

## Network presets

```ts
import { getNetworkPreset, getNetworkPresetByChainId } from "@gitbondhq/mppx-stake";

const preset = getNetworkPreset("tempoModerato");
// preset.chain, preset.rpcUrl, etc.
```

| Network | Chain ID | Batch calls | Fee-payer |
|---------|----------|-------------|-----------|
| `tempoModerato` | 42431 | Yes | Yes |
| `tempo` | — | Yes | Yes |
| `base` | 8453 | No | No |
| `ethereum` | 1 | No | No |

---

## Agent expectations

- Preserve package naming and export shape unless migration is explicitly requested.
- Keep changes within package boundary unless a companion contracts change is also requested.
- `chainId` is required on the server — there is no default. Always include it.
- All amounts are base-unit integer strings. Never pass decimal strings.
- When adding the stake method to an existing mppx setup, register it alongside (not replacing) other methods.
- DID source format for payer extraction: `did:pkh:eip155:${chainId}:${address}`.
- If the contract interface changes, regenerate ABI before updating SDK code.
