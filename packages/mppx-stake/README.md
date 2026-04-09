# @gitbondhq/mppx-stake

Stake intent method for [MPP](https://github.com/anthropics/mpp). This package is a lightweight development kit for stake-to-pay primitives: clients prove beneficiary control for a `scope-active` escrow, and servers verify the active escrow on-chain.

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

The client method only signs an EIP-712 `scope-active` proof as the
beneficiary. It does not create escrows, submit transactions, or orchestrate
sponsorship flows. Any escrow creation or reuse checks should happen in the
calling app or wallet UX before invoking the MPP client.

When the challenged request omits `beneficiary`, this helper still emits a
`source` DID for the beneficiary signer. The server needs that DID as a hint so
it can reconstruct the EIP-712 message before recovering the beneficiary from
the signature.

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
      assertEscrowActive: async (client, contract, escrow) => {
        // Replace the default beneficiary-bound on-chain verification.
      },
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
3. runs `assertEscrowActive` to enforce escrow policy
4. validates the active escrow terms and principal

If `assertEscrowActive` is omitted, the default verifier checks on-chain active
stake by `(scope, beneficiary)` and validates the active escrow terms.

Verification is intentionally stateless. Production servers still need to store
and reject reused challenge IDs so the same credential cannot be replayed until
expiry.

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
- If stake terms can change over time, consider scope versioning instead of
  assuming any active escrow for a scope is always reusable
- `beneficiary` is the authorization subject; `payer` is the funding account
- This package only handles the stake method. For `charge`, `session`, or other intents, register those from `mppx` directly.
