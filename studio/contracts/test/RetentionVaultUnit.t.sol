// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {RetentionVault} from "../RetentionVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract RetentionVaultUnitTest is Test {
    // ─── contract under test ────────────────────────────────────────────────
    RetentionVault internal vault;
    MockUSDC       internal usdc;

    // ─── actors ─────────────────────────────────────────────────────────────
    address internal payer   = makeAddr("payer");
    address internal payee   = makeAddr("payee");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    // ─── default constructor params ─────────────────────────────────────────
    uint256 constant PRIOR_A           = 4e17;
    uint256 constant PRIOR_B           = 46e17;
    uint256 constant Z_WAD             = 1e18;
    uint256 constant CAP_BPS           = 1000;
    uint256 constant FLOOR_BPS         = 100;
    uint256 constant MAX_AGREEMENT_VAL = 50_000_000;
    uint256 constant MAX_TOTAL_HELD    = 500_000_000;
    uint256 constant MIN_RECORD_VAL    = 500_000;

    // ─── default agreement params ────────────────────────────────────────────
    uint256 constant CONTRACT_VALUE    = 10_000_000;
    uint256 constant MAX_BPS           = 500;
    uint256 constant MIN_BPS           = 100;
    uint256 constant DEFECT_PERIOD     = 7 days;
    uint256 constant RESPONSE_WINDOW   = 3 days;
    uint256 constant ARBITER_WINDOW    = 3 days;

    // ─── event declarations (mirrors contract) ───────────────────────────────
    event AgreementCreated(uint256 indexed id, address indexed payer, address indexed payee, address arbiter, uint256 contractValue);
    event AgreementAccepted(uint256 indexed id, uint256 retentionBps, uint256 n, uint256 k);
    event AgreementCancelled(uint256 indexed id);
    event ProgressPaid(uint256 indexed id, uint256 amount, uint256 cut, bytes32 ref);
    event ProvisionalSigned(uint256 indexed id, address signer);
    event ProvisionalAccepted(uint256 indexed id, uint256 released, uint256 defectEnd);
    event ClaimOpened(uint256 indexed id, uint256 amount, bytes32 evidenceHash);
    event ClaimAnswered(uint256 indexed id, bool accepted);
    event ClaimDecided(uint256 indexed id, uint256 payerShare);
    event ClaimResolved(uint256 indexed id, uint256 payerShare, string reason);
    event Finalized(uint256 indexed id, uint256 released);
    event Withdrawn(address indexed account, uint256 amount);
    event ProvisionalRequested(uint256 indexed id, uint256 deadline);
    event ProvisionalObjected(uint256 indexed id, bytes32 reasonHash);
    event ProvisionalDecided(uint256 indexed id, bool accepted);
    event ProvisionalResolved(uint256 indexed id, string reason);

    // ─── setUp ───────────────────────────────────────────────────────────────
    function setUp() public {
        usdc  = new MockUSDC("Mock USDC", "mUSDC");
        vault = new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  1. Constructor validation  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Constructor_StoresParams() public view {
        assertEq(address(vault.usdc()),             address(usdc));
        assertEq(vault.priorA(),                    PRIOR_A);
        assertEq(vault.priorB(),                    PRIOR_B);
        assertEq(vault.zWad(),                      Z_WAD);
        assertEq(vault.capBps(),                    CAP_BPS);
        assertEq(vault.floorBps(),                  FLOOR_BPS);
        assertEq(vault.maxAgreementValue(),         MAX_AGREEMENT_VAL);
        assertEq(vault.maxTotalHeld(),              MAX_TOTAL_HELD);
        assertEq(vault.minRecordValue(),            MIN_RECORD_VAL);
    }

    function test_Constructor_Revert_ZeroAddress() public {
        vm.expectRevert(RetentionVault.ZeroAddress.selector);
        new RetentionVault(
            address(0),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_UsdcNoCode() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            eoa,
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_CapBpsExceeds10000() public {
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            10_001, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_FloorBpsZero() public {
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, 0,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_FloorBpsGtCapBps() public {
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            100, 101,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_MaxAgreementValueZero() public {
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            0, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_MaxTotalHeldZero() public {
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, 0, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_PriorsBothZero() public {
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            address(usdc),
            0, 0, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  2. createAgreement  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_CreateAgreement_HappyPath() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit AgreementCreated(0, payer, payee, arbiter, CONTRACT_VALUE);

        vm.prank(payer);
        uint256 id = vault.createAgreement(
            payee, arbiter,
            CONTRACT_VALUE, MAX_BPS, MIN_BPS,
            DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW
        );
        assertEq(id, 0);

        RetentionVault.Agreement memory a = vault.agreement(0);
        assertEq(a.payer,          payer);
        assertEq(a.payee,          payee);
        assertEq(a.arbiter,        arbiter);
        assertEq(a.contractValue,  CONTRACT_VALUE);
        assertEq(a.maxBps,         MAX_BPS);
        assertEq(a.minBps,         MIN_BPS);
        assertEq(uint8(a.state),   uint8(RetentionVault.State.Proposed));
    }

    function test_CreateAgreement_IdIncrements() public {
        vm.startPrank(payer);
        uint256 id0 = vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        uint256 id1 = vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        vm.stopPrank();
        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_CreateAgreement_Revert_PayeeZeroAddress() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.ZeroAddress.selector);
        vault.createAgreement(address(0), arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_SameAddress_PayerEqualsPayee() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.SameAddress.selector);
        vault.createAgreement(payer, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_SameAddress_ArbiterEqualsPayee() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.SameAddress.selector);
        vault.createAgreement(payee, payee, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_SameAddress_ArbiterEqualsPayer() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.SameAddress.selector);
        vault.createAgreement(payee, payer, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_NoRevert_ArbiterAddressZero() public {
        // arbiter can be address(0) — no revert
        vm.prank(payer);
        vault.createAgreement(payee, address(0), CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_ContractValueZero() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        vault.createAgreement(payee, arbiter, 0, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_ContractValueExceedsMax() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        vault.createAgreement(payee, arbiter, MAX_AGREEMENT_VAL + 1, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_MaxBpsExceedsCapBps() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, CAP_BPS + 1, FLOOR_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_MinBpsLtFloorBps() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, FLOOR_BPS - 1, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_MinBpsGtMaxBps() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidBps.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MAX_BPS + 1, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_DefectPeriodTooShort() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, 59, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_DefectPeriodTooLong() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, 730 days + 1, RESPONSE_WINDOW, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_ResponseWindowTooShort() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, 59, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_ResponseWindowTooLong() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, 30 days + 1, ARBITER_WINDOW);
    }

    function test_CreateAgreement_Revert_ArbiterWindowTooShort() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, 59);
    }

    function test_CreateAgreement_Revert_ArbiterWindowTooLong() public {
        vm.prank(payer);
        vm.expectRevert(RetentionVault.InvalidPeriod.selector);
        vault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, 30 days + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  3. cancelProposal  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_CancelProposal_HappyPath() public {
        uint256 id = _createAgreement();

        vm.expectEmit(true, false, false, false, address(vault));
        emit AgreementCancelled(id);

        vm.prank(payer);
        vault.cancelProposal(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.Cancelled));
    }

    function test_CancelProposal_Revert_NotPayer() public {
        uint256 id = _createAgreement();
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotPayer.selector);
        vault.cancelProposal(id);
    }

    function test_CancelProposal_Revert_WrongState_AfterActive() public {
        uint256 id = _createAndAcceptAgreement();
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.cancelProposal(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  4. acceptAgreement  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_AcceptAgreement_HappyPath() public {
        uint256 id = _createAgreement();

        vm.prank(payee);
        vault.acceptAgreement(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.Active));
        // retentionBps clamped to [minBps, maxBps]
        assertGe(a.retentionBps, MIN_BPS);
        assertLe(a.retentionBps, MAX_BPS);
    }

    function test_AcceptAgreement_EmitsEvent() public {
        uint256 id = _createAgreement();

        uint256 expected = vault.rateFor(payee, MAX_BPS);
        if (expected < MIN_BPS) expected = MIN_BPS;
        else if (expected > MAX_BPS) expected = MAX_BPS;

        vm.expectEmit(true, false, false, true, address(vault));
        emit AgreementAccepted(id, expected, 0, 0);

        vm.prank(payee);
        vault.acceptAgreement(id);
    }

    function test_AcceptAgreement_Revert_NotPayee() public {
        uint256 id = _createAgreement();
        vm.prank(payer);
        vm.expectRevert(RetentionVault.NotPayee.selector);
        vault.acceptAgreement(id);
    }

    function test_AcceptAgreement_Revert_WrongState() public {
        uint256 id = _createAgreement();
        vm.prank(payer);
        vault.cancelProposal(id);

        vm.prank(payee);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.acceptAgreement(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  5. payProgress  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_PayProgress_HappyPath() public {
        uint256 id     = _createAndAcceptAgreement();
        uint256 amount = 1_000_000;

        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);

        RetentionVault.Agreement memory a = vault.agreement(id);
        uint256 cut = amount * a.retentionBps / 10_000;

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProgressPaid(id, amount, cut, bytes32(0));

        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));

        a = vault.agreement(id);
        assertEq(a.paid,     amount);
        assertEq(a.retained, cut);
        assertEq(vault.withdrawable(payee), amount - cut);
        assertEq(vault.totalHeld(),         amount);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    function test_PayProgress_Revert_NotPayer() public {
        uint256 id = _createAndAcceptAgreement();
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotPayer.selector);
        vault.payProgress(id, 1_000, bytes32(0));
    }

    function test_PayProgress_Revert_WrongState() public {
        uint256 id = _createAgreement(); // still Proposed
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.payProgress(id, 1_000, bytes32(0));
    }

    function test_PayProgress_Revert_ZeroAmount() public {
        uint256 id = _createAndAcceptAgreement();
        vm.prank(payer);
        vm.expectRevert(RetentionVault.ZeroAmount.selector);
        vault.payProgress(id, 0, bytes32(0));
    }

    function test_PayProgress_Revert_ExceedsContractValue() public {
        uint256 id = _createAndAcceptAgreement();
        uint256 tooBig = CONTRACT_VALUE + 1;
        usdc.mint(payer, tooBig);
        vm.prank(payer);
        usdc.approve(address(vault), tooBig);
        vm.prank(payer);
        vm.expectRevert(RetentionVault.ExceedsContractValue.selector);
        vault.payProgress(id, tooBig, bytes32(0));
    }

    function test_PayProgress_Revert_ExceedsMaxHeld() public {
        // Deploy a vault with a very small maxTotalHeld
        RetentionVault tinyVault = new RetentionVault(
            address(usdc),
            PRIOR_A, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, 1, MIN_RECORD_VAL  // maxTotalHeld = 1
        );

        vm.prank(payer);
        tinyVault.createAgreement(payee, arbiter, CONTRACT_VALUE, MAX_BPS, MIN_BPS, DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW);
        vm.prank(payee);
        tinyVault.acceptAgreement(0);

        uint256 amount = 2;
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(tinyVault), amount);

        vm.prank(payer);
        vm.expectRevert(RetentionVault.ExceedsMaxHeld.selector);
        tinyVault.payProgress(0, amount, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  6. signProvisional  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_SignProvisional_BothSignsTransitionsToDefectPeriod() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        // payer signs first
        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalSigned(id, payer);
        vm.prank(payer);
        vault.signProvisional(id);

        // payee signs → triggers ProvisionalAccepted
        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
        assertGt(a.defectEnd, block.timestamp);
    }

    function test_SignProvisional_Revert_NotParty() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotParty.selector);
        vault.signProvisional(id);
    }

    function test_SignProvisional_Revert_WrongState() public {
        uint256 id = _createAgreement(); // Proposed
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.signProvisional(id);
    }

    function test_SignProvisional_Revert_AlreadySigned_Payer() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);
        vm.prank(payer);
        vault.signProvisional(id);
        vm.prank(payer);
        vm.expectRevert(RetentionVault.AlreadySigned.selector);
        vault.signProvisional(id);
    }

    function test_SignProvisional_Revert_AlreadySigned_Payee() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);
        vm.prank(payee);
        vault.signProvisional(id);
        vm.prank(payee);
        vm.expectRevert(RetentionVault.AlreadySigned.selector);
        vault.signProvisional(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░══░  7. openClaim  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_OpenClaim_HappyPath() public {
        uint256 id = _reachDefectPeriod();

        RetentionVault.Agreement memory a = vault.agreement(id);
        uint256 claimAmt = vault.pool(id);
        bytes32 evidence = keccak256("evidence");

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimOpened(id, claimAmt, evidence);

        vm.prank(payer);
        vault.openClaim(id, claimAmt, evidence);

        a = vault.agreement(id);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.Open));
        assertEq(a.claim.amount,        claimAmt);
        assertEq(a.claim.evidenceHash,  evidence);
    }

    function test_OpenClaim_Revert_NotPayer() public {
        uint256 id = _reachDefectPeriod();
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotPayer.selector);
        vault.openClaim(id, 1, bytes32(0));
    }

    function test_OpenClaim_Revert_WrongState() public {
        uint256 id = _createAndAcceptAgreement(); // Active not DefectPeriod
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.openClaim(id, 1, bytes32(0));
    }

    function test_OpenClaim_Revert_DeadlinePassed() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd); // exactly at defectEnd → DeadlinePassed
        vm.prank(payer);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.openClaim(id, 1, bytes32(0));
    }

    function test_OpenClaim_Revert_ClaimExists() public {
        uint256 id = _reachDefectPeriod();
        uint256 pool = vault.pool(id);
        uint256 half = pool / 2;

        vm.prank(payer);
        vault.openClaim(id, half, bytes32(0));

        vm.prank(payer);
        vm.expectRevert(RetentionVault.ClaimExists.selector);
        vault.openClaim(id, half, bytes32(0));
    }

    function test_OpenClaim_Revert_ZeroAmount() public {
        uint256 id = _reachDefectPeriod();
        vm.prank(payer);
        vm.expectRevert(RetentionVault.ZeroAmount.selector);
        vault.openClaim(id, 0, bytes32(0));
    }

    function test_OpenClaim_Revert_ExceedsPool() public {
        uint256 id = _reachDefectPeriod();
        uint256 overPool = vault.pool(id) + 1;
        vm.prank(payer);
        vm.expectRevert(RetentionVault.ExceedsPool.selector);
        vault.openClaim(id, overPool, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  8. respondClaim  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_RespondClaim_Accept() public {
        uint256 id = _reachOpenClaim();

        RetentionVault.Agreement memory before = vault.agreement(id);
        uint256 claimAmt = before.claim.amount;
        uint256 payerWithdrawBefore = vault.withdrawable(payer);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimAnswered(id, true);

        vm.prank(payee);
        vault.respondClaim(id, true);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(a.awardedToPayer, claimAmt);
        assertEq(vault.withdrawable(payer), payerWithdrawBefore + claimAmt);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.None));
        assertTrue(a.upheld);
    }

    function test_RespondClaim_Reject() public {
        uint256 id = _reachOpenClaim();

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimAnswered(id, false);

        vm.prank(payee);
        vault.respondClaim(id, false);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.Disputed));
        assertGt(a.claim.arbiterDeadline, 0);
    }

    function test_RespondClaim_Revert_NotPayee() public {
        uint256 id = _reachOpenClaim();
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotPayee.selector);
        vault.respondClaim(id, true);
    }

    function test_RespondClaim_Revert_NoOpenClaim() public {
        uint256 id = _reachDefectPeriod(); // no claim opened
        vm.prank(payee);
        vm.expectRevert(RetentionVault.NoOpenClaim.selector);
        vault.respondClaim(id, true);
    }

    function test_RespondClaim_Revert_DeadlinePassed() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.responseDeadline + 1); // past deadline
        vm.prank(payee);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.respondClaim(id, true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  9. resolveUnanswered  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_ResolveUnanswered_HappyPath() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        uint256 claimAmt = a.claim.amount;

        vm.warp(a.claim.responseDeadline + 1); // past deadline

        uint256 payerWithdrawBefore = vault.withdrawable(payer);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimResolved(id, claimAmt, "silence");

        vault.resolveUnanswered(id);

        a = vault.agreement(id);
        assertEq(a.awardedToPayer, claimAmt);
        assertEq(vault.withdrawable(payer), payerWithdrawBefore + claimAmt);
        assertTrue(a.upheld);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.None));
    }

    function test_ResolveUnanswered_Revert_NoOpenClaim() public {
        uint256 id = _reachDefectPeriod();
        vm.expectRevert(RetentionVault.NoOpenClaim.selector);
        vault.resolveUnanswered(id);
    }

    function test_ResolveUnanswered_Revert_DeadlineNotPassed() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        // exactly at deadline → NOT passed
        vm.warp(a.claim.responseDeadline);
        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.resolveUnanswered(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  10. arbiterDecide  ░══░
    // ═══════════════════════════════════════════════════════════════════════

    function test_ArbiterDecide_HappyPath() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        uint256 payerShare = a.claim.amount / 2;

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimDecided(id, payerShare);

        vm.prank(arbiter);
        vault.arbiterDecide(id, payerShare);

        a = vault.agreement(id);
        assertEq(a.awardedToPayer, payerShare);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.None));
    }

    function test_ArbiterDecide_Revert_NotArbiter() public {
        uint256 id = _reachDisputedClaim();
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotArbiter.selector);
        vault.arbiterDecide(id, 1);
    }

    function test_ArbiterDecide_Revert_NoOpenClaim() public {
        uint256 id = _reachDefectPeriod();
        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.NoOpenClaim.selector);
        vault.arbiterDecide(id, 0);
    }

    function test_ArbiterDecide_Revert_DeadlinePassed() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.arbiterDeadline + 1);
        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.arbiterDecide(id, 0);
    }

    function test_ArbiterDecide_Revert_ExceedsClaimAmount() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.ExceedsClaimAmount.selector);
        vault.arbiterDecide(id, a.claim.amount + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  11. resolveByDefault  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_ResolveByDefault_HappyPath() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.arbiterDeadline + 1); // past arbiter deadline

        vm.expectEmit(true, false, false, true, address(vault));
        emit ClaimResolved(id, 0, "default");

        vault.resolveByDefault(id);

        a = vault.agreement(id);
        assertEq(uint8(a.claim.status), uint8(RetentionVault.ClaimStatus.None));
        assertEq(a.awardedToPayer, 0);
    }

    function test_ResolveByDefault_Revert_NoOpenClaim() public {
        uint256 id = _reachDefectPeriod();
        vm.expectRevert(RetentionVault.NoOpenClaim.selector);
        vault.resolveByDefault(id);
    }

    function test_ResolveByDefault_Revert_DeadlineNotPassed() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        // arbiterDeadline not yet passed
        vm.warp(a.claim.arbiterDeadline);
        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.resolveByDefault(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  12. finalize  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Finalize_HappyPath() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        uint256 remaining = vault.pool(id);

        vm.warp(a.defectEnd); // exactly at defectEnd

        vm.expectEmit(true, false, false, true, address(vault));
        emit Finalized(id, remaining);

        vault.finalize(id);

        a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.Closed));
        assertEq(a.releasedToPayee, a.retained); // all released
    }

    function test_Finalize_UpdatesRecord() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd);
        vault.finalize(id);

        (uint256 n, uint256 k) = vault.record(payee);
        assertEq(n, 1);
        assertEq(k, 0); // no upheld claim
    }

    function test_Finalize_Revert_WrongState() public {
        uint256 id = _createAndAcceptAgreement();
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.finalize(id);
    }

    function test_Finalize_Revert_DeadlineNotPassed() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd - 1); // one second before
        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.finalize(id);
    }

    function test_Finalize_Revert_ClaimExists() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd);
        vm.expectRevert(RetentionVault.ClaimExists.selector);
        vault.finalize(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  13. withdraw  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Withdraw_HappyPath() public {
        uint256 id = _createAndAcceptAgreement();
        uint256 amount = 1_000_000;
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);
        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));

        uint256 payeeWithdrawable = vault.withdrawable(payee);
        assertGt(payeeWithdrawable, 0);

        uint256 balBefore = usdc.balanceOf(payee);

        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(payee, payeeWithdrawable);

        vm.prank(payee);
        vault.withdraw();

        assertEq(usdc.balanceOf(payee), balBefore + payeeWithdrawable);
        assertEq(vault.withdrawable(payee), 0);
    }

    function test_Withdraw_Revert_ZeroAmount() public {
        vm.prank(stranger);
        vm.expectRevert(RetentionVault.ZeroAmount.selector);
        vault.withdraw();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  14. Blocklist: blocked payee cannot block payer's withdrawal  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Blocklist_PayeeBlockedDoesNotPreventPayerWithdraw() public {
        // Get payer a claim award so they have withdrawable balance
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.responseDeadline + 1);
        vault.resolveUnanswered(id); // awards claim to payer

        uint256 payerWithdrawable = vault.withdrawable(payer);
        assertGt(payerWithdrawable, 0);

        // Block the payee (not the payer)
        usdc.setBlocked(payee, true);

        // Payer can still withdraw
        uint256 balBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        vault.withdraw();
        assertEq(usdc.balanceOf(payer), balBefore + payerWithdrawable);
    }

    function test_Blocklist_BlockedPayeeCannotWithdraw() public {
        uint256 id = _createAndAcceptAgreement();
        uint256 amount = 1_000_000;
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);
        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));

        // Block the payee
        usdc.setBlocked(payee, true);

        vm.prank(payee);
        vm.expectRevert(MockUSDC.Blocked.selector);
        vault.withdraw();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  15. credibilityWad view  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_CredibilityWad_ZeroNReturnsZero() public view {
        uint256 cred = vault.credibilityWad(payee);
        assertEq(cred, 0); // n=0 → 0 * WAD * WAD / (0 + priorA + priorB)
    }

    function test_CredibilityWad_IncreasesWith_N() public {
        // ReentrancyGuard is slot 0, so _recordN is at slot 5 (not 4).
        bytes32 slot = keccak256(abi.encode(payee, uint256(5)));
        vm.store(address(vault), slot, bytes32(uint256(1)));

        uint256 cred1 = vault.credibilityWad(payee);

        // set n=10
        vm.store(address(vault), slot, bytes32(uint256(10)));
        uint256 cred10 = vault.credibilityWad(payee);

        assertGt(cred10, cred1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  16. Boundary tests for deadline semantics  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Boundary_OpenClaim_BeforeDefectEnd() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd - 1); // one second before end → should succeed
        vm.prank(payer);
        vault.openClaim(id, 1, bytes32(0)); // no revert expected
    }

    function test_Boundary_OpenClaim_AtDefectEnd() public {
        uint256 id = _reachDefectPeriod();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.defectEnd); // exactly at end → DeadlinePassed (>=)
        vm.prank(payer);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.openClaim(id, 1, bytes32(0));
    }

    function test_Boundary_RespondClaim_AtResponseDeadline() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.responseDeadline); // exactly at deadline: contract uses > so this is still ok
        vm.prank(payee);
        vault.respondClaim(id, true); // no revert
    }

    function test_Boundary_RespondClaim_AfterResponseDeadline() public {
        uint256 id = _reachOpenClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.responseDeadline + 1);
        vm.prank(payee);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.respondClaim(id, true);
    }

    function test_Boundary_ArbiterDecide_AtArbiterDeadline() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.arbiterDeadline); // exactly at deadline: contract uses > so this is still ok
        vm.prank(arbiter);
        vault.arbiterDecide(id, 0); // no revert
    }

    function test_Boundary_ArbiterDecide_AfterArbiterDeadline() public {
        uint256 id = _reachDisputedClaim();
        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.claim.arbiterDeadline + 1);
        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.arbiterDecide(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  Fuzz: payProgress arithmetic  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function testFuzz_PayProgress_CutAndReleaseBalance(uint256 amount) public {
        uint256 id = _createAndAcceptAgreement();
        RetentionVault.Agreement memory a = vault.agreement(id);

        amount = bound(amount, 1, a.contractValue);
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);

        uint256 payeeWithdrawableBefore = vault.withdrawable(payee);

        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));

        a = vault.agreement(id);
        uint256 expectedCut     = amount * a.retentionBps / 10_000;
        uint256 expectedRelease = amount - expectedCut;

        assertEq(a.retained, expectedCut);
        assertEq(vault.withdrawable(payee), payeeWithdrawableBefore + expectedRelease);
        assertEq(a.paid, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  D10 — constructor priorA/priorB zero  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    function test_Constructor_Revert_PriorAZero() public {
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            address(usdc),
            0, PRIOR_B, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    function test_Constructor_Revert_PriorBZero() public {
        vm.expectRevert(RetentionVault.InvalidValue.selector);
        new RetentionVault(
            address(usdc),
            PRIOR_A, 0, Z_WAD,
            CAP_BPS, FLOOR_BPS,
            MAX_AGREEMENT_VAL, MAX_TOTAL_HELD, MIN_RECORD_VAL
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  D10 — signProvisional  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    /// Payee signs first → provisionalStatus=Requested, provisionalDeadline set, event emitted
    function test_SignProvisional_PayeeFirst_SetsRequested() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        // capture the deadline that should be set
        uint256 expectedDeadline = block.timestamp + RESPONSE_WINDOW;

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalSigned(id, payee);
        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalRequested(id, expectedDeadline);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.Requested));
        assertEq(a.provisionalDeadline, expectedDeadline);
        assertEq(uint8(a.state), uint8(RetentionVault.State.Active)); // still Active
    }

    /// Payer signs first, then payee → both signed → immediate DefectPeriod
    function test_SignProvisional_PayerThenPayee_DirectAccept() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payer);
        vault.signProvisional(id);

        // payee signing while payer already signed → both signed → _acceptProvisional
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0); // check only topic

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
        // provisionalStatus cleared on accept
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.None));
    }

    /// PayerCannotSignWhileDisputed: payee signs → payer objects → payer tries to sign again
    function test_SignProvisional_PayerCannotSignWhileDisputed() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        // payee signs → Requested
        vm.prank(payee);
        vault.signProvisional(id);

        // payer objects → Disputed
        vm.prank(payer);
        vault.objectProvisional(id, keccak256("objection"));

        // payer tries to sign → PayerCannotSignWhileDisputed
        vm.prank(payer);
        vm.expectRevert(RetentionVault.PayerCannotSignWhileDisputed.selector);
        vault.signProvisional(id);
    }

    /// Payee signs first (Requested), then payer signs → both signed → DefectPeriod
    function test_SignProvisional_PayerSignsWhileRequested() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        // payee signs first → Requested
        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.Requested));

        // payer signs → both signed → DefectPeriod immediately
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0); // check only topic

        vm.prank(payer);
        vault.signProvisional(id);

        a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  D10 — objectProvisional  ░══░
    // ═══════════════════════════════════════════════════════════════════════

    /// Happy path: payee signs → payer objects → Disputed state
    function test_ObjectProvisional_HappyPath() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        bytes32 reasonHash = keccak256("reason");

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalObjected(id, reasonHash);

        vm.prank(payer);
        vault.objectProvisional(id, reasonHash);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.Disputed));
        assertEq(a.provisionalObjectionHash, reasonHash);
        assertGt(a.provisionalArbiterDeadline, 0);
    }

    /// Stranger cannot call objectProvisional
    function test_ObjectProvisional_Revert_NotPayer() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotPayer.selector);
        vault.objectProvisional(id, bytes32(0));
    }

    /// objectProvisional on non-Active agreement reverts WrongState
    function test_ObjectProvisional_Revert_WrongState() public {
        uint256 id = _createAgreement(); // Proposed, not Active
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.objectProvisional(id, bytes32(0));
    }

    /// objectProvisional when provisionalStatus=None reverts WrongProvisionalStatus
    function test_ObjectProvisional_Revert_WrongProvisionalStatus() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);
        // provisionalStatus is still None (payee hasn't signed yet)
        vm.prank(payer);
        vm.expectRevert(RetentionVault.WrongProvisionalStatus.selector);
        vault.objectProvisional(id, bytes32(0));
    }

    /// objectProvisional after provisionalDeadline reverts DeadlinePassed
    function test_ObjectProvisional_Revert_DeadlinePassed() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline + 1); // past deadline

        vm.prank(payer);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.objectProvisional(id, bytes32(0));
    }

    /// objectProvisional at exactly provisionalDeadline succeeds (contract uses >)
    function test_ObjectProvisional_Boundary_AtDeadline() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline); // exactly at deadline → no revert (> not >=)

        vm.prank(payer);
        vault.objectProvisional(id, bytes32(0)); // should succeed
    }

    /// objectProvisional one second after provisionalDeadline reverts DeadlinePassed
    function test_ObjectProvisional_Boundary_JustAfterDeadline() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline + 1);

        vm.prank(payer);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.objectProvisional(id, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  D10 — arbiterDecideProvisional  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    /// arbiter decides accept=true → DefectPeriod, emits ProvisionalDecided + ProvisionalAccepted
    function test_ArbiterDecideProvisional_Accept() public {
        uint256 id = _reachProvisionalDisputed();

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalDecided(id, true);
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0); // check topic only

        vm.prank(arbiter);
        vault.arbiterDecideProvisional(id, true);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    /// arbiter decides accept=false → payeeSigned=false, provisionalStatus=None
    function test_ArbiterDecideProvisional_Reject() public {
        uint256 id = _reachProvisionalDisputed();

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalDecided(id, false);

        vm.prank(arbiter);
        vault.arbiterDecideProvisional(id, false);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.Active));
        assertFalse(a.payeeSigned);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.None));
    }

    /// Stranger cannot call arbiterDecideProvisional
    function test_ArbiterDecideProvisional_Revert_NotArbiter() public {
        uint256 id = _reachProvisionalDisputed();

        vm.prank(stranger);
        vm.expectRevert(RetentionVault.NotArbiter.selector);
        vault.arbiterDecideProvisional(id, true);
    }

    /// arbiterDecideProvisional on non-Active agreement reverts WrongState
    function test_ArbiterDecideProvisional_Revert_WrongState() public {
        uint256 id = _reachDefectPeriod();
        // Now in DefectPeriod
        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.arbiterDecideProvisional(id, true);
    }

    /// arbiterDecideProvisional when provisionalStatus=Requested (not Disputed) reverts WrongProvisionalStatus
    function test_ArbiterDecideProvisional_Revert_WrongProvisionalStatus() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        // payee signs → Requested (not Disputed)
        vm.prank(payee);
        vault.signProvisional(id);

        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.WrongProvisionalStatus.selector);
        vault.arbiterDecideProvisional(id, true);
    }

    /// arbiterDecideProvisional past provisionalArbiterDeadline reverts DeadlinePassed
    function test_ArbiterDecideProvisional_Revert_DeadlinePassed() public {
        uint256 id = _reachProvisionalDisputed();

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalArbiterDeadline + 1);

        vm.prank(arbiter);
        vm.expectRevert(RetentionVault.DeadlinePassed.selector);
        vault.arbiterDecideProvisional(id, true);
    }

    /// arbiterDecideProvisional at exactly provisionalArbiterDeadline succeeds (uses >)
    function test_ArbiterDecideProvisional_Boundary_AtDeadline() public {
        uint256 id = _reachProvisionalDisputed();

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalArbiterDeadline); // exactly at deadline → no revert

        vm.prank(arbiter);
        vault.arbiterDecideProvisional(id, true); // should succeed
    }

    /// After arbiter rejects, payeeSigned=false; payee can call signProvisional again
    function test_ArbiterDecideProvisional_AfterReject_PayeeCanReRequest() public {
        uint256 id = _reachProvisionalDisputed();

        // arbiter rejects
        vm.prank(arbiter);
        vault.arbiterDecideProvisional(id, false);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertFalse(a.payeeSigned);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.None));

        // payee can sign again → Requested
        uint256 expectedDeadline = block.timestamp + RESPONSE_WINDOW;

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalRequested(id, expectedDeadline);

        vm.prank(payee);
        vault.signProvisional(id);

        a = vault.agreement(id);
        assertEq(uint8(a.provisionalStatus), uint8(RetentionVault.ProvisionalStatus.Requested));
        assertEq(a.provisionalDeadline, expectedDeadline);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  D10 — resolveProvisional  ░══░
    // ═══════════════════════════════════════════════════════════════════════

    /// Silence path: payee signs → warp past provisionalDeadline → resolveProvisional → DefectPeriod
    function test_ResolveProvisional_Silence() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline + 1); // past deadline

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalResolved(id, "silence");
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0); // topic only

        vault.resolveProvisional(id);

        a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    /// No-arbiter default: payee signs, payer objects on agreement with arbiter=0,
    /// resolveProvisional accepts immediately (no arbiterDeadline needed to pass)
    function test_ResolveProvisional_Default_NoArbiter() public {
        uint256 id = _createAcceptAndPayNoArbiter(CONTRACT_VALUE);

        // payee signs → Requested
        vm.prank(payee);
        vault.signProvisional(id);

        // payer objects → Disputed
        vm.prank(payer);
        vault.objectProvisional(id, keccak256("reason"));

        // arbiter=0 → resolveProvisional accepts immediately (no deadline check for arbiter=0)
        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalResolved(id, "default");
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0);

        vault.resolveProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    /// Arbiter expired default: payee signs, payer objects, warp past provisionalArbiterDeadline → resolveProvisional
    function test_ResolveProvisional_Default_ArbiterExpired() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        vm.prank(payer);
        vault.objectProvisional(id, keccak256("reason"));

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalArbiterDeadline + 1);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ProvisionalResolved(id, "default");
        vm.expectEmit(true, false, false, false, address(vault));
        emit ProvisionalAccepted(id, 0, 0);

        vault.resolveProvisional(id);

        a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    /// resolveProvisional on non-Active agreement reverts WrongState
    function test_ResolveProvisional_Revert_WrongState() public {
        uint256 id = _reachDefectPeriod(); // DefectPeriod, not Active
        vm.expectRevert(RetentionVault.WrongState.selector);
        vault.resolveProvisional(id);
    }

    /// resolveProvisional when provisionalStatus=None reverts WrongProvisionalStatus
    function test_ResolveProvisional_Revert_WrongProvisionalStatus_None() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);
        // provisionalStatus=None
        vm.expectRevert(RetentionVault.WrongProvisionalStatus.selector);
        vault.resolveProvisional(id);
    }

    /// resolveProvisional when Requested but deadline not yet passed → DeadlineNotPassed
    function test_ResolveProvisional_Revert_RequestedDeadlineNotPassed() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);
        // deadline not passed yet

        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.resolveProvisional(id);
    }

    /// resolveProvisional when Disputed with arbiter and deadline not passed → DeadlineNotPassed
    function test_ResolveProvisional_Revert_DisputedDeadlineNotPassed() public {
        uint256 id = _reachProvisionalDisputed();
        // arbiterDeadline not yet passed

        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.resolveProvisional(id);
    }

    /// Boundary: vm.warp to exactly provisionalDeadline → DeadlineNotPassed (contract uses <=)
    function test_ResolveProvisional_Boundary_RequestedAtDeadline() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline); // exactly at deadline → still not passed

        vm.expectRevert(RetentionVault.DeadlineNotPassed.selector);
        vault.resolveProvisional(id);
    }

    /// Boundary: vm.warp to provisionalDeadline+1 → succeeds
    function test_ResolveProvisional_Boundary_RequestedJustAfterDeadline() public {
        uint256 id = _createAcceptAndPay(CONTRACT_VALUE);

        vm.prank(payee);
        vault.signProvisional(id);

        RetentionVault.Agreement memory a = vault.agreement(id);
        vm.warp(a.provisionalDeadline + 1); // just after → succeeds

        vault.resolveProvisional(id);

        a = vault.agreement(id);
        assertEq(uint8(a.state), uint8(RetentionVault.State.DefectPeriod));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ░░░  Internal helpers  ░░░
    // ═══════════════════════════════════════════════════════════════════════

    /// Create agreement (Proposed)
    function _createAgreement() internal returns (uint256 id) {
        vm.prank(payer);
        id = vault.createAgreement(
            payee, arbiter,
            CONTRACT_VALUE, MAX_BPS, MIN_BPS,
            DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW
        );
    }

    /// Create agreement with no arbiter (Proposed)
    function _createAgreementNoArbiter() internal returns (uint256 id) {
        vm.prank(payer);
        id = vault.createAgreement(
            payee, address(0),
            CONTRACT_VALUE, MAX_BPS, MIN_BPS,
            DEFECT_PERIOD, RESPONSE_WINDOW, ARBITER_WINDOW
        );
    }

    /// Create + accept agreement (Active)
    function _createAndAcceptAgreement() internal returns (uint256 id) {
        id = _createAgreement();
        vm.prank(payee);
        vault.acceptAgreement(id);
    }

    /// Create + accept agreement with no arbiter (Active)
    function _createAndAcceptAgreementNoArbiter() internal returns (uint256 id) {
        id = _createAgreementNoArbiter();
        vm.prank(payee);
        vault.acceptAgreement(id);
    }

    /// Create + accept + pay (Active, with funds in)
    function _createAcceptAndPay(uint256 amount) internal returns (uint256 id) {
        id = _createAndAcceptAgreement();
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);
        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));
    }

    /// Create + accept + pay with no arbiter (Active, with funds in)
    function _createAcceptAndPayNoArbiter(uint256 amount) internal returns (uint256 id) {
        id = _createAndAcceptAgreementNoArbiter();
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(vault), amount);
        vm.prank(payer);
        vault.payProgress(id, amount, bytes32(0));
    }

    /// Reach DefectPeriod (both signs)
    function _reachDefectPeriod() internal returns (uint256 id) {
        id = _createAcceptAndPay(CONTRACT_VALUE);
        vm.prank(payer);
        vault.signProvisional(id);
        vm.prank(payee);
        vault.signProvisional(id);
    }

    /// Reach provisional Disputed state (payee signs → payer objects)
    function _reachProvisionalDisputed() internal returns (uint256 id) {
        id = _createAcceptAndPay(CONTRACT_VALUE);
        vm.prank(payee);
        vault.signProvisional(id);
        vm.prank(payer);
        vault.objectProvisional(id, keccak256("objection"));
    }

    /// Reach DefectPeriod with an open claim
    function _reachOpenClaim() internal returns (uint256 id) {
        id = _reachDefectPeriod();
        uint256 claimAmt = vault.pool(id);
        vm.prank(payer);
        vault.openClaim(id, claimAmt, keccak256("evidence"));
    }

    /// Reach a Disputed claim (payee rejected)
    function _reachDisputedClaim() internal returns (uint256 id) {
        id = _reachOpenClaim();
        vm.prank(payee);
        vault.respondClaim(id, false);
    }
}
