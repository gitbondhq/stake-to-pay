import { getAddress } from 'viem'

const didPattern = /^did:pkh:eip155:(\d+):(0x[0-9a-fA-F]{40})$/

/** Resolves a credential source DID into the EVM payer address and chain id. */
export const resolveDid = (value: string | undefined) => {
  if (!value) throw new Error('stake credentials must include a source DID.')

  const match = didPattern.exec(value)
  if (!match) throw new Error(`Invalid source DID: ${value}`)

  return {
    address: getAddress(match[2]!),
    chainId: Number(match[1]!),
  }
}

/** Resolves the payer from the credential source DID. */
export const resolvePayer = (chainId: number, source: string | undefined) => {
  const did = resolveDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return did.address
}
