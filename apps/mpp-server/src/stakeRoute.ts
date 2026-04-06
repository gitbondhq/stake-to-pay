import { randomBytes } from 'node:crypto'

import { Credential } from 'mppx'

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

type StakeChallengeRequest = {
  amount: string
  counterparty?: string
  externalId?: string
  policy?: string
  resource?: string
  stakeKey: `0x${string}`
  methodDetails?: {
    feePayer?: boolean
  }
}

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

const isStakeChallengeRequest = (
  value: unknown,
): value is StakeChallengeRequest => {
  if (!isRecord(value)) return false

  const request = value
  const methodDetails = request.methodDetails

  return (
    typeof request.amount === 'string' &&
    isOptionalString(request.counterparty) &&
    isOptionalString(request.externalId) &&
    isOptionalString(request.policy) &&
    isOptionalString(request.resource) &&
    typeof request.stakeKey === 'string' &&
    request.stakeKey.startsWith('0x') &&
    (methodDetails === undefined ||
      (isRecord(methodDetails) && isOptionalBoolean(methodDetails.feePayer)))
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean'

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string'

export const resolveStakeRouteOptions = (
  req: CredentialRequest,
  config: AppConfig,
  methodName: string,
): StakeRouteOptions => {
  const credential = getPaymentCredential(req)

  if (
    credential?.challenge.intent === 'stake' &&
    credential.challenge.method === methodName &&
    isStakeChallengeRequest(credential.challenge.request) &&
    credential.challenge.request.counterparty === config.stakeCounterparty &&
    credential.challenge.request.resource === config.stakeResource
  ) {
    return {
      amount: credential.challenge.request.amount,
      externalId:
        typeof credential.challenge.request.externalId === 'string'
          ? credential.challenge.request.externalId
          : `document:${config.documentSlug}:retry`,
      policy:
        typeof credential.challenge.request.policy === 'string'
          ? credential.challenge.request.policy
          : config.stakePolicy,
      resource: config.stakeResource,
      stakeKey: credential.challenge.request.stakeKey,
    }
  }

  return createStakeRouteOptions(config)
}
