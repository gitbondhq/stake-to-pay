import { access, mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { parseStakeChallenge, type StakeChallenge } from '@gitbondhq/mppx-stake'
import { Credential } from 'mppx'

import { resolveProtectedResourceUrl } from './context.js'
import { fetchWithOptions } from './http.js'
import { requiredString } from './parsing.js'

export const defaultChallengesDirectory = 'challenges'
export const defaultCredentialFilePath = 'credential.txt'

export async function resolveStakeChallengeForRespond(options: {
  challengeFile?: string
  url?: string
}): Promise<StakeChallenge> {
  if (options.url && options.challengeFile) {
    throw new Error('Pass either --url or --challenge-file, not both.')
  }

  if (options.url) {
    return fetchStakeChallenge(resolveProtectedResourceUrl(options.url))
  }

  if (options.challengeFile) {
    return loadStakeChallengeFromFile(options.challengeFile)
  }

  const latestChallengeFilePath = await resolveLatestChallengeFilePath()
  if (latestChallengeFilePath) {
    return loadStakeChallengeFromFile(latestChallengeFilePath)
  }

  return fetchStakeChallenge(resolveProtectedResourceUrl())
}

export async function loadStakeChallengeFromFile(
  path: string,
): Promise<StakeChallenge> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const challenge =
    parsed &&
    typeof parsed === 'object' &&
    'challenge' in parsed &&
    parsed.challenge
      ? parsed.challenge
      : parsed

  return parseStakeChallenge(challenge)
}

export async function resolveSerializedCredential(options: {
  credentialFile?: string
}): Promise<string> {
  const value = await readSerializedCredentialFromFile(
    options.credentialFile ?? defaultCredentialFilePath,
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

async function fetchStakeChallenge(url: string): Promise<StakeChallenge> {
  const response = await fetchWithOptions({ url })

  if (response.status !== 402) {
    throw new Error(
      `Expected a 402 challenge response from ${url}, received ${response.status}.`,
    )
  }

  return parseStakeChallenge(response)
}

export async function resolveChallengeOutputPath(
  path?: string,
): Promise<string> {
  const resolvedPath = path?.trim() || createTimestampedChallengeFilePath()
  await mkdir(dirname(resolvedPath), { recursive: true })
  return resolvedPath
}

export async function resolveChallengeFilePath(path?: string): Promise<string> {
  if (path?.trim()) {
    return path.trim()
  }

  const latestChallengeFilePath = await resolveLatestChallengeFilePath()
  if (latestChallengeFilePath) {
    return latestChallengeFilePath
  }

  throw new Error(
    `No saved challenge found. Run \`stake-mpp challenge fetch\` first or pass --file.`,
  )
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveLatestChallengeFilePath(): Promise<string | undefined> {
  if (!(await fileExists(defaultChallengesDirectory))) {
    return undefined
  }

  const entries = await readdir(defaultChallengesDirectory, {
    withFileTypes: true,
  })
  const latest = entries
    .filter(
      entry =>
        entry.isFile() && entry.name.toLowerCase().endsWith('-challenge.json'),
    )
    .map(entry => entry.name)
    .sort()
    .at(-1)

  return latest ? join(defaultChallengesDirectory, latest) : undefined
}

function createTimestampedChallengeFilePath(now = new Date()): string {
  return join(
    defaultChallengesDirectory,
    `${formatTimestampForFilename(now)}-challenge.json`,
  )
}

function formatTimestampForFilename(value: Date): string {
  return value.toISOString().replaceAll(':', '-')
}
