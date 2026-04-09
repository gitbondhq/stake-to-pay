import type { Address, Hex } from 'viem'

export type StakeChallengeRequest = {
  amount: string
  beneficiary?: Address
  contract: Address
  counterparty: Address
  policy?: string
  resource?: string
  scope: Hex
  token: Address
  description?: string
  externalId?: string
  methodDetails: {
    chainId: number
  }
}

export type StakeCredentialPayload = {
  signature: Hex
  type: 'scope-active'
}
