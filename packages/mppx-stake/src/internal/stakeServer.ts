import { Method, PaymentRequest, Store, type Credential } from 'mppx'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import { stake as createStakeMethod } from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import type {
  StakeChallengeRequest,
  StakeCredentialPayload,
} from '../stakeSchema.js'
import { createClient } from './client.js'
import { recoverScopeActiveProofSigner } from './scopeActiveProof.js'
import { assertSourceDidMatches, resolveBeneficiary } from './source.js'
import {
  assertEscrowOnChain as defaultAssertEscrowOnChain,
  toReceipt,
} from './tx.js'

/** The concrete stake method type produced by `Methods.stake`. */
export type StakeMethod = ReturnType<typeof createStakeMethod>

export type StakeDefaults = {
  contract?: Address
  counterparty?: Address
  token?: Address
  description?: string
}

export type AssertEscrowActive = typeof defaultAssertEscrowOnChain

export type StakeReplayStoreItemMap = {
  [key: `mppx:stake:challenge:${string}`]: number
}

export type StakeParameters = StakeDefaults & {
  assertEscrowActive?: AssertEscrowActive
  preset: NetworkPreset
  store?: Store.Store<StakeReplayStoreItemMap>
}

/** Issues stake challenges and verifies beneficiary-controlled scope-active proofs. */
export const createServerStake = (method: StakeMethod) => {
  return (parameters: StakeParameters) => {
    const assertEscrowActive =
      parameters.assertEscrowActive ?? defaultAssertEscrowOnChain
    const preset = parameters.preset
    const store =
      (parameters.store ?? Store.memory()) as Store.Store<StakeReplayStoreItemMap>

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

      async request({
        credential,
        request,
      }: {
        credential?: Parameters<Method.RequestFn<StakeMethod>>[0]['credential']
        request: Parameters<Method.RequestFn<StakeMethod>>[0]['request']
      }) {
        const echoedRequest = getEchoedChallengeRequest(credential, method)

        return {
          ...request,
          ...echoedRequest,
          methodDetails: {
            chainId: preset.chain.id,
          },
        }
      },

      async verify({
        credential,
        request,
      }: {
        credential: Parameters<Method.VerifyFn<StakeMethod>>[0]['credential']
        request: Parameters<Method.VerifyFn<StakeMethod>>[0]['request']
      }) {
        const challengeRequest = credential.challenge
          .request as StakeChallengeRequest
        const currentRequest = PaymentRequest.fromMethod(method, {
          ...request,
          methodDetails: {
            chainId: preset.chain.id,
          },
        }) as StakeChallengeRequest
        assertRequestMatches(currentRequest, challengeRequest)

        const chainId = challengeRequest.methodDetails.chainId
        const hintedBeneficiary =
          challengeRequest.beneficiary ??
          resolveBeneficiary(chainId, credential.source)
        const beneficiary = await recoverScopeActiveProofSigner({
          amount: challengeRequest.amount,
          beneficiary: hintedBeneficiary,
          chainId,
          challengeId: credential.challenge.id,
          contract: challengeRequest.contract,
          counterparty: challengeRequest.counterparty,
          expires: credential.challenge.expires,
          scope: challengeRequest.scope,
          signature: (credential.payload as StakeCredentialPayload).signature,
          token: challengeRequest.token,
        })

        if (
          challengeRequest.beneficiary &&
          !isAddressEqual(challengeRequest.beneficiary, beneficiary)
        ) {
          throw new Error(
            'Recovered beneficiary does not match the challenged beneficiary.',
          )
        }

        assertSourceDidMatches(chainId, credential.source, beneficiary)

        await assertChallengeUnused(store, credential.challenge.id)
        await markChallengeUsed(store, credential.challenge.id)

        try {
          const client = createClient(preset)
          await assertEscrowActive(client, challengeRequest.contract, {
            beneficiary,
            counterparty: challengeRequest.counterparty,
            scope: challengeRequest.scope,
            token: challengeRequest.token,
            value: BigInt(challengeRequest.amount),
          })
        } catch (error) {
          await clearChallengeUse(store, credential.challenge.id)
          throw error
        }

        return toReceipt(
          {
            beneficiary,
            contract: challengeRequest.contract,
            scope: challengeRequest.scope,
          },
          method.name,
        )
      },
    })
  }
}

const assertRequestMatches = (
  currentRequest: StakeChallengeRequest,
  challengeRequest: StakeChallengeRequest,
) => {
  assertOptionalAddress(
    'beneficiary',
    currentRequest.beneficiary,
    challengeRequest.beneficiary,
  )
  assertAddress(
    'counterparty',
    currentRequest.counterparty,
    challengeRequest.counterparty,
  )
  assertAddress('contract', currentRequest.contract, challengeRequest.contract)
  assertAddress('token', currentRequest.token, challengeRequest.token)

  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    ['externalId', currentRequest.externalId, challengeRequest.externalId],
    ['policy', currentRequest.policy, challengeRequest.policy],
    ['resource', currentRequest.resource, challengeRequest.resource],
    ['scope', currentRequest.scope, challengeRequest.scope],
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

const assertAddress = (
  label: string,
  expected: Address,
  received: Address,
) => {
  if (!isAddressEqual(expected, received))
    throw new Error(`Challenge ${label} does not match this route.`)
}

const assertOptionalAddress = (
  label: string,
  expected: Address | undefined,
  received: Address | undefined,
) => {
  if (!expected && !received) return
  if (!expected || !received || !isAddressEqual(expected, received))
    throw new Error(`Challenge ${label} does not match this route.`)
}

const getEchoedChallengeRequest = (
  credential: Credential.Credential | null | undefined,
  method: StakeMethod,
): Partial<Pick<StakeChallengeRequest, 'beneficiary' | 'externalId' | 'scope'>> => {
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
    ...(echoedRequest.beneficiary
      ? { beneficiary: echoedRequest.beneficiary }
      : {}),
    ...(echoedRequest.externalId
      ? { externalId: echoedRequest.externalId }
      : {}),
    scope: echoedRequest.scope,
  }
}

const getChallengeStoreKey = (
  challengeId: string,
): `mppx:stake:challenge:${string}` => `mppx:stake:challenge:${challengeId}`

const assertChallengeUnused = async (
  store: Store.Store<StakeReplayStoreItemMap>,
  challengeId: string,
): Promise<void> => {
  const seen = await store.get(getChallengeStoreKey(challengeId))
  if (seen !== null) throw new Error('Challenge has already been used.')
}

const markChallengeUsed = async (
  store: Store.Store<StakeReplayStoreItemMap>,
  challengeId: string,
): Promise<void> => {
  await store.put(getChallengeStoreKey(challengeId), Date.now())
}

const clearChallengeUse = async (
  store: Store.Store<StakeReplayStoreItemMap>,
  challengeId: string,
): Promise<void> => store.delete(getChallengeStoreKey(challengeId))
