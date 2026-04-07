import { PaymentRequest } from 'mppx'
import { Mppx, tempo as upstreamTempo } from 'mppx/server'
import type { Address, Hex, TransactionReceipt } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as Methods from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import { stake } from './index.js'

const account = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const payer = '0x4444444444444444444444444444444444444444' as Address
const counterparty = '0x2222222222222222222222222222222222222222' as Address
const contract = '0x1111111111111111111111111111111111111111' as Address
const token = '0x20C0000000000000000000000000000000000000' as Address
const stakeKey =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex
const chainId = 42431
const txHash =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex
const methodName = 'tempo'
const preset = {
  chain: tempoModerato,
  family: 'evm',
  id: 'tempoModerato',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
} as const satisfies NetworkPreset

const rawInput = {
  amount: '5000000',
  chainId,
  contract,
  counterparty,
  token,
  stakeKey,
}
const routeRequest = {
  amount: rawInput.amount,
  contract: rawInput.contract,
  counterparty: rawInput.counterparty,
  token: rawInput.token,
  stakeKey: rawInput.stakeKey,
}

const stakeMethod = Methods.stake({ name: methodName })
const challengeRequest = PaymentRequest.fromMethod(stakeMethod, rawInput)

const mocks = vi.hoisted(() => ({
  assertEscrowCreatedReceipt: vi.fn(),
  assertEscrowOnChain: vi.fn().mockResolvedValue(undefined),
  createClient: vi.fn(() => ({})),
  getTransactionReceipt: vi.fn(),
}))

vi.mock('../internal/client.js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../internal/tx.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../internal/tx.js')>()),
  assertEscrowCreatedReceipt: mocks.assertEscrowCreatedReceipt,
  assertEscrowOnChain: mocks.assertEscrowOnChain,
}))

vi.mock('viem/actions', async importOriginal => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  getTransactionReceipt: mocks.getTransactionReceipt,
}))

const mockReceipt = {
  logs: [],
  status: 'success',
  transactionHash: txHash,
} as unknown as TransactionReceipt

const makeCredential = (payload: { hash: Hex; type: 'hash' }) => ({
  challenge: {
    id: 'test-challenge-id',
    intent: 'stake' as const,
    method: methodName,
    realm: 'test.example.com',
    request: challengeRequest,
  },
  payload,
  source: `did:pkh:eip155:${chainId}:${payer}`,
})

describe('server stake exports', () => {
  it('composes with an existing method set', () => {
    const methods = [
      ...upstreamTempo({ account }),
      stake({ name: methodName, preset }),
    ] as const

    expect(methods).toHaveLength(3)
    expect(methods[0].intent).toBe('charge')
    expect(methods[1].intent).toBe('session')
    expect(methods[2].intent).toBe('stake')
    expect(methods[2].name).toBe(methodName)
  })

  it('exposes the standalone stake server method', () => {
    const method = stake({ name: methodName, preset })
    expect(method.name).toBe(methodName)
    expect(method.intent).toBe('stake')
  })

  it('wires stake into Mppx.create()', () => {
    const mppx = Mppx.create({
      methods: [
        [
          ...upstreamTempo({ account }),
          stake({ name: methodName, preset }),
        ] as const,
      ],
      secretKey: 'test-secret',
    })

    expect(typeof mppx.stake).toBe('function')
    expect(typeof mppx[`${methodName}/stake`]).toBe('function')
  })
})

describe('server stake verification', () => {
  it('keeps route defaults limited to shared request fields', () => {
    const method = stake({
      contract,
      counterparty,
      token,
      description: 'Stake required',
      name: methodName,
      preset,
    })

    expect(method.defaults).toEqual({
      chainId,
      contract,
      counterparty,
      token,
      description: 'Stake required',
    })
    expect(method.defaults).not.toHaveProperty('externalId')
  })

  describe('verify', () => {
    beforeEach(() => vi.clearAllMocks())

    it('fetches receipt and verifies on-chain state', async () => {
      mocks.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const credential = makeCredential({ hash: txHash, type: 'hash' })
      const result = await method.verify({
        credential,
        request: routeRequest,
      })

      expect(result).toEqual({
        method: methodName,
        reference: txHash,
        status: 'success',
        timestamp: expect.any(String),
      })
      expect(mocks.createClient).toHaveBeenCalledWith(preset)
      expect(mocks.getTransactionReceipt).toHaveBeenCalledOnce()
      expect(mocks.assertEscrowCreatedReceipt).toHaveBeenCalledOnce()
      expect(mocks.assertEscrowOnChain).toHaveBeenCalledOnce()
    })

    it('rejects when challenge request does not match', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const mismatchedRequest = PaymentRequest.fromMethod(stakeMethod, {
        ...rawInput,
        amount: '9999999',
      })
      const credential = {
        ...makeCredential({ hash: txHash, type: 'hash' }),
        challenge: {
          id: 'test-id',
          intent: 'stake' as const,
          method: methodName,
          realm: 'test.example.com',
          request: mismatchedRequest,
        },
      }

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/does not match/i)
    })

    it('rejects when source DID chainId does not match', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const credential = {
        ...makeCredential({ hash: txHash, type: 'hash' }),
        source: `did:pkh:eip155:1:${payer}`,
      }

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/chainId/i)
    })
  })
})
