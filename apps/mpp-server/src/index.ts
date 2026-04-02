import { randomBytes } from 'node:crypto'
import process from 'node:process'

import { stake, Mppx } from '@gitbondhq/mppx-escrow/server'
import { Credential } from 'mppx'
import express from 'express'

import { loadConfig, toPublicConfig, type AppConfig } from './config.js'
import { createFakeDocument } from './document.js'

type StakeRouteOptions = {
  amount: string
  externalId: string
  policy: string
  resource: string
  stakeKey: `0x${string}`
}

type StakeChallengeRequest = {
  amount: string
  externalId?: string
  methodDetails: {
    counterparty?: string
    policy?: string
    resource?: string
    stakeKey: `0x${string}`
  }
}

const config = loadConfig()
const fakeDocument = createFakeDocument(config.documentTitle)

const mppx = Mppx.create({
  methods: [
    stake({
      ...(config.stakeBeneficiary
        ? { beneficiary: config.stakeBeneficiary }
        : {}),
      chainId: config.stakeChainId,
      contract: config.stakeContract,
      counterparty: config.stakeCounterparty,
      currency: config.stakeCurrency,
      description: config.stakeDescription,
    }),
  ],
  secretKey: config.mppSecretKey,
})

const app = express()
app.disable('x-powered-by')

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.get('/', (req, res) => {
  const origin = getOrigin(req, config)

  res.json({
    service: 'stake-mpp-demo-server',
    paywall: {
      intent: 'tempo/stake',
      ...toPublicConfig(config),
    },
    example: {
      preview: `curl ${origin}${config.documentPreviewPath}`,
      protected: `npx mppx ${origin}${config.documentPath}`,
    },
  })
})

app.get(config.documentPreviewPath, (_req, res) => {
  res.json({
    locked: true,
    preview: fakeDocument.excerpt,
    title: config.documentTitle,
    unlockPath: config.documentPath,
  })
})

app.get(config.documentPath, async (req, res) => {
  try {
    const result = await mppx.stake(resolveStakeRouteOptions(req, config))(
      toWebRequest(req, config),
    )

    if (result.status === 402) {
      await sendWebResponse(res, result.challenge)
      return
    }

    const response = result.withReceipt(
      Response.json(
        {
          body: fakeDocument.fullText,
          slug: config.documentSlug,
          title: config.documentTitle,
          unlockedAt: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      ),
    )

    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      error: message,
    })
  }
})

app.listen(config.port, config.host, () => {
  const displayHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
  const origin = `http://${displayHost}:${config.port}`

  console.log(`[mpp-server] listening on ${origin}`)
  console.log(`[mpp-server] preview route: ${origin}${config.documentPreviewPath}`)
  console.log(`[mpp-server] protected route: ${origin}${config.documentPath}`)
  console.log(
    `[mpp-server] stake amount=${config.stakeAmount} chainId=${config.stakeChainId} contract=${config.stakeContract}`,
  )
})

const createStakeRouteOptions = (config: AppConfig): StakeRouteOptions => {
  const nonce = randomBytes(6).toString('hex')

  return {
    amount: config.stakeAmount,
    externalId: `document:${config.documentSlug}:${Date.now()}:${nonce}`,
    policy: config.stakePolicy,
    resource: config.stakeResource,
    stakeKey: `0x${randomBytes(32).toString('hex')}`,
  }
}

const getOrigin = (
  req: {
    headers: Record<string, string | string[] | undefined>
    protocol: string
  },
  config: AppConfig,
): string => {
  const hostHeader = req.headers.host
  const host =
    typeof hostHeader === 'string' && hostHeader.length > 0
      ? hostHeader
      : `${config.host}:${config.port}`

  return `${req.protocol}://${host}`
}

const getPaymentCredential = (
  req: {
    headers: Record<string, string | string[] | undefined>
  },
) => {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string') return null

  try {
    return Credential.deserialize(authorization)
  } catch {
    return null
  }
}

const isStakeChallengeRequest = (
  value: unknown,
): value is StakeChallengeRequest => {
  if (!value || typeof value !== 'object') return false

  const request = value as {
    amount?: unknown
    externalId?: unknown
    methodDetails?: {
      counterparty?: unknown
      policy?: unknown
      resource?: unknown
      stakeKey?: unknown
    }
  }

  return (
    typeof request.amount === 'string' &&
    (!('externalId' in request) || request.externalId === undefined || typeof request.externalId === 'string') &&
    !!request.methodDetails &&
    (!('counterparty' in request.methodDetails) ||
      request.methodDetails.counterparty === undefined ||
      typeof request.methodDetails.counterparty === 'string') &&
    (!('policy' in request.methodDetails) ||
      request.methodDetails.policy === undefined ||
      typeof request.methodDetails.policy === 'string') &&
    (!('resource' in request.methodDetails) ||
      request.methodDetails.resource === undefined ||
      typeof request.methodDetails.resource === 'string') &&
    typeof request.methodDetails.stakeKey === 'string' &&
    request.methodDetails.stakeKey.startsWith('0x')
  )
}

const resolveStakeRouteOptions = (
  req: {
    headers: Record<string, string | string[] | undefined>
  },
  config: AppConfig,
): StakeRouteOptions => {
  const credential = getPaymentCredential(req)

  if (
    credential?.challenge.intent === 'stake' &&
    credential.challenge.method === 'tempo' &&
    isStakeChallengeRequest(credential.challenge.request) &&
    credential.challenge.request.methodDetails.counterparty ===
      config.stakeCounterparty &&
    credential.challenge.request.methodDetails.resource === config.stakeResource
  ) {
    return {
      amount: credential.challenge.request.amount,
      externalId:
        typeof credential.challenge.request.externalId === 'string'
          ? credential.challenge.request.externalId
          : `document:${config.documentSlug}:retry`,
      policy:
        typeof credential.challenge.request.methodDetails.policy === 'string'
          ? credential.challenge.request.methodDetails.policy
          : config.stakePolicy,
      resource: config.stakeResource,
      stakeKey: credential.challenge.request.methodDetails.stakeKey,
    }
  }

  return createStakeRouteOptions(config)
}

const sendWebResponse = async (
  res: {
    end(body?: Uint8Array): void
    setHeader(name: string, value: string): void
    status(code: number): typeof res
  },
  response: Response,
) => {
  res.status(response.status)
  for (const [key, value] of response.headers) res.setHeader(key, value)

  const body = new Uint8Array(await response.arrayBuffer())
  res.end(body)
}

const toWebRequest = (
  req: {
    headers: Record<string, string | string[] | undefined>
    method: string
    originalUrl: string
    protocol: string
  },
  config: AppConfig,
): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else if (typeof value === 'string') headers.set(key, value)
  }

  return new Request(`${getOrigin(req, config)}${req.originalUrl}`, {
    headers,
    method: req.method,
  })
}

process.on('uncaughtException', error => {
  console.error('[mpp-server] uncaught exception', error)
  process.exitCode = 1
})

process.on('unhandledRejection', error => {
  console.error('[mpp-server] unhandled rejection', error)
  process.exitCode = 1
})
