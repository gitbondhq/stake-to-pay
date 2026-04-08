import type { Address, Client, Hex } from 'viem'
import { encodeFunctionData, isAddressEqual } from 'viem'
import { readContract } from 'viem/actions'

import { MPPEscrowAbi } from '../abi/MPPEscrow.js'
import { erc20Abi } from '../abi/erc20.js'

/** Builds the approve + createEscrow flow used by this SDK. */
export const buildStakeCalls = (parameters: {
  amount: bigint
  beneficiary: Address
  contract: Address
  counterparty: Address
  scope: Hex
  token: Address
}) => {
  const { amount, beneficiary, contract, counterparty, scope, token } =
    parameters

  return [
    {
      data: encodeFunctionData({
        abi: erc20Abi,
        args: [contract, amount],
        functionName: 'approve',
      }),
      to: token,
    },
    {
      data: encodeFunctionData({
        abi: MPPEscrowAbi,
        args: [scope, counterparty, beneficiary, token, amount],
        functionName: 'createEscrow',
      }),
      to: contract,
    },
  ] as const
}

type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  scope: Hex
  token: Address
  value: bigint
}

export type EscrowState = {
  beneficiary: Address
  counterparty: Address
  id: bigint
  isActive: boolean
  payer: Address
  principal: bigint
  scope: Hex
  token: Address
}

/** Confirms the resolved on-chain escrow matches the expected beneficiary and terms. */
export const assertEscrowState = (
  escrow: EscrowState,
  parameters: EscrowVerificationParams,
) => {
  const { beneficiary, counterparty, scope, token, value } = parameters

  if (!escrow.isActive) throw new Error('Escrow is not active.')
  assertAddress('escrow.beneficiary', escrow.beneficiary, beneficiary)
  assertAddress('escrow.counterparty', escrow.counterparty, counterparty)
  assertAddress('escrow.token', escrow.token, token)
  assertHex('escrow.scope', escrow.scope, scope)
  assertAtLeast('escrow.principal', escrow.principal, value)
}

export const hasActiveEscrow = async (
  client: Client,
  contract: Address,
  scope: Hex,
  beneficiary: Address,
) =>
  (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [scope, beneficiary],
    functionName: 'isEscrowActive',
  })) as boolean

/** Verifies the canonical active-state query, then checks the full escrow record. */
export const assertEscrowOnChain = async (
  client: Client,
  contract: Address,
  parameters: EscrowVerificationParams,
) => {
  const isActive = await hasActiveEscrow(
    client,
    contract,
    parameters.scope,
    parameters.beneficiary,
  )

  if (!isActive)
    throw new Error('Escrow is not active for the expected beneficiary.')

  const escrow = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [parameters.scope, parameters.beneficiary],
    functionName: 'getActiveEscrow',
  })) as EscrowState

  assertEscrowState(escrow, parameters)
}

/** Converts a successful active-stake verification into the MPP receipt shape. */
export const toReceipt = (
  parameters: {
    beneficiary: Address
    contract: Address
    scope: Hex
  },
  method: string,
) =>
  ({
    method,
    reference: `${parameters.contract}:${parameters.scope}:${parameters.beneficiary}`,
    status: 'success',
    timestamp: new Date().toISOString(),
  }) as const

const assertAddress = (label: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected)) throw new Error(`Mismatched ${label}.`)
}

const assertAtLeast = (label: string, actual: bigint, expected: bigint) => {
  if (actual < expected) throw new Error(`Mismatched ${label}.`)
}

const assertHex = (label: string, actual: Hex, expected: Hex) => {
  if (actual.toLowerCase() !== expected.toLowerCase())
    throw new Error(`Mismatched ${label}.`)
}
