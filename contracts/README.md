# MPPEscrow Contracts

Solidity contracts for the MPP stake payment intent. `MPPEscrow` is a minimal,
forkable escrow that locks whitelisted ERC-20 tokens for a stable `scope`,
tracks one active escrow per `(scope, beneficiary)`, and resolves escrows by
internal `escrowId`.

This contract is meant to be a development kit starting point, not a production
deployment target.

## Directory layout

```text
contracts/
  src/
    IMPPEscrow.sol       Interface: structs, events, errors, function signatures
    MPPEscrow.sol        Reference implementation with lifecycle hooks
  test/
    MPPEscrow.t.sol      Foundry tests
  script/
    DeployMPPEscrow.s.sol
```

## How the escrow works

### Lifecycle

1. **Create**: A payer calls `createEscrow(scope, counterparty, beneficiary, token, amount)` after approving the contract to spend tokens.
2. **Active**: The contract stores an internal `escrowId` and marks it as the active escrow for `(scope, beneficiary)`.
3. **Refund**: The counterparty or a refund delegate calls `refundEscrow(escrowId)` to return tokens to the beneficiary.
4. **Slash**: The counterparty or a slash delegate calls `slashEscrow(escrowId)` to send tokens to the counterparty.

Once resolved, an escrow is inactive and a new escrow may later be created for
the same `(scope, beneficiary)`.

### Core concepts

| Concept | Description |
| ------- | ----------- |
| **Scope** | Stable `bytes32` identifier for the protected access surface |
| **Beneficiary** | Authorization subject for active-stake access |
| **Payer** | Funding account that supplies the escrowed tokens |
| **Escrow ID** | Internal contract id used for storage, events, refund, and slash flows |
| **Token whitelist** | Only reviewed ERC-20 tokens may be escrowed |

### Read surface

The reference contract exposes:

- `getEscrow(escrowId)` for the full historical record
- `getActiveEscrowId(scope, beneficiary)` for the current active id
- `isEscrowActive(scope, beneficiary)` for a fast boolean check
- `getActiveEscrow(scope, beneficiary)` for the canonical active record

## Lifecycle hooks

`MPPEscrow` exposes three internal hooks you can override in a fork:

```solidity
function _afterDeposit(uint256 escrowId, bytes32 scope, address token, uint256 amount) internal;
function _beforeRefund(uint256 escrowId, bytes32 scope, address token, address beneficiary, uint256 amount) internal;
function _beforeSlash(uint256 escrowId, bytes32 scope, address token, address counterparty, uint256 amount) internal;
```

All are no-ops by default. Typical uses:

- route deposits into a vault
- withdraw from a yield source before refund/slash
- take protocol fees before settlement
- add custom access control or timing rules

## Extension guidance

Useful directions for a fork:

- add yield routing in the hooks
- add custom whitelist or owner controls if your product needs them
- add time locks or withdrawal policies
- add richer escrow metadata in storage or events

Keep the active lookup simple unless you have a concrete use case. The reference
contract intentionally avoids top-up, replace, and multiple-concurrent-active
behavior.

## Building and testing

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
forge test
forge build
```

## Deployment

```bash
export WHITELISTED_TOKENS=0xYourTokenAddress
export CAST_ACCOUNT=your-keystore-account
export SENDER_ADDRESS=0xYourAddress

forge script script/DeployMPPEscrow.s.sol --rpc-url $RPC_URL --sender $SENDER_ADDRESS
forge script script/DeployMPPEscrow.s.sol --rpc-url $RPC_URL --broadcast --account $CAST_ACCOUNT --sender $SENDER_ADDRESS
```
