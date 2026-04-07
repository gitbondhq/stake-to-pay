import type { Account, Address, Chain, Client, Hex, Transport } from 'viem'
import { createClient as viemCreateClient, http, numberToHex } from 'viem'
import {
  prepareTransactionRequest,
  sendCallsSync,
  sendRawTransactionSync,
  signTransaction,
} from 'viem/actions'

import type { NetworkPreset } from '../networkConfig.js'

export type EvmClient = Client<Transport, Chain>

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export const createClient = (preset: NetworkPreset): EvmClient => {
  const rpcUrl = preset.chain.rpcUrls.default.http[0]
  if (!rpcUrl)
    throw new Error(`No default RPC URL configured for ${preset.id}.`)

  return viemCreateClient({
    chain: preset.chain,
    transport: http(rpcUrl),
  }) as EvmClient
}

export type Call = { to: Address; data: Hex }

type SubmitCallsFn = (
  client: EvmClient,
  params: {
    account: Account
    calls: readonly Call[]
    experimental_fallback: boolean
    feeToken?: Address
  },
) => Promise<{
  receipts?: Array<{ transactionHash: Hex }> | undefined
}>

type PrepareSingleCallFn = (
  client: EvmClient,
  params: {
    account: Account
    data: Hex
    to: Address
    value: bigint
  },
) => Promise<PreparedSingleCallTransaction>

type PreparedSingleCallTransaction = Record<string, unknown> & {
  chainId?: number | undefined
  gas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxPriorityFeePerGas?: bigint | undefined
  nonce?: number | undefined
}

type SignPreparedFn = (
  client: EvmClient,
  params: PreparedSingleCallTransaction,
) => Promise<Hex>

type SubmitRawSyncFn = (
  client: EvmClient,
  params: { serializedTransaction: Hex },
) => Promise<import('viem').TransactionReceipt>

const submitCallsAction = sendCallsSync as unknown as SubmitCallsFn
const prepareSingleCallAction =
  prepareTransactionRequest as unknown as PrepareSingleCallFn
const signPreparedAction = signTransaction as unknown as SignPreparedFn
const submitRawSyncAction = sendRawTransactionSync as unknown as SubmitRawSyncFn

/**
 * Prepares and signs a single normal EVM transaction. This is the fallback
 * path used on chains without Tempo batch call support.
 */
const prepareAndSignSingleCall = async (
  client: EvmClient,
  account: Account,
  call: Call,
): Promise<Hex> => {
  const prepared = await prepareSingleCallAction(client, {
    account,
    to: call.to,
    data: call.data,
    value: 0n,
  })
  if (prepared.gas) prepared.gas += 5_000n
  return signPreparedAction(client, prepared)
}

const submitSequentialCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
): Promise<Hex> => {
  let lastHash: Hex | undefined
  for (const call of calls) {
    const signed = await prepareAndSignSingleCall(client, account, call)
    const receipt = await submitRawSyncAction(client, {
      serializedTransaction: signed,
    })
    lastHash = receipt.transactionHash
  }
  if (!lastHash) throw new Error('No transaction hash returned.')
  return lastHash
}

/**
 * Submits already-built calls. Uses Tempo batch submission where supported and
 * otherwise falls back to sequential single-call transactions.
 */
export const submitCalls = async (
  client: EvmClient,
  preset: NetworkPreset,
  account: Account,
  calls: readonly Call[],
  feeToken?: Address,
): Promise<Hex> => {
  if (!preset.capabilities.supportsBatchCalls) {
    if (feeToken)
      throw new Error(`${preset.id} does not support fee-token batched calls.`)
    return submitSequentialCalls(client, account, calls)
  }

  const result = await submitCallsAction(client, {
    account,
    calls,
    experimental_fallback: true,
    ...(feeToken ? { feeToken } : {}),
  })
  const hash = result.receipts?.[0]?.transactionHash
  if (!hash) throw new Error('No transaction hash returned.')
  return hash
}

// Signs a single-call transaction via an EIP-1193 provider (e.g. Privy).
// Uses eth_signTransaction which produces a standard EIP-1559 (type 2)
// envelope, bypassing Tempo's custom 0x76 serialization that embedded
// wallets don't support.
export const prepareAndProviderSign = async (
  client: EvmClient,
  account: Account,
  call: Call,
  provider: EIP1193Provider,
): Promise<Hex> => {
  const prepared = await prepareSingleCallAction(client, {
    account,
    to: call.to,
    data: call.data,
    value: 0n,
  })
  if (prepared.gas) prepared.gas += 5_000n

  const txParams = {
    from: account.address,
    to: call.to,
    data: call.data,
    value: '0x0',
    gas: prepared.gas ? numberToHex(prepared.gas) : undefined,
    maxFeePerGas: prepared.maxFeePerGas
      ? numberToHex(prepared.maxFeePerGas)
      : undefined,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas
      ? numberToHex(prepared.maxPriorityFeePerGas)
      : '0x0',
    chainId: prepared.chainId ? numberToHex(prepared.chainId) : undefined,
    nonce: prepared.nonce != null ? numberToHex(prepared.nonce) : undefined,
  }

  return (await provider.request({
    method: 'eth_signTransaction',
    params: [txParams],
  })) as Hex
}

/**
 * Client-broadcast helper for wallet providers that can only sign standard
 * EIP-1559 transactions one call at a time.
 */
export const providerSubmitCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
  provider: EIP1193Provider,
): Promise<Hex> => {
  let lastHash: Hex | undefined
  for (const call of calls) {
    const signed = await prepareAndProviderSign(client, account, call, provider)
    const receipt = await submitRawSyncAction(client, {
      serializedTransaction: signed,
    })
    lastHash = receipt.transactionHash
  }
  if (!lastHash) throw new Error('No transaction hash returned.')
  return lastHash
}
