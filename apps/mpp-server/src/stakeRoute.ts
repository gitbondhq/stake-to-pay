import { randomBytes } from 'node:crypto'

import { parseStakeChallenge } from '@gitbondhq/mppx-stake'
import { Credential } from 'mppx'
import { isAddressEqual } from 'viem'

import type { AppConfig } from './config.js'

type HeaderMap = Record<string, string | string[] | undefined>

type CredentialRequest = {
  headers: HeaderMap
}

export type StakeRouteOptions = {
  amount: string
  externalId: string
  policy: string
  resource: string
  stakeKey: `0x${string}`
}

type StakeChallengeRequest = ReturnType<typeof parseStakeChallenge>['request']

const createStakeRouteOptions = (config: AppConfig): StakeRouteOptions => {
  const nonce = randomBytes(6).toString('hex')

  return {
    amount: config.stakeAmount,
    externalId: `document:${config.documentSlug}:${Date.now()}:${nonce}`,
    policy: config.stakePolicy,
    resource: config.stakeResource,
    stakeKey: `0x${randomBytes(32).toString('hex')}`,
  }
}

const getPaymentCredential = (req: CredentialRequest) => {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string') return null

  try {
    return Credential.deserialize(authorization)
  } catch {
    return null
  }
}

const getStakeChallengeRequest = (
  req: CredentialRequest,
  methodName: string,
) => {
  const credential = getPaymentCredential(req)
  if (!credential) return null

  try {
    return parseStakeChallenge(credential.challenge, {
      methodName,
    }).request
  } catch {
    return null
  }
}

const matchesConfiguredRoute = (
  config: AppConfig,
  request: StakeChallengeRequest | null,
): request is StakeChallengeRequest =>
  request !== null &&
  isAddressEqual(request.contract, config.stakeContract) &&
  isAddressEqual(request.counterparty, config.stakeCounterparty) &&
  isAddressEqual(request.token, config.stakeToken) &&
  request.methodDetails.chainId === config.networkPreset.chain.id &&
  request.resource === config.stakeResource &&
  (config.stakeBeneficiary
    ? request.beneficiary !== undefined &&
      isAddressEqual(request.beneficiary, config.stakeBeneficiary)
    : request.beneficiary === undefined)

export const resolveStakeRouteOptions = (
  req: CredentialRequest,
  config: AppConfig,
  methodName: string,
): StakeRouteOptions => {
  const challengeRequest = getStakeChallengeRequest(req, methodName)

  if (matchesConfiguredRoute(config, challengeRequest)) {
    return {
      amount: challengeRequest.amount,
      externalId:
        challengeRequest.externalId ?? `document:${config.documentSlug}:retry`,
      policy: challengeRequest.policy ?? config.stakePolicy,
      resource: config.stakeResource,
      stakeKey: challengeRequest.stakeKey,
    }
  }

  return createStakeRouteOptions(config)
}
