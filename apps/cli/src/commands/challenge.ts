import { writeFile } from 'node:fs/promises'

import { Command } from 'commander'
import { Credential } from 'mppx'
import {
  type StakeCredentialPayload,
  withStakeSubmission,
} from '@gitbondhq/mpp-stake'
import { stake as createStakeMethod } from '@gitbondhq/mpp-stake/client'
import { privateKeyToAccount } from 'viem/accounts'

import {
  getStakeChallengeFromResponse,
  loadStakeChallengeFromFile,
  resolveSerializedCredential,
  resolveStakeChallengeForRespond,
} from '../cli/challenge.js'
import { PRIVATE_KEY_ENV, repoConfig } from '../cli/context.js'
import { printJson, writeJsonFile } from '../cli/format.js'
import { collectRepeatableOption, fetchWithOptions, serializeHttpResponse } from '../cli/http.js'
import { asHex32, requiredString } from '../cli/parsing.js'

export function registerChallengeCommands(program: Command): void {
  const challenge = program
    .command('challenge')
    .description('Fetch, inspect, sign, and submit MPP stake challenges')

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
      'Create a serialized credential for a stake challenge using client-side submission and return a tx-hash payload.',
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
        const forcedChallenge = withStakeSubmission(challengeValue, 'push')
        const account = privateKeyToAccount(
          asHex32(options.privateKey ?? process.env[PRIVATE_KEY_ENV], '--private-key'),
        )
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

        if (parsedCredential.payload.type !== 'hash') {
          throw new Error(
            `challenge respond expected a tx-hash payload but received ${parsedCredential.payload.type}.`,
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
          txHash: parsedCredential.payload.hash,
          outputPath: options.out ?? null,
          originalSubmission: challengeValue.request.methodDetails.submission ?? null,
          payloadType: parsedCredential.payload.type,
          source: parsedCredential.source,
          submissionOverrideApplied:
            (challengeValue.request.methodDetails.submission ?? 'push') !== 'push',
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
}
