import type { Address, Hex } from 'viem'

export type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

export type WriteCommandOptions = BaseCommandOptions & {
  noWait?: boolean
  privateKey?: string
}

export type StakeChallengeRequest = {
  amount: string
  contract: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  methodDetails: {
    action?: 'createEscrow' | undefined
    beneficiary?: Address | undefined
    chainId: number
    counterparty: Address
    policy?: string | undefined
    resource?: string | undefined
    stakeKey: Hex
    submission?: 'push' | 'pull' | undefined
  }
}

export type StakeMethodInput = {
  amount: string
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
  submission?: 'push' | 'pull' | undefined
}

export type StakeCredentialPayload =
  | { hash: Hex; type: 'hash' }
  | { signature: Hex; type: 'transaction' }

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
