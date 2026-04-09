import { escrowAbi } from '@gitbondhq/mppx-stake/abi'
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
      .requiredOption('--scope <bytes32>', 'Escrow scope as a 32-byte hex value')
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
            abi: escrowAbi,
            account,
            address,
            functionName: 'createEscrow',
            args: [
              asBytes32(options.scope, '--scope'),
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
      .requiredOption('--escrow-id <uint256>', 'Escrow id as a uint256 value'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
          const simulation = await publicClient.simulateContract({
            abi: escrowAbi,
            account,
            address,
            functionName: 'refundEscrow',
            args: [asUint256(options.escrowId, '--escrow-id')] as const,
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
      .requiredOption('--escrow-id <uint256>', 'Escrow id as a uint256 value'),
  ).action(
    async (
      options: WriteCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeWrite(
        options,
        async ({ account, address, publicClient, walletClient }) => {
          const simulation = await publicClient.simulateContract({
            abi: escrowAbi,
            account,
            address,
            functionName: 'slashEscrow',
            args: [asUint256(options.escrowId, '--escrow-id')] as const,
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
      .command('get-active-escrow-id')
      .description('Call MPPEscrow.getActiveEscrowId')
      .requiredOption('--scope <bytes32>', 'Escrow scope as a 32-byte hex value')
      .requiredOption('--beneficiary <address>', 'Beneficiary address'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeRead(options, async ({ address, publicClient }) => {
        const scope = asBytes32(options.scope, '--scope')
        const beneficiary = asAddress(options.beneficiary, '--beneficiary')
        const escrowId = await publicClient.readContract({
          abi: escrowAbi,
          address,
          functionName: 'getActiveEscrowId',
          args: [scope, beneficiary] as const,
        })

        return {
          beneficiary,
          escrowId,
          functionName: 'getActiveEscrowId',
          scope,
        }
      })
    },
  )

  withReadOptions(
    escrow
      .command('get-active-escrow')
      .description('Call MPPEscrow.getActiveEscrow')
      .requiredOption('--scope <bytes32>', 'Escrow scope as a 32-byte hex value')
      .requiredOption('--beneficiary <address>', 'Beneficiary address'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeRead(options, async ({ address, publicClient }) => {
        const scope = asBytes32(options.scope, '--scope')
        const beneficiary = asAddress(options.beneficiary, '--beneficiary')
        const escrowState = await publicClient.readContract({
          abi: escrowAbi,
          address,
          functionName: 'getActiveEscrow',
          args: [scope, beneficiary] as const,
        })

        return {
          beneficiary,
          escrow: escrowState,
          functionName: 'getActiveEscrow',
          scope,
        }
      })
    },
  )

  withReadOptions(
    escrow
      .command('get-escrow')
      .description('Call MPPEscrow.getEscrow')
      .requiredOption('--escrow-id <uint256>', 'Escrow id as a uint256 value'),
  ).action(
    async (
      options: BaseCommandOptions & Record<string, string | undefined>,
    ) => {
      await executeRead(options, async ({ address, publicClient }) => {
        const escrowState = await publicClient.readContract({
          abi: escrowAbi,
          address,
          functionName: 'getEscrow',
          args: [asUint256(options.escrowId, '--escrow-id')] as const,
        })

        return {
          functionName: 'getEscrow',
          escrow: escrowState,
        }
      })
    },
  )
}
