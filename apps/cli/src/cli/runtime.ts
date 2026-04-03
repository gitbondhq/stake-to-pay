import { Command } from 'commander'
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { CONTRACT_ENV, PRIVATE_KEY_ENV, RPC_URL_ENV, repoConfig, selectedNetwork } from './context.js'
import { printJson } from './format.js'
import { asAddress, asHex32, requiredString } from './parsing.js'
import type { BaseCommandOptions, WriteCommandOptions } from './types.js'

export function withReadOptions(command: Command): Command {
  return command
    .option(
      '--rpc-url <url>',
      `JSON-RPC URL. Can also be provided via ${RPC_URL_ENV}.`,
    )
    .option(
      '--contract <address>',
      `MPPEscrow contract address. Can also be provided via ${CONTRACT_ENV}.`,
    )
}

export function withWriteOptions(command: Command): Command {
  return withReadOptions(command)
    .option(
      '--private-key <hex>',
      `Private key for the signing account. Can also be provided via ${PRIVATE_KEY_ENV}.`,
    )
    .option('--no-wait', 'Return after broadcast instead of waiting for a receipt')
}

export async function executeRead(
  options: BaseCommandOptions,
  callback: (context: {
    address: Address
    publicClient: ReturnType<typeof createPublicClient>
  }) => Promise<unknown>,
): Promise<void> {
  const publicClient = createPublicClient({
    transport: http(resolveRpcUrl(options)),
  })
  const address = resolveContractAddress(options)

  const result = await callback({ address, publicClient })
  printJson(result)
}

export async function executeWrite(
  options: WriteCommandOptions,
  callback: (context: {
    account: ReturnType<typeof privateKeyToAccount>
    address: Address
    publicClient: ReturnType<typeof createPublicClient>
    walletClient: ReturnType<typeof createWalletClient>
  }) => Promise<{ functionName: string; hash: Hex; payer?: Address }>,
): Promise<void> {
  const publicClient = createPublicClient({
    transport: http(resolveRpcUrl(options)),
  })
  const account = privateKeyToAccount(resolvePrivateKey(options))
  const address = resolveContractAddress(options)
  const walletClient = createWalletClient({
    account,
    transport: http(resolveRpcUrl(options)),
  })

  const result = await callback({ account, address, publicClient, walletClient })

  if (options.noWait) {
    printJson({
      ...result,
      status: 'submitted',
    })
    return
  }

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: result.hash,
  })

  printJson({
    ...result,
    receipt,
    status: receipt.status,
  })
}

function resolveRpcUrl(options: BaseCommandOptions): string {
  return requiredString(
    options.rpcUrl ??
      process.env[RPC_URL_ENV] ??
      repoConfig.rpcUrl ??
      selectedNetwork.chain.rpcUrls.default.http[0],
    `Missing RPC URL. Pass --rpc-url, set ${RPC_URL_ENV}, or configure a default RPC URL for ${selectedNetwork.id}.`,
  )
}

function resolveContractAddress(options: BaseCommandOptions): Address {
  return asAddress(
    options.contract ?? process.env[CONTRACT_ENV] ?? repoConfig.escrow.contract,
    '--contract',
  )
}

function resolvePrivateKey(options: WriteCommandOptions): Hex {
  return asHex32(
    options.privateKey ?? process.env[PRIVATE_KEY_ENV],
    '--private-key',
  )
}
