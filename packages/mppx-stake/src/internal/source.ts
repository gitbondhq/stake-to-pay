import type { Address } from 'viem'
import { getAddress, isAddressEqual } from 'viem'

const didPattern = /^did:pkh:eip155:(\d+):(0x[0-9a-fA-F]{40})$/

/** Resolves a credential source DID into the EVM address and chain id. */
export const resolveDid = (value: string | undefined) => {
  if (!value) throw new Error('stake credentials must include a source DID.')

  const match = didPattern.exec(value)
  if (!match) throw new Error(`Invalid source DID: ${value}`)

  return {
    address: getAddress(match[2]!),
    chainId: Number(match[1]!),
  }
}

/** Resolves an EVM address from the credential source DID for the expected chain. */
export const resolveBeneficiary = (
  chainId: number,
  source: string | undefined,
) => {
  if (!source) {
    throw new Error(
      'stake credentials must include a source DID when the challenge omits beneficiary.',
    )
  }

  const did = resolveDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return did.address
}

/** Validates an optional source DID against the recovered beneficiary address. */
export const assertSourceDidMatches = (
  chainId: number,
  source: string | undefined,
  beneficiary: Address,
) => {
  if (!source) return

  const did = resolveDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')
  if (!isAddressEqual(did.address, beneficiary))
    throw new Error('Source DID does not match the recovered beneficiary.')
}
