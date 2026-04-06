import {
  type Address,
  getAddress,
  type Hex,
  isAddress,
  zeroAddress,
} from 'viem'

export function asAddress(value: string | undefined, label: string): Address {
  const text = requiredString(value, `Missing ${label}.`)
  if (!isAddress(text)) {
    throw new Error(
      `Invalid ${label}: expected an EVM address, received "${text}".`,
    )
  }

  return getAddress(text)
}

export function asOptionalBeneficiary(value: string | undefined): Address {
  return value ? asAddress(value, '--beneficiary') : zeroAddress
}

export function asBytes32(value: string | undefined, label: string): Hex {
  return asFixedHex(value, 32, label)
}

export function asHex32(value: string | undefined, label: string): Hex {
  return asFixedHex(value, 32, label)
}

export function asFixedHex(
  value: string | undefined,
  bytes: number,
  label: string,
): Hex {
  const text = requiredString(value, `Missing ${label}.`)
  const normalized = text.startsWith('0x') ? text : `0x${text}`
  const expectedLength = 2 + bytes * 2

  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid ${label}: expected hex data.`)
  }

  if (normalized.length !== expectedLength) {
    throw new Error(
      `Invalid ${label}: expected ${bytes} bytes (${expectedLength - 2} hex characters).`,
    )
  }

  return normalized as Hex
}

export function asUint256(value: string | undefined, label: string): bigint {
  const text = requiredString(value, `Missing ${label}.`)

  try {
    const parsed = BigInt(text)
    if (parsed < 0n) {
      throw new Error(`Invalid ${label}: expected a non-negative integer.`)
    }
    return parsed
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Invalid ${label}: expected a uint256 integer string.`)
  }
}

export function asUint8(value: string | undefined, label: string): number {
  const text = requiredString(value, `Missing ${label}.`)
  const parsed = Number.parseInt(text, 10)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`Invalid ${label}: expected an integer between 0 and 255.`)
  }

  return parsed
}

export function requiredString(
  value: string | undefined,
  message: string,
): string {
  if (!value || value.trim().length === 0) {
    throw new Error(message)
  }

  return value.trim()
}
