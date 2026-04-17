import { readFileSync } from 'node:fs'
import process from 'node:process'

import { type Address, getAddress, isAddress } from 'viem'

const defaultHost = '127.0.0.1'
const defaultPort = 4020
const repoConfigPath = new URL('../../../config.json', import.meta.url)

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

type ServerRepoConfig = RepoConfig & {
  escrow: RepoConfig['escrow'] & {
    contract: NonNullable<RepoConfig['escrow']['contract']>
    counterparty: NonNullable<RepoConfig['escrow']['counterparty']>
  }
}

export type AppConfig = {
  host: string
  mppSecretKey: string
  port: number
  repoConfig: ServerRepoConfig
}

export const loadConfig = (): AppConfig => {
  return {
    host: process.env.HOST?.trim() || defaultHost,
    mppSecretKey: getRequiredString('MPP_SECRET_KEY'),
    port: loadPort(),
    repoConfig: loadRepoConfig(),
  }
}

const loadPort = (): number => {
  const value = process.env.PORT?.trim()
  if (!value) return defaultPort

  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error('PORT must be a positive integer.')
  return parsed
}

const getRequiredString = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const loadRepoConfig = (): ServerRepoConfig => {
  const repoConfig = parseRepoConfig(
    JSON.parse(readFileSync(repoConfigPath, 'utf8')),
  )
  if (!repoConfig.escrow.contract) {
    throw new Error(
      'config.json escrow.contract is required for apps/mpp-server.',
    )
  }
  if (!repoConfig.escrow.counterparty) {
    throw new Error(
      'config.json escrow.counterparty is required for apps/mpp-server.',
    )
  }
  return repoConfig as ServerRepoConfig
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
