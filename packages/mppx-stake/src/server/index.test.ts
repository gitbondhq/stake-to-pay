import { PaymentRequest } from 'mppx'
import { Mppx, tempo as upstreamTempo } from 'mppx/server'
import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as Methods from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import { signScopeActiveProof } from '../internal/scopeActiveProof.js'
import { stake } from './index.js'

const account = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const beneficiaryAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)
const beneficiary = beneficiaryAccount.address
const counterparty = '0x2222222222222222222222222222222222222222' as Address
const contract = '0x1111111111111111111111111111111111111111' as Address
const token = '0x20C0000000000000000000000000000000000000' as Address
const scope =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const alternateScope =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const chainId = 42431
const methodName = 'tempo'
const externalId = 'document:test:challenge'
const policy = 'slash'
const expires = '2026-01-01T00:00:00.000Z'
const preset = {
  chain: tempoModerato,
  family: 'evm',
  id: 'tempoModerato',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
} as const satisfies NetworkPreset
const resource = 'documents/test'

const rawInput = {
  amount: '5000000',
  contract,
  counterparty,
  externalId,
  policy,
  resource,
  scope,
  token,
  methodDetails: {
    chainId,
  },
}
const routeRequest = {
  amount: rawInput.amount,
  contract: rawInput.contract,
  counterparty: rawInput.counterparty,
  externalId: rawInput.externalId,
  policy: rawInput.policy,
  resource: rawInput.resource,
  scope: rawInput.scope,
  token: rawInput.token,
}

const stakeMethod = Methods.stake({ name: methodName })
const challengeRequest = PaymentRequest.fromMethod(stakeMethod, rawInput)

const mocks = vi.hoisted(() => ({
  assertEscrowOnChain: vi.fn().mockResolvedValue(undefined),
  createClient: vi.fn(() => ({})),
}))

vi.mock('../internal/client.js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../internal/tx.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../internal/tx.js')>()),
  assertEscrowOnChain: mocks.assertEscrowOnChain,
}))

const makeCredential = async (parameters?: {
  challengeRequest?: typeof challengeRequest
  source?: string
}) => {
  const request = parameters?.challengeRequest ?? challengeRequest
  const signature = await signScopeActiveProof(beneficiaryAccount, {
    beneficiary,
    chainId,
    challengeId: 'test-challenge-id',
    contract,
    expires,
    scope: request.scope as `0x${string}`,
  })

  return {
    challenge: {
      expires,
      id: 'test-challenge-id',
      intent: 'stake' as const,
      method: methodName,
      realm: 'test.example.com',
      request,
    },
    payload: {
      signature,
      type: 'scope-active' as const,
    },
    source:
      parameters?.source ?? `did:pkh:eip155:${chainId}:${beneficiaryAccount.address}`,
  }
}

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
      contract,
      counterparty,
      token,
      description: 'Stake required',
      methodDetails: {
        chainId,
      },
    })
    expect(method.defaults).not.toHaveProperty('externalId')
  })

  it('reuses echoed scope and externalId when a credential is present', async () => {
    const method = stake({
      contract,
      token,
      name: methodName,
      preset,
    })
    const credential = await makeCredential()

    const request = await method.request!({
      credential,
      request: {
        ...routeRequest,
        externalId: 'document:test:fresh',
        scope: alternateScope,
      },
    })

    expect(request).toEqual({
      ...routeRequest,
      methodDetails: {
        chainId,
      },
    })
  })

  describe('verify', () => {
    beforeEach(() => vi.clearAllMocks())

    it('recovers the beneficiary proof and verifies on-chain state', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const credential = await makeCredential()
      const result = await method.verify({
        credential,
        request: routeRequest,
      })

      expect(result).toEqual({
        method: methodName,
        reference: `${contract}:${scope}:${beneficiary}`,
        status: 'success',
        timestamp: expect.any(String),
      })
      expect(mocks.createClient).toHaveBeenCalledWith(preset)
      expect(mocks.assertEscrowOnChain).toHaveBeenCalledWith(
        {},
        contract,
        expect.objectContaining({
          beneficiary,
          counterparty,
          scope,
          token,
          value: 5_000_000n,
        }),
      )
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
      const credential = await makeCredential({
        challengeRequest: mismatchedRequest,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/does not match/i)
    })

    it('rejects when challenge resource does not match', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const mismatchedRequest = PaymentRequest.fromMethod(stakeMethod, {
        ...rawInput,
        resource: 'documents/other',
      })
      const credential = await makeCredential({
        challengeRequest: mismatchedRequest,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/resource/i)
    })

    it('rejects when source DID chainId does not match', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const credential = await makeCredential({
        source: `did:pkh:eip155:1:${beneficiary}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/chainId/i)
    })

    it('rejects when source DID address does not match the recovered beneficiary', async () => {
      const method = stake({
        contract,
        token,
        name: methodName,
        preset,
      })
      const wrongSourceAddress =
        '0x4444444444444444444444444444444444444444' as Address
      const credential = await makeCredential({
        source: `did:pkh:eip155:${chainId}:${wrongSourceAddress}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/recovered beneficiary/i)
    })
  })
})
