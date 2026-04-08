import type { Chain, Client, Transport } from 'viem'
import { createClient as viemCreateClient, http } from 'viem'

import type { NetworkPreset } from '../networkConfig.js'

type EvmClient = Client<Transport, Chain>

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
