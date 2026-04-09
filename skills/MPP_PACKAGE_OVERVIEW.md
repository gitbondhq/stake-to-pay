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
  account,              // Default account used to sign the beneficiary proof
  beneficiaryAccount,   // Optional separate signer for the beneficiary proof
})
```

### How client credentials work

1. Client receives a 402 challenge with stake request fields including `scope`.
2. The calling app or wallet ensures an active escrow already exists for `(scope, beneficiary)`.
3. SDK signs an EIP-712 `scope-active` proof as the beneficiary.
4. SDK produces a single public credential:
   - `type: "scope-active"` — credential contains the beneficiary signature.

### Gotchas

- `scope` must be stable for the protected resource or policy.
- `beneficiary` is the access subject; `account` is only the default signer used by the client helper.
- If the challenge specifies `beneficiary`, the beneficiary signing account must match it.
- If the challenge omits `beneficiary`, the client credential still needs a `source` DID so the server can reconstruct the signed EIP-712 message before recovering the beneficiary.

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
  beneficiary,      // Optional — if present, challenge expects this beneficiary
  description,      // Optional — human-readable
  name,             // Optional — method name (default: inferred)
})
```

### How server verification works

1. Server issues 402 challenge with stake request fields.
2. Client submits a `scope-active` credential.
3. Server recovers the beneficiary from the signature.
4. Server checks on-chain escrow state via `isEscrowActive(scope, beneficiary)` and then validates the full active escrow record with `getActiveEscrow(scope, beneficiary)`.
5. Verification is **stateless** — no local escrow tracking, always queries chain.
6. Production servers must add challenge-id replay protection on top of this reference verifier.

---

## Request schema

Challenge requests contain:

```ts
{
  amount: "5000000",          // Base-unit integer string
  beneficiary?: "0x...",      // Optional expected beneficiary
  contract: "0x...",
  counterparty: "0x...",
  policy?: "demo-document-v1",
  resource?: "documents/slug",
  scope: "0xabcd...",         // 32-byte hex — stable protected-surface id
  token: "0x...",
  description?: "...",
  methodDetails: {
    chainId: 42431,
  }
}
```

**Immutable fields** (must match exactly): `amount`, `beneficiary` if present, `counterparty`, `contract`, `scope`, `token`, `chainId`.

**Mutable fields** (can differ): `policy`, `resource`, `description`.

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
- DID source format for beneficiary extraction: `did:pkh:eip155:${chainId}:${address}`.
- If the contract interface changes, regenerate ABI before updating SDK code.
