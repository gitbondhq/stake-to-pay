#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const forgeArtifact = resolve(__dirname, '../../../out/MPPEscrow.sol/MPPEscrow.json')
const outFile = resolve(__dirname, '../src/generated/MPPEscrowAbi.ts')

const artifact = JSON.parse(readFileSync(forgeArtifact, 'utf-8'))
const abi = JSON.stringify(artifact.abi, null, 2)

mkdirSync(dirname(outFile), { recursive: true })

const source = `// Auto-generated from local forge build output — do not edit manually.
import type { Abi } from 'viem'

export const MPPEscrowAbi = ${abi} as const satisfies Abi
`

writeFileSync(outFile, source)
console.log(`Wrote ${outFile}`)
