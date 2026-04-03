# Chain portability refactor map

This document is the concrete migration plan for making this repository chain-portable without losing the current Tempo Moderato happy path.

The immediate target is not "support every chain in one pass." The target is:

- keep `tempoModerato` as the default preset
- make Base and Ethereum cheap to enable with light config changes
- isolate Tempo-specific features behind an adapter boundary
- document the shape of future Solana support without implementing it in this MVP

## Prelaunch refactor policy

This repository should be treated as prelaunch infrastructure.

That means this plan explicitly assumes:

- there are no legacy users we need to preserve compatibility for
- there is no requirement to keep old SDK APIs, CLI flags, config names, package boundaries, or internal method shapes stable
- breaking changes are acceptable when they reduce coupling and make the architecture simpler
- compatibility shims, deprecation layers, and dual-path migrations should be avoided unless they materially reduce implementation risk during the refactor itself

Working rule:

- prefer deleting or renaming Tempo-centric abstractions over preserving them behind wrappers
- prefer one clean preset/config model over supporting multiple generations of env vars and command shapes
- preserve the product intent and the default Tempo Moderato flow, but do not preserve accidental API surface just because it exists today
- prefer exporting the smallest useful primitive, not a convenience bundle that drags unrelated protocol methods into this package
- prefer checked-in config files for repo-wide non-secret settings, and reserve env vars for secrets and runtime overrides

## Template simplicity policy

This repository is a sample/template for teams who want to build their own staking paywalls.

That should drive the architecture:

- keep the default experience simple
- prefer obvious, teachable code paths over generalized framework machinery
- avoid over-engineering multi-network orchestration into the template
- ship a working default out of the box on `tempoModerato`
- allow operators to change the selected chain in config without needing a large rewrite

Important scope constraint:

- this repo only needs to support one selected chain at a time
- it does not need to support multiple chains concurrently in one running app instance
- "support Base and Ethereum" means "make them lightweight config swaps," not "run Tempo, Base, and Ethereum side-by-side at once"

Working rule:

- optimize for clarity and template value first
- add abstraction only when it makes the one-chain-at-a-time path cleaner
- reject designs that introduce a multi-chain control plane the sample app does not actually need

## Goals

- Preserve the repo as a simple template that users can run with minimal setup.
- Preserve the current escrow contract flow on Tempo Moderato.
- Make the TypeScript SDK, CLI, and server treat Tempo as one adapter, not the root abstraction.
- Make standard EVM transport the baseline path.
- Make chain presets explicit and composable.
- Avoid a large contract rewrite. Most of the work should stay inside `packages/mppx-escrow`.

## Non-goals

- Do not implement Solana support in this phase.
- Do not replace `MPPEscrow` with a non-EVM escrow primitive.
- Do not try to unify EVM and Solana transaction signing under one transport implementation yet.
- Do not remove Tempo-specific optimizations; move them behind capabilities instead.
- Do not spend time on backward compatibility layers for pre-refactor SDK, CLI, or config patterns.
- Do not build multi-chain runtime support where one server or app instance manages several active chains at once.
- Do not turn the sample/template into a generic cross-chain orchestration framework.

## Current coupling that should be removed

These files currently blur generic EVM behavior with Tempo-specific behavior:

- `packages/mppx-escrow/src/internal/chains.ts`
- `packages/mppx-escrow/src/internal/client.ts`
- `packages/mppx-escrow/src/internal/tx.ts`
- `packages/mppx-escrow/src/internal/stakeServer.ts`
- `packages/mppx-escrow/src/internal/chainMethods.ts`
- `packages/mppx-escrow/src/tempo/client/*`
- `packages/mppx-escrow/src/tempo/server/*`
- `apps/mpp-server/src/config.ts`
- `apps/cli/src/index.ts`

These public types and wrappers also currently overreach:

- `packages/mppx-escrow/src/base/client/Methods.ts`
- `packages/mppx-escrow/src/base/server/Methods.ts`
- `packages/mppx-escrow/src/tempo/client/Methods.ts`
- `packages/mppx-escrow/src/tempo/server/Methods.ts`

They currently bundle unrelated upstream methods such as `charge`, `settle`, and `session` together with `stake`. That is convenience-oriented, but it makes this package look like an owner of the full method surface instead of a focused `stake` extension.

The Solidity contract is already close to generic EVM:

- `contracts/src/MPPEscrow.sol`
- `contracts/script/DeployMPPEscrow.s.sol`

The contract package should stay thin. The portability work belongs primarily in `packages/mppx-escrow`.

## Desired package shape

The end state should look like this:

```text
packages/mppx-escrow/src/
├── core/             # chain-family-agnostic challenge, credential, config, errors
├── evm/              # generic EVM methods, tx building, decoding, verification
├── tempo/            # Tempo transport extensions and presets
├── solana-docs/      # docs-only stubs or typed placeholders, no runtime logic yet
├── client/           # public client entrypoints
├── server/           # public server entrypoints
└── abi/              # EVM ABI artifacts
```

Important constraint:

- `core` must not import `viem/tempo`, Tempo chain presets, ERC-2612 helpers, or any EVM ABI code.
- `evm` may depend on `viem`.
- `tempo` may depend on `viem/tempo`.
- Solana remains documentation-only for now. No runtime adapter should be shipped until there is a real Solana escrow or proof flow.
- The package should export `stake` as the primary primitive. It should not export a full method bundle that implicitly owns `charge`, `settle`, or `session`.

## Core abstractions to stabilize

These concepts should become the durable protocol surface:

- `network`
- `asset`
- `amount`
- `beneficiary`
- `counterparty`
- `stakeKey`
- `challenge`
- `credential`
- `submissionMode`
- `verificationReceipt`

These concepts should be adapter-specific:

- EVM address parsing
- ABI calldata encoding and decoding
- ERC20 `approve` and `permit`
- Tempo batch envelopes
- Tempo fee payer behavior
- serialized transaction shape
- Solana account metas and instruction encoding

These concepts should stay out of this package's primary public API:

- ownership of upstream non-stake methods
- a bundled "all methods" client shape
- a bundled "all methods" server shape

Apps can compose `stake` with upstream methods themselves.

## Network and capability model

The repo should stop treating "Tempo" as the base method family. It should treat Tempo as a preset plus an extension of EVM capabilities.

Use a registry shape like:

```ts
type NetworkFamily = "evm" | "solana";

type NetworkCapabilities = {
  supportsBatchCalls: boolean;
  supportsFeePayer: boolean;
  supportsEscrowContract: boolean;
};

type NetworkPreset = {
  id: "tempoModerato" | "tempo" | "base" | "ethereum";
  family: NetworkFamily;
  chainId?: number;
  rpcUrlEnv: string;
  defaultRpcUrl?: string;
  escrowContractEnv?: string;
  capabilities: NetworkCapabilities;
};
```

`permit` should not be modeled as a chain capability. It is a token feature and
should continue to be detected at runtime per token by probing the ERC-2612
surface, then falling back to the legacy approve-plus-create flow when absent.

Recommended initial presets:

- `tempoModerato`
- `tempo`
- `base`
- `ethereum`

Recommended defaults:

- default preset: `tempoModerato`
- default family: `evm`
- default write flow: standard EVM single transaction or `approve + createEscrow`
- Tempo batch and fee payer enabled only when the selected preset exposes those capabilities

Migration bias:

- when an existing API shape conflicts with this model, change the API shape rather than carrying both patterns
- if an env var, method name, or module boundary is Tempo-centric, rename it once rather than aliasing it indefinitely
- if a wrapper exports upstream methods that are not owned by this package, remove that wrapper rather than preserving it for convenience

## Configuration policy

This refactor should reduce env-var sprawl.

Use checked-in config files for:

- selected network preset
- chain presets and capability declarations
- known contract addresses for non-secret environments
- feature flags and transport policy
- repo-wide or app-wide defaults that should be visible in code review

Use env vars for:

- private keys
- RPC API keys or authenticated RPC URLs
- deployment-only secrets
- local machine overrides
- CI overrides where checked-in defaults are not appropriate

Working rule:

- non-secret defaults belong in config, not scattered env vars
- env vars should override config when needed, not define the entire architecture
- Base and Ethereum support should usually be activated by selecting a preset in config, not by assembling many environment variables by hand
- the config should select one active chain for the app, not several active chains at once

Recommended shape:

- repo-level typed config for shared defaults and presets
- app-level config files for CLI/server-specific behavior
- env vars layered on top for secrets and final overrides

Example direction:

```ts
// mpp.config.ts
export default defineMppConfig({
  network: "tempoModerato",
  presets: {
    tempoModerato: { family: "evm", chainId: 365, supportsBatchCalls: true, supportsFeePayer: true },
    tempo: { family: "evm", chainId: 360, supportsBatchCalls: true, supportsFeePayer: true },
    base: { family: "evm", chainId: 8453, supportsBatchCalls: false, supportsFeePayer: false },
    ethereum: { family: "evm", chainId: 1, supportsBatchCalls: false, supportsFeePayer: false },
  },
})
```

And then at the app layer:

```ts
// apps/mpp-server/mpp.config.ts
export default defineServerConfig({
  network: "tempoModerato",
  escrowContract: "0x...",
})
```

The exact file names can change. The important part is the split:

- config files define the intended repo behavior, including the selected preset
- env vars provide secrets and environment-specific overrides
- a single checked-in config selects the one active chain the template is running against

## Concrete refactor stages

### Stage 1: Introduce explicit network presets

Primary files:

- a new typed config entrypoint such as `mpp.config.ts`
- `packages/mppx-escrow/src/internal/chains.ts`
- `apps/mpp-server/src/config.ts`
- `apps/cli/src/index.ts`

Changes:

- Replace Tempo-only chain registration with a preset registry.
- Add `tempoModerato`, `tempo`, `base`, and `ethereum`.
- Make checked-in config select a named preset first, rather than hard-coding Tempo assumptions in app code.
- Move repo-wide non-secret settings out of env vars and into typed config.
- Keep env vars only as overrides for secrets and deployment/runtime differences.
- Allow a single top-level override such as `MPP_NETWORK=tempoModerato` when an operator needs to override the checked-in default.

Exit criteria:

- The server and CLI can boot on Tempo Moderato, Base, or Ethereum by changing config rather than code.
- Tempo remains the default preset.
- Old Tempo-only config names are either removed or kept only as short-lived internal aliases during the implementation branch, not as part of the target architecture.
- Repo-wide defaults live in config files that can be reviewed in git, rather than being implied by undocumented env vars.
- The selected config still resolves to one active chain at runtime.

### Stage 2: Split generic protocol logic from transport logic

Primary files:

- `packages/mppx-escrow/src/internal/request.ts`
- `packages/mppx-escrow/src/internal/stakeMethod.ts`
- `packages/mppx-escrow/src/internal/chainMethods.ts`
- `packages/mppx-escrow/src/client/index.ts`
- `packages/mppx-escrow/src/server/index.ts`

Changes:

- Create a `core/` area for challenge schema, credential schema, config parsing, shared errors, and method selection.
- Move request normalization, challenge parsing, and shared method metadata into `core/`.
- Keep all EVM transaction parsing out of `core/`.
- Remove the current bundled `ChainClientMethods` and `ChainServerMethods` pattern from the target architecture.
- Make the main public export a `stake` registration primitive rather than a method set that includes `charge`, `settle`, or `session`.
- Prefer explicit method composition in apps, for example `[...tempo(...), stake(...)]`, rather than adding helper APIs just to append one method.

Exit criteria:

- `core/` has no `viem` dependency.
- `client/` and `server/` public entrypoints compose adapters through `core`, rather than importing Tempo-specific logic directly.
- Public types are allowed to change if that produces a cleaner boundary between `core`, `evm`, and `tempo`.
- The package can be consumed as "register `stake` into my own method set" rather than "import this repo's full bundled method set."

### Stage 3: Create a generic EVM adapter

Primary files:

- `packages/mppx-escrow/src/internal/client.ts`
- `packages/mppx-escrow/src/internal/tx.ts`
- `packages/mppx-escrow/src/internal/stakeServer.ts`
- `packages/mppx-escrow/src/abi/*`

Changes:

- Move generic EVM transaction construction into `src/evm/client/`.
- Move generic EVM verification and transaction decoding into `src/evm/server/`.
- Move ERC20 and escrow ABI helpers into `src/evm/abi` or keep `src/abi` as the EVM-only artifact area.
- Treat standard EIP-1559 transaction payloads as the baseline credential format for EVM.

Exit criteria:

- Base and Ethereum work without importing `viem/tempo`.
- Generic EVM verification logic does not branch on Tempo by default.
- EVM APIs are allowed to replace Tempo-centric method names if that makes the generic path clearer.

### Stage 4: Reduce Tempo to an extension adapter

Primary files:

- `packages/mppx-escrow/src/tempo/client/*`
- `packages/mppx-escrow/src/tempo/server/*`
- any Tempo-specific logic still remaining under `src/internal/*`

Changes:

- Keep Tempo-specific transaction envelopes in `tempo/`.
- Keep `sendCallsSync`, fee payer support, and Tempo batch parsing in `tempo/`.
- Make Tempo extend the EVM adapter rather than replace it.

Exit criteria:

- Tempo-specific code can be removed from an EVM-only build without breaking Base or Ethereum.
- The only difference between Tempo and Base/Ethereum is preset selection plus optional capability paths.
- Tempo wrappers should stay thin; do not recreate Tempo-centered naming at the root package level.

### Stage 5: Thin the apps to configuration and orchestration

Primary files:

- `apps/mpp-server/src/index.ts`
- `apps/mpp-server/src/config.ts`
- `apps/cli/src/index.ts`

Changes:

- Server chooses a preset and instantiates the correct adapter via `@gitbondhq/mppx-escrow/server`.
- CLI uses the selected preset to decide whether Tempo-only flags are available.
- Demo app stops importing Tempo assumptions directly and relies on shared preset metadata.
- Apps compose `stake` with whatever upstream methods they actually need. This package should stop re-exporting `charge`, `settle`, and `session` as part of its primary API.

Exit criteria:

- Apps do not contain chain-family logic beyond selecting a preset.
- Base and Ethereum support are mostly a config concern.
- CLI and server flags/env vars may be renamed to match the new preset model, even if that is a breaking change.
- `apps/mpp-server` can register only the methods it actually serves, instead of inheriting a larger bundled surface from this package.

### Stage 6: Solana docs-only support

This repo should document Solana support shape without shipping runtime code yet.

Recommended docs-only additions in this phase:

- describe Solana as a separate adapter family, not an EVM extension
- define the minimum interface a Solana adapter must satisfy
- document that Solana requires its own escrow program or proof primitive
- document that EVM ABI, ERC20 permit, and serialized EVM transaction payloads do not generalize to Solana

Suggested placeholder shape:

```ts
type AdapterFamily = "evm" | "solana";

type ChallengeAdapter = {
  family: AdapterFamily;
  createCredential(input: unknown): Promise<unknown>;
  verifyCredential(input: unknown): Promise<unknown>;
};
```

Important rule:

- Do not add fake Solana runtime code just to make the package tree look symmetrical. That creates false confidence. Documentation and interface placeholders are enough for now.

## File-by-file map

This is the minimal concrete move list.

### Move or replace

- `packages/mppx-escrow/src/internal/request.ts`
  - move shared challenge parsing into `src/core/request.ts`
- `packages/mppx-escrow/src/internal/stakeMethod.ts`
  - move method metadata into `src/core/methods.ts`
- `packages/mppx-escrow/src/internal/chainMethods.ts`
  - split into `src/core/registry.ts` and adapter registration files
- `packages/mppx-escrow/src/internal/client.ts`
  - split generic EVM client logic into `src/evm/client/`
- `packages/mppx-escrow/src/internal/stakeServer.ts`
  - split generic EVM verification into `src/evm/server/`
- `packages/mppx-escrow/src/internal/tx.ts`
  - split generic EVM decoding into `src/evm/tx.ts`
  - keep Tempo-specific envelope handling in `src/tempo/tx.ts`

### Thin wrappers to keep

- `packages/mppx-escrow/src/client/index.ts`
- `packages/mppx-escrow/src/server/index.ts`
- selected adapter entrypoints under `packages/mppx-escrow/src/base/*`
- selected adapter entrypoints under `packages/mppx-escrow/src/tempo/*`

These should become small public wrappers around the new `core`, `evm`, and `tempo` internals.

They should not continue to act as broad method bundles for unrelated protocol methods.

## Default configuration model

The simplest operator-facing model after the refactor is a typed config file plus a small env-var override layer.

Checked-in config:

```ts
// mpp.config.ts
export default defineMppConfig({
  network: "tempoModerato",
  presets: {
    tempoModerato: {
      family: "evm",
      chainId: 365,
      escrowContract: "0x...",
    },
    base: {
      family: "evm",
      chainId: 8453,
      escrowContract: "0x...",
    },
    ethereum: {
      family: "evm",
      chainId: 1,
      escrowContract: "0x...",
    },
  },
})
```

Env-var override layer:

```dotenv
MPP_NETWORK=tempoModerato
MPP_RPC_URL=
MPP_ESCROW_CONTRACT=
```

Behavior:

- if `MPP_NETWORK` is omitted, use the preset selected in the checked-in config
- if `MPP_RPC_URL` is set, it overrides the preset RPC default for that environment
- if `MPP_ESCROW_CONTRACT` is set, it overrides the checked-in contract address
- secrets such as private keys should remain env-only and should not move into config files

Why this is the right default:

- Tempo Moderato remains the easiest path for the current product.
- Base and Ethereum become one-line config changes.
- The CLI and server no longer need bespoke Tempo branching to choose the active chain.
- Repo behavior becomes visible in source control instead of being hidden in shell setup.
- The template stays simple because it chooses one chain at a time instead of managing several concurrently.

## Testing plan tied to the refactor

The migration should be validated in layers.

### Unit tests

- `core` tests for challenge parsing and config resolution
- `evm` tests for ABI encoding, decoding, and verification
- `tempo` tests only for Tempo-specific transport extensions

### Integration tests

- server verification on `tempoModerato`
- server verification on Base
- server verification on Ethereum
- CLI command smoke tests against a local EVM chain

### Contract tests

- keep Foundry tests unchanged unless the contract surface changes
- avoid mixing chain portability work into contract security logic

## Risks to control during the refactor

- Do not let "multi-chain" turn into "everything is optional and loosely typed."
- Do not let Solana placeholders leak into runtime flows prematurely.
- Do not keep Tempo-specific transaction handling in generic EVM utilities.
- Do not duplicate challenge schema logic across CLI, server, and SDK.

## Acceptance criteria

The refactor is done when all of these are true:

- The repo is still understandable as a sample/template, not a generalized orchestration framework.
- Tempo Moderato is still the default preset.
- Base and Ethereum work by selecting a preset, not by editing code paths.
- Tempo batch and fee payer behavior are isolated to a Tempo adapter.
- `packages/mppx-escrow` exposes a generic EVM path that does not import Tempo-specific modules.
- Solana support is documented clearly enough that a future implementation can be started without reopening the architecture question.
- The resulting API surface is simpler than the current one, even if that required breaking changes.
- The primary public API exports `stake` as a focused extension point, not a wrapped protocol bundle containing `charge`, `settle`, or `session`.
- The runtime model still assumes one active chain per app instance.

## Recommended implementation order

Build this in the following order:

1. preset registry and config cleanup
2. `core` extraction
3. generic EVM adapter extraction
4. Tempo adapter reduction
5. app and CLI migration
6. Solana documentation pass

That order keeps the current Tempo flow working while reducing coupling in the highest-value package first.
