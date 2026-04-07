import { PaymentRequest } from 'mppx'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import * as Methods from '../Methods.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import { assertEscrowState, buildStakeCalls, matchStakeCalls } from './tx.js'

const payer = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)

const input = {
  amount: '5000000',
  beneficiary: '0x3333333333333333333333333333333333333333',
  chainId: 42431,
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as const

const challenge = PaymentRequest.fromMethod(
  Methods.stake({ name: 'tempo' }),
  input,
) as StakeChallengeRequest

describe('stake transaction helpers', () => {
  it('builds and matches the approve + createEscrow flow', () => {
    const calls = buildStakeCalls({
      amount: 5_000_000n,
      beneficiary: input.beneficiary,
      contract: input.contract,
      counterparty: input.counterparty,
      token: input.token,
      stakeKey: input.stakeKey,
    })

    expect(() =>
      matchStakeCalls({
        beneficiary: input.beneficiary,
        calls,
        challenge,
      }),
    ).not.toThrow()
  })

  it('rejects extra calls', () => {
    const calls = [
      ...buildStakeCalls({
        amount: 5_000_000n,
        beneficiary: input.beneficiary,
        contract: input.contract,
        counterparty: input.counterparty,
        token: input.token,
        stakeKey: input.stakeKey,
      }),
      {
        data: '0x12345678',
        to: input.contract,
      },
    ] as const

    expect(() =>
      matchStakeCalls({
        beneficiary: input.beneficiary,
        calls,
        challenge,
      }),
    ).toThrow(/unexpected call count/i)
  })

  it('verifies the escrow state snapshot', () => {
    expect(() =>
      assertEscrowState(
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          isActive: true,
          payer: payer.address,
          principal: 5_000_000n,
          token: input.token,
        },
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          token: input.token,
          payer: payer.address,
          value: 5_000_000n,
        },
      ),
    ).not.toThrow()
  })
})
