---
title: Stake Intent for HTTP Payment Authentication
abbrev: Payment Intent Stake
docname: draft-payment-intent-stake-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jonathan Schwartz
    ins: J. Schwartz
    email: jonathan@glif.io
    org: GitBond

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
---

--- abstract

This document defines the "stake" payment intent for use with the Payment
HTTP Authentication Scheme {{I-D.httpauth-payment}}. The "stake" intent
represents a collateral-based access pattern where tokens are locked in an
escrow contract rather than transferred as payment. Access is granted upon
proof that a beneficiary currently has an active stake for a protected scope,
and the stake may later be refunded, slashed, or withdrawn according to the
escrow contract's rules.

--- middle

# Introduction

The "stake" intent introduces a collateral-based alternative to direct
payment. Instead of transferring funds to a recipient, a payer locks tokens in
an escrow contract on behalf of a beneficiary. The server authorizes access
based on the beneficiary's active stake for a protected scope.

This specification defines the abstract challenge-response protocol for
stake-backed access. It does not prescribe a specific escrow contract design
beyond requiring that servers can verify active stake state and the challenged
terms (see {{escrow-verification}}).

This model enables several patterns:

- **Zero-cost access**: The server gates access without charging users;
  well-behaved participants get their stake back
- **Enforcement via slashing**: The counterparty can penalize policy
  violations by slashing the stake
- **Yield-based monetization**: Staked tokens may be deposited into
  yield-bearing protocols while the beneficiary retains principal exposure
- **Sponsored access**: A payer can fund stake on behalf of a different
  beneficiary
- **Reversible commitments**: Users can lock collateral rather than make
  irreversible payments

## Escrow Contract Trust

The escrow contract address is specified by the server in the challenge
request. The security properties of the stake depend entirely on the contract
implementation. A well-designed escrow contract enforces fair refund and slash
rules, but a malicious contract could behave arbitrarily.

Clients SHOULD verify the escrow contract before interacting with it.
Canonical, audited escrow contracts MAY be published by ecosystem
participants and referenced by multiple server implementations. See
{{contract-verification}} for guidance.

## Relationship to Payment Methods

This document defines the abstract semantics of the "stake" intent.
Payment method specifications define how to implement this intent using
their specific escrow infrastructure and ownership-proof primitives. Any
method that supports escrow contracts or equivalent custodial locking
mechanisms MAY implement this intent.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Stake
: A collateral deposit where tokens are locked in an escrow contract to gain
resource access.

Escrow
: A smart contract or custodial mechanism that holds staked tokens. The
escrow's rules (refund conditions, slash authority, withdrawal rights) are
defined by its implementation.

Counterparty
: The entity designated by the server as the escrow's controlling party.
Typically authorized to trigger refunds or slashes, but the exact authority
depends on the escrow contract.

Beneficiary
: The authorization subject for stake-backed access. The server grants access
when this beneficiary has an active stake for the challenged scope.

Payer
: The account that funds the escrow deposit. The payer MAY be the same as the
beneficiary, but sponsorship flows MAY use a different payer.

Scope
: A stable identifier for the protected access surface. A scope identifies what
the active stake authorizes. It is not a per-challenge replay key and is not a
contract storage key.

Escrow ID
: A contract-assigned identifier for one escrow instance. Escrow IDs are
implementation details used for storage, events, refund flows, slash flows,
and audit trails.

Base Units
: The smallest denomination of a currency or asset. For tokens, this is the
smallest transferable unit defined by the token's decimal precision.

# Intent Semantics

## Definition

The "stake" intent represents a request for tokens to be locked in an escrow
contract so that a beneficiary gains access to a protected scope. Access is
granted upon proof that:

1. the requester controls the beneficiary for the current challenge, and
2. the beneficiary currently has an active stake for the required scope.

## Properties

| Property              | Value                                                      |
| --------------------- | ---------------------------------------------------------- |
| **Intent Identifier** | `stake`                                                    |
| **Payment Timing**    | Before request (active stake must already exist)           |
| **Challenge Replay**  | Single-use per challenge `id`                              |
| **Stake Reuse**       | Active stake MAY satisfy multiple challenges for the scope |
| **Reversibility**     | Contract-dependent (see {{resolution}})                    |

## Lifecycle

The stake intent has a three-phase lifecycle:

### Phase 1: Prove

1. Server issues a 402 response with `intent="stake"`
2. Client ensures an active escrow exists for the challenged scope
3. Client submits a `scope-active` credential proving beneficiary control for
   the challenge
4. Server verifies active stake and grants access
5. Server returns a `Payment-Receipt` header

### Phase 2: Active

While the escrow is active, the beneficiary has ongoing access to the
protected scope. An already-active stake MAY satisfy later challenges for the
same scope without requiring a new escrow deposit, but later protected requests
still use the normal challenge-response flow unless a higher-layer session
mechanism defines otherwise. In that case, each later challenge requires its
own fresh challenge-bound ownership proof.

### Phase 3: Resolution {#resolution}

The escrow resolves when it transitions out of the active state. Common
resolution outcomes include:

- **Refund**: The counterparty returns the staked tokens to the beneficiary.
  This is the expected outcome for well-behaved participants.
- **Slash**: The counterparty transfers the staked tokens to itself as a
  penalty for policy violation.
- **Withdraw**: The payer or beneficiary reclaims the stake, if permitted by
  the escrow contract.

The set of available resolution actions and the conditions under which they are
permitted are defined by the escrow contract implementation and are outside the
scope of this specification. Servers MUST revoke access when the escrow is no
longer active, regardless of the resolution type.

## Atomicity

The "stake" intent is atomic at verification time: the server MUST NOT grant
access until the active stake has been verified with the correct parameters.
Inactive or mismatched escrows MUST be rejected.

# Request Schema

The `request` parameter for a "stake" intent is a JSON object with
shared fields defined by this specification and method-specific
extensions in the `methodDetails` field. The `request` JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) and base64url-encoded
without padding per {{I-D.httpauth-payment}}.

## Shared Fields

### Required Fields

| Field          | Type   | Description                                           |
| -------------- | ------ | ----------------------------------------------------- |
| `amount`       | string | Minimum stake amount in base units                    |
| `contract`     | string | Escrow contract address in method-native format       |
| `counterparty` | string | Address authorized to control the escrow              |
| `scope`        | string | Stable identifier for the protected scope             |
| `token`        | string | Token identifier (contract address or method-defined) |

### Optional Fields

| Field         | Type   | Description                                                                                                     |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `beneficiary` | string | Beneficiary the server expects to authorize. If omitted, the beneficiary is recovered from the ownership proof. |
| `description` | string | Human-readable description of the stake requirement                                                             |
| `externalId`  | string | Server reference identifier                                                                                     |
| `policy`      | string | Identifier for the counterparty's policy                                                                        |
| `resource`    | string | Identifier for the resource being accessed                                                                      |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the expiry value.

## Scope Semantics

`scope` is the canonical identifier for the protected access surface.
It MUST be stable across challenges for the same protected surface and MUST NOT
be used as a per-challenge replay key.

This specification intentionally leaves scope derivation to implementations.
Method specifications or profiles MAY define concrete derivation rules. A
profile MAY, for example, require `scope` to be a `bytes32` hash in EVM
environments.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails`
object. These fields are method-specific and MUST be documented in the
payment method specification. Clients that do not recognize a payment
method SHOULD ignore `methodDetails` but MUST still be able to parse
the shared fields.

Example method-specific fields include:

| Field     | Type   | Description                             |
| --------- | ------ | --------------------------------------- |
| `chainId` | number | Chain identifier for the target network |

# Credential Requirements

## Payload

The credential structure follows {{I-D.httpauth-payment}}, containing
`challenge`, `payload`, and an optional `source` field.

The `payload` for a "stake" intent MUST use a single proof type:

| Proof Type   | `type` Value     | Description                                                                |
| ------------ | ---------------- | -------------------------------------------------------------------------- |
| Scope Active | `"scope-active"` | Proof that the requester controls the beneficiary for the challenged scope |

### Scope-Active Payload

```json
{
  "signature": "0x1234...abcd",
  "type": "scope-active"
}
```

The signature MUST be bound to the challenge and MUST allow the server to
recover or verify the beneficiary address. The signature MUST NOT merely prove
that some past escrow-creation transaction occurred.

If `source` is present, it MUST match the recovered beneficiary identity.

## Challenge Freshness

Stake credentials are single-use at the challenge level, not at the scope
level. Servers MUST reject replayed credentials for the same challenge `id`.
An already-active stake MAY satisfy later challenges for the same scope,
subject to normal server replay protection. Reuse of the underlying stake does
not eliminate the need for a new challenge and a new challenge-bound proof on
later protected requests.

# Escrow Verification {#escrow-verification}

Servers MUST verify that an escrow is active and that its parameters
match the original challenge before granting access. The mechanism used
to query escrow state is an implementation detail and is outside the
scope of this specification. Servers MAY use contract state queries,
event logs, indexers, or any other method appropriate for their target
platform.

Implementations SHOULD expose a canonical active lookup by `(scope, beneficiary)`.
Escrow IDs are internal implementation details and SHOULD NOT appear in the
public challenge or credential shape.

# Verification

## Server Responsibilities

Servers verifying a "stake" credential MUST:

1. Verify the challenge `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Verify the `scope-active` ownership proof and recover or validate the
   beneficiary
4. Verify that an active escrow exists for `(scope, beneficiary)`
5. Verify that the escrow parameters match the challenge
6. Verify that the escrow principal meets or exceeds the requested amount

## On-Chain Verification {#on-chain-verification}

Servers MUST verify that the escrow is active before granting access.
Historical escrow-creation evidence alone is insufficient: a client could have
created an escrow and then immediately resolved it. Servers MUST confirm the
escrow is currently active using whatever query mechanism is appropriate for
their escrow contract and platform.

When verifying escrow state, servers MUST confirm that the active escrow
matches the challenge:

- Beneficiary matches the recovered proof subject
- Beneficiary matches the request if the request explicitly specifies one
- Counterparty matches the request
- Token matches the request
- Scope matches the request
- Amount meets or exceeds the requested stake

Servers MAY additionally verify escrow creation events as a supplementary audit
mechanism, but such events are not the normative stake proof.

## Ongoing Verification

Servers SHOULD periodically re-verify escrow state for ongoing access.
A withdrawn, refunded, or slashed escrow MUST result in access revocation.
Servers MAY implement webhooks, event subscriptions, or polling to detect
escrow state changes.

Unless a higher-layer session mechanism is in use, later protected requests
SHOULD issue a fresh challenge and require a fresh `scope-active` proof, while
reusing the same active stake if it still satisfies the challenged scope and
terms.

## Method-Specific Proof Rules

This specification defines the semantics of `scope-active`, but each payment
method MUST specify how the proof is represented.

For EVM-based stake methods, a suitable construction is an EIP-712 signature
whose domain binds the escrow contract and chain, and whose message binds at
least:

- `challenge.id`
- `expires`
- `scope`
- `beneficiary`

Other payment methods MAY define equivalent ownership-proof envelopes so long as
they provide the same semantics: challenge-bound beneficiary control for the
challenged scope.

# Examples

### Stake Challenge

```json
{
  "amount": "5000000",
  "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
  "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Stake required to access premium content",
  "externalId": "document:incident-report",
  "policy": "document-access-v1",
  "resource": "/documents/incident-report",
  "scope": "0x9a3f...7b2e",
  "token": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431
  }
}
```

### Scope-Active Credential

```json
{
  "challenge": {
    "id": "challenge-123",
    "method": "tempo",
    "intent": "stake",
    "request": {
      "amount": "5000000",
      "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
      "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
      "scope": "0x9a3f...7b2e",
      "token": "0x20c0000000000000000000000000000000000000",
      "methodDetails": {
        "chainId": 42431
      }
    }
  },
  "payload": {
    "signature": "0x1234...abcd",
    "type": "scope-active"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

# Security Considerations

## Stake Amount Verification

Clients MUST verify the requested stake amount is appropriate before locking
tokens. Malicious servers could request excessive collateral. Clients SHOULD
warn users when stake amounts exceed a configurable threshold.

## Counterparty Trust

The counterparty has authority over the escrow as defined by the contract.
Depending on the contract implementation, this may include the ability to slash
the entire stake. Clients SHOULD verify the counterparty address against a
known trusted set or warn users about unknown counterparties. The
counterparty's policies SHOULD be publicly documented.

## Contract Verification {#contract-verification}

Clients MUST verify the escrow contract address before interacting with it.
Malicious servers could specify a contract that steals tokens rather than
escrowing them.

Ecosystem participants MAY publish canonical escrow contract addresses
that are audited, well-known, and reusable across server implementations.
Clients SHOULD maintain a registry of trusted escrow contracts and warn
users when encountering an unknown contract. Verification methods include:

- Checking the contract address against a known-good list
- Verifying contract bytecode matches a published reference
- Checking for audit attestations on-chain

## Replay Protection

Servers MUST implement replay protection for challenge credentials. The replay
unit is the challenge `id`, not the scope. Reusing an active stake across later
challenges is allowed only when each later challenge has its own valid proof
exchange.

## Scope Derivation

Servers MUST derive `scope` deterministically for the protected access surface
they intend to authorize. If a server changes scope derivation unexpectedly, it
may strand legitimate active stakes or unintentionally merge distinct access
surfaces into one authorization domain.

## Beneficiary and Payer Separation

Implementations MUST NOT assume that the payer and beneficiary are the same
account. Access is granted based on the beneficiary's active stake, while
funding and refund mechanics may involve a separate payer.

## Escrow Liveness

Servers MUST re-verify escrow state for ongoing access. A refunded, slashed, or
withdrawn escrow MUST result in access revocation. Servers SHOULD NOT cache
escrow state indefinitely.

## Token Approval Risk

EVM implementations that use the approve-then-escrow flow expose the payer to
front-running risk between the approval and escrow creation transactions.
Implementations SHOULD prefer approval patterns that minimize this window when
their token ecosystem supports them.

## Transport Security

All Payment authentication flows MUST use TLS 1.2 or later per
{{I-D.httpauth-payment}}. Stake credentials contain challenge-bound ownership
proofs that could otherwise be replayed within the challenge validity window.

## Slash Abuse

Counterparties could abuse their slash authority. This specification
does not define slash policy enforcement; it is the responsibility of the
escrow contract and the counterparty's governance model. Clients SHOULD only
stake with counterparties and contracts whose policies are transparent and
auditable.

## Withdrawal Risk

If the escrow contract allows withdrawal, a client could gain access and then
withdraw immediately. Servers MUST re-verify escrow state to detect this.
Escrow contracts MAY implement time locks or other withdrawal conditions to
mitigate this risk.

# IANA Considerations

## Payment Intent Registration

This document registers the "stake" intent in the "HTTP Payment Intents"
registry established by {{I-D.httpauth-payment}}:

| Intent  | Description                    | Reference     |
| ------- | ------------------------------ | ------------- |
| `stake` | Collateral-based escrow access | This document |

Contact: GitBond (<jonathan@gitbond.com>)
