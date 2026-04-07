import { readFileSync } from 'node:fs'
import process from 'node:process'

import { parseRepoConfig, type RepoConfig } from '@gitbondhq/mppx-stake'
import { getAddress, isAddress } from 'viem'

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
  networkPreset: RepoConfig['networkPreset']
  port: number
  stakeAmount: string
  stakeContract: `0x${string}`
  stakeCounterparty: `0x${string}`
  stakeToken: `0x${string}`
  stakeDescription: string
  stakePolicy: string
  stakeResource: string
  stakeTokenWhitelist: RepoConfig['escrow']['tokenWhitelist']
}

export const loadConfig = (): AppConfig => {
  const repoConfig = loadRepoConfig()
  const documentSlug = getSlug('DOCUMENT_SLUG', defaultDocumentSlug)
  const networkPreset = repoConfig.networkPreset

  return {
    documentPath: `/documents/${documentSlug}`,
    documentPreviewPath: `/documents/${documentSlug}/preview`,
    documentSlug,
    documentTitle: getString('DOCUMENT_TITLE', defaultDocumentTitle),
    host: getString('HOST', defaultHost),
    methodName: repoConfig.methodName,
    mppSecretKey: getRequiredString('MPP_SECRET_KEY'),
    networkPreset,
    port: getInteger('PORT', defaultPort),
    stakeAmount: getBaseUnitAmount('STAKE_AMOUNT', repoConfig.escrow.amount),
    stakeContract: getConfiguredAddress(
      'STAKE_CONTRACT',
      repoConfig.escrow.contract,
    ),
    stakeCounterparty: getConfiguredAddress(
      'STAKE_COUNTERPARTY',
      repoConfig.escrow.counterparty,
    ),
    stakeToken: getConfiguredAddress('STAKE_TOKEN', repoConfig.escrow.token),
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
  network: config.networkPreset.id,
  port: config.port,
  stakeAmount: config.stakeAmount,
  stakeChainId: config.networkPreset.chain.id,
  stakeContract: config.stakeContract,
  stakeCounterparty: config.stakeCounterparty,
  stakeToken: config.stakeToken,
  stakeDescription: config.stakeDescription,
  stakePolicy: config.stakePolicy,
  stakeResource: config.stakeResource,
  stakeTokenWhitelist: config.stakeTokenWhitelist,
})

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

const getConfiguredAddress = (
  name: string,
  fallback: `0x${string}` | undefined,
): `0x${string}` => {
  const value = process.env[name]?.trim() || fallback
  if (!value) throw new Error(`${name} is required.`)
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address.`)
  return getAddress(value)
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

const loadRepoConfig = (): RepoConfig =>
  parseRepoConfig(JSON.parse(readFileSync(repoConfigPath, 'utf8')))
