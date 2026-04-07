import {
  createClientStake,
  type StakeParameters as ClientStakeParameters,
} from '../internal/stakeClient.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'

/** Client-side `stake` method implementation used to create credentials. */
export const stake: (
  parameters: ClientStakeParameters & StakeMethodParameters,
) => ReturnType<ReturnType<typeof createClientStake>> = ({
  name,
  ...parameters
}) => createClientStake(createStakeMethod({ name }))(parameters)
