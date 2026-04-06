// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MPPEscrow} from "../src/MPPEscrow.sol";

contract DeployMPPEscrow is Script {
    function run() external {
        address[] memory whitelistedTokens = vm.envOr("WHITELISTED_TOKENS", ",", new address[](0));

        // Deployment warning:
        // Carefully review every whitelisted token. This template assumes
        // exact-transfer ERC20 behavior. Different decimals require correct
        // base-unit handling by integrators, and fee-on-transfer, rebasing,
        // share-based, callback-heavy, or otherwise non-standard tokens can
        // produce unexpected accounting or settlement behavior.
        console2.log("WARNING: Review every whitelisted token before deployment.");
        console2.log(
            "Assumes exact-transfer ERC20 behavior; fees, rebases/share mechanics, callbacks, and denomination mistakes can break expectations."
        );

        vm.startBroadcast();
        MPPEscrow escrow = new MPPEscrow(whitelistedTokens);
        vm.stopBroadcast();

        console2.log("MPPEscrow deployed to:", address(escrow));
    }
}
