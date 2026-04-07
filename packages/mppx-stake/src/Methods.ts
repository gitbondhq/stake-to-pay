import { Method, z } from 'mppx'

import { baseUnitAmount } from './internal/request.js'

export type StakeMethodParameters = {
  name: string
}

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
      request: z.pipe(
        z.object({
          amount: baseUnitAmount(),
          chainId: z.number(),
          contract: z.address(),
          counterparty: z.address(),
          description: z.optional(z.string()),
          externalId: z.optional(z.string()),
          policy: z.optional(z.string()),
          resource: z.optional(z.string()),
          stakeKey: z.hash(),
          token: z.address(),
        }),
        z.transform(
          ({
            amount,
            chainId,
            contract,
            counterparty,
            description,
            externalId,
            policy,
            resource,
            stakeKey,
            token,
          }) => ({
            amount,
            contract,
            counterparty,
            ...(description !== undefined ? { description } : {}),
            ...(externalId !== undefined ? { externalId } : {}),
            ...(policy !== undefined ? { policy } : {}),
            ...(resource !== undefined ? { resource } : {}),
            stakeKey,
            token,
            methodDetails: {
              chainId,
            },
          }),
        ),
      ),
    },
  })
