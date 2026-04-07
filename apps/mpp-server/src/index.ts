import process from 'node:process'

import { stake } from '@gitbondhq/mppx-stake/server'
import express from 'express'
import { Mppx } from 'mppx/server'

import { loadConfig, toPublicConfig } from './config.js'
import { createFakeDocument } from './document.js'
import { resolveStakeRouteOptions } from './stakeRoute.js'
import { getOrigin, sendWebResponse, toWebRequest } from './web.js'

const config = loadConfig()
const fakeDocument = createFakeDocument(config.documentTitle)
const configuredStakeMethod = stake({
  ...(config.stakeBeneficiary ? { beneficiary: config.stakeBeneficiary } : {}),
  contract: config.stakeContract,
  counterparty: config.stakeCounterparty,
  token: config.stakeToken,
  description: config.stakeDescription,
  name: config.methodName,
  preset: config.networkPreset,
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
  const origin = getOrigin(req, config)

  res.json({
    service: 'stake-mpp-demo-server',
    paywall: {
      intent: stakeIntent,
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
    const stakeMethod = mppx.stake
    if (!stakeMethod) {
      throw new Error('Stake method is not configured.')
    }

    const result = await stakeMethod(
      resolveStakeRouteOptions(req, config, configuredStakeMethod.name),
    )(toWebRequest(req, config))

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
  console.log(
    `[mpp-server] preview route: ${origin}${config.documentPreviewPath}`,
  )
  console.log(`[mpp-server] protected route: ${origin}${config.documentPath}`)
  console.log(
    `[mpp-server] network=${config.networkPreset.id} stake amount=${config.stakeAmount} chainId=${config.networkPreset.chain.id} contract=${config.stakeContract}`,
  )
})

process.on('uncaughtException', error => {
  console.error('[mpp-server] uncaught exception', error)
  process.exitCode = 1
})

process.on('unhandledRejection', error => {
  console.error('[mpp-server] unhandled rejection', error)
  process.exitCode = 1
})
