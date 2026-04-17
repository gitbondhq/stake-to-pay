import process from 'node:process'

import { loadRepoConfig } from './config.js'

export const RPC_URL_ENV = 'MPP_ESCROW_RPC_URL'
export const CONTRACT_ENV = 'MPP_ESCROW_CONTRACT'
export const PRIVATE_KEY_ENV = 'MPP_ESCROW_PRIVATE_KEY'
export const ACCOUNT_ENV = 'MPP_ESCROW_ACCOUNT'
export const PASSWORD_FILE_ENV = 'MPP_ESCROW_PASSWORD_FILE'
export const RESOURCE_URL_ENV = 'MPP_RESOURCE_URL'

export const repoConfigPath = new URL(
  '../../../../config.json',
  import.meta.url,
)
const repoEnvPath = new URL('../../../../.env', import.meta.url)

try {
  process.loadEnvFile(repoEnvPath)
} catch (error) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code !== 'ENOENT') {
    throw error
  }
}

export const repoConfig = loadRepoConfig(repoConfigPath)

const defaultDemoHost = '127.0.0.1'
const defaultDemoPort = '4020'
const defaultProtectedResourcePath = '/documents/document'

export function resolveProtectedResourceUrl(url?: string): string {
  if (url?.trim()) {
    return url.trim()
  }

  if (process.env[RESOURCE_URL_ENV]?.trim()) {
    return process.env[RESOURCE_URL_ENV]!.trim()
  }

  const host = process.env.HOST?.trim() || defaultDemoHost
  const port = process.env.PORT?.trim() || defaultDemoPort

  return new URL(
    defaultProtectedResourcePath,
    `http://${host}:${port}`,
  ).toString()
}
