import { Credential, Method, z } from 'mppx'

import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import * as Account from './account.js'
import type { EIP1193Provider } from './client.js'
import { createClient, providerSubmitCalls, submitCalls } from './client.js'
import { buildStakeCalls } from './tx.js'

type StakeMethod = Parameters<typeof Method.toClient>[0]

export type StakeParameters = {
  preset: NetworkPreset
  provider?: EIP1193Provider | undefined
} & Account.GetResolverParameters

/** Builds and broadcasts stake transactions, then returns the tx hash. */
export const createClientStake = (method: StakeMethod) => {
  return (parameters: StakeParameters) => {
    const preset = parameters.preset
    const getAccount = Account.getResolver({ account: parameters.account })

    return Method.toClient(method, {
      context: z.strictObject({
        account: z.optional(
          z.custom<Account.GetResolverParameters['account']>(),
        ),
      }),

      async createCredential({ challenge, context }) {
        const request = challenge.request as StakeChallengeRequest
        const chainId = request.methodDetails.chainId
        if (chainId !== preset.chain.id) {
          throw new Error(
            `challenge chainId ${chainId} does not match the ${preset.id} preset (${preset.chain.id}).`,
          )
        }

        const client = createClient(preset)
        const account = getAccount(client, context)
        const calls = buildStakeCalls({
          amount: BigInt(request.amount),
          beneficiary: request.beneficiary ?? account.address,
          contract: request.contract,
          counterparty: request.counterparty,
          token: request.token,
          stakeKey: request.stakeKey,
        })

        const source = `did:pkh:eip155:${chainId}:${account.address}`
        const hash = parameters.provider
          ? await providerSubmitCalls(
              client,
              account,
              calls,
              parameters.provider,
            )
          : await submitCalls(client, account, calls)

        return Credential.serialize({
          challenge,
          payload: { hash, type: 'hash' },
          source,
        })
      },
    })
  }
}
