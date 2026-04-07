# @gitbondhq/mppx-stake

Stake intent method for [MPP](https://github.com/anthropics/mpp). Lock tokens in an on-chain escrow to gain access — refundable for well-behaved users, slashable for violations.

## Install

```sh
npm install @gitbondhq/mppx-stake
```

## Entry points

| Import | Purpose |
|--------|---------|
| `@gitbondhq/mppx-stake` | Core exports: `Methods.stake`, `MPPEscrowAbi`, network presets |
| `@gitbondhq/mppx-stake/client` | Client-side credential building |
| `@gitbondhq/mppx-stake/server` | Server-side escrow verification |
| `@gitbondhq/mppx-stake/abi` | Contract ABI only |

## Client usage

Register alongside other MPP methods:

```ts
import { Mppx, tempo } from "mppx/client";
import { stake } from "@gitbondhq/mppx-stake/client";

const mppx = Mppx.create({
  methods: [[...tempo({ account }), stake({ account })]],
});
```

Or standalone:

```ts
import { stake } from "@gitbondhq/mppx-stake/client";

const method = stake({ account });
```

## Server usage

```ts
import { Mppx } from "mppx/server";
import { stake } from "@gitbondhq/mppx-stake/server";

const mppx = Mppx.create({
  methods: [
    stake({
      chainId: 42431,
      contract: "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
      token: "0x20C0000000000000000000000000000000000000",
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});
```

The server method verifies escrow state on-chain — no local state tracking needed.

## Credential types

| Type | Flow |
|------|------|
| `transaction` | Client signs tx, server broadcasts |
| `hash` | Client broadcasts tx, sends hash to server |

## Network presets

Built-in presets for supported chains. The consuming app selects the active network:

```ts
import { getNetworkPreset } from "@gitbondhq/mppx-stake";

const preset = getNetworkPreset("tempoModerato");
// preset.chain, preset.rpcUrl, ...
```

## Notes

- Method identity: `method="stake"`, `intent="stake"`
- All token amounts are in base units (smallest denomination)
- This package only handles the stake method. For `charge`, `session`, or other intents, register those from `mppx` directly.
