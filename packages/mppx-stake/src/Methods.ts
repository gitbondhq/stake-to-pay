import { Method, z } from 'mppx'

export type StakeMethodParameters = {
  name: string
}

const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

/**
 * Shared `name/stake` method schema used by both the client and server
 * adapters in this package.
 */
export const stake = ({ name }: StakeMethodParameters) =>
  Method.from({
    name,
    intent: 'stake',
    schema: {
      credential: {
        payload: z.object({
          hash: z.hash(),
          type: z.literal('hash'),
        }),
      },
      request: z.object({
        amount: baseUnitAmount(),
        beneficiary: z.optional(z.address()),
        contract: z.address(),
        counterparty: z.address(),
        description: z.optional(z.string()),
        externalId: z.optional(z.string()),
        policy: z.optional(z.string()),
        resource: z.optional(z.string()),
        stakeKey: z.hash(),
        token: z.address(),
        methodDetails: z.object({
          chainId: z.number(),
        }),
      }),
    },
  })
