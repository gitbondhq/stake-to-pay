import type { Account, Address, Chain, Client, Hex, Transport } from 'viem'
import { createClient as viemCreateClient, http, numberToHex } from 'viem'
import {
  prepareTransactionRequest,
  sendRawTransactionSync,
  signTransaction,
} from 'viem/actions'

import type { NetworkPreset } from '../networkConfig.js'

export type EvmClient = Client<Transport, Chain>

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export const createClient = (preset: NetworkPreset): EvmClient =>
  viemCreateClient({
    chain: toChain(preset),
    transport: http(preset.rpcUrl),
  }) as EvmClient

export type Call = { to: Address; data: Hex }

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

const prepareSingleCallAction =
  prepareTransactionRequest as unknown as PrepareSingleCallFn
const signPreparedAction = signTransaction as unknown as SignPreparedFn
const submitRawSyncAction = sendRawTransactionSync as unknown as SubmitRawSyncFn

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

export const submitCalls = async (
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

// Signs a single-call transaction via an EIP-1193 provider (e.g. Privy).
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

const toChain = (preset: NetworkPreset): Chain =>
  ({
    ...preset.chain,
    rpcUrls: {
      default: { http: [preset.rpcUrl] },
      public: { http: [preset.rpcUrl] },
    },
  }) as Chain
