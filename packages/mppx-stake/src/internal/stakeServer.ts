import { Method, PaymentRequest } from 'mppx'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'
import { getTransactionReceipt } from 'viem/actions'

import type { NetworkPreset } from '../networkConfig.js'
import type {
  StakeChallengeRequest,
  StakeCredentialPayload,
} from '../stakeSchema.js'
import { createClient } from './client.js'
import { toTypedRequest } from './request.js'
import { resolvePayerAndBeneficiary } from './source.js'
import {
  assertEscrowCreatedReceipt,
  assertEscrowOnChain,
  toReceipt,
} from './tx.js'

type StakeMethod = Parameters<typeof Method.toServer>[0] & { name: string }

export type StakeDefaults = {
  beneficiary?: Address | undefined
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
        beneficiary: parameters.beneficiary,
        chainId: preset.chain.id,
        contract: parameters.contract,
        counterparty: parameters.counterparty,
        token: parameters.token,
        description: parameters.description,
      },

      async request({ request }) {
        const rest = { ...(request as Record<string, unknown>) }
        delete rest.feePayer

        return {
          ...rest,
          chainId: preset.chain.id,
        }
      },

      async verify({ credential, request }) {
        const challengeRequest = credential.challenge
          .request as StakeChallengeRequest
        const currentRequest = PaymentRequest.fromMethod(method, {
          ...(request as Record<string, unknown>),
          chainId: preset.chain.id,
        }) as StakeChallengeRequest
        assertRequestMatches(currentRequest, challengeRequest)

        const typed = toTypedRequest(challengeRequest)
        if (typed.feePayer === true)
          throw new Error('feePayer-backed stake challenges are not supported.')

        const { beneficiary, payer } = resolvePayerAndBeneficiary(
          challengeRequest,
          credential.source,
        )
        const client = createClient(preset)
        const payload = credential.payload as StakeCredentialPayload

        const verifyParams = {
          beneficiary,
          counterparty: typed.counterparty,
          token: typed.token,
          payer,
          value: typed.amount,
        }
        const receiptParams = {
          ...verifyParams,
          contract: typed.contract,
          stakeKey: typed.stakeKey,
        }

        const receipt = await getTransactionReceipt(client, {
          hash: payload.hash,
        })

        assertEscrowCreatedReceipt(receipt, receiptParams)
        await assertEscrowOnChain(
          client,
          typed.contract,
          typed.stakeKey,
          verifyParams,
        )

        return toReceipt(receipt, method.name)
      },
    })
  }
}

/**
 * Verifies that the request currently being served still matches the original
 * challenge fields the client responded to.
 */
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

  const currentBeneficiary = currentRequest.beneficiary
  const challengeBeneficiary = challengeRequest.beneficiary
  if (
    !currentBeneficiary !== !challengeBeneficiary ||
    (currentBeneficiary &&
      challengeBeneficiary &&
      !isAddressEqual(
        currentBeneficiary as Address,
        challengeBeneficiary as Address,
      ))
  )
    throw new Error('Challenge beneficiary does not match this route.')
}
