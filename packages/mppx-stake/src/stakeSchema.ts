import type { Address, Hex } from 'viem'

export type StakeChallengeRequest = {
  amount: string
  contract: Address
  counterparty: Address
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  methodDetails: {
    chainId: number
  }
}

export type StakeCredentialPayload = { hash: Hex; type: 'hash' }
