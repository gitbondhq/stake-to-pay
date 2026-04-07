import { Challenge, Credential } from 'mppx'
import { Mppx, tempo as upstreamTempo } from 'mppx/client'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { stake as createStakeMethod } from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import type { StakeCredentialPayload } from '../stakeSchema.js'
import { stake } from './index.js'

const account = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const methodName = 'tempo'
const preset = {
  chain: tempoModerato,
  family: 'evm',
  id: 'tempoModerato',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
} as const satisfies NetworkPreset
const txHash =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex
const request = {
  amount: '5000000',
  beneficiary: '0x3333333333333333333333333333333333333333',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  methodDetails: {
    chainId: preset.chain.id,
  },
} as const

describe('client stake exports', () => {
  it('composes with an existing method set', () => {
    const methods = [
      ...upstreamTempo({ account }),
      stake({ account, name: methodName, preset }),
    ] as const

    expect(methods).toHaveLength(3)
    expect(methods[0].intent).toBe('charge')
    expect(methods[1].intent).toBe('session')
    expect(methods[2].intent).toBe('stake')
    expect(methods[2].name).toBe(methodName)
  })

  it('exposes the standalone stake client method', () => {
    const method = stake({ account, name: methodName, preset })
    expect(method.name).toBe(methodName)
    expect(method.intent).toBe('stake')
  })

  it('wires stake into Mppx.create()', () => {
    const mppx = Mppx.create({
      methods: [
        [
          ...upstreamTempo({ account }),
          stake({ account, name: methodName, preset }),
        ] as const,
      ],
      polyfill: false,
    })

    expect(mppx.methods.some(method => method.intent === 'stake')).toBe(true)
  })

  it('does not expose client context overrides', () => {
    const method = stake({ account, name: methodName, preset })

    expect(method.context).toBeUndefined()
  })

  it('lets the app provide the final escrow hash from the request', async () => {
    const getTransactionHash = vi.fn(
      async ({ account: receivedAccount, request: receivedRequest }) => {
        expect(receivedAccount).toBe(account)
        expect(receivedRequest).toEqual(request)
        return txHash
      },
    )
    const method = stake({
      account,
      getTransactionHash,
      name: methodName,
      preset,
    })
    const challenge = Challenge.fromMethod(
      createStakeMethod({ name: methodName }),
      {
        id: 'challenge-1',
        realm: 'api.example.com',
        request,
      },
    )
    const serialized = await method.createCredential({ challenge })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(getTransactionHash).toHaveBeenCalledOnce()
    expect(credential.payload).toEqual({
      hash: txHash,
      type: 'hash',
    })
    expect(credential.source).toBe(
      `did:pkh:eip155:${preset.chain.id}:${account.address}`,
    )
  })
})
