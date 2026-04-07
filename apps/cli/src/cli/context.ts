import { stakeMethod as createStakeMethod } from '@gitbondhq/mppx-stake'

import { loadRepoConfig } from './config.js'

export const RPC_URL_ENV = 'MPP_ESCROW_RPC_URL'
export const CONTRACT_ENV = 'MPP_ESCROW_CONTRACT'
export const PRIVATE_KEY_ENV = 'MPP_ESCROW_PRIVATE_KEY'

export const repoConfigPath = new URL(
  '../../../../config.json',
  import.meta.url,
)
export const repoConfig = loadRepoConfig(repoConfigPath)
export const stakeMethod = createStakeMethod({ name: repoConfig.methodName })
