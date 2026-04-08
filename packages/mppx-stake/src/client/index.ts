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

type StakeClientReturn = ReturnType<ReturnType<typeof createClientStake>>

/** Client-side `stake` method implementation used to create credentials. */
export const stake = ({
  name,
  ...parameters
}: ClientStakeParameters & StakeMethodParameters): StakeClientReturn =>
  createClientStake(createStakeMethod({ name }))(parameters)
