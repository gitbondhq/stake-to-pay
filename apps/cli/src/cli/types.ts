import type { Address, Hex } from 'viem'

export type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

export type WriteCommandOptions = BaseCommandOptions & {
  noWait?: boolean
  privateKey?: string
}

export type RepoConfig = {
  chainId: number
  escrow: {
    contract?: `0x${string}` | undefined
    token: `0x${string}`
    tokenWhitelist: `0x${string}`[]
  }
  methodName: string
  network: string
  rpcUrl?: string | undefined
}
