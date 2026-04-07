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

export type StakeMethodInput = {
  amount: string
  chainId: number
  contract: Address
  counterparty: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
}

export type StakeCredentialPayload = { hash: Hex; type: 'hash' }

export const toStakeMethodInput = (
  request: StakeChallengeRequest,
): StakeMethodInput => {
  return {
    amount: request.amount,
    chainId: request.methodDetails.chainId,
    contract: request.contract,
    counterparty: request.counterparty,
    token: request.token,
    ...(request.description !== undefined
      ? { description: request.description }
      : {}),
    ...(request.externalId !== undefined
      ? { externalId: request.externalId }
      : {}),
    ...(request.policy !== undefined ? { policy: request.policy } : {}),
    ...(request.resource !== undefined ? { resource: request.resource } : {}),
    stakeKey: request.stakeKey,
  }
}
