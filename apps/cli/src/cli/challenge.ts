import { readFile } from 'node:fs/promises'

import { Credential } from 'mppx'
import {
  parseStakeChallenge,
  type StakeChallenge,
} from '@gitbondhq/mpp-stake'

import { repoConfig } from './context.js'
import { fetchWithOptions } from './http.js'
import { requiredString } from './parsing.js'

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

  return parseStakeChallenge(challenge, {
    methodName: repoConfig.methodName,
  })
}

export function getStakeChallengeFromResponse(response: Response): StakeChallenge {
  return parseStakeChallenge(response, {
    methodName: repoConfig.methodName,
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
