import { Challenge, Credential } from 'mppx'
import { Mppx, tempo as upstreamTempo } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { stake as createStakeMethod } from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import { recoverScopeActiveProofSigner } from '../internal/scopeActiveProof.js'
import type { StakeCredentialPayload } from '../stakeSchema.js'
import { stake } from './index.js'

const payerAccount = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const beneficiaryAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)
const methodName = 'tempo'
const preset = {
  chain: tempoModerato,
  family: 'evm',
  id: 'tempoModerato',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
} as const satisfies NetworkPreset
const request = {
  amount: '5000000',
  beneficiary: beneficiaryAccount.address,
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  scope:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  token: '0x20C0000000000000000000000000000000000000',
  methodDetails: {
    chainId: preset.chain.id,
  },
} as const

describe('client stake exports', () => {
  it('composes with an existing method set', () => {
    const methods = [
      ...upstreamTempo({ account: payerAccount }),
      stake({ account: payerAccount, name: methodName, preset }),
    ] as const

    expect(methods).toHaveLength(3)
    expect(methods[0].intent).toBe('charge')
    expect(methods[1].intent).toBe('session')
    expect(methods[2].intent).toBe('stake')
    expect(methods[2].name).toBe(methodName)
  })

  it('exposes the standalone stake client method', () => {
    const method = stake({ account: payerAccount, name: methodName, preset })
    expect(method.name).toBe(methodName)
    expect(method.intent).toBe('stake')
  })

  it('wires stake into Mppx.create()', () => {
    const mppx = Mppx.create({
      methods: [
        [
          ...upstreamTempo({ account: payerAccount }),
          stake({ account: payerAccount, name: methodName, preset }),
        ] as const,
      ],
      polyfill: false,
    })

    expect(mppx.methods.some(method => method.intent === 'stake')).toBe(true)
  })

  it('does not expose client context overrides', () => {
    const method = stake({ account: payerAccount, name: methodName, preset })

    expect(method.context).toBeUndefined()
  })

  it('signs a scope-active credential for an already-active escrow', async () => {
    const method = stake({
      account: payerAccount,
      beneficiaryAccount,
      name: methodName,
      preset,
    })
    const challenge = Challenge.fromMethod(createStakeMethod({ name: methodName }), {
      expires: '2026-01-01T00:00:00.000Z',
      id: 'challenge-1',
      realm: 'api.example.com',
      request,
    })
    // `Challenge.fromMethod` widens `intent`/`method` to `string` in its return
    // type, so we cast here to satisfy the literal-typed `method.createCredential`.
    const serialized = await method.createCredential({
      challenge: challenge as Parameters<
        typeof method.createCredential
      >[0]['challenge'],
    })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.payload.type).toBe('scope-active')
    expect(credential.source).toBe(
      `did:pkh:eip155:${preset.chain.id}:${beneficiaryAccount.address}`,
    )

    await expect(
      recoverScopeActiveProofSigner({
        amount: request.amount,
        beneficiary: beneficiaryAccount.address,
        chainId: preset.chain.id,
        challengeId: challenge.id,
        contract: request.contract,
        counterparty: request.counterparty,
        expires: challenge.expires,
        scope: request.scope,
        signature: credential.payload.signature,
        token: request.token,
      }),
    ).resolves.toBe(beneficiaryAccount.address)
  })

  it('binds counterparty, token, and amount in the scope-active proof', async () => {
    const method = stake({
      account: payerAccount,
      beneficiaryAccount,
      name: methodName,
      preset,
    })
    const challenge = Challenge.fromMethod(createStakeMethod({ name: methodName }), {
      expires: '2026-01-01T00:00:00.000Z',
      id: 'challenge-2',
      realm: 'api.example.com',
      request,
    })
    const serialized = await method.createCredential({
      challenge: challenge as Parameters<
        typeof method.createCredential
      >[0]['challenge'],
    })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    await expect(
      recoverScopeActiveProofSigner({
        amount: '5000001',
        beneficiary: beneficiaryAccount.address,
        chainId: preset.chain.id,
        challengeId: challenge.id,
        contract: request.contract,
        counterparty: request.counterparty,
        expires: challenge.expires,
        scope: request.scope,
        signature: credential.payload.signature,
        token: request.token,
      }),
    ).resolves.not.toBe(beneficiaryAccount.address)

    await expect(
      recoverScopeActiveProofSigner({
        amount: request.amount,
        beneficiary: beneficiaryAccount.address,
        chainId: preset.chain.id,
        challengeId: challenge.id,
        contract: request.contract,
        counterparty: '0x3333333333333333333333333333333333333333',
        expires: challenge.expires,
        scope: request.scope,
        signature: credential.payload.signature,
        token: request.token,
      }),
    ).resolves.not.toBe(beneficiaryAccount.address)

    await expect(
      recoverScopeActiveProofSigner({
        amount: request.amount,
        beneficiary: beneficiaryAccount.address,
        chainId: preset.chain.id,
        challengeId: challenge.id,
        contract: request.contract,
        counterparty: request.counterparty,
        expires: challenge.expires,
        scope: request.scope,
        signature: credential.payload.signature,
        token: '0x3333333333333333333333333333333333333333',
      }),
    ).resolves.not.toBe(beneficiaryAccount.address)
  })
})
