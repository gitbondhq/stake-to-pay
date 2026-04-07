import { Method, PaymentRequest } from 'mppx'
import type { Account as ViemAccount, Address, Hex } from 'viem'
import { isAddressEqual, parseTransaction } from 'viem'
import { getTransactionReceipt } from 'viem/actions'
import { Transaction } from 'viem/tempo'

import type { NetworkPreset } from '../networkConfig.js'
import type {
  StakeChallengeRequest,
  StakeCredentialPayload,
} from '../stakeSchema.js'
import { cosignWithFeePayer, createClient, submitRawSync } from './client.js'
import { toTypedRequest } from './request.js'
import { resolvePayerAndBeneficiary } from './source.js'
import {
  assertEscrowCreatedReceipt,
  assertEscrowOnChain,
  getSerializedTransaction,
  isTempoTransaction,
  matchStakeCalls,
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
  feePayer?: ViemAccount | string | undefined
  preset: NetworkPreset
}

/**
 * Turns the shared stake schema into a server method that can issue stake
 * challenges and verify either submitted tx hashes or signed tx payloads.
 */
export const createServerStake = (method: StakeMethod) => {
  return (parameters: StakeParameters) => {
    const preset = parameters.preset
    const feePayerUrl =
      typeof parameters.feePayer === 'string' ? parameters.feePayer : undefined
    const feePayer =
      typeof parameters.feePayer === 'object' ? parameters.feePayer : undefined

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
        const currentRequest = request as Record<string, unknown> & {
          feePayer?: boolean | undefined
        }
        const defaultFeePayer =
          (feePayer || feePayerUrl) && preset.capabilities.supportsFeePayer
            ? true
            : undefined

        return {
          ...currentRequest,
          chainId: preset.chain.id,
          ...(currentRequest.feePayer !== undefined
            ? { feePayer: currentRequest.feePayer }
            : defaultFeePayer !== undefined
              ? { feePayer: defaultFeePayer }
              : {}),
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
        const activeFeePayer = typed.feePayer === true ? feePayer : undefined
        const activeFeePayerUrl =
          typed.feePayer === true ? feePayerUrl : undefined
        const { beneficiary, payer } = resolvePayerAndBeneficiary(
          challengeRequest,
          credential.source,
        )
        const client = createClient(preset, activeFeePayerUrl)

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

        let receipt

        const payload = credential.payload as StakeCredentialPayload

        if (typed.feePayer === true && payload.type === 'hash')
          throw new Error(
            'Hash credentials are not allowed when methodDetails.feePayer is true.',
          )

        if (payload.type === 'hash')
          receipt = await getTransactionReceipt(client, {
            hash: payload.hash,
          })
        else {
          const serializedTransaction = getSerializedTransaction(payload)

          if (isTempoTransaction(serializedTransaction)) {
            const transaction = Transaction.deserialize(
              serializedTransaction as Transaction.TransactionSerializedTempo,
            )
            if (!transaction.signature || !transaction.from)
              throw new Error(
                'stake transactions must be signed by the payer first.',
              )

            matchStakeCalls({
              beneficiary,
              calls: transaction.calls ?? [],
              challenge: challengeRequest,
              payer,
            })

            const feeToken = transaction.feeToken as Address | undefined
            const finalTransaction = activeFeePayer
              ? await cosignWithFeePayer(
                  client,
                  preset,
                  serializedTransaction,
                  activeFeePayer,
                  feeToken,
                )
              : serializedTransaction

            receipt = await submitRawSync(client, finalTransaction)
          } else {
            // Standard EIP-1559 transaction (single-call permit flow).
            if (activeFeePayer)
              throw new Error(
                'Fee payer cosigning requires a Tempo batch transaction.',
              )

            const transaction = parseTransaction(serializedTransaction)
            if (
              !transaction.to ||
              !('data' in transaction) ||
              !transaction.data
            )
              throw new Error('Standard transaction missing to or data.')

            matchStakeCalls({
              beneficiary,
              calls: [
                {
                  to: transaction.to as Address,
                  data: transaction.data as Hex,
                },
              ],
              challenge: challengeRequest,
              payer,
            })

            receipt = await submitRawSync(client, serializedTransaction)
          }
        }

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
    [
      'feePayer',
      currentRequest.methodDetails.feePayer === true,
      challengeRequest.methodDetails.feePayer === true,
    ],
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
