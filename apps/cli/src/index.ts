#!/usr/bin/env node

import { Command } from 'commander'
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

type BaseCommandOptions = {
  contract?: string
  rpcUrl?: string
}

type WriteCommandOptions = BaseCommandOptions & {
  noWait?: boolean
  privateKey?: string
}

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
`,
  )

const escrow = program
  .command('escrow')
  .description('Subcommands mapped to MPPEscrow public and external methods')

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
    options.rpcUrl ?? process.env[RPC_URL_ENV],
    `Missing RPC URL. Pass --rpc-url or set ${RPC_URL_ENV}.`,
  )
}

function resolveContractAddress(options: BaseCommandOptions): Address {
  return asAddress(
    options.contract ?? process.env[CONTRACT_ENV],
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

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}

try {
  await program.parseAsync(process.argv)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
