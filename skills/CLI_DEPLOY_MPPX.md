# Skill: CLI_DEPLOY_MPPX

## Scope

Use this playbook for CLI-related tasks that interact with stake-mpp tooling.

## Common intent

- Confirm CLI package layout and entry points.
- Run CLI checks or commands in workspace context.
- Add/validate CLI flows that call on-chain proof/verification workflows.

## Routing

1. Start from root workspace.
2. Open workspace package config:
   - `apps/cli`
3. Resolve dependencies from root `package.json` / workspace graph before executing CLI commands.

## Helpful commands

- `npm run build --workspace @stake-mpp/cli`
- `npm run lint --workspace @stake-mpp/cli`
- `cd apps/cli && npm run <cmd>`

## Agent expectations

- Keep command examples scoped to the exact task.
- Prefer non-destructive checks before mutating changes.
- If a user asks for deployment-related work, confirm whether they mean contract deployment (`contracts/` skill) or CLI deployment UX.
