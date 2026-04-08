import { writeFile } from 'node:fs/promises'

import { clientStake, parseStakeChallenge } from '@gitbondhq/mppx-stake'
import { Command } from 'commander'
import { Credential } from 'mppx'

import {
  defaultChallengesDirectory,
  defaultCredentialFilePath,
  loadStakeChallengeFromFile,
  resolveChallengeFilePath,
  resolveChallengeOutputPath,
  resolveSerializedCredential,
  resolveStakeChallengeForRespond,
} from '../cli/challenge.js'
import { repoConfig, resolveProtectedResourceUrl } from '../cli/context.js'
import { printJson, writeJsonFile } from '../cli/format.js'
import { fetchWithOptions, serializeHttpResponse } from '../cli/http.js'
import { resolveAccount, withSigningOptions } from '../cli/runtime.js'
import type { SigningOptions } from '../cli/types.js'

export function registerChallengeCommands(program: Command): void {
  const challenge = program
    .command('challenge')
    .description('Fetch, inspect, sign, and submit MPP stake challenges')

  challenge
    .command('fetch')
    .description(
      'Fetch the demo resource and print the 402 payment challenge if present',
    )
    .option(
      '--url <url>',
      'Protected resource URL. Defaults to MPP_RESOURCE_URL or the local demo server route.',
    )
    .option(
      '--out <path>',
      `Write the parsed challenge JSON to a file. Defaults to a timestamped file in ${defaultChallengesDirectory}/`,
    )
    .action(async (options: { out?: string; url?: string }) => {
      const response = await fetchWithOptions({
        url: resolveProtectedResourceUrl(options.url),
      })

      const challengeValue =
        response.status === 402
          ? parseStakeChallenge(response, {
              methodName: repoConfig.methodName,
            })
          : null

      const outputPath = challengeValue
        ? await resolveChallengeOutputPath(options.out)
        : null

      if (outputPath && challengeValue) {
        await writeJsonFile(outputPath, challengeValue)
      }

      printJson({
        ...(challengeValue ? { challenge: challengeValue } : {}),
        ...(outputPath ? { outputPath } : {}),
        ...(await serializeHttpResponse(response)),
      })
    })

  challenge
    .command('inspect')
    .description('Inspect a saved stake challenge JSON file')
    .option(
      '--file <path>',
      `Path to a saved challenge JSON file. Defaults to the latest file in ${defaultChallengesDirectory}/`,
    )
    .action(async (options: { file?: string }) => {
      const challengeFilePath = await resolveChallengeFilePath(options.file)
      const challengeValue = await loadStakeChallengeFromFile(challengeFilePath)

      printJson({
        description: challengeValue.description ?? null,
        file: challengeFilePath,
        id: challengeValue.id,
        intent: challengeValue.intent,
        method: challengeValue.method,
        opaque: challengeValue.opaque ?? null,
        realm: challengeValue.realm,
        request: challengeValue.request,
      })
    })

  withSigningOptions(
    challenge
      .command('respond')
      .description(
        'Create a serialized credential for a stake challenge using client-side broadcast and return a tx-hash payload.',
      )
      .option(
        '--url <url>',
        'Protected resource URL to fetch a fresh 402 challenge from. Defaults to MPP_RESOURCE_URL or the local demo server route.',
      )
      .option(
        '--challenge-file <path>',
        `Path to a saved challenge JSON file. Defaults to the latest file in ${defaultChallengesDirectory}/ before fetching a fresh challenge.`,
      )
      .option(
        '--out <path>',
        'Write the serialized credential to a file',
        defaultCredentialFilePath,
      ),
  ).action(
    async (
      options: SigningOptions & {
        challengeFile?: string
        out?: string
        url?: string
      },
    ) => {
      const challengeValue = await resolveStakeChallengeForRespond(options)
      const account = await resolveAccount(options)
      const method = clientStake({
        account,
        name: repoConfig.methodName,
        preset: repoConfig.networkPreset,
      })
      const serializedCredential = await method.createCredential({
        challenge: challengeValue,
      })
      const parsedCredential = Credential.deserialize<{
        hash: string
        type: string
      }>(serializedCredential)

      if (options.out) {
        await writeFile(options.out, `${serializedCredential}\n`, 'utf8')
      }

      printJson({
        challengeId: challengeValue.id,
        credential: serializedCredential,
        txHash: parsedCredential.payload.hash,
        outputPath: options.out ?? null,
        payloadType: parsedCredential.payload.type,
        source: parsedCredential.source,
      })
    },
  )

  challenge
    .command('submit')
    .description(
      'Retry the protected demo resource request with the saved credential',
    )
    .option(
      '--credential-file <path>',
      'Path to a file containing a serialized credential',
      defaultCredentialFilePath,
    )
    .option(
      '--url <url>',
      'Protected resource URL. Defaults to MPP_RESOURCE_URL or the local demo server route.',
    )
    .action(
      async (options: {
        credentialFile?: string
        url?: string
      }) => {
        const credential = await resolveSerializedCredential(options)
        const response = await fetchWithOptions({
          authorization: credential,
          url: resolveProtectedResourceUrl(options.url),
        })

        const challengeValue =
          response.status === 402
            ? parseStakeChallenge(response, {
                methodName: repoConfig.methodName,
              })
            : null

        printJson({
          ...(challengeValue ? { challenge: challengeValue } : {}),
          ...(await serializeHttpResponse(response)),
        })
      },
    )
}
