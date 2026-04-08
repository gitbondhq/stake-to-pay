import { Credential, Method } from 'mppx'
import type { Account } from 'viem'
import { isAddressEqual } from 'viem'

import { stake as createStakeMethod } from '../Methods.js'
import type { NetworkPreset } from '../networkConfig.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import { signScopeActiveProof } from './scopeActiveProof.js'

/** The concrete stake method type produced by `Methods.stake`. */
export type StakeMethod = ReturnType<typeof createStakeMethod>

type ClientStakeParameters = {
  account: Account
  beneficiaryAccount?: Account | undefined
  preset: NetworkPreset
}

/** Returns the signed scope-active proof for an already-active escrow. */
export const createClientStake = (method: StakeMethod) => {
  return (parameters: ClientStakeParameters) => {
    const preset = parameters.preset
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
