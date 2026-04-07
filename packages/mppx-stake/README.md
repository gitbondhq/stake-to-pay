# @gitbondhq/mppx-stake

Stake intent method for [MPP](https://github.com/anthropics/mpp). Lock tokens in an on-chain escrow to gain access — refundable for well-behaved users, slashable for violations.

## Install

```sh
npm install @gitbondhq/mppx-stake
```

## Entry points

| Import | Purpose |
|--------|---------|
| `@gitbondhq/mppx-stake` | Core exports: `stakeMethod`, `clientStake`, `serverStake`, `MPPEscrowAbi`, network preset types |
| `@gitbondhq/mppx-stake/client` | Client-side credential building |
| `@gitbondhq/mppx-stake/server` | Server-side escrow verification |
| `@gitbondhq/mppx-stake/abi` | Contract ABI only |

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

Or standalone:

```ts
import { stake } from "@gitbondhq/mppx-stake/client";
import { tempoModerato } from "viem/chains";

const preset = {
  chain: tempoModerato,
  family: "evm",
  id: "tempoModerato",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
} as const;

const method = stake({ account, name: "tempo", preset });
```

If a UI wants to control transaction submission itself, pass
`getTransactionHash`. The callback receives the account and stake request, then
returns the final `createEscrow` transaction hash:

```ts
const method = stake({
  account,
  getTransactionHash: async ({ account, request }) => {
    await submitApproval(account, request);
    return submitCreateEscrow(account, request);
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

The server method verifies escrow state on-chain — no local state tracking needed.
The preset supplies the chain metadata, including `chain.id`.

## Credential types

| Type | Flow |
|------|------|
| `hash` | Client broadcasts tx, sends hash to server |

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
- All token amounts are in base units (smallest denomination)
- This package only handles the stake method. For `charge`, `session`, or other intents, register those from `mppx` directly.
