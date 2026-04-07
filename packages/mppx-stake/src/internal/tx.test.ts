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
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as const

describe('stake transaction helpers', () => {
  it('builds the approve + createEscrow flow with payer as beneficiary', () => {
    const calls = buildStakeCalls({
      ...input,
      payer: payer.address,
    })

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
      payer.address,
      input.token,
      input.amount,
    ])
  })

  it('verifies the escrow state snapshot', () => {
    expect(() =>
      assertEscrowState(
        {
          beneficiary: payer.address,
          counterparty: input.counterparty,
          isActive: true,
          payer: payer.address,
          principal: input.amount,
          token: input.token,
        },
        {
          counterparty: input.counterparty,
          token: input.token,
          payer: payer.address,
          value: input.amount,
        },
      ),
    ).not.toThrow()
  })
})
