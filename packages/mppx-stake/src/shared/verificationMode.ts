/**
 * Shared client/server toggle for owner-agnostic stake checks.
 *
 * Defaults to `true`. Set `mode: false` only when your deployment
 * intentionally skips beneficiary ownership proof creation and verification.
 */
export type StakeVerificationModeParameters = {
  mode?: boolean
}

export const shouldVerifyScopeActiveProof = (
  parameters: StakeVerificationModeParameters,
) => parameters.mode !== false
