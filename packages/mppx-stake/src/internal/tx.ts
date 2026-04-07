import type { Address, Client, Hex, TransactionReceipt } from 'viem'
import { encodeFunctionData, isAddressEqual, parseEventLogs } from 'viem'
import { readContract } from 'viem/actions'

import { erc20Abi } from '../abi/erc20.js'
import { MPPEscrowAbi } from '../abi/MPPEscrow.js'

/** Builds the approve + createEscrow flow used by this SDK. */
export const buildStakeCalls = (parameters: {
  amount: bigint
  beneficiary: Address
  contract: Address
  counterparty: Address
  token: Address
  stakeKey: Hex
}) => {
  const { amount, beneficiary, contract, counterparty, token, stakeKey } =
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
        args: [stakeKey, counterparty, beneficiary, token, amount],
        functionName: 'createEscrow',
      }),
      to: contract,
    },
  ] as const
}

type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  token: Address
  payer: Address
  value: bigint
}

/** Confirms the transaction receipt emitted the expected `EscrowCreated` event. */
export const assertEscrowCreatedReceipt = (
  receipt: TransactionReceipt,
  parameters: EscrowVerificationParams & {
    contract: Address
    stakeKey: Hex
  },
) => {
  if (receipt.status !== 'success')
    throw new Error(`Stake transaction reverted: ${receipt.transactionHash}`)

  const { beneficiary, contract, counterparty, token, payer, stakeKey, value } =
    parameters
  const logs = parseEventLogs({
    abi: MPPEscrowAbi,
    eventName: 'EscrowCreated',
    logs: receipt.logs,
  })
  const match = logs.find(
    log =>
      isAddressEqual(log.address, contract) &&
      log.args.key === stakeKey &&
      isAddressEqual(log.args.payer, payer) &&
      isAddressEqual(log.args.beneficiary, beneficiary) &&
      isAddressEqual(log.args.counterparty, counterparty) &&
      isAddressEqual(log.args.token, token) &&
      log.args.amount >= value,
  )

  if (!match) throw new Error('No matching EscrowCreated event found.')
}

export type EscrowState = {
  beneficiary: Address
  counterparty: Address
  isActive: boolean
  payer: Address
  principal: bigint
  token: Address
}

/** Confirms the resolved on-chain escrow matches the expected payer and terms. */
export const assertEscrowState = (
  escrow: EscrowState,
  parameters: EscrowVerificationParams,
) => {
  const { beneficiary, counterparty, token, payer, value } = parameters

  if (!escrow.isActive) throw new Error('Escrow is not active.')
  assertAddress('escrow.payer', escrow.payer, payer)
  assertAddress('escrow.beneficiary', escrow.beneficiary, beneficiary)
  assertAddress('escrow.counterparty', escrow.counterparty, counterparty)
  assertAddress('escrow.token', escrow.token, token)
  assertAtLeast('escrow.principal', escrow.principal, value)
}

/** Verifies the canonical active-state query, then checks the full escrow record. */
export const assertEscrowOnChain = async (
  client: Client,
  contract: Address,
  stakeKey: Hex,
  parameters: EscrowVerificationParams,
) => {
  const isActive = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [stakeKey, parameters.payer],
    functionName: 'isEscrowActive',
  })) as boolean

  if (!isActive) throw new Error('Escrow is not active for the expected payer.')

  const escrow = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [stakeKey],
    functionName: 'getEscrow',
  })) as EscrowState

  assertEscrowState(escrow, parameters)
}

/** Converts a successful transaction receipt into the MPP receipt shape. */
export const toReceipt = (receipt: TransactionReceipt, method: string) =>
  ({
    method,
    reference: receipt.transactionHash,
    status: 'success',
    timestamp: new Date().toISOString(),
  }) as const

const assertAddress = (label: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected)) throw new Error(`Mismatched ${label}.`)
}

const assertAtLeast = (label: string, actual: bigint, expected: bigint) => {
  if (actual < expected) throw new Error(`Mismatched ${label}.`)
}
