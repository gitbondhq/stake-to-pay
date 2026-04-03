import { readFile } from 'node:fs/promises'

import { Challenge, Credential } from 'mppx'

import { stakeMethod } from './context.js'
import { fetchWithOptions } from './http.js'
import { requiredString } from './parsing.js'
import type {
  StakeChallengeRequest,
  StakeMethodInput,
} from './types.js'

type StakeChallenge = Challenge.Challenge<StakeChallengeRequest, 'stake', string>

export async function resolveStakeChallengeForRespond(options: {
  challengeFile?: string
  header?: string[]
  method?: string
  url?: string
}): Promise<StakeChallenge> {
  if (options.url && options.challengeFile) {
    throw new Error('Pass either --url or --challenge-file, not both.')
  }

  if (options.url) {
    const response = await fetchWithOptions({
      headers: options.header,
      method: options.method,
      url: options.url,
    })

    if (response.status !== 402) {
      throw new Error(
        `Expected a 402 challenge response from ${options.url}, received ${response.status}.`,
      )
    }

    return getStakeChallengeFromResponse(response)
  }

  if (options.challengeFile) {
    return loadStakeChallengeFromFile(options.challengeFile)
  }

  throw new Error('Missing challenge source. Pass --url or --challenge-file.')
}

export async function loadStakeChallengeFromFile(path: string): Promise<StakeChallenge> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const challenge =
    parsed &&
    typeof parsed === 'object' &&
    'challenge' in parsed &&
    parsed.challenge
      ? parsed.challenge
      : parsed

  return normalizeStakeChallenge(challenge)
}

export function getStakeChallengeFromResponse(response: Response): StakeChallenge {
  return Challenge.fromResponse(response, {
    methods: [stakeMethod],
  }) as StakeChallenge
}

export function withPullSubmission(challenge: StakeChallenge): StakeChallenge {
  const request = toStakeMethodInput(challenge.request)

  return Challenge.fromMethod(stakeMethod, {
    description: challenge.description,
    digest: challenge.digest,
    expires: challenge.expires,
    id: challenge.id,
    ...(challenge.opaque ? { meta: challenge.opaque } : {}),
    realm: challenge.realm,
    request: {
      ...request,
      submission: 'pull',
    },
  }) as StakeChallenge
}

export async function resolveSerializedCredential(options: {
  credential?: string
  credentialFile?: string
}): Promise<string> {
  if (options.credential && options.credentialFile) {
    throw new Error('Pass either --credential or --credential-file, not both.')
  }

  const serialized =
    options.credential ??
    (options.credentialFile
      ? await readSerializedCredentialFromFile(options.credentialFile)
      : undefined)

  const value = requiredString(
    serialized,
    'Missing credential. Pass --credential or --credential-file.',
  )

  Credential.deserialize(value)
  return value
}

function normalizeStakeChallenge(value: unknown): StakeChallenge {
  const parsed = Challenge.Schema.parse(value)

  if (parsed.method !== stakeMethod.name || parsed.intent !== stakeMethod.intent) {
    throw new Error(
      `Expected a ${stakeMethod.name}/${stakeMethod.intent} challenge, received ${parsed.method}/${parsed.intent}.`,
    )
  }

  return Challenge.fromMethod(stakeMethod, {
    description: parsed.description,
    digest: parsed.digest,
    expires: parsed.expires,
    id: parsed.id,
    ...(parsed.opaque ? { meta: parsed.opaque } : {}),
    realm: parsed.realm,
    request: toStakeMethodInput(parsed.request as StakeChallengeRequest),
  }) as StakeChallenge
}

function toStakeMethodInput(request: StakeChallengeRequest): StakeMethodInput {
  return {
    amount: request.amount,
    ...(request.methodDetails.beneficiary
      ? { beneficiary: request.methodDetails.beneficiary }
      : {}),
    chainId: request.methodDetails.chainId,
    contract: request.contract,
    counterparty: request.methodDetails.counterparty,
    token: request.token,
    ...(request.description ? { description: request.description } : {}),
    ...(request.externalId ? { externalId: request.externalId } : {}),
    ...(request.methodDetails.policy ? { policy: request.methodDetails.policy } : {}),
    ...(request.methodDetails.resource ? { resource: request.methodDetails.resource } : {}),
    stakeKey: request.methodDetails.stakeKey,
    ...(request.methodDetails.submission
      ? { submission: request.methodDetails.submission }
      : {}),
  }
}

async function readSerializedCredentialFromFile(path: string): Promise<string> {
  const raw = (await readFile(path, 'utf8')).trim()

  try {
    const parsed = JSON.parse(raw) as unknown

    if (typeof parsed === 'string') return parsed

    if (
      parsed &&
      typeof parsed === 'object' &&
      'credential' in parsed &&
      typeof parsed.credential === 'string'
    ) {
      return parsed.credential
    }
  } catch {
    // Raw credential string, handled below.
  }

  return raw
}
