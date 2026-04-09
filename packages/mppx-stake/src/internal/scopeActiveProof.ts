import type { Account, Address, Hex } from 'viem'
import { recoverTypedDataAddress } from 'viem'

const DOMAIN_NAME = 'MPP Scope Active Stake'
const DOMAIN_VERSION = '1'

const scopeActiveTypes = {
  ScopeActiveStake: [
    { name: 'challengeId', type: 'string' },
    { name: 'expires', type: 'string' },
    { name: 'scope', type: 'bytes32' },
    { name: 'beneficiary', type: 'address' },
    { name: 'counterparty', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

type ScopeActiveProofParameters = {
  amount: string
  beneficiary: Address
  chainId: number
  challengeId: string
  contract: Address
  counterparty: Address
  expires?: string
  scope: Hex
  token: Address
}

const getScopeActiveTypedData = (parameters: ScopeActiveProofParameters) => ({
  domain: {
    chainId: parameters.chainId,
    name: DOMAIN_NAME,
    verifyingContract: parameters.contract,
    version: DOMAIN_VERSION,
  } as const,
  message: {
    amount: BigInt(parameters.amount),
    beneficiary: parameters.beneficiary,
    challengeId: parameters.challengeId,
    counterparty: parameters.counterparty,
    expires: parameters.expires ?? '',
    scope: parameters.scope,
    token: parameters.token,
  },
  primaryType: 'ScopeActiveStake' as const,
  types: scopeActiveTypes,
})

export const signScopeActiveProof = async (
  account: Account,
  parameters: ScopeActiveProofParameters,
): Promise<Hex> => {
  if (!account.signTypedData)
    throw new Error('beneficiary account must support signTypedData().')

  return account.signTypedData(getScopeActiveTypedData(parameters))
}

export const recoverScopeActiveProofSigner = async (
  parameters: ScopeActiveProofParameters & { signature: Hex },
): Promise<Address> =>
  recoverTypedDataAddress({
    ...getScopeActiveTypedData(parameters),
    signature: parameters.signature,
  })
