import { MPPEscrowAbi } from '@gitbondhq/mppx-stake'
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
    .description('Core MPPEscrow lifecycle and inspection commands')

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
}
