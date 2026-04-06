#!/usr/bin/env node
/**
 * Reads the MPPEscrow ABI from the monorepo forge build output and writes it
 * into the TypeScript SDK source tree.
 *
 * Usage: node scripts/generate-mppx-stake-abi.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const forgeArtifact = resolve(repoRoot, 'out/MPPEscrow.sol/MPPEscrow.json')
const outFile = resolve(repoRoot, 'packages/mppx-stake/src/abi/MPPEscrow.ts')

const artifact = JSON.parse(readFileSync(forgeArtifact, 'utf-8'))
const abi = JSON.stringify(artifact.abi, null, 2)

const source = `// Auto-generated from monorepo forge build output — do not edit manually.
import type { Abi } from 'viem'

export const MPPEscrowAbi = ${abi} as const satisfies Abi
`

writeFileSync(outFile, source)
console.log(`Wrote ${outFile}`)
