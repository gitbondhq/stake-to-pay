import { PaymentRequest } from 'mppx'
import { describe, expect, it } from 'vitest'

import * as Methods from './Methods.js'

const request = {
  amount: '5000000',
  beneficiary: '0x3333333333333333333333333333333333333333',
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

const stakeMethod = Methods.stake({ name: 'tempo' })

describe('stake method schema', () => {
  it('exposes the expected method identity', () => {
    expect(stakeMethod.name).toBe('tempo')
    expect(stakeMethod.intent).toBe('stake')
  })

  it('parses a valid request into the wire shape', () => {
    const parsed = PaymentRequest.fromMethod(stakeMethod, request)

    expect(parsed).toEqual({
      amount: '5000000',
      beneficiary: request.beneficiary,
      counterparty: request.counterparty,
      contract: request.contract,
      description: request.description,
      externalId: request.externalId,
      policy: request.policy,
      resource: request.resource,
      stakeKey: request.stakeKey,
      token: request.token,
      methodDetails: request.methodDetails,
    })
  })

  it('rejects decimal amounts', () => {
    expect(() =>
      PaymentRequest.fromMethod(stakeMethod, { ...request, amount: '5.00' }),
    ).toThrow(/base-unit amount/i)
  })

  it('rejects an invalid stake key', () => {
    expect(() =>
      PaymentRequest.fromMethod(stakeMethod, {
        ...request,
        stakeKey: '0x1234',
      }),
    ).toThrow(/hash/i)
  })

  it('accepts hash payloads', () => {
    expect(
      stakeMethod.schema.credential.payload.parse({
        hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        type: 'hash',
      }),
    ).toEqual({
      hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      type: 'hash',
    })
  })
})
