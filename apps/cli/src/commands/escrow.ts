import { MPPEscrowAbi } from '@gitbondhq/mppx-stake/abi'
import { Command } from 'commander'

import {
  asAddress,
  asBytes32,
  asOptionalBeneficiary,
  asUint256,
} from '../cli/parsing.js'
import {
  executeRead,
  executeWrite,
  withReadOptions,
  withWriteOptions,
} from '../cli/runtime.js'
import type { BaseCommandOptions, WriteCommandOptions } from '../cli/types.js'

export function registerEscrowCommands(program: Command): void {
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
      .requiredOption(
        '--amount <uint256>',
        'Principal amount in token base units',
      ),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('refund-escrow')
      .description('Call MPPEscrow.refundEscrow')
      .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('slash-escrow')
      .description('Call MPPEscrow.slashEscrow')
      .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('add-refund-delegate')
      .description('Call MPPEscrow.addRefundDelegate')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('remove-refund-delegate')
      .description('Call MPPEscrow.removeRefundDelegate')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('add-slash-delegate')
      .description('Call MPPEscrow.addSlashDelegate')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withWriteOptions(
    escrow
      .command('remove-slash-delegate')
      .description('Call MPPEscrow.removeSlashDelegate')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
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
        },
      )
    },
  )

  withReadOptions(
    escrow
      .command('get-escrow')
      .description('Call MPPEscrow.getEscrow')
      .requiredOption('--key <bytes32>', 'Escrow key as a 32-byte hex value'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
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
    },
  )

  withReadOptions(
    escrow
      .command('token-whitelist')
      .description('Call MPPEscrow.tokenWhitelist')
      .requiredOption('--token <address>', 'Token address'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
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
    },
  )

  withReadOptions(
    escrow
      .command('total-escrowed')
      .description('Call MPPEscrow.totalEscrowed'),
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
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
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
    },
  )

  withReadOptions(
    escrow
      .command('refund-delegates')
      .description('Call MPPEscrow.refundDelegates')
      .requiredOption('--counterparty <address>', 'Counterparty address')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
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
    },
  )

  withReadOptions(
    escrow
      .command('slash-delegates')
      .description('Call MPPEscrow.slashDelegates')
      .requiredOption('--counterparty <address>', 'Counterparty address')
      .requiredOption('--delegate <address>', 'Delegate address'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
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
    },
  )
}
