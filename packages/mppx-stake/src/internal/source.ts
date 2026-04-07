import { parseDid } from './did.js'

/** Resolves the payer from the credential source DID. */
export const resolvePayer = (chainId: number, source: string | undefined) => {
  const did = parseDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return did.address
}
