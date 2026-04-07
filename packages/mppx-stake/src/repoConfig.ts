import { type Address, getAddress, isAddress } from 'viem'

import { type NetworkPreset, parseNetworkPreset } from './networkConfig.js'

export type RepoConfig = {
  escrow: {
    amount: string
    contract?: Address | undefined
    counterparty?: Address | undefined
    description: string
    policy: string
    token: Address
    tokenWhitelist: Address[]
  }
  methodName: string
  networkPreset: NetworkPreset
}

export const parseRepoConfig = (value: unknown): RepoConfig => {
  if (!value || typeof value !== 'object') {
    throw new Error('config.json must be an object.')
  }

  const raw = value as {
    escrow?: {
      amount?: unknown
      contract?: unknown
      counterparty?: unknown
      description?: unknown
      policy?: unknown
      token?: unknown
      tokenWhitelist?: unknown
    }
    methodName?: unknown
    networkPreset?: unknown
  }
  const escrow = raw.escrow
  if (!escrow || typeof escrow !== 'object') {
    throw new Error('config.json escrow must be an object.')
  }

  const tokenWhitelist = requiredJsonAddressArray(
    escrow.tokenWhitelist,
    'escrow.tokenWhitelist',
  )
  const token = requiredJsonAddress(escrow.token, 'escrow.token')
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
    escrow: {
      amount: requiredJsonBaseUnitAmount(escrow.amount, 'escrow.amount'),
      contract: optionalJsonAddress(escrow.contract, 'escrow.contract'),
      counterparty: optionalJsonAddress(
        escrow.counterparty,
        'escrow.counterparty',
      ),
      description: requiredJsonString(escrow.description, 'escrow.description'),
      policy: requiredJsonString(escrow.policy, 'escrow.policy'),
      token,
      tokenWhitelist,
    },
    methodName: requiredJsonString(raw.methodName, 'methodName'),
    networkPreset: parseNetworkPreset(raw.networkPreset),
  }
}

const requiredJsonAddress = (value: unknown, label: string): Address => {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`config.json ${label} must be a valid EVM address.`)
  }
  return getAddress(value)
}

const optionalJsonAddress = (
  value: unknown,
  label: string,
): Address | undefined => {
  if (value === null || value === undefined) return undefined
  return requiredJsonAddress(value, label)
}

const requiredJsonAddressArray = (value: unknown, label: string): Address[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`config.json ${label} must be a non-empty address array.`)
  }
  return value.map((item, index) =>
    requiredJsonAddress(item, `${label}[${index}]`),
  )
}

const requiredJsonBaseUnitAmount = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`config.json ${label} must be a base-unit integer string.`)
  }
  return value
}

const requiredJsonString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`config.json ${label} must be a non-empty string.`)
  }
  return value.trim()
}
