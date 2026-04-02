import process from 'node:process'

import { isAddress } from 'viem'

const defaultCurrency = '0x20c0000000000000000000000000000000000000'
const defaultStakeAmount = '5000000'
const defaultStakeChainId = 42431
const defaultDocumentSlug = 'incident-report-7b'
const defaultDocumentTitle = 'Incident Report 7B'
const defaultHost = '127.0.0.1'
const defaultPort = 4020
const defaultStakeDescription = 'Stake required to unlock the full incident report'
const defaultStakePolicy = 'demo-document-v1'

export type AppConfig = {
  documentPath: string
  documentPreviewPath: string
  documentSlug: string
  documentTitle: string
  host: string
  mppSecretKey: string
  port: number
  stakeAmount: string
  stakeBeneficiary?: `0x${string}` | undefined
  stakeChainId: number
  stakeContract: `0x${string}`
  stakeCounterparty: `0x${string}`
  stakeCurrency: `0x${string}`
  stakeDescription: string
  stakePolicy: string
  stakeResource: string
}

export const loadConfig = (): AppConfig => {
  const documentSlug = getSlug('DOCUMENT_SLUG', defaultDocumentSlug)

  return {
    documentPath: `/documents/${documentSlug}`,
    documentPreviewPath: `/documents/${documentSlug}/preview`,
    documentSlug,
    documentTitle: getString('DOCUMENT_TITLE', defaultDocumentTitle),
    host: getString('HOST', defaultHost),
    mppSecretKey: getRequiredString('MPP_SECRET_KEY'),
    port: getInteger('PORT', defaultPort),
    stakeAmount: getBaseUnitAmount('STAKE_AMOUNT', defaultStakeAmount),
    stakeBeneficiary: getOptionalAddress('STAKE_BENEFICIARY'),
    stakeChainId: getInteger('STAKE_CHAIN_ID', defaultStakeChainId),
    stakeContract: getRequiredAddress('STAKE_CONTRACT'),
    stakeCounterparty: getRequiredAddress('STAKE_COUNTERPARTY'),
    stakeCurrency: getAddress('STAKE_CURRENCY', defaultCurrency),
    stakeDescription: getString('STAKE_DESCRIPTION', defaultStakeDescription),
    stakePolicy: getString('STAKE_POLICY', defaultStakePolicy),
    stakeResource: `documents/${documentSlug}`,
  }
}

export const toPublicConfig = (config: AppConfig) => ({
  documentPath: config.documentPath,
  documentPreviewPath: config.documentPreviewPath,
  documentSlug: config.documentSlug,
  documentTitle: config.documentTitle,
  host: config.host,
  port: config.port,
  stakeAmount: config.stakeAmount,
  stakeBeneficiary: config.stakeBeneficiary ?? null,
  stakeChainId: config.stakeChainId,
  stakeContract: config.stakeContract,
  stakeCounterparty: config.stakeCounterparty,
  stakeCurrency: config.stakeCurrency,
  stakeDescription: config.stakeDescription,
  stakePolicy: config.stakePolicy,
  stakeResource: config.stakeResource,
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

const getRequiredAddress = (name: string): `0x${string}` =>
  getAddress(name, getRequiredString(name))

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
