import { readFileSync } from 'node:fs'

import { type Address, getAddress, isAddress } from 'viem'

export type RepoConfig = {
  chainId: number
  escrow: {
    amount: string
    contract?: Address
    counterparty?: Address
    description: string
    policy: string
    token: Address
    tokenWhitelist: Address[]
  }
}

export function loadRepoConfig(repoConfigPath: URL): RepoConfig {
  return parseRepoConfig(JSON.parse(readFileSync(repoConfigPath, 'utf8')))
}

const parseRepoConfig = (value: unknown): RepoConfig => {
  if (!value || typeof value !== 'object') {
    throw new Error('config.json must be an object.')
  }

  const raw = value as {
    chainId?: unknown
    escrow?: unknown
  }

  if (
    typeof raw.chainId !== 'number' ||
    !Number.isSafeInteger(raw.chainId) ||
    raw.chainId <= 0
  ) {
    throw new Error('config.json chainId must be a positive integer.')
  }

  return {
    chainId: raw.chainId,
    escrow: parseEscrow(raw.escrow),
  }
}

const parseEscrow = (value: unknown): RepoConfig['escrow'] => {
  if (!value || typeof value !== 'object') {
    throw new Error('config.json escrow must be an object.')
  }
  const raw = value as Record<string, unknown>

  const tokenWhitelist = requiredAddressArray(
    raw.tokenWhitelist,
    'escrow.tokenWhitelist',
  )
  const token = requiredAddress(raw.token, 'escrow.token')
  if (
    !tokenWhitelist.some(
      candidate => candidate.toLowerCase() === token.toLowerCase(),
    )
  ) {
    throw new Error(
      'config.json escrow.token must be included in escrow.tokenWhitelist.',
    )
  }

  return {
    amount: requiredBaseUnitAmount(raw.amount, 'escrow.amount'),
    ...(raw.contract === undefined || raw.contract === null
      ? {}
      : { contract: requiredAddress(raw.contract, 'escrow.contract') }),
    ...(raw.counterparty === undefined || raw.counterparty === null
      ? {}
      : {
          counterparty: requiredAddress(
            raw.counterparty,
            'escrow.counterparty',
          ),
        }),
    description: requiredString(raw.description, 'escrow.description'),
    policy: requiredString(raw.policy, 'escrow.policy'),
    token,
    tokenWhitelist,
  }
}

const requiredAddress = (value: unknown, label: string): Address => {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`config.json ${label} must be a valid EVM address.`)
  }
  return getAddress(value)
}

const requiredAddressArray = (value: unknown, label: string): Address[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`config.json ${label} must be a non-empty address array.`)
  }
  return value.map((item, index) => requiredAddress(item, `${label}[${index}]`))
}

const requiredBaseUnitAmount = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`config.json ${label} must be a base-unit integer string.`)
  }
  return value
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`config.json ${label} must be a non-empty string.`)
  }
  return value.trim()
}
