import { readFileSync } from 'node:fs'

import { getNetworkPreset, resolveNetworkId } from '@gitbondhq/mppx-stake'
import { getAddress, isAddress } from 'viem'

import type { RepoConfig } from './types.js'

export function loadRepoConfig(repoConfigPath: URL): RepoConfig {
  const raw = JSON.parse(readFileSync(repoConfigPath, 'utf8')) as {
    chainId?: unknown
    escrow?: {
      contract?: unknown
      token?: unknown
      tokenWhitelist?: unknown
    }
    methodName?: unknown
    network?: unknown
    rpcUrl?: unknown
  }

  const network = resolveNetworkId(requiredJsonString(raw.network, 'network'))
  const preset = getNetworkPreset(network)
  const chainId = requiredJsonInteger(raw.chainId, 'chainId')
  if (chainId !== preset.chain.id) {
    throw new Error(
      `config.json chainId ${chainId} does not match the ${network} preset (${preset.chain.id}).`,
    )
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
  if (!tokenWhitelist.some(candidate => candidate.toLowerCase() === token.toLowerCase())) {
    throw new Error('config.json escrow.token must be included in escrow.tokenWhitelist.')
  }

  return {
    chainId,
    escrow: {
      contract: optionalJsonAddress(escrow.contract, 'escrow.contract'),
      token,
      tokenWhitelist,
    },
    methodName: requiredJsonString(raw.methodName, 'methodName'),
    network,
    rpcUrl:
      raw.rpcUrl === null || raw.rpcUrl === undefined
        ? undefined
        : requiredJsonString(raw.rpcUrl, 'rpcUrl'),
  }
}

function requiredJsonAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`config.json ${label} must be a valid EVM address.`)
  }
  return getAddress(value)
}

function optionalJsonAddress(
  value: unknown,
  label: string,
): `0x${string}` | undefined {
  if (value === null || value === undefined) return undefined
  return requiredJsonAddress(value, label)
}

function requiredJsonAddressArray(
  value: unknown,
  label: string,
): `0x${string}`[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`config.json ${label} must be a non-empty address array.`)
  }
  return value.map((item, index) =>
    requiredJsonAddress(item, `${label}[${index}]`),
  )
}

function requiredJsonInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`config.json ${label} must be a positive integer.`)
  }
  return Number(value)
}

function requiredJsonString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`config.json ${label} must be a non-empty string.`)
  }
  return value.trim()
}
