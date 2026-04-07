import type { Account, Hex } from 'viem'

import { createClientStake } from '../internal/stakeClient.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'

export type GetTransactionHashParameters = {
  account: Account
  request: StakeChallengeRequest
}

export type GetTransactionHash = (
  parameters: GetTransactionHashParameters,
) => Promise<Hex>

export type ClientStakeParameters = {
  account: Account
  getTransactionHash?: GetTransactionHash | undefined
  preset: NetworkPreset
}

/** Client-side `stake` method implementation used to create credentials. */
export const stake: (
  parameters: ClientStakeParameters & StakeMethodParameters,
) => ReturnType<ReturnType<typeof createClientStake>> = ({
  name,
  ...parameters
}) => createClientStake(createStakeMethod({ name }))(parameters)
