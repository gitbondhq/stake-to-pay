import type { Chain } from 'viem'
import { z } from 'zod'

export type NetworkPreset = {
  capabilities: {
    supportsBatchCalls: boolean
    supportsFeePayer: boolean
  }
  chain: Chain
  family: 'evm'
  id: string
}

const networkPresetSchema = z.looseObject({
  id: z.string().trim().min(1),
  family: z.literal('evm'),
  capabilities: z.object({
    supportsBatchCalls: z.boolean(),
    supportsFeePayer: z.boolean(),
  }),
  chain: z.looseObject({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    nativeCurrency: z.object({
      decimals: z.number().int().nonnegative(),
      name: z.string().trim().min(1),
      symbol: z.string().trim().min(1),
    }),
    rpcUrls: z.looseObject({
      default: z.looseObject({
        http: z.array(z.string().url()).min(1),
        webSocket: z.array(z.string().url()).optional(),
      }),
    }),
  }),
})

export const parseNetworkPreset = (value: unknown): NetworkPreset =>
  networkPresetSchema.parse(value) as NetworkPreset
