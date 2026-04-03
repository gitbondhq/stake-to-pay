import { Methods, getNetworkPreset, resolveNetworkId } from '@gitbondhq/mppx-escrow'

import { loadRepoConfig } from './config.js'

export const RPC_URL_ENV = 'MPP_ESCROW_RPC_URL'
export const CONTRACT_ENV = 'MPP_ESCROW_CONTRACT'
export const PRIVATE_KEY_ENV = 'MPP_ESCROW_PRIVATE_KEY'
export const NETWORK_ENV = 'MPP_NETWORK'

export const repoConfigPath = new URL('../../../../config.json', import.meta.url)
export const repoConfig = loadRepoConfig(repoConfigPath)
export const selectedNetwork = getNetworkPreset(
  resolveNetworkId(process.env[NETWORK_ENV]?.trim() || repoConfig.network),
)
export const stakeMethod = Methods.stake({ name: repoConfig.methodName })
