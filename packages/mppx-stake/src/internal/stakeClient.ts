import { Credential, Method } from 'mppx'
import type { Account, Hex } from 'viem'

import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import { createClient, submitCalls } from './client.js'
import { buildStakeCalls } from './tx.js'

type GetTransactionHash = (parameters: {
  account: Account
  request: StakeChallengeRequest
}) => Promise<Hex>

type ClientStakeParameters = {
  account: Account
  getTransactionHash?: GetTransactionHash | undefined
  preset: NetworkPreset
}

/** Builds and broadcasts stake transactions, then returns the tx hash. */
export const createClientStake = (
  method: Parameters<typeof Method.toClient>[0],
) => {
  return (parameters: ClientStakeParameters) => {
    const preset = parameters.preset
    const account = parameters.account

    return Method.toClient(method, {
      async createCredential({ challenge }) {
        const request = challenge.request as StakeChallengeRequest
        const chainId = request.methodDetails.chainId
        if (chainId !== preset.chain.id) {
          throw new Error(
            `challenge chainId ${chainId} does not match the ${preset.id} preset (${preset.chain.id}).`,
          )
        }

        const source = `did:pkh:eip155:${chainId}:${account.address}`
        const hash = parameters.getTransactionHash
          ? await parameters.getTransactionHash({
              account,
              request,
            })
          : await submitCalls(
              createClient(preset),
              account,
              buildStakeCalls({
                amount: BigInt(request.amount),
                beneficiary: request.beneficiary ?? account.address,
                contract: request.contract,
                counterparty: request.counterparty,
                token: request.token,
                stakeKey: request.stakeKey,
              }),
            )

        return Credential.serialize({
          challenge,
          payload: { hash, type: 'hash' },
          source,
        })
      },
    })
  }
}
