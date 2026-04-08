import {
  createServerStake,
  type StakeParameters as ServerStakeParameters,
} from '../internal/stakeServer.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'

type StakeServerReturn = ReturnType<ReturnType<typeof createServerStake>>

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const stake = ({
  name,
  ...parameters
}: ServerStakeParameters & StakeMethodParameters): StakeServerReturn =>
  createServerStake(createStakeMethod({ name }))(parameters)
