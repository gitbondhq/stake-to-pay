import { Method, PaymentRequest, type Credential } from 'mppx'
import type { Address } from 'viem'
import { getTransactionReceipt } from 'viem/actions'

import type { NetworkPreset } from '../networkConfig.js'
import type {
  StakeChallengeRequest,
  StakeCredentialPayload,
} from '../stakeSchema.js'
import { createClient } from './client.js'
import { resolvePayer } from './source.js'
import {
  assertEscrowCreatedReceipt,
  assertEscrowOnChain,
  toReceipt,
} from './tx.js'

type StakeMethod = Parameters<typeof Method.toServer>[0] & { name: string }

export type StakeDefaults = {
  contract?: Address | undefined
  counterparty?: Address | undefined
  token?: Address | undefined
  description?: string | undefined
}

export type StakeParameters = StakeDefaults & {
  preset: NetworkPreset
}

/** Issues stake challenges and verifies submitted tx hashes. */
export const createServerStake = (method: StakeMethod) => {
  return (parameters: StakeParameters) => {
    const preset = parameters.preset

    return Method.toServer(method, {
      defaults: {
        contract: parameters.contract,
        counterparty: parameters.counterparty,
        token: parameters.token,
        description: parameters.description,
        methodDetails: {
          chainId: preset.chain.id,
        },
      },

      async request({ credential, request }) {
        const echoedRequest = getEchoedChallengeRequest(credential, method)

        return {
          ...(request as Record<string, unknown>),
          ...echoedRequest,
          methodDetails: {
            chainId: preset.chain.id,
          },
        }
      },

      async verify({ credential, request }) {
        const challengeRequest = credential.challenge
          .request as StakeChallengeRequest
        const currentRequest = PaymentRequest.fromMethod(method, {
          ...(request as Record<string, unknown>),
          methodDetails: {
            chainId: preset.chain.id,
          },
        }) as StakeChallengeRequest
        assertRequestMatches(currentRequest, challengeRequest)

        const chainId = challengeRequest.methodDetails.chainId
        const amount = BigInt(challengeRequest.amount)
        const payer = resolvePayer(chainId, credential.source)
        const client = createClient(preset)
        const payload = credential.payload as StakeCredentialPayload
        const beneficiary = challengeRequest.beneficiary ?? payer

        const verifyParams = {
          beneficiary,
          counterparty: challengeRequest.counterparty,
          token: challengeRequest.token,
          payer,
          value: amount,
        }
        const receiptParams = {
          ...verifyParams,
          contract: challengeRequest.contract,
          stakeKey: challengeRequest.stakeKey,
        }

        const receipt = await getTransactionReceipt(client, {
          hash: payload.hash,
        })

        assertEscrowCreatedReceipt(receipt, receiptParams)
        await assertEscrowOnChain(
          client,
          challengeRequest.contract,
          challengeRequest.stakeKey,
          verifyParams,
        )

        return toReceipt(receipt, method.name)
      },
    })
  }
}

const assertRequestMatches = (
  currentRequest: StakeChallengeRequest,
  challengeRequest: StakeChallengeRequest,
) => {
  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    [
      'counterparty',
      currentRequest.counterparty,
      challengeRequest.counterparty,
    ],
    ['contract', currentRequest.contract, challengeRequest.contract],
    ['externalId', currentRequest.externalId, challengeRequest.externalId],
    ['policy', currentRequest.policy, challengeRequest.policy],
    ['resource', currentRequest.resource, challengeRequest.resource],
    ['stakeKey', currentRequest.stakeKey, challengeRequest.stakeKey],
    ['token', currentRequest.token, challengeRequest.token],
    [
      'chainId',
      currentRequest.methodDetails.chainId,
      challengeRequest.methodDetails.chainId,
    ],
  ] as const

  for (const [label, expected, received] of pairs)
    if (String(expected) !== String(received))
      throw new Error(`Challenge ${label} does not match this route.`)
}

const getEchoedChallengeRequest = (
  credential: Credential.Credential | null | undefined,
  method: StakeMethod,
): Partial<Pick<StakeChallengeRequest, 'externalId' | 'stakeKey'>> => {
  if (!credential) return {}
  if (
    credential.challenge.method !== method.name ||
    credential.challenge.intent !== method.intent
  ) {
    return {}
  }

  const parsed = method.schema.request.safeParse(credential.challenge.request)
  if (!parsed.success) return {}
  const echoedRequest = parsed.data as StakeChallengeRequest

  return {
    ...(echoedRequest.externalId ? { externalId: echoedRequest.externalId } : {}),
    stakeKey: echoedRequest.stakeKey,
  }
}
