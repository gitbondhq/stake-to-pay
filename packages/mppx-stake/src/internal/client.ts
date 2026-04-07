import type { Account, Address, Chain, Client, Hex, Transport } from 'viem'
import { createClient as viemCreateClient, http } from 'viem'
import { sendTransactionSync } from 'viem/actions'

import type { NetworkPreset } from '../networkConfig.js'

type EvmClient = Client<Transport, Chain>
type Call = { to: Address; data: Hex }

export const createClient = (preset: NetworkPreset): EvmClient =>
  viemCreateClient({
    chain: {
      ...preset.chain,
      rpcUrls: {
        default: { http: [preset.rpcUrl] },
        public: { http: [preset.rpcUrl] },
      },
    } as Chain,
    transport: http(preset.rpcUrl),
  }) as EvmClient

export const submitCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
): Promise<Hex> => {
  let lastHash: Hex | undefined

  for (const call of calls) {
    const receipt = await sendTransactionSync(client, {
      account,
      data: call.data,
      to: call.to,
      value: 0n,
    })
    lastHash = receipt.transactionHash
  }

  if (!lastHash) throw new Error('No transaction hash returned.')
  return lastHash
}
