import { readFileSync } from 'node:fs'
import process from 'node:process'

import {
  getNetworkPreset,
  resolveNetworkId,
  type NetworkId,
} from '@gitbondhq/mpp-stake'
import { isAddress } from 'viem'

const defaultStakeAmount = '5000000'
const defaultDocumentSlug = 'incident-report-7b'
const defaultDocumentTitle = 'Incident Report 7B'
const defaultHost = '127.0.0.1'
const defaultPort = 4020
const repoConfigPath = new URL('../../../config.json', import.meta.url)

export type AppConfig = {
  documentPath: string
  documentPreviewPath: string
  documentSlug: string
  documentTitle: string
  host: string
  methodName: string
  mppSecretKey: string
  network: NetworkId
  port: number
  stakeAmount: string
  stakeBeneficiary?: `0x${string}` | undefined
  stakeChainId: number
  stakeContract: `0x${string}`
  stakeCounterparty: `0x${string}`
  stakeToken: `0x${string}`
  stakeDescription: string
  stakePolicy: string
  stakeResource: string
  stakeTokenWhitelist: readonly `0x${string}`[]
}

export const loadConfig = (): AppConfig => {
  const repoConfig = loadRepoConfig()
  const documentSlug = getSlug('DOCUMENT_SLUG', defaultDocumentSlug)
  const network = resolveNetworkId(
    process.env.MPP_NETWORK?.trim() || repoConfig.network,
  )
  const preset = getNetworkPreset(network)

  return {
    documentPath: `/documents/${documentSlug}`,
    documentPreviewPath: `/documents/${documentSlug}/preview`,
    documentSlug,
    documentTitle: getString('DOCUMENT_TITLE', defaultDocumentTitle),
    host: getString('HOST', defaultHost),
    methodName: repoConfig.methodName,
    mppSecretKey: getRequiredString('MPP_SECRET_KEY'),
    network,
    port: getInteger('PORT', defaultPort),
    stakeAmount: getBaseUnitAmount('STAKE_AMOUNT', repoConfig.escrow.amount),
    stakeBeneficiary:
      getOptionalAddress('STAKE_BENEFICIARY') ?? repoConfig.escrow.beneficiary,
    stakeChainId: preset.chain.id,
    stakeContract: getConfiguredAddress(
      'STAKE_CONTRACT',
      repoConfig.escrow.contract,
    ),
    stakeCounterparty: getConfiguredAddress(
      'STAKE_COUNTERPARTY',
      repoConfig.escrow.counterparty,
    ),
    stakeToken: getConfiguredAddress(
      'STAKE_TOKEN',
      repoConfig.escrow.token,
    ),
    stakeDescription: getString(
      'STAKE_DESCRIPTION',
      repoConfig.escrow.description,
    ),
    stakePolicy: getString('STAKE_POLICY', repoConfig.escrow.policy),
    stakeResource: `documents/${documentSlug}`,
    stakeTokenWhitelist: repoConfig.escrow.tokenWhitelist,
  }
}

export const toPublicConfig = (config: AppConfig) => ({
  documentPath: config.documentPath,
  documentPreviewPath: config.documentPreviewPath,
  documentSlug: config.documentSlug,
  documentTitle: config.documentTitle,
  host: config.host,
  methodName: config.methodName,
  network: config.network,
  port: config.port,
  stakeAmount: config.stakeAmount,
  stakeBeneficiary: config.stakeBeneficiary ?? null,
  stakeChainId: config.stakeChainId,
  stakeContract: config.stakeContract,
  stakeCounterparty: config.stakeCounterparty,
  stakeToken: config.stakeToken,
  stakeDescription: config.stakeDescription,
  stakePolicy: config.stakePolicy,
  stakeResource: config.stakeResource,
  stakeTokenWhitelist: config.stakeTokenWhitelist,
})

const getAddress = (name: string, fallback: string): `0x${string}` => {
  const value = getString(name, fallback)
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address.`)
  return value
}

const getBaseUnitAmount = (name: string, fallback: string): string => {
  const value = getString(name, fallback)
  if (!/^\d+$/.test(value))
    throw new Error(`${name} must be a base-unit integer string.`)
  return value
}

const getInteger = (name: string, fallback: number): number => {
  const value = process.env[name]?.trim()
  if (!value) return fallback

  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer.`)
  return parsed
}

const getOptionalAddress = (name: string): `0x${string}` | undefined => {
  const value = process.env[name]?.trim()
  if (!value) return undefined
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address.`)
  return value
}

const getConfiguredAddress = (
  name: string,
  fallback: `0x${string}` | undefined,
): `0x${string}` => {
  const value = process.env[name]?.trim() || fallback
  if (!value) throw new Error(`${name} is required.`)
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address.`)
  return value
}

const getRequiredString = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const getSlug = (name: string, fallback: string): string => {
  const value = getString(name, fallback)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    throw new Error(`${name} must be lowercase kebab-case.`)
  return value
}

const getString = (name: string, fallback: string): string => {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : fallback
}

type RepoConfig = {
  chainId: number
  escrow: {
    amount: string
    beneficiary?: `0x${string}` | undefined
    contract?: `0x${string}` | undefined
    counterparty?: `0x${string}` | undefined
    token: `0x${string}`
    description: string
    policy: string
    tokenWhitelist: `0x${string}`[]
  }
  methodName: string
  network: NetworkId
  rpcUrl?: string | undefined
}

const loadRepoConfig = (): RepoConfig => {
  const raw = JSON.parse(readFileSync(repoConfigPath, 'utf8')) as {
    chainId?: unknown
    escrow?: {
      amount?: unknown
      beneficiary?: unknown
      contract?: unknown
      counterparty?: unknown
      token?: unknown
      description?: unknown
      policy?: unknown
      tokenWhitelist?: unknown
    }
    methodName?: unknown
    network?: unknown
    rpcUrl?: unknown
  }

  const network = resolveNetworkId(getRequiredJsonString(raw.network, 'network'))
  const preset = getNetworkPreset(network)
  const chainId = getRequiredJsonInteger(raw.chainId, 'chainId')
  if (chainId !== preset.chain.id) {
    throw new Error(
      `config.json chainId ${chainId} does not match the ${network} preset (${preset.chain.id}).`,
    )
  }

  const escrow = raw.escrow
  if (!escrow || typeof escrow !== 'object') {
    throw new Error('config.json escrow must be an object.')
  }

  const tokenWhitelist = getRequiredJsonAddressArray(
    escrow.tokenWhitelist,
    'escrow.tokenWhitelist',
  )
  const token = getRequiredJsonAddress(escrow.token, 'escrow.token')
  if (!tokenWhitelist.some(token => token.toLowerCase() === token.toLowerCase())) {
    throw new Error('config.json escrow.token must be included in escrow.tokenWhitelist.')
  }

  return {
    chainId,
    escrow: {
      amount: getRequiredJsonBaseUnitAmount(escrow.amount, 'escrow.amount'),
      beneficiary: getOptionalJsonAddress(
        escrow.beneficiary,
        'escrow.beneficiary',
      ),
      contract: getOptionalJsonAddress(escrow.contract, 'escrow.contract'),
      counterparty: getOptionalJsonAddress(
        escrow.counterparty,
        'escrow.counterparty',
      ),
      token,
      description: getRequiredJsonString(
        escrow.description,
        'escrow.description',
      ),
      policy: getRequiredJsonString(escrow.policy, 'escrow.policy'),
      tokenWhitelist,
    },
    methodName: getRequiredJsonString(raw.methodName, 'methodName'),
    network,
    rpcUrl:
      raw.rpcUrl === null || raw.rpcUrl === undefined
        ? undefined
        : getRequiredJsonString(raw.rpcUrl, 'rpcUrl'),
  }
}

const getRequiredJsonAddress = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`config.json ${label} must be a valid EVM address.`)
  }
  return value
}

const getOptionalJsonAddress = (
  value: unknown,
  label: string,
): `0x${string}` | undefined => {
  if (value === null || value === undefined) return undefined
  return getRequiredJsonAddress(value, label)
}

const getRequiredJsonAddressArray = (
  value: unknown,
  label: string,
): `0x${string}`[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`config.json ${label} must be a non-empty address array.`)
  }
  return value.map((item, index) =>
    getRequiredJsonAddress(item, `${label}[${index}]`),
  )
}

const getRequiredJsonBaseUnitAmount = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`config.json ${label} must be a base-unit integer string.`)
  }
  return value
}

const getRequiredJsonInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`config.json ${label} must be a positive integer.`)
  }
  return Number(value)
}

const getRequiredJsonString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`config.json ${label} must be a non-empty string.`)
  }
  return value.trim()
}
