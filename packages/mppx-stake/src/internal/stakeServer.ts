import { Method, PaymentRequest, type Credential } from 'mppx'
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
import { assertEscrowOnChain, toReceipt } from './tx.js'

/** The concrete stake method type produced by `Methods.stake`. */
export type StakeMethod = ReturnType<typeof createStakeMethod>

export type StakeDefaults = {
  contract?: Address | undefined
  counterparty?: Address | undefined
  token?: Address | undefined
  description?: string | undefined
}

export type StakeParameters = StakeDefaults & {
  preset: NetworkPreset
}

/** Issues stake challenges and verifies beneficiary-controlled scope-active proofs. */
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
          ...request,
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
          beneficiary: hintedBeneficiary,
          chainId,
          challengeId: credential.challenge.id,
          contract: challengeRequest.contract,
          expires: credential.challenge.expires,
          scope: challengeRequest.scope,
          signature: (credential.payload as StakeCredentialPayload).signature,
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

        const client = createClient(preset)
        await assertEscrowOnChain(client, challengeRequest.contract, {
          beneficiary,
          counterparty: challengeRequest.counterparty,
          scope: challengeRequest.scope,
          token: challengeRequest.token,
          value: BigInt(challengeRequest.amount),
        })

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
  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    ['beneficiary', currentRequest.beneficiary ?? '', challengeRequest.beneficiary ?? ''],
    [
      'counterparty',
      currentRequest.counterparty,
      challengeRequest.counterparty,
    ],
    ['contract', currentRequest.contract, challengeRequest.contract],
    ['externalId', currentRequest.externalId, challengeRequest.externalId],
    ['policy', currentRequest.policy, challengeRequest.policy],
    ['resource', currentRequest.resource, challengeRequest.resource],
    ['scope', currentRequest.scope, challengeRequest.scope],
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
    ...(echoedRequest.externalId ? { externalId: echoedRequest.externalId } : {}),
    scope: echoedRequest.scope,
  }
}
