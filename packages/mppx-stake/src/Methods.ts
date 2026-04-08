import { Method, z } from 'mppx'

export type StakeMethodParameters = {
  name: string
}

const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

const ecdsaSignature = () =>
  z
    .string()
    .check(
      z.regex(
        /^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/,
        'Invalid ECDSA signature',
      ),
    )

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
          signature: ecdsaSignature(),
          type: z.literal('scope-active'),
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
        scope: z.hash(),
        token: z.address(),
        methodDetails: z.object({
          chainId: z.number(),
        }),
      }),
    },
  })
