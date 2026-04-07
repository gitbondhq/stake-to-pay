import {
  createServerStake,
  type StakeParameters as ServerStakeParameters,
} from '../internal/stakeServer.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const stake: (
  parameters: ServerStakeParameters & StakeMethodParameters,
) => ReturnType<ReturnType<typeof createServerStake>> = ({
  name,
  ...parameters
}) => createServerStake(createStakeMethod({ name }))(parameters)
