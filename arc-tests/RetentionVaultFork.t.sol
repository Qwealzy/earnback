// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Arc testnet fork testi: Studio'nun deploy ettiği kontratı GERÇEK Arc USDC'siyle sınar.
// Çalıştırma (WSL, proje kökü):
//   ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io FOUNDRY_PROFILE=arc arc-forge test --match-path 'contracts/test/fork/*' -vv
// Studio'nun MockUSDC testleri Arc USDC'sinin blocklist ve 18/6 ondalık davranışını sınayamaz; bu dosya onu yapar.

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RetentionVault} from "../../RetentionVault.sol";

contract RetentionVaultForkTest is Test {
    RetentionVault constant VAULT = RetentionVault(0xfA5E10d370140AcBDfe977437be6742908449b39);
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    // Arc testnet'te blocklist'e eklenmiş test adresi (context/notes/01 §3, notes/23 §3.7)
    address constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    address payer = makeAddr("isveren");
    address payee = makeAddr("yuklenici");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"));
    }

    function _fund(address who, uint256 usdc6) internal {
        // Arc'ta yerel bakiye (18 ondalık) ile USDC ERC-20 bakiyesi (6 ondalık) aynı paradır.
        vm.deal(who, usdc6 * 1e12);
    }

    function _agreement(address p, address q) internal returns (uint256 id) {
        vm.prank(p);
        id = VAULT.createAgreement(q, address(0), 2e6, 500, 100, 600, 120, 120);
        vm.prank(q);
        VAULT.acceptAgreement(id);
    }

    function _pay(address p, uint256 id, uint256 amount) internal {
        vm.startPrank(p);
        USDC.approve(address(VAULT), amount);
        VAULT.payProgress(id, amount, bytes32("fork"));
        vm.stopPrank();
    }

    function test_deployedConfig() public view {
        assertEq(address(VAULT.usdc()), address(USDC));
        assertEq(VAULT.priorA(), 4e17);
        assertEq(VAULT.priorB(), 46e17);
        assertEq(VAULT.zWad(), 1e18);
        assertEq(VAULT.capBps(), 1000);
        assertEq(VAULT.floorBps(), 100);
        assertEq(VAULT.maxAgreementValue(), 50e6);
        assertEq(VAULT.maxTotalHeld(), 500e6);
        assertEq(VAULT.minRecordValue(), 5e5);
        assertEq(VAULT.rateFor(payee, 500), 500);
    }

    function test_nativeAndErc20ViewsMatch() public {
        _fund(payer, 3e6);
        assertEq(payer.balance, 3e18, "yerel bakiye 18 ondalik");
        assertEq(USDC.balanceOf(payer), 3e6, "ERC-20 bakiyesi 6 ondalik ve ayni para");
    }

    function test_happyPath_realUSDC() public {
        _fund(payer, 5e6);
        uint256 heldBefore = VAULT.totalHeld();
        uint256 id = _agreement(payer, payee);
        assertEq(VAULT.agreement(id).retentionBps, 500, "yeni yuklenici tavani oder");

        _pay(payer, id, 1e6);
        _pay(payer, id, 1e6);
        assertEq(VAULT.pool(id), 100_000, "2 USDC'nin %5'i kasada");
        assertEq(VAULT.withdrawable(payee), 1_900_000);

        vm.prank(payee);
        VAULT.signProvisional(id);
        vm.prank(payer);
        VAULT.signProvisional(id);
        assertEq(VAULT.pool(id), 50_000, "gecici kabulde yarisi serbest");

        vm.warp(block.timestamp + 600);
        VAULT.finalize(id);
        assertEq(VAULT.pool(id), 0);

        vm.prank(payee);
        VAULT.withdraw();
        assertEq(USDC.balanceOf(payee), 2e6, "yuklenici 2 USDC'nin tamamini aldi");
        assertEq(VAULT.totalHeld(), heldBefore);
        (uint256 n, uint256 k) = VAULT.record(payee);
        assertEq(n, 1);
        assertEq(k, 0);
    }

    function test_blockedPayeeDoesNotBlockOthers_realUSDC() public {
        // Önce adresin gerçekten engelli olduğunu doğrula; değilse test anlamsızdır.
        _fund(bob, 1e6);
        vm.prank(bob);
        (bool ok,) = address(USDC).call(abi.encodeCall(IERC20.transfer, (BLOCKED, 1)));
        assertFalse(ok, "BLOCKED adresi testnet'te engelli olmali");

        _fund(payer, 5e6);
        uint256 idBlocked = _agreement(payer, BLOCKED);
        uint256 idBob = _agreement(payer, makeAddr("temiz-yuklenici"));
        _pay(payer, idBlocked, 1e6);
        _pay(payer, idBob, 1e6);

        vm.prank(BLOCKED);
        vm.expectRevert();
        VAULT.withdraw();

        address temiz = makeAddr("temiz-yuklenici");
        uint256 alacak = VAULT.withdrawable(temiz);
        vm.prank(temiz);
        VAULT.withdraw();
        assertEq(USDC.balanceOf(temiz), alacak, "engelli alici digerlerini durdurmadi");
    }

    function test_D10_silenceDeemsProvisional_realUSDC() public {
        _fund(payer, 5e6);
        uint256 id = _agreement(payer, payee);
        _pay(payer, id, 1e6);

        vm.prank(payee);
        VAULT.signProvisional(id);
        vm.warp(block.timestamp + 121);
        VAULT.resolveProvisional(id);
        assertEq(uint256(VAULT.agreement(id).state), uint256(RetentionVault.State.DefectPeriod));
        assertEq(VAULT.pool(id), 25_000, "1 USDC'nin %5'inin yarisi kasada kaldi");
    }
}
