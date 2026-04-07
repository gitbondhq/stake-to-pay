import { Credential, Method, z } from 'mppx'

import type { NetworkPreset } from '../networkConfig.js'
import * as Account from './account.js'
import type { EIP1193Provider } from './client.js'
import { createClient, providerSubmitCalls, submitCalls } from './client.js'
import { toTypedRequest } from './request.js'
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
        const typed = toTypedRequest(
          challenge.request as Parameters<typeof toTypedRequest>[0],
        )
        if (typed.chainId !== preset.chain.id) {
          throw new Error(
            `challenge chainId ${typed.chainId} does not match the ${preset.id} preset (${preset.chain.id}).`,
          )
        }

        const client = createClient(preset)
        const account = getAccount(client, context)
        const calls = buildStakeCalls({
          amount: typed.amount,
          beneficiary: typed.beneficiary ?? account.address,
          contract: typed.contract,
          counterparty: typed.counterparty,
          token: typed.token,
          stakeKey: typed.stakeKey,
        })

        const source = `did:pkh:eip155:${typed.chainId}:${account.address}`
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
