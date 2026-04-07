import { z } from 'zod'

export type NetworkPreset = {
  chain: {
    id: number
    name: string
    nativeCurrency: {
      decimals: number
      name: string
      symbol: string
    }
  }
  family: 'evm'
  id: string
  rpcUrl: string
}

const networkPresetSchema = z.looseObject({
  id: z.string().trim().min(1),
  family: z.literal('evm'),
  rpcUrl: z.string().url(),
  chain: z.looseObject({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    nativeCurrency: z.object({
      decimals: z.number().int().nonnegative(),
      name: z.string().trim().min(1),
      symbol: z.string().trim().min(1),
    }),
  }),
})

export const parseNetworkPreset = (value: unknown): NetworkPreset =>
  networkPresetSchema.parse(value) as NetworkPreset
