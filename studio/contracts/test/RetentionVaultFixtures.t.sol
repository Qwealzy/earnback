// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {RetentionVault} from "../RetentionVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice Rate fixture tests using vm.store to inject _recordN/_recordK values.
/// Slot layout: slot4 = _recordN, slot5 = _recordK
/// Mapping slot: keccak256(abi.encode(addr, uint256(slotBase)))
contract RetentionVaultFixturesTest is Test {
    // ─── Set A vault (priorA=4e17, priorB=46e17) ─────────────────────────
    RetentionVault internal vaultA;
    // ─── Set B vault (priorA=1e18, priorB=115e17) ────────────────────────
    RetentionVault internal vaultB;

    MockUSDC internal usdc;

    address internal addr = makeAddr("subject");

    // ─── shared constructor params ────────────────────────────────────────
    uint256 constant Z_WAD             = 1e18;
    uint256 constant CAP_BPS           = 1000;
    uint256 constant FLOOR_BPS         = 100;
    uint256 constant MAX_AGREEMENT_VAL = 50_000_000;
    uint256 constant MAX_TOTAL_HELD    = 500_000_000;
    uint256 constant MIN_RECORD_VAL    = 500_000;

    // ─── agreement params for end-to-end test ────────────────────────────
    address internal payer   = makeAddr("payer");
    address internal payee2  = makeAddr("payee2");
    address internal arbiter = makeAddr("arbiter");

    uint256 constant CONTRACT_VALUE  = 10_000_000;
    uint256 constant MAX_BPS         = 500;
    uint256 constant MIN_BPS         = 100;
    uint256 constant DEFECT_PERIOD   = 7 days;
    uint256 constant RESPONSE_WINDOW = 3 days;
    uint256 constant ARBITER_WINDOW  = 3 days;

    function setUp() public {
        usdc  = new MockUSDC("Mock USDC", "mUSDC");

        vaultA = new RetentionVault(
            address(usdc),
            4e17, 46e17, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );

        vaultB = new RetentionVault(
            address(usdc),
            1e18, 115e17, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    // ─── helper: set N and K in vault storage ─────────────────────────────
    // ReentrancyGuard occupies slot 0, so the declared storage is shifted by 1:
    //   _agreements → slot 1, _nextId → slot 2, withdrawable → slot 3,
    //   _totalHeld → slot 4, _recordN → slot 5, _recordK → slot 6
    function _setRecord(RetentionVault v, address a, uint256 n, uint256 k) internal {
        bytes32 slotN = keccak256(abi.encode(a, uint256(5)));
        bytes32 slotK = keccak256(abi.encode(a, uint256(6)));
        vm.store(address(v), slotN, bytes32(n));
        vm.store(address(v), slotK, bytes32(k));
    }

    // ─── helper: assert rateFor matches expected within ±1 bps (rounding) ─
    function _assertRate(RetentionVault v, address a, uint256 maxBps, uint256 expected) internal view {
        uint256 actual = v.rateFor(a, maxBps);
        // allow ±1 for integer rounding
        uint256 lo = expected > 0 ? expected - 1 : 0;
        uint256 hi = expected + 1;
        assertTrue(
            actual >= lo && actual <= hi,
            string(abi.encodePacked(
                "rateFor mismatch: expected ~", _uintToStr(expected),
                " got ", _uintToStr(actual)
            ))
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  Set A (priorA=4e17, priorB=46e17)  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetA_n0_k0() public view {
        // fresh addr → n=0,k=0 → should return maxBps (500) capped
        _assertRate(vaultA, addr, 500, 500);
    }

    function test_SetA_n1_k0() public {
        _setRecord(vaultA, addr, 1, 0);
        _assertRate(vaultA, addr, 500, 421);
    }

    function test_SetA_n3_k0() public {
        _setRecord(vaultA, addr, 3, 0);
        _assertRate(vaultA, addr, 500, 321);
    }

    function test_SetA_n5_k0() public {
        _setRecord(vaultA, addr, 5, 0);
        _assertRate(vaultA, addr, 500, 259);
    }

    function test_SetA_n10_k0() public {
        _setRecord(vaultA, addr, 10, 0);
        _assertRate(vaultA, addr, 500, 175);
    }

    function test_SetA_n10_k1() public {
        _setRecord(vaultA, addr, 10, 1);
        _assertRate(vaultA, addr, 500, 435);
    }

    function test_SetA_n10_k3() public {
        _setRecord(vaultA, addr, 10, 3);
        _assertRate(vaultA, addr, 500, 500);
    }

    function test_SetA_n20_k0() public {
        _setRecord(vaultA, addr, 20, 0);
        _assertRate(vaultA, addr, 500, 106);
    }

    function test_SetA_n50_k1() public {
        _setRecord(vaultA, addr, 50, 1);
        _assertRate(vaultA, addr, 500, 121);
    }

    function test_SetA_n1000_k0() public {
        _setRecord(vaultA, addr, 1000, 0);
        _assertRate(vaultA, addr, 500, 100);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  Set B (priorA=1e18, priorB=115e17)  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetB_n0_k0() public view {
        _assertRate(vaultB, addr, 500, 500);
    }

    function test_SetB_n1_k0() public {
        _setRecord(vaultB, addr, 1, 0);
        _assertRate(vaultB, addr, 500, 464);
    }

    function test_SetB_n3_k0() public {
        _setRecord(vaultB, addr, 3, 0);
        _assertRate(vaultB, addr, 500, 406);
    }

    function test_SetB_n5_k0() public {
        _setRecord(vaultB, addr, 5, 0);
        _assertRate(vaultB, addr, 500, 361);
    }

    function test_SetB_n10_k0() public {
        _setRecord(vaultB, addr, 10, 0);
        _assertRate(vaultB, addr, 500, 282);
    }

    function test_SetB_n10_k1() public {
        _setRecord(vaultB, addr, 10, 1);
        _assertRate(vaultB, addr, 500, 479);
    }

    function test_SetB_n10_k3() public {
        _setRecord(vaultB, addr, 10, 3);
        _assertRate(vaultB, addr, 500, 500);
    }

    function test_SetB_n20_k0() public {
        _setRecord(vaultB, addr, 20, 0);
        _assertRate(vaultB, addr, 500, 196);
    }

    function test_SetB_n50_k1() public {
        _setRecord(vaultB, addr, 50, 1);
        _assertRate(vaultB, addr, 500, 175);
    }

    function test_SetB_n1000_k0() public {
        _setRecord(vaultB, addr, 1000, 0);
        _assertRate(vaultB, addr, 500, 100);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  End-to-end: 3 closed agreements → 4th uses retentionBps=321  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    /// Run a full agreement lifecycle (create→accept→pay→sign→sign→wait→finalize)
    /// with vaultA, payer, payee2, no claims.  contractValue must be >= MIN_RECORD_VAL.
    function _runFullLifecycle(uint256 agreementId) internal {
        // Already created by caller; accept, pay, sign, finalize
        vm.prank(payee2);
        vaultA.acceptAgreement(agreementId);

        usdc.mint(payer, CONTRACT_VALUE);
        vm.prank(payer);
        usdc.approve(address(vaultA), CONTRACT_VALUE);
        vm.prank(payer);
        vaultA.payProgress(agreementId, CONTRACT_VALUE, bytes32(0));

        vm.prank(payer);
        vaultA.signProvisional(agreementId);
        vm.prank(payee2);
        vaultA.signProvisional(agreementId);

        RetentionVault.Agreement memory a = vaultA.agreement(agreementId);
        vm.warp(a.defectEnd);
        vaultA.finalize(agreementId);

        // Withdraw to keep totalHeld from hitting cap across repeated lifecycles
        uint256 payeeW = vaultA.withdrawable(payee2);
        if (payeeW > 0) {
            vm.prank(payee2);
            vaultA.withdraw();
        }
        uint256 payerW = vaultA.withdrawable(payer);
        if (payerW > 0) {
            vm.prank(payer);
            vaultA.withdraw();
        }
    }

    function test_E2E_ThreeAgreements_FourthRetentionBps321() public {
        // Require payer != payee2 (assured by makeAddr) and CONTRACT_VALUE >= MIN_RECORD_VAL
        assertGe(CONTRACT_VALUE, MIN_RECORD_VAL);

        // Agreement 0
        vm.prank(payer);
        vaultA.createAgreement(payee2, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        _runFullLifecycle(0);

        // Agreement 1
        vm.prank(payer);
        vaultA.createAgreement(payee2, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        _runFullLifecycle(1);

        // Agreement 2
        vm.prank(payer);
        vaultA.createAgreement(payee2, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        _runFullLifecycle(2);

        // After 3 finalized agreements: n=3, k=0
        (uint256 n, uint256 k) = vaultA.record(payee2);
        assertEq(n, 3);
        assertEq(k, 0);

        // Agreement 3: acceptAgreement computes rateFor(payee2, MAX_BPS)
        // n=3,k=0 → expected ~321
        vm.prank(payer);
        vaultA.createAgreement(payee2, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);

        vm.prank(payee2);
        vaultA.acceptAgreement(3);

        RetentionVault.Agreement memory a4 = vaultA.agreement(3);
        // Allow ±1 for rounding
        assertGe(a4.retentionBps, 320);
        assertLe(a4.retentionBps, 322);
    }

    // ─── tiny string helper ─────────────────────────────────────────────────
    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 len;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory s = new bytes(len);
        for (uint256 i = len; i > 0; i--) {
            s[i - 1] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(s);
    }
}
