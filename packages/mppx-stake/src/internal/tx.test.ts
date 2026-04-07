import { decodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import { erc20Abi } from '../abi/erc20.js'
import { MPPEscrowAbi } from '../abi/MPPEscrow.js'
import { assertEscrowState, buildStakeCalls } from './tx.js'

const payer = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)

const input = {
  amount: 5_000_000n,
  beneficiary: '0x3333333333333333333333333333333333333333',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as const

describe('stake transaction helpers', () => {
  it('builds the approve + createEscrow flow with the requested beneficiary', () => {
    const calls = buildStakeCalls(input)

    expect(calls).toHaveLength(2)

    const approve = decodeFunctionData({
      abi: erc20Abi,
      data: calls[0]!.data,
    })
    expect(approve.functionName).toBe('approve')
    expect(approve.args).toEqual([input.contract, input.amount])

    const createEscrow = decodeFunctionData({
      abi: MPPEscrowAbi,
      data: calls[1]!.data,
    })
    expect(createEscrow.functionName).toBe('createEscrow')
    expect(createEscrow.args).toEqual([
      input.stakeKey,
      input.counterparty,
      input.beneficiary,
      input.token,
      input.amount,
    ])
  })

  it('verifies the escrow state snapshot', () => {
    expect(() =>
      assertEscrowState(
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          isActive: true,
          payer: payer.address,
          principal: input.amount,
          token: input.token,
        },
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          token: input.token,
          payer: payer.address,
          value: input.amount,
        },
      ),
    ).not.toThrow()
  })

  it('accepts escrow principal above the requested minimum', () => {
    expect(() =>
      assertEscrowState(
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          isActive: true,
          payer: payer.address,
          principal: input.amount + 1n,
          token: input.token,
        },
        {
          beneficiary: input.beneficiary,
          counterparty: input.counterparty,
          token: input.token,
          payer: payer.address,
          value: input.amount,
        },
      ),
    ).not.toThrow()
  })
})
