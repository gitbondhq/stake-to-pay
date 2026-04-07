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

- `skills/E2E_STAKE_DEMO.md` — use when someone wants to run the demo, try stake for the first time, or walk through the full 402 → escrow → access flow.
- `skills/CONTRACTS_DEPLOY_MPPESCROW.md` — use when asked to deploy `MPPEscrow` (any chain) or to prepare/validate cast-wallet deployment state.
- `skills/CLI_DEPLOY_MPPX.md` — use for CLI escrow operations, the challenge-response pipeline, and CLI tooling work.
- `skills/MPP_PACKAGE_OVERVIEW.md` — use for `@gitbondhq/mppx-stake` SDK integration, client/server wiring, ABI updates, or package changes.
- `skills/APP_MPP_SERVER.md` — use for `apps/mpp-server` maintenance, config, route changes, or debugging 402/credential issues.

## How to choose a skill

Use a skill when the task is operational and repeatable:

1. First-time setup or end-to-end demo: use `skills/E2E_STAKE_DEMO.md`.
2. Contract deployment (`forge script`, cast wallets, env prep): use `skills/CONTRACTS_DEPLOY_MPPESCROW.md`.
3. CLI commands (escrow ops, challenge flow, tooling): use `skills/CLI_DEPLOY_MPPX.md`.
4. SDK integration (`@gitbondhq/mppx-stake` client/server config, exports, ABI): use `skills/MPP_PACKAGE_OVERVIEW.md`.
5. Demo server work (routes, config, debugging): use `skills/APP_MPP_SERVER.md`.

If a relevant skill file exists, read it before running deployment-like or operational commands.

## Safety reminders

- Never commit secrets.
- `example.env` is a template only; `.env` should stay local.
- For deployment, use cast keystore workflow rather than raw private-key env vars.
