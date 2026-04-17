#!/usr/bin/env node

import { Command } from 'commander'

import {
  ACCOUNT_ENV,
  CONTRACT_ENV,
  PASSWORD_FILE_ENV,
  PRIVATE_KEY_ENV,
  RESOURCE_URL_ENV,
  RPC_URL_ENV,
} from './cli/context.js'
import { registerChallengeCommands } from './commands/challenge.js'
import { registerEscrowCommands } from './commands/escrow.js'

const program = new Command()

program
  .name('stake-mpp')
  .description('CLI for the MPPEscrow contract')
  .showHelpAfterError()
  .addHelpText(
    'after',
    `
Environment variables:
  ${RPC_URL_ENV}        Default RPC URL
  ${CONTRACT_ENV}       Default MPPEscrow contract address
  ${PRIVATE_KEY_ENV}    Default private key for write commands
  ${ACCOUNT_ENV}        Default cast wallet account name for write commands
  ${PASSWORD_FILE_ENV}  Default keystore password file for write commands
  ${RESOURCE_URL_ENV}   Default protected demo resource URL for challenge commands

Repo config:
  config.json          Shared chainId, optional rpcUrl, and escrow defaults at the repo root
`,
  )

registerEscrowCommands(program)
registerChallengeCommands(program)

try {
  await program.parseAsync(process.argv)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
