import { readFileSync } from 'node:fs'
import process from 'node:process'

import { parseRepoConfig, type RepoConfig } from '@gitbondhq/mppx-stake'

const defaultHost = '127.0.0.1'
const defaultPort = 4020
const repoConfigPath = new URL('../../../config.json', import.meta.url)

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
  const repoConfig = parseRepoConfig(JSON.parse(readFileSync(repoConfigPath, 'utf8')))
  if (!repoConfig.escrow.contract) {
    throw new Error('config.json escrow.contract is required for apps/mpp-server.')
  }
  if (!repoConfig.escrow.counterparty) {
    throw new Error('config.json escrow.counterparty is required for apps/mpp-server.')
  }
  return repoConfig as ServerRepoConfig
}
