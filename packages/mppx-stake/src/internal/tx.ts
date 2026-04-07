import type { Address, Client, Hex, TransactionReceipt } from 'viem'
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddressEqual,
  parseEventLogs,
} from 'viem'
import { readContract } from 'viem/actions'

import { erc20Abi } from '../abi/erc20.js'
import { MPPEscrowAbi } from '../abi/MPPEscrow.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'

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

/**
 * Matches decoded transaction calls against the original stake challenge.
 * This is now only the approve + createEscrow flow.
 */
export const matchStakeCalls = (parameters: {
  beneficiary: Address
  calls: readonly { data?: Hex | undefined; to?: Address | undefined }[]
  challenge: StakeChallengeRequest
}) => {
  const { beneficiary, calls, challenge } = parameters
  const amount = BigInt(challenge.amount)
  const contract = challenge.contract as Address
  const counterparty = challenge.counterparty as Address
  const token = challenge.token as Address
  const stakeKey = challenge.stakeKey as Hex

  if (calls.length !== 2)
    throw new Error('Invalid stake transaction: unexpected call count.')

  const [approveCall, createEscrowCall] = calls
  if (
    !approveCall?.data ||
    !approveCall.to ||
    !isAddressEqual(approveCall.to, token)
  )
    throw new Error('Invalid stake transaction: wrong approve target.')

  if (
    !createEscrowCall?.data ||
    !createEscrowCall.to ||
    !isAddressEqual(createEscrowCall.to, contract)
  )
    throw new Error('Invalid stake transaction: wrong escrow target.')

  const approve = decodeFunctionData({
    abi: erc20Abi,
    data: approveCall.data,
  })
  if (approve.functionName !== 'approve')
    throw new Error('Invalid stake transaction: first call must be approve.')

  const [spender, approvedAmount] = approve.args as [Address, bigint]
  assertAddress('approve.spender', spender, contract)
  assertMatch('approve.amount', approvedAmount, amount)

  const escrow = decodeFunctionData({
    abi: MPPEscrowAbi,
    data: createEscrowCall.data,
  })
  if (escrow.functionName !== 'createEscrow')
    throw new Error(
      'Invalid stake transaction: second call must be createEscrow.',
    )

  const [key, counterpartyArg, beneficiaryArg, tokenArg, amountArg] =
    escrow.args as [Hex, Address, Address, Address, bigint]

  assertMatch('stakeKey', key, stakeKey)
  assertAddress('counterparty', counterpartyArg, counterparty)
  assertAddress('beneficiary', beneficiaryArg, beneficiary)
  assertAddress('token', tokenArg, token)
  assertMatch('amount', amountArg, amount)
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
      log.args.amount === value,
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
  assertMatch('escrow.principal', escrow.principal, value)
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

const assertMatch = (
  label: string,
  actual: bigint | string,
  expected: bigint | string,
) => {
  if (String(actual) !== String(expected))
    throw new Error(`Mismatched ${label}.`)
}
