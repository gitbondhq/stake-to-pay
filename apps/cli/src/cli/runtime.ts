import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Command } from 'commander'
import { Keystore } from 'ox'
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  ACCOUNT_ENV,
  CONTRACT_ENV,
  PASSWORD_FILE_ENV,
  PRIVATE_KEY_ENV,
  repoConfig,
  RPC_URL_ENV,
} from './context.js'
import { printJson } from './format.js'
import { asAddress, asHex32, requiredString } from './parsing.js'
import type {
  BaseCommandOptions,
  SigningOptions,
  WriteCommandOptions,
} from './types.js'

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
  return withSigningOptions(withReadOptions(command)).option(
    '--no-wait',
    'Return after broadcast instead of waiting for a receipt',
  )
}

export function withSigningOptions(command: Command): Command {
  return command
    .option(
      '--private-key <hex>',
      `Private key for the signing account. Can also be provided via ${PRIVATE_KEY_ENV}.`,
    )
    .option(
      '--account <name>',
      `Cast wallet account name from ~/.foundry/keystores. Can also be provided via ${ACCOUNT_ENV}.`,
    )
    .option('--keystore <path>', 'Path to a cast wallet keystore JSON file.')
    .option(
      '--password-file <path>',
      `Path to a file containing the keystore passphrase for non-interactive use. Can also be provided via ${PASSWORD_FILE_ENV}.`,
    )
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
    account: Account
    address: Address
    publicClient: ReturnType<typeof createPublicClient>
    walletClient: ReturnType<typeof createWalletClient>
  }) => Promise<{ functionName: string; hash: Hex; payer?: Address }>,
): Promise<void> {
  const publicClient = createPublicClient({
    transport: http(resolveRpcUrl(options)),
  })
  const account = await resolveAccount(options)
  const address = resolveContractAddress(options)
  const walletClient = createWalletClient({
    account,
    transport: http(resolveRpcUrl(options)),
  })

  const result = await callback({
    account,
    address,
    publicClient,
    walletClient,
  })

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
      repoConfig.networkPreset.rpcUrl,
    `Missing RPC URL. Pass --rpc-url, set ${RPC_URL_ENV}, or configure rpcUrl for ${repoConfig.networkPreset.id}.`,
  )
}

function resolveContractAddress(options: BaseCommandOptions): Address {
  return asAddress(
    options.contract ?? process.env[CONTRACT_ENV] ?? repoConfig.escrow.contract,
    '--contract',
  )
}

export async function resolveAccount(
  options: SigningOptions,
): Promise<Account> {
  if (options.privateKey ?? process.env[PRIVATE_KEY_ENV]) {
    return privateKeyToAccount(resolvePrivateKey(options))
  }

  const keystorePath =
    options.keystore ??
    resolveFoundryKeystorePath(options.account ?? process.env[ACCOUNT_ENV])

  if (!keystorePath) {
    throw new Error(
      `Missing signing method. Pass --private-key, set ${PRIVATE_KEY_ENV}, pass --account, set ${ACCOUNT_ENV}, or pass --keystore.`,
    )
  }

  const keystore = await readKeystore(keystorePath)
  const passwordFile = options.passwordFile ?? process.env[PASSWORD_FILE_ENV]
  const password = passwordFile
    ? (await readFile(passwordFile, 'utf8')).trim()
    : await promptPassword()
  // ox@0.14.x async scrypt derivation does not preserve Foundry keystore
  // parameters correctly for some cast wallets. The sync path does.
  const key = Keystore.toKey(keystore, { password })
  const decryptedPrivateKey = Keystore.decrypt(keystore, key)

  return privateKeyToAccount(decryptedPrivateKey)
}

function resolvePrivateKey(options: SigningOptions): Hex {
  return asHex32(
    options.privateKey ?? process.env[PRIVATE_KEY_ENV],
    '--private-key',
  )
}

function resolveFoundryKeystorePath(
  account: string | undefined,
): string | undefined {
  return account ? join(homedir(), '.foundry', 'keystores', account) : undefined
}

async function readKeystore(path: string): Promise<Keystore.Keystore> {
  const contents = await readFile(path, 'utf8')

  try {
    return JSON.parse(contents) as Keystore.Keystore
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid keystore JSON at ${path}: ${message}`)
  }
}

async function promptPassword(): Promise<string> {
  const input = process.stdin
  if (
    !input.isTTY ||
    !process.stderr.isTTY ||
    typeof input.setRawMode !== 'function'
  ) {
    throw new Error(
      'No TTY available for passphrase prompt. Use --password-file.',
    )
  }

  process.stderr.write('Keystore passphrase: ')

  return await new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw
    let password = ''

    const cleanup = () => {
      input.off('data', onData)
      input.off('error', onError)
      input.setRawMode(wasRaw)
      input.pause()
      process.stderr.write('\n')
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          cleanup()
          resolve(password)
          return
        }

        if (char === '\u0003' || char === '\u0004') {
          cleanup()
          reject(new Error('Passphrase prompt cancelled.'))
          return
        }

        if (char === '\u007f' || char === '\b') {
          password = password.slice(0, -1)
          continue
        }

        password += char
      }
    }

    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
    input.on('error', onError)
  })
}
