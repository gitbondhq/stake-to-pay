import { createHash } from 'node:crypto'
import process from 'node:process'

import { serverStake } from '@gitbondhq/mppx-stake/server'
import express from 'express'
import { Mppx } from 'mppx/server'

import { loadConfig } from './config.js'
import { loadDocument } from './content.js'
import { getOrigin, sendWebResponse, toWebRequest } from './web.js'

function deriveScope(parameters: { policy?: string; resource: string }) {
  return `0x${createHash('sha256')
    .update(`${parameters.policy ?? ''}:${parameters.resource}`)
    .digest('hex')}` as `0x${string}`
}

const config = loadConfig()
const document = loadDocument()
const { chainId, escrow } = config.repoConfig
const documentScope = deriveScope({
  policy: escrow.policy,
  resource: document.resource,
})
const configuredStakeMethod = serverStake({
  chainId,
  contract: escrow.contract,
  counterparty: escrow.counterparty,
  token: escrow.token,
  description: escrow.description,
})
const stakeIntent = `${configuredStakeMethod.name}/${configuredStakeMethod.intent}`

const mppx = Mppx.create({
  methods: [configuredStakeMethod],
  secretKey: config.mppSecretKey,
})

const app = express()
app.disable('x-powered-by')

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.get('/', (req, res) => {
  const origin = getOrigin(req, { host: config.host, port: config.port })

  res.json({
    service: 'stake-mpp-demo-server',
    paywall: {
      intent: stakeIntent,
      documentPath: document.path,
      documentPreviewPath: document.previewPath,
      documentSlug: document.slug,
      documentTitle: document.title,
      host: config.host,
      port: config.port,
      stakeAmount: escrow.amount,
      stakeChainId: chainId,
      stakeContract: escrow.contract,
      stakeCounterparty: escrow.counterparty,
      stakeDescription: escrow.description,
      stakePolicy: escrow.policy,
      stakeResource: document.resource,
      stakeScope: documentScope,
      stakeToken: escrow.token,
      stakeTokenWhitelist: escrow.tokenWhitelist,
    },
    example: {
      preview: `curl ${origin}${document.previewPath}`,
      protected: `npx mppx ${origin}${document.path}`,
    },
  })
})

app.get(document.previewPath, (_req, res) => {
  res.json({
    locked: true,
    preview: document.preview,
    title: document.title,
    unlockPath: document.path,
  })
})

app.get(document.path, async (req, res) => {
  try {
    const stakeMethod = mppx.stake
    if (!stakeMethod) {
      throw new Error('Stake method is not configured.')
    }

    const result = await stakeMethod(createStakeRouteRequest())(
      toWebRequest(req, { host: config.host, port: config.port }),
    )

    if (result.status === 402) {
      await sendWebResponse(res, result.challenge)
      return
    }

    const response = result.withReceipt(
      Response.json(
        {
          body: document.fullText,
          slug: document.slug,
          title: document.title,
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
    console.error('[mpp-server] request failed', error)
    // Keep client-facing errors generic in the demo. Production servers should
    // map verification failures onto stable public error codes/messages.
    res.status(500).json({
      error: 'Internal server error',
    })
  }
})

const server = app.listen(config.port, config.host, () => {
  const displayHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
  const origin = `http://${displayHost}:${config.port}`

  console.log(`[mpp-server] listening on ${origin}`)
  console.log(`[mpp-server] preview route: ${origin}${document.previewPath}`)
  console.log(`[mpp-server] protected route: ${origin}${document.path}`)
  console.log(
    `[mpp-server] stake amount=${escrow.amount} chainId=${chainId} contract=${escrow.contract}`,
  )
})

const shutdown = () => {
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('uncaughtException', error => {
  console.error('[mpp-server] uncaught exception', error)
  process.exitCode = 1
})

process.on('unhandledRejection', error => {
  console.error('[mpp-server] unhandled rejection', error)
  process.exitCode = 1
})

const createStakeRouteRequest = () => {
  return {
    amount: escrow.amount,
    externalId: `document:${document.slug}`,
    policy: escrow.policy,
    resource: document.resource,
    scope: documentScope,
  }
}
