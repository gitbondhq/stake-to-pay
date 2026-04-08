import { Credential, Method } from 'mppx'
import type { Account } from 'viem'
import { isAddressEqual } from 'viem'

import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import { createClient, submitCalls } from './client.js'
import { signScopeActiveProof } from './scopeActiveProof.js'
import { buildStakeCalls, hasActiveEscrow } from './tx.js'

type EnsureActiveStake = (parameters: {
  beneficiary: Account['address']
  beneficiaryAccount: Account
  payerAccount: Account
  request: StakeChallengeRequest
}) => Promise<void>

type ClientStakeParameters = {
  account: Account
  beneficiaryAccount?: Account | undefined
  ensureActiveStake?: EnsureActiveStake | undefined
  preset: NetworkPreset
}

/** Ensures an active escrow exists, then returns the signed scope-active proof. */
export const createClientStake = (
  method: Parameters<typeof Method.toClient>[0],
) => {
  return (parameters: ClientStakeParameters) => {
    const preset = parameters.preset
    const payerAccount = parameters.account
    const beneficiaryAccount =
      parameters.beneficiaryAccount ?? parameters.account

    return Method.toClient(method, {
      async createCredential({ challenge }) {
        const request = challenge.request as StakeChallengeRequest
        const chainId = request.methodDetails.chainId
        if (chainId !== preset.chain.id) {
          throw new Error(
            `challenge chainId ${chainId} does not match the ${preset.id} preset (${preset.chain.id}).`,
          )
        }

        if (
          request.beneficiary &&
          !isAddressEqual(request.beneficiary, beneficiaryAccount.address)
        ) {
          throw new Error(
            'Challenge beneficiary does not match the beneficiary signing account.',
          )
        }

        const beneficiary = request.beneficiary ?? beneficiaryAccount.address

        if (parameters.ensureActiveStake) {
          await parameters.ensureActiveStake({
            beneficiary,
            beneficiaryAccount,
            payerAccount,
            request,
          })
        } else {
          const client = createClient(preset)
          const isActive = await hasActiveEscrow(
            client,
            request.contract,
            request.scope,
            beneficiary,
          )

          if (!isActive) {
            await submitCalls(
              client,
              payerAccount,
              buildStakeCalls({
                amount: BigInt(request.amount),
                beneficiary,
                contract: request.contract,
                counterparty: request.counterparty,
                scope: request.scope,
                token: request.token,
              }),
            )
          }
        }

        const signature = await signScopeActiveProof(beneficiaryAccount, {
          beneficiary,
          chainId,
          challengeId: challenge.id,
          contract: request.contract,
          expires: challenge.expires,
          scope: request.scope,
        })

        return Credential.serialize({
          challenge,
          payload: {
            signature,
            type: 'scope-active',
          },
          source: `did:pkh:eip155:${chainId}:${beneficiaryAccount.address}`,
        })
      },
    })
  }
}
