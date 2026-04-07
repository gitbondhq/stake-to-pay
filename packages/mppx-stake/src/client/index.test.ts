import { Mppx, tempo as upstreamTempo } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import type { NetworkPreset } from '../networkConfig.js'
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

  it('accepts valid context with account override', () => {
    const method = stake({ name: methodName, preset })

    expect(
      method.context?.parse({
        account: account.address,
      }),
    ).toEqual({
      account: account.address,
    })
  })

  it('rejects unknown context options', () => {
    const method = stake({ name: methodName, preset })

    expect(() => method.context?.parse({ unexpected: true })).toThrow()
  })
})
