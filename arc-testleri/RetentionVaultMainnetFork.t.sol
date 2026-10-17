// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Arc MAINNET fork rehearsal (nothing is broadcast): deploys RetentionVault with the decided mainnet
// constructor values (K1, docs/MAINNET-PLAN.md) on a local fork of chain 5042 and runs it against the
// real mainnet USDC contract. Stands in for Studio's compass-deploy --mode verify, whose
// @circlefin/compass-chains registry is not available (npm 404, 18 Oct).
// Run (WSL, project root):
//   ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io FOUNDRY_PROFILE=arc arc-forge test --match-path 'contracts/test/fork/RetentionVaultMainnetFork.t.sol' -vv

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RetentionVault} from "../../RetentionVault.sol";

contract RetentionVaultMainnetForkTest is Test {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    // keccak256(bytecode.object) of contracts/out/RetentionVault.sol/RetentionVault.json (Studio export, 18 Oct)
    bytes32 constant STUDIO_CREATION_HASH = 0x848dc721a0c2e31e4c562292640b6a28e05632632f19f1dae2f6fc5ee28d9f2f;

    RetentionVault vault;
    address payer = makeAddr("isveren");
    address payee = makeAddr("yuklenici");

    function setUp() public {
        vm.createSelectFork(vm.envString("ARC_MAINNET_RPC_URL"));
        assertEq(block.chainid, 5042, "fork must be Arc mainnet");
        vault = new RetentionVault(address(USDC), 4e17, 46e17, 1e18, 500, 100, 1e15, 1e15, 5e5);
    }

    function _fund(address who, uint256 usdc6) internal {
        // On Arc the native balance (18 decimals) and the USDC ERC-20 balance (6 decimals) are the same money.
        vm.deal(who, usdc6 * 1e12);
    }

    function _agreement(uint256 value, uint256 defect, uint256 window) internal returns (uint256 id) {
        vm.prank(payer);
        id = vault.createAgreement(payee, address(0), value, 500, 100, defect, window, window);
        vm.prank(payee);
        vault.acceptAgreement(id);
    }

    function _pay(uint256 id, uint256 amount) internal {
        vm.startPrank(payer);
        USDC.approve(address(vault), amount);
        vault.payProgress(id, amount, bytes32("mainnet-fork"));
        vm.stopPrank();
    }

    function test_creationCodeMatchesStudioArtifact() public pure {
        assertEq(keccak256(type(RetentionVault).creationCode), STUDIO_CREATION_HASH, "arc-forge build == Studio artifact");
    }

    function test_mainnetConfig() public view {
        assertGt(address(USDC).code.length, 0, "USDC exists on mainnet");
        assertEq(address(vault.usdc()), address(USDC));
        assertEq(vault.priorA(), 4e17);
        assertEq(vault.priorB(), 46e17);
        assertEq(vault.zWad(), 1e18);
        assertEq(vault.capBps(), 500);
        assertEq(vault.floorBps(), 100);
        assertEq(vault.maxAgreementValue(), 1e15);
        assertEq(vault.maxTotalHeld(), 1e15);
        assertEq(vault.minRecordValue(), 5e5);
        assertEq(vault.rateFor(payee, 500), 500, "new payee pays the cap");
    }

    function test_happyPath_realMainnetUSDC() public {
        _fund(payer, 3e6);
        uint256 id = _agreement(2e6, 600, 120);
        _pay(id, 1e6);
        _pay(id, 1e6);
        assertEq(vault.pool(id), 100_000, "5% of 2 USDC retained");
        assertEq(USDC.balanceOf(address(vault)), 2e6, "real USDC moved into the vault");

        vm.prank(payee);
        vault.signProvisional(id);
        vm.prank(payer);
        vault.signProvisional(id);
        assertEq(vault.pool(id), 50_000, "half released at provisional acceptance");

        vm.warp(block.timestamp + 600);
        vault.finalize(id);
        vm.prank(payee);
        vault.withdraw();
        assertEq(USDC.balanceOf(payee), 2e6, "payee received the full 2 USDC");
        assertEq(vault.totalHeld(), 0);
        (uint256 n, uint256 k) = vault.record(payee);
        assertEq(n, 1);
        assertEq(k, 0);
        assertEq(vault.rateFor(payee, 500), 421, "one clean job: 4.21%, as the reference");
    }

    function test_D10_silenceDeemsProvisional_realMainnetUSDC() public {
        _fund(payer, 2e6);
        uint256 id = _agreement(1e6, 600, 120);
        _pay(id, 1e6);
        vm.prank(payee);
        vault.signProvisional(id);
        vm.warp(block.timestamp + 121);
        vault.resolveProvisional(id);
        assertEq(uint256(vault.agreement(id).state), uint256(RetentionVault.State.DefectPeriod));
        assertEq(vault.pool(id), 25_000);
    }

    function test_noPracticalCap_largeAgreementAccepted() public {
        // Decision K1: no amount caps. A 1,000,000 USDC agreement can be proposed (no funds move here).
        vm.prank(payer);
        uint256 id = vault.createAgreement(payee, address(0), 1_000_000e6, 500, 100, 600, 120, 120);
        assertEq(vault.agreement(id).contractValue, 1_000_000e6);
    }
}
