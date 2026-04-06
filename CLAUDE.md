# CLAUDE.md

## Repository snapshot

- Monorepo: contracts, apps, and packages are coordinated in one workspace.
- Root workspace entry point is this directory.
- Main section: `contracts/` (Foundry: Solidity source, tests, scripts).
- Main section: `apps/` (demo app, cli tooling).
- Main section: `packages/` (shared TS packages, including `@gitbondhq/mppx-stake`).
- Main section: `skills/` (agent operational playbooks).

## Preferred repo orientation

- Start in root unless a task is clearly scoped to a sub-project.
- Read required files once, then apply edits.
- Prefer minimal, targeted changes and keep style aligned with existing code.

## Agent playbook index

This repo uses task-specific skills in `skills/`:

- `skills/CONTRACTS_DEPLOY_MPPESCROW.md` — use when asked to deploy `MPPEscrow` (any chain) or to prepare/validate cast-wallet deployment state.
- `skills/CLI_DEPLOY_MPPX.md` — use for CLI-focused agent tasks related to stake-mpp tooling and CLI verification/commands.
- `skills/MPP_PACKAGE_OVERVIEW.md` — use for `packages/mppx-stake` SDK/API package work, ABI updates, or client/server integration changes.

## How to choose a skill

Use a skill when the task is operational and repeatable:

1. Contract deployment request (`forge script`, cast wallets, env prep): use `skills/CONTRACTS_DEPLOY_MPPESCROW.md`.
2. CLI workflow request (tooling UX, commands, auth, integrations): use `skills/CLI_DEPLOY_MPPX.md` (add/use other `skills/CLI_*.md` files as needed).
3. Package SDK request (`@gitbondhq/mppx-stake` behavior, examples, exports, ABI updates): use `skills/MPP_PACKAGE_OVERVIEW.md`.

If a relevant skill file exists, read it before running deployment-like or operational commands.

## Safety reminders

- Never commit secrets.
- `example.env` is a template only; `.env` should stay local.
- For deployment, use cast keystore workflow rather than raw private-key env vars.
