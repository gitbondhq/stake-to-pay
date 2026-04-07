import { Challenge } from 'mppx'
import { describe, expect, it } from 'vitest'

import type { StakeChallenge } from './challenge.js'
import { parseStakeChallenge } from './challenge.js'
import { stake as createStakeMethod } from './Methods.js'

const methodName = 'tempo'
const stakeMethod = createStakeMethod({ name: methodName })

const request = {
  amount: '5000000',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  description: 'Stake required',
  externalId: 'github:owner/repo:pr:1',
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  methodDetails: {
    chainId: 42431,
  },
} as const

describe('stake challenge helpers', () => {
  it('parses a stake challenge object into the shared typed request shape', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-1',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge

    expect(
      parseStakeChallenge(original, {
        methodName,
      }),
    ).toEqual(original)
  })

  it('parses a 402 response carrying a stake challenge', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-2',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge
    const response = new Response(null, {
      headers: {
        'WWW-Authenticate': Challenge.serialize(original),
      },
      status: 402,
    })

    expect(
      parseStakeChallenge(response, {
        methodName,
      }),
    ).toEqual(original)
  })
})
