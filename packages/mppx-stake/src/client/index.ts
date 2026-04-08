import type { Account, Address } from 'viem'

import { createClientStake } from '../internal/stakeClient.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'

export type EnsureActiveStakeParameters = {
  beneficiary: Address
  beneficiaryAccount: Account
  payerAccount: Account
  request: StakeChallengeRequest
}

export type EnsureActiveStake = (
  parameters: EnsureActiveStakeParameters,
) => Promise<void>

export type ClientStakeParameters = {
  account: Account
  beneficiaryAccount?: Account | undefined
  ensureActiveStake?: EnsureActiveStake | undefined
  preset: NetworkPreset
}

/** Client-side `stake` method implementation used to create credentials. */
export const stake: (
  parameters: ClientStakeParameters & StakeMethodParameters,
) => ReturnType<ReturnType<typeof createClientStake>> = ({
  name,
  ...parameters
}) => createClientStake(createStakeMethod({ name }))(parameters)
