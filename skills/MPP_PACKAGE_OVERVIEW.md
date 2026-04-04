# Skill: MPP_PACKAGE_OVERVIEW

## Scope

Use this playbook for requests in the `packages/mppx-escrow` domain.

## Common intent

- Update SDK exports, ABI wiring, or helper client/server functions.
- Inspect generated ABI files and verify alignment with on-chain contract changes.
- Review sample credential flows and verification logic.
- Validate TypeScript type surface when adding new protocol-facing APIs.

## Routing

1. Start in `packages/mppx-escrow`.
2. Confirm whether request touches:
   - SDK runtime imports/exports
   - ABI regeneration artifacts
   - Example usage in client/server layers
3. Keep contract/CLI docs aligned with any public API changes.

## Helpful commands

- `npm run build:mppx-escrow`
- `npm run generate:abi:mppx-escrow`
- `npm run lint --workspace=@gitbondhq/mppx-escrow`
- Regenerate ABI from contract output only when contract interface changed.

## Agent expectations

- Preserve package naming and existing export shape unless migration is explicitly requested.
- Keep changes limited to package boundary unless a companion contracts change is explicitly requested.
