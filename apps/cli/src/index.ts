#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { Command } from 'commander'
import { Challenge, Credential } from 'mppx'
import {
  Methods,
  getNetworkPreset,
  resolveNetworkId,
} from '@gitbondhq/mppx-escrow'
import { stake as createStakeMethod } from '@gitbondhq/mppx-escrow/client'
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { MPPEscrowAbi } from './generated/MPPEscrowAbi.js'

const RPC_URL_ENV = 'MPP_ESCROW_RPC_URL'
const CONTRACT_ENV = 'MPP_ESCROW_CONTRACT'
const PRIVATE_KEY_ENV = 'MPP_ESCROW_PRIVATE_KEY'
const NETWORK_ENV = 'MPP_NETWORK'
const repoConfigPath = new URL('../../../config.json', import.meta.url)
const repoConfig = loadRepoConfig()
const selectedNetwork = getNetworkPreset(
  resolveNetworkId(process.env[NETWORK_ENV]?.trim() || repoConfig.network),
)
const stakeMethod = Methods.stake({ name: repoConfig.methodName })

type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

type WriteCommandOptions = BaseCommandOptions & {
  noWait?: boolean
  privateKey?: string
}

type StakeChallengeRequest = {
  amount: string
  contract: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  methodDetails: {
    action?: 'createEscrow' | undefined
    beneficiary?: Address | undefined
    chainId: number
    counterparty: Address
    policy?: string | undefined
    resource?: string | undefined
    stakeKey: Hex
    submission?: 'push' | 'pull' | undefined
  }
}

type StakeMethodInput = {
  amount: string
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
  submission?: 'push' | 'pull' | undefined
}

type StakeChallenge = Challenge.Challenge<StakeChallengeRequest, 'stake', string>

type StakeCredentialPayload =
  | { hash: Hex; type: 'hash' }
  | { signature: Hex; type: 'transaction' }

const program = new Command()

program
  .name('stake-mpp')
  .description('CLI for the MPPEscrow contract')
  .showHelpAfterError()
  .addHelpText(
    'after',
    `
Environment variables:
  ${NETWORK_ENV}        Active network preset for SDK defaults
  ${RPC_URL_ENV}        Default RPC URL
  ${CONTRACT_ENV}       Default MPPEscrow contract address
  ${PRIVATE_KEY_ENV}    Default private key for write commands

Repo config:
  config.json          Shared network and escrow defaults at the repo root
`,
  )

const escrow = program
  .command('escrow')
  .description('Subcommands mapped to MPPEscrow public and external methods')

const challenge = program
  .command('challenge')
  .description('Fetch, inspect, sign, and submit MPP stake challenges')

withWriteOptions(
  escrow
    .command('create-escrow')
    .description('Call MPPEscrow.createEscrow')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value')
    .requiredOption('--counterparty <address>', 'Counterparty address')
    .option(
      '--beneficiary <address>',
      'Beneficiary address. If omitted, passes address(0) and lets the contract default it to the payer.',
    )
    .requiredOption('--token <address>', 'Whitelisted token address')
    .requiredOption('--amount <uint256>', 'Principal amount in token base units'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'createEscrow',
      args: [
        asBytes32(options.key, '--key'),
        asAddress(options.counterparty, '--counterparty'),
        asOptionalBeneficiary(options.beneficiary),
        asAddress(options.token, '--token'),
        asUint256(options.amount, '--amount'),
      ],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'createEscrow',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('create-escrow-with-permit')
    .description('Call MPPEscrow.createEscrowWithPermit. Payer is derived from the signing key.')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value')
    .requiredOption('--counterparty <address>', 'Counterparty address')
    .option(
      '--beneficiary <address>',
      'Beneficiary address. If omitted, passes address(0) and lets the contract default it to the payer.',
    )
    .requiredOption('--token <address>', 'Whitelisted token address')
    .requiredOption('--amount <uint256>', 'Principal amount in token base units')
    .requiredOption('--deadline <uint256>', 'Permit deadline as a unix timestamp')
    .requiredOption('--v <uint8>', 'Permit signature v value')
    .requiredOption('--r <bytes32>', 'Permit signature r value')
    .requiredOption('--s <bytes32>', 'Permit signature s value'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'createEscrowWithPermit',
      args: [
        asBytes32(options.key, '--key'),
        account.address,
        asAddress(options.counterparty, '--counterparty'),
        asOptionalBeneficiary(options.beneficiary),
        asAddress(options.token, '--token'),
        asUint256(options.amount, '--amount'),
        {
          deadline: asUint256(options.deadline, '--deadline'),
          v: asUint8(options.v, '--v'),
          r: asBytes32(options.r, '--r'),
          s: asBytes32(options.s, '--s'),
        },
      ],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'createEscrowWithPermit',
      hash,
      payer: account.address,
    }
  })
})

withWriteOptions(
  escrow
    .command('refund-escrow')
    .description('Call MPPEscrow.refundEscrow')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'refundEscrow',
      args: [asBytes32(options.key, '--key')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'refundEscrow',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('slash-escrow')
    .description('Call MPPEscrow.slashEscrow')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'slashEscrow',
      args: [asBytes32(options.key, '--key')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'slashEscrow',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('set-counterparty')
    .description('Call MPPEscrow.setCounterparty')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value')
    .requiredOption('--new-counterparty <address>', 'New counterparty address'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'setCounterparty',
      args: [
        asBytes32(options.key, '--key'),
        asAddress(options.newCounterparty, '--new-counterparty'),
      ],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'setCounterparty',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('add-refund-delegate')
    .description('Call MPPEscrow.addRefundDelegate')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'addRefundDelegate',
      args: [asAddress(options.delegate, '--delegate')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'addRefundDelegate',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('remove-refund-delegate')
    .description('Call MPPEscrow.removeRefundDelegate')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'removeRefundDelegate',
      args: [asAddress(options.delegate, '--delegate')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'removeRefundDelegate',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('add-slash-delegate')
    .description('Call MPPEscrow.addSlashDelegate')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'addSlashDelegate',
      args: [asAddress(options.delegate, '--delegate')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'addSlashDelegate',
      hash,
    }
  })
})

withWriteOptions(
  escrow
    .command('remove-slash-delegate')
    .description('Call MPPEscrow.removeSlashDelegate')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: WriteCommandOptions & Record<string, string | undefined>) => {
  await executeWrite(options, async ({ account, address, publicClient, walletClient }) => {
    const simulation = await publicClient.simulateContract({
      abi: MPPEscrowAbi,
      account,
      address,
      functionName: 'removeSlashDelegate',
      args: [asAddress(options.delegate, '--delegate')],
    })

    const hash = await walletClient.writeContract(simulation.request)

    return {
      functionName: 'removeSlashDelegate',
      hash,
    }
  })
})

withReadOptions(
  escrow
    .command('get-escrow')
    .description('Call MPPEscrow.getEscrow')
    .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
).action(async (options: BaseCommandOptions & Record<string, string | undefined>) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const escrowState = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'getEscrow',
      args: [asBytes32(options.key, '--key')],
    })

    return {
      functionName: 'getEscrow',
      escrow: escrowState,
    }
  })
})

withReadOptions(
  escrow
    .command('token-whitelist')
    .description('Call MPPEscrow.tokenWhitelist')
    .requiredOption('--token <address>', 'Token address'),
).action(async (options: BaseCommandOptions & Record<string, string | undefined>) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const whitelisted = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'tokenWhitelist',
      args: [asAddress(options.token, '--token')],
    })

    return {
      functionName: 'tokenWhitelist',
      whitelisted,
    }
  })
})

withReadOptions(
  escrow.command('total-escrowed').description('Call MPPEscrow.totalEscrowed'),
).action(async (options: BaseCommandOptions) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const totalEscrowed = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'totalEscrowed',
    })

    return {
      functionName: 'totalEscrowed',
      totalEscrowed,
    }
  })
})

withReadOptions(
  escrow
    .command('total-escrowed-by-token')
    .description('Call MPPEscrow.totalEscrowedByToken')
    .requiredOption('--token <address>', 'Token address'),
).action(async (options: BaseCommandOptions & Record<string, string | undefined>) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const totalEscrowedByToken = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'totalEscrowedByToken',
      args: [asAddress(options.token, '--token')],
    })

    return {
      functionName: 'totalEscrowedByToken',
      totalEscrowedByToken,
    }
  })
})

withReadOptions(
  escrow
    .command('refund-delegates')
    .description('Call MPPEscrow.refundDelegates')
    .requiredOption('--counterparty <address>', 'Counterparty address')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: BaseCommandOptions & Record<string, string | undefined>) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const authorized = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'refundDelegates',
      args: [
        asAddress(options.counterparty, '--counterparty'),
        asAddress(options.delegate, '--delegate'),
      ],
    })

    return {
      functionName: 'refundDelegates',
      authorized,
    }
  })
})

withReadOptions(
  escrow
    .command('slash-delegates')
    .description('Call MPPEscrow.slashDelegates')
    .requiredOption('--counterparty <address>', 'Counterparty address')
    .requiredOption('--delegate <address>', 'Delegate address'),
).action(async (options: BaseCommandOptions & Record<string, string | undefined>) => {
  await executeRead(options, async ({ address, publicClient }) => {
    const authorized = await publicClient.readContract({
      abi: MPPEscrowAbi,
      address,
      functionName: 'slashDelegates',
      args: [
        asAddress(options.counterparty, '--counterparty'),
        asAddress(options.delegate, '--delegate'),
      ],
    })

    return {
      functionName: 'slashDelegates',
      authorized,
    }
  })
})

challenge
  .command('fetch')
  .description('Fetch a protected resource and print the 402 payment challenge if present')
  .requiredOption('--url <url>', 'Protected resource URL')
  .option('--method <method>', 'HTTP method used to fetch the challenge', 'GET')
  .option(
    '--header <name:value>',
    'Additional HTTP header; repeat for multiple headers',
    collectRepeatableOption,
    [],
  )
  .option('--out <path>', 'Write the parsed challenge JSON to a file if a 402 challenge is returned')
  .action(
    async (
      options: {
        header?: string[]
        method?: string
        out?: string
        url?: string
      },
    ) => {
      const response = await fetchWithOptions({
        headers: options.header,
        method: options.method,
        url: requiredString(options.url, 'Missing --url.'),
      })

      const challengeValue =
        response.status === 402 ? getStakeChallengeFromResponse(response) : null

      if (options.out && challengeValue) {
        await writeJsonFile(options.out, challengeValue)
      }

      printJson({
        ...(challengeValue ? { challenge: challengeValue } : {}),
        ...(options.out && challengeValue ? { outputPath: options.out } : {}),
        ...(await serializeHttpResponse(response)),
      })
    },
  )

challenge
  .command('inspect')
  .description('Inspect a saved stake challenge JSON file')
  .requiredOption('--file <path>', 'Path to a saved challenge JSON file')
  .action(async (options: { file?: string }) => {
    const challengeValue = await loadStakeChallengeFromFile(
      requiredString(options.file, 'Missing --file.'),
    )

    printJson({
      description: challengeValue.description ?? null,
      id: challengeValue.id,
      intent: challengeValue.intent,
      method: challengeValue.method,
      opaque: challengeValue.opaque ?? null,
      realm: challengeValue.realm,
      request: challengeValue.request,
    })
  })

challenge
  .command('respond')
  .description(
    'Create a serialized credential for a stake challenge. This command only emits signed transaction payloads for now.',
  )
  .option('--url <url>', 'Protected resource URL to fetch for a 402 challenge')
  .option('--challenge-file <path>', 'Path to a saved challenge JSON file')
  .option('--method <method>', 'HTTP method used when fetching the challenge', 'GET')
  .option(
    '--header <name:value>',
    'Additional HTTP header when fetching the challenge; repeat for multiple headers',
    collectRepeatableOption,
    [],
  )
  .requiredOption(
    '--private-key <hex>',
    `Private key for signing. Can also be provided via ${PRIVATE_KEY_ENV}.`,
  )
  .option('--out <path>', 'Write the serialized credential to a file')
  .action(
    async (
      options: {
        challengeFile?: string
        header?: string[]
        method?: string
        out?: string
        privateKey?: string
        url?: string
      },
    ) => {
      const challengeValue = await resolveStakeChallengeForRespond(options)
      const forcedChallenge = withPullSubmission(challengeValue)
      const account = privateKeyToAccount(asHex32(options.privateKey ?? process.env[PRIVATE_KEY_ENV], '--private-key'))
      const method = createStakeMethod({
        account,
        name: repoConfig.methodName,
      })
      const serializedCredential = await method.createCredential({
        challenge: forcedChallenge,
        context: {},
      })
      const parsedCredential =
        Credential.deserialize<StakeCredentialPayload>(serializedCredential)

      if (parsedCredential.payload.type !== 'transaction') {
        throw new Error(
          `challenge respond expected a signed transaction payload but received ${parsedCredential.payload.type}.`,
        )
      }

      if (options.out) {
        await writeFile(
          options.out,
          `${serializedCredential}\n`,
          'utf8',
        )
      }

      printJson({
        challengeId: forcedChallenge.id,
        credential: serializedCredential,
        outputPath: options.out ?? null,
        originalSubmission: challengeValue.request.methodDetails.submission ?? null,
        payloadType: parsedCredential.payload.type,
        source: parsedCredential.source,
        submissionOverrideApplied:
          (challengeValue.request.methodDetails.submission ?? 'push') !== 'pull',
      })
    },
  )

challenge
  .command('submit')
  .description('Retry a protected resource request with a serialized MPP credential in Authorization')
  .requiredOption('--url <url>', 'Protected resource URL')
  .option('--method <method>', 'HTTP method used when retrying the request', 'GET')
  .option(
    '--header <name:value>',
    'Additional HTTP header; repeat for multiple headers',
    collectRepeatableOption,
    [],
  )
  .option('--credential <value>', 'Serialized credential string')
  .option('--credential-file <path>', 'Path to a file containing a serialized credential')
  .action(
    async (
      options: {
        credential?: string
        credentialFile?: string
        header?: string[]
        method?: string
        url?: string
      },
    ) => {
      const credential = await resolveSerializedCredential(options)
      const response = await fetchWithOptions({
        authorization: credential,
        headers: options.header,
        method: options.method,
        url: requiredString(options.url, 'Missing --url.'),
      })

      const challengeValue =
        response.status === 402 ? getStakeChallengeFromResponse(response) : null

      printJson({
        ...(challengeValue ? { challenge: challengeValue } : {}),
        ...(await serializeHttpResponse(response)),
      })
    },
  )

function withReadOptions(command: Command): Command {
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

function withWriteOptions(command: Command): Command {
  return withReadOptions(command)
    .option(
      '--private-key <hex>',
      `Private key for the signing account. Can also be provided via ${PRIVATE_KEY_ENV}.`,
    )
    .option('--no-wait', 'Return after broadcast instead of waiting for a receipt')
}

async function executeRead(
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

async function executeWrite(
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

function asAddress(value: string | undefined, label: string): Address {
  const text = requiredString(value, `Missing ${label}.`)
  if (!isAddress(text)) {
    throw new Error(`Invalid ${label}: expected an EVM address, received "${text}".`)
  }

  return getAddress(text)
}

function asOptionalBeneficiary(value: string | undefined): Address {
  return value ? asAddress(value, '--beneficiary') : zeroAddress
}

function asBytes32(value: string | undefined, label: string): Hex {
  return asFixedHex(value, 32, label)
}

function asHex32(value: string | undefined, label: string): Hex {
  return asFixedHex(value, 32, label)
}

function asFixedHex(
  value: string | undefined,
  bytes: number,
  label: string,
): Hex {
  const text = requiredString(value, `Missing ${label}.`)
  const normalized = text.startsWith('0x') ? text : `0x${text}`
  const expectedLength = 2 + bytes * 2

  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid ${label}: expected hex data.`)
  }

  if (normalized.length !== expectedLength) {
    throw new Error(
      `Invalid ${label}: expected ${bytes} bytes (${expectedLength - 2} hex characters).`,
    )
  }

  return normalized as Hex
}

function asUint256(value: string | undefined, label: string): bigint {
  const text = requiredString(value, `Missing ${label}.`)

  try {
    const parsed = BigInt(text)
    if (parsed < 0n) {
      throw new Error(`Invalid ${label}: expected a non-negative integer.`)
    }
    return parsed
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Invalid ${label}: expected a uint256 integer string.`)
  }
}

function asUint8(value: string | undefined, label: string): number {
  const text = requiredString(value, `Missing ${label}.`)
  const parsed = Number.parseInt(text, 10)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`Invalid ${label}: expected an integer between 0 and 255.`)
  }

  return parsed
}

function requiredString(value: string | undefined, message: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(message)
  }

  return value.trim()
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, jsonReplacer, 2)}\n`)
}

function collectRepeatableOption(value: string, previous: string[]): string[] {
  return [...previous, value]
}

async function resolveStakeChallengeForRespond(options: {
  challengeFile?: string
  header?: string[]
  method?: string
  url?: string
}): Promise<StakeChallenge> {
  if (options.url && options.challengeFile) {
    throw new Error('Pass either --url or --challenge-file, not both.')
  }

  if (options.url) {
    const response = await fetchWithOptions({
      headers: options.header,
      method: options.method,
      url: options.url,
    })

    if (response.status !== 402) {
      throw new Error(
        `Expected a 402 challenge response from ${options.url}, received ${response.status}.`,
      )
    }

    return getStakeChallengeFromResponse(response)
  }

  if (options.challengeFile) {
    return loadStakeChallengeFromFile(options.challengeFile)
  }

  throw new Error('Missing challenge source. Pass --url or --challenge-file.')
}

async function loadStakeChallengeFromFile(path: string): Promise<StakeChallenge> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const challenge =
    parsed &&
    typeof parsed === 'object' &&
    'challenge' in parsed &&
    parsed.challenge
      ? parsed.challenge
      : parsed

  return normalizeStakeChallenge(challenge)
}

function getStakeChallengeFromResponse(response: Response): StakeChallenge {
  return Challenge.fromResponse(response, {
    methods: [stakeMethod],
  }) as StakeChallenge
}

function normalizeStakeChallenge(value: unknown): StakeChallenge {
  const parsed = Challenge.Schema.parse(value)

  if (parsed.method !== stakeMethod.name || parsed.intent !== stakeMethod.intent) {
    throw new Error(
      `Expected a ${stakeMethod.name}/${stakeMethod.intent} challenge, received ${parsed.method}/${parsed.intent}.`,
    )
  }

  return Challenge.fromMethod(stakeMethod, {
    description: parsed.description,
    digest: parsed.digest,
    expires: parsed.expires,
    id: parsed.id,
    ...(parsed.opaque ? { meta: parsed.opaque } : {}),
    realm: parsed.realm,
    request: toStakeMethodInput(parsed.request as StakeChallengeRequest),
  }) as StakeChallenge
}

function withPullSubmission(challenge: StakeChallenge): StakeChallenge {
  const request = toStakeMethodInput(challenge.request)

  return Challenge.fromMethod(stakeMethod, {
    description: challenge.description,
    digest: challenge.digest,
    expires: challenge.expires,
    id: challenge.id,
    ...(challenge.opaque ? { meta: challenge.opaque } : {}),
    realm: challenge.realm,
    request: {
      ...request,
      submission: 'pull',
    },
  }) as StakeChallenge
}

function toStakeMethodInput(request: StakeChallengeRequest): StakeMethodInput {
  return {
    amount: request.amount,
    ...(request.methodDetails.beneficiary
      ? { beneficiary: request.methodDetails.beneficiary }
      : {}),
    chainId: request.methodDetails.chainId,
    contract: request.contract,
    counterparty: request.methodDetails.counterparty,
    token: request.token,
    ...(request.description ? { description: request.description } : {}),
    ...(request.externalId ? { externalId: request.externalId } : {}),
    ...(request.methodDetails.policy ? { policy: request.methodDetails.policy } : {}),
    ...(request.methodDetails.resource ? { resource: request.methodDetails.resource } : {}),
    stakeKey: request.methodDetails.stakeKey,
    ...(request.methodDetails.submission
      ? { submission: request.methodDetails.submission }
      : {}),
  }
}

async function resolveSerializedCredential(options: {
  credential?: string
  credentialFile?: string
}): Promise<string> {
  if (options.credential && options.credentialFile) {
    throw new Error('Pass either --credential or --credential-file, not both.')
  }

  const serialized =
    options.credential ??
    (options.credentialFile
      ? await readSerializedCredentialFromFile(options.credentialFile)
      : undefined)

  const value = requiredString(
    serialized,
    'Missing credential. Pass --credential or --credential-file.',
  )

  Credential.deserialize(value)
  return value
}

async function readSerializedCredentialFromFile(path: string): Promise<string> {
  const raw = (await readFile(path, 'utf8')).trim()

  try {
    const parsed = JSON.parse(raw) as unknown

    if (typeof parsed === 'string') return parsed

    if (
      parsed &&
      typeof parsed === 'object' &&
      'credential' in parsed &&
      typeof parsed.credential === 'string'
    ) {
      return parsed.credential
    }
  } catch {
    // Raw credential string, handled below.
  }

  return raw
}

async function fetchWithOptions(parameters: {
  authorization?: string | undefined
  headers?: string[] | undefined
  method?: string | undefined
  url: string
}): Promise<Response> {
  const headers = new Headers()

  for (const header of parameters.headers ?? []) {
    const [name, ...rest] = header.split(':')
    if (!name || rest.length === 0) {
      throw new Error(
        `Invalid --header value "${header}". Expected "name:value".`,
      )
    }

    headers.set(name.trim(), rest.join(':').trim())
  }

  if (parameters.authorization) {
    headers.set('authorization', parameters.authorization)
  }

  return fetch(parameters.url, {
    headers,
    method: parameters.method ?? 'GET',
  })
}

async function serializeHttpResponse(
  response: Response,
): Promise<{
  body: unknown
  headers: Record<string, string>
  ok: boolean
  redirected: boolean
  status: number
  statusText: string
  url: string
}> {
  const bodyText = await response.text()
  return {
    body: parseResponseBody(bodyText, response.headers.get('content-type')),
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    redirected: response.redirected,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  }
}

function parseResponseBody(
  bodyText: string,
  contentType: string | null,
): unknown {
  if (bodyText.length === 0) return null

  const wantsJson =
    contentType?.includes('application/json') ||
    contentType?.includes('+json') ||
    bodyText.startsWith('{') ||
    bodyText.startsWith('[')

  if (wantsJson) {
    try {
      return JSON.parse(bodyText) as unknown
    } catch {
      return bodyText
    }
  }

  return bodyText
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, jsonReplacer, 2)}\n`, 'utf8')
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}

type RepoConfig = {
  chainId: number
  escrow: {
    contract?: `0x${string}` | undefined
    token: `0x${string}`
    tokenWhitelist: `0x${string}`[]
  }
  methodName: string
  network: string
  rpcUrl?: string | undefined
}

function loadRepoConfig(): RepoConfig {
  const raw = JSON.parse(readFileSync(repoConfigPath, 'utf8')) as {
    chainId?: unknown
    escrow?: {
      contract?: unknown
      token?: unknown
      tokenWhitelist?: unknown
    }
    methodName?: unknown
    network?: unknown
    rpcUrl?: unknown
  }

  const network = resolveNetworkId(requiredJsonString(raw.network, 'network'))
  const preset = getNetworkPreset(network)
  const chainId = requiredJsonInteger(raw.chainId, 'chainId')
  if (chainId !== preset.chain.id) {
    throw new Error(
      `config.json chainId ${chainId} does not match the ${network} preset (${preset.chain.id}).`,
    )
  }

  const escrow = raw.escrow
  if (!escrow || typeof escrow !== 'object') {
    throw new Error('config.json escrow must be an object.')
  }

  const tokenWhitelist = requiredJsonAddressArray(
    escrow.tokenWhitelist,
    'escrow.tokenWhitelist',
  )
  const token = requiredJsonAddress(escrow.token, 'escrow.token')
  if (!tokenWhitelist.some(token => token.toLowerCase() === token.toLowerCase())) {
    throw new Error('config.json escrow.token must be included in escrow.tokenWhitelist.')
  }

  return {
    chainId,
    escrow: {
      contract: optionalJsonAddress(escrow.contract, 'escrow.contract'),
      token,
      tokenWhitelist,
    },
    methodName: requiredJsonString(raw.methodName, 'methodName'),
    network,
    rpcUrl:
      raw.rpcUrl === null || raw.rpcUrl === undefined
        ? undefined
        : requiredJsonString(raw.rpcUrl, 'rpcUrl'),
  }
}

function requiredJsonAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`config.json ${label} must be a valid EVM address.`)
  }
  return getAddress(value)
}

function optionalJsonAddress(
  value: unknown,
  label: string,
): `0x${string}` | undefined {
  if (value === null || value === undefined) return undefined
  return requiredJsonAddress(value, label)
}

function requiredJsonAddressArray(
  value: unknown,
  label: string,
): `0x${string}`[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`config.json ${label} must be a non-empty address array.`)
  }
  return value.map((item, index) =>
    requiredJsonAddress(item, `${label}[${index}]`),
  )
}

function requiredJsonInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`config.json ${label} must be a positive integer.`)
  }
  return Number(value)
}

function requiredJsonString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`config.json ${label} must be a non-empty string.`)
  }
  return value.trim()
}

try {
  await program.parseAsync(process.argv)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
