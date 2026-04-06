# AGENTS.md

## Scope

This file gives agent operators quick routing for work in this repository.

## Repo structure (high level)

- `contracts/`
- `contracts/src/`: smart contracts (e.g., `MPPEscrow.sol`)
- `contracts/test/`: Forge test suite
- `contracts/script/`: deployment/admin scripts
- `apps/`
- `apps/demo/`: end-user UI demo
- `apps/cli/`: command-line tooling
- `apps/mpp-server/`: standalone Express demo server that gates a fake document behind a `tempo/stake` paywall
- `packages/`
- `packages/mppx-stake/`: MPP stake TypeScript SDK + ABI/type exports
- `packages/ui/`: shared UI components
- `packages/eslint-config/`: shared lint rules
- `packages/typescript-config/`: shared TS config
- `skills/`
- `skills/`: operational playbooks and reusable agent guidance

## Skill routing

When a request is received, apply the relevant skill first:

1. Smart-contract deploy or cast-wallet transaction workflow: use `skills/CONTRACTS_DEPLOY_MPPESCROW.md`.
2. CLI command or agent-tooling work: use `skills/CLI_DEPLOY_MPPX.md` for deploy-facing CLI tasks and create/use other `skills/CLI_*.md` files for broader CLI workflows.
3. Package/SDK work (`@gitbondhq/mppx-stake` APIs, ABI, build artifacts): use `skills/MPP_PACKAGE_OVERVIEW.md`.
4. Standalone MPP stake-paywall server work in `apps/mpp-server/`: use `skills/APP_MPP_SERVER.md`.

## Deployment playbook usage

- Confirm `.env` values exist before any on-chain action.
- Validate cast account + sender alignment before broadcast.
- Run dry-run once, then broadcast in a controlled command.
- Return contract address and broadcast output for handoff.

## Communication defaults

- Keep outputs concise.
- Include exact commands run and exact errors if commands fail.
- Favor deterministic, repeatable sequences over heuristic/manual steps.
