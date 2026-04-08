import type { Account } from 'viem'

import { createClientStake } from '../internal/stakeClient.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'

export type ClientStakeParameters = {
  account: Account
  beneficiaryAccount?: Account | undefined
  preset: NetworkPreset
}

/** Client-side `stake` method implementation used to create credentials. */
export const stake: (
  parameters: ClientStakeParameters & StakeMethodParameters,
) => ReturnType<ReturnType<typeof createClientStake>> = ({
  name,
  ...parameters
}) => createClientStake(createStakeMethod({ name }))(parameters)
