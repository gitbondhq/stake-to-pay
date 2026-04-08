# @gitbondhq/mppx-stake

Stake intent method for [MPP](https://github.com/anthropics/mpp). This package is a lightweight development kit for stake-to-pay primitives: clients ensure an escrow exists for a `scope`, then prove beneficiary control with a `scope-active` signature.

## Install

```sh
npm install @gitbondhq/mppx-stake
```

## Entry points

| Import | Purpose |
|--------|---------|
| `@gitbondhq/mppx-stake` | Core exports: `stakeMethod`, `clientStake`, `serverStake`, `MPPEscrowAbi`, network preset types |
| `@gitbondhq/mppx-stake/client` | Client-side active-stake proof creation |
| `@gitbondhq/mppx-stake/server` | Server-side active-stake verification |
| `@gitbondhq/mppx-stake/abi` | Contract ABI only |

## Challenge model

Stake requests are centered on a stable `scope`:

```json
{
  "amount": "5000000",
  "beneficiary": "0x1234...",
  "contract": "0x651B...",
  "counterparty": "0x742d...",
  "scope": "0xabcd...",
  "token": "0x20c0...",
  "methodDetails": {
    "chainId": 42431
  }
}
```

The public credential is a single proof type:

```json
{
  "signature": "0x...",
  "type": "scope-active"
}
```

## Client usage

Register alongside other MPP methods:

```ts
import { Mppx, tempo } from "mppx/client";
import { stake } from "@gitbondhq/mppx-stake/client";
import { tempoModerato } from "viem/chains";

const preset = {
  chain: tempoModerato,
  family: "evm",
  id: "tempoModerato",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
} as const;

const mppx = Mppx.create({
  methods: [[...tempo({ account }), stake({ account, name: "tempo", preset })]],
});
```

By default the client:

1. checks `isEscrowActive(scope, beneficiary)`
2. creates a new escrow only if none is active
3. signs an EIP-712 `scope-active` proof as the beneficiary

If you need custom stake-creation behavior, pass `ensureActiveStake`:

```ts
const method = stake({
  account: payerAccount,
  beneficiaryAccount,
  ensureActiveStake: async ({ beneficiary, payerAccount, request }) => {
    // custom tx orchestration, sponsorship, or wallet UX
  },
  name: "tempo",
  preset,
});
```

## Server usage

```ts
import { Mppx } from "mppx/server";
import { serverStake } from "@gitbondhq/mppx-stake";
import { tempoModerato } from "viem/chains";

const preset = {
  chain: tempoModerato,
  family: "evm",
  id: "tempoModerato",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
} as const;

const mppx = Mppx.create({
  methods: [
    serverStake({
      name: "tempo",
      preset,
      contract: "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
      token: "0x20C0000000000000000000000000000000000000",
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});
```

The server:

1. verifies the challenged `scope`
2. recovers the beneficiary from the `scope-active` signature
3. checks on-chain active stake by `(scope, beneficiary)`
4. validates the active escrow terms and principal

No tx-hash receipt exchange is part of the public protocol anymore.

## Network preset objects

This package does not ship a named preset registry. The consuming app provides the preset object it wants to use:

```ts
import type { NetworkPreset } from "@gitbondhq/mppx-stake";
import { tempoModerato } from "viem/chains";

const preset: NetworkPreset = {
  chain: tempoModerato,
  family: "evm",
  id: "tempoModerato",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
};
```

## Notes

- Method identity: `method="stake"`, `intent="stake"`
- All token amounts are base-unit integer strings
- `scope` should be stable for the protected surface being authorized
- If stake terms can change over time, consider scope versioning and/or a
  custom `ensureActiveStake` hook instead of assuming any active escrow for a
  scope is always reusable
- `beneficiary` is the authorization subject; `payer` is the funding account
- This package only handles the stake method. For `charge`, `session`, or other intents, register those from `mppx` directly.
