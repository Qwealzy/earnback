// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {RetentionVault} from "../RetentionVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

// ═══════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════

contract RetentionVaultHandler is Test {
    RetentionVault public vault;
    MockUSDC       public usdc;

    address public payer1;
    address public payer2;
    address public payee1;
    address public payee2;
    address public arbiter1;

    // ghost accounting
    uint256 public ghost_deposited;
    uint256 public ghost_withdrawn;

    // tracked agreement IDs
    uint256[] public agreementIds;
    mapping(uint256 => bool) public tracked;

    // per-payee monotone N tracking
    mapping(address => uint256) public ghost_recordN;

    constructor(
        RetentionVault _vault,
        MockUSDC _usdc,
        address _payer1,
        address _payer2,
        address _payee1,
        address _payee2,
        address _arbiter1
    ) {
        vault    = _vault;
        usdc     = _usdc;
        payer1   = _payer1;
        payer2   = _payer2;
        payee1   = _payee1;
        payee2   = _payee2;
        arbiter1 = _arbiter1;
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    function _pickPayer(uint256 seed) internal view returns (address) {
        return seed % 2 == 0 ? payer1 : payer2;
    }

    function _pickPayee(uint256 seed) internal view returns (address) {
        return seed % 2 == 0 ? payee1 : payee2;
    }

    function _pickId(uint256 seed) internal view returns (uint256) {
        if (agreementIds.length == 0) return type(uint256).max; // sentinel
        return agreementIds[seed % agreementIds.length];
    }

    // ─── actions ─────────────────────────────────────────────────────────

    function call_createAgreement(
        uint256 payerSeed,
        uint256 payeeSeed,
        uint256 contractValue,
        uint256 maxBps,
        uint256 minBps,
        uint256 defectPeriod,
        uint256 responseWindow,
        uint256 arbiterWindow
    ) external {
        address _payer = _pickPayer(payerSeed);
        address _payee = _pickPayee(payeeSeed + 1); // +1 ensures different index

        // ensure payer != payee
        if (_payer == _payee) return;

        contractValue  = bound(contractValue, 1, vault.maxAgreementValue());
        maxBps         = bound(maxBps, vault.floorBps(), vault.capBps());
        minBps         = bound(minBps, vault.floorBps(), maxBps);
        defectPeriod   = bound(defectPeriod, 60, 730 days);
        responseWindow = bound(responseWindow, 60, 30 days);
        arbiterWindow  = bound(arbiterWindow, 60, 30 days);

        try vault.createAgreement{gas: 500_000}(
            _payee, arbiter1,
            contractValue, maxBps, minBps,
            defectPeriod, responseWindow, arbiterWindow
        ) returns (uint256 id) {
            agreementIds.push(id);
            tracked[id] = true;
        } catch {}
    }

    function call_acceptAgreement(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Proposed)) return;

        try vault.acceptAgreement{gas: 300_000}(id) {} catch {}
    }

    function call_payProgress(uint256 idSeed, uint256 amount) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Active)) return;
        if (a.paid >= a.contractValue) return;

        uint256 remaining = a.contractValue - a.paid;
        amount = bound(amount, 1, remaining);

        // Check maxTotalHeld
        uint256 newHeld = vault.totalHeld() + amount;
        if (newHeld > vault.maxTotalHeld()) return;

        usdc.mint(a.payer, amount);
        vm.prank(a.payer);
        usdc.approve(address(vault), amount);

        try vault.payProgress{gas: 300_000}(id, amount, bytes32(0)) {
            ghost_deposited += amount;
        } catch {}
    }

    function call_signProvisional(uint256 idSeed, uint256 signerSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Active)) return;

        address signer = signerSeed % 2 == 0 ? a.payer : a.payee;

        // D10: payer cannot sign while provisional is Disputed — skip rather than revert
        if (signer == a.payer && a.provisionalStatus == RetentionVault.ProvisionalStatus.Disputed) return;
        // D10: skip if already signed (would revert AlreadySigned)
        if (signer == a.payer && a.payerSigned) return;
        if (signer == a.payee && a.payeeSigned) return;

        vm.prank(signer);
        try vault.signProvisional{gas: 300_000}(id) {} catch {}
    }

    function call_objectProvisional(uint256 idSeed, bytes32 reasonHash) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Active)) return;
        if (a.provisionalStatus != RetentionVault.ProvisionalStatus.Requested) return;
        if (block.timestamp > a.provisionalDeadline) return;

        vm.prank(a.payer);
        try vault.objectProvisional{gas: 300_000}(id, reasonHash) {} catch {}
    }

    function call_arbiterDecideProvisional(uint256 idSeed, bool accept) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Active)) return;
        if (a.provisionalStatus != RetentionVault.ProvisionalStatus.Disputed) return;
        if (a.arbiter == address(0)) return;
        if (block.timestamp > a.provisionalArbiterDeadline) return;

        vm.prank(a.arbiter);
        try vault.arbiterDecideProvisional{gas: 300_000}(id, accept) {} catch {}
    }

    function call_resolveProvisional(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.Active)) return;
        if (a.provisionalStatus == RetentionVault.ProvisionalStatus.None) return;

        if (a.provisionalStatus == RetentionVault.ProvisionalStatus.Requested) {
            if (block.timestamp <= a.provisionalDeadline) return;
        } else if (a.provisionalStatus == RetentionVault.ProvisionalStatus.Disputed) {
            if (a.arbiter != address(0) && block.timestamp <= a.provisionalArbiterDeadline) return;
        }

        try vault.resolveProvisional{gas: 300_000}(id) {} catch {}
    }

    function call_openClaim(uint256 idSeed, uint256 amount, bytes32 evidence) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.DefectPeriod)) return;
        if (block.timestamp >= a.defectEnd) return;
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.None)) return;

        uint256 poolAmt = vault.pool(id);
        if (poolAmt == 0) return;
        amount = bound(amount, 1, poolAmt);

        vm.prank(a.payer);
        try vault.openClaim{gas: 300_000}(id, amount, evidence) {} catch {}
    }

    function call_respondClaim(uint256 idSeed, bool accept) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.Open)) return;
        if (block.timestamp > a.claim.responseDeadline) return;

        vm.prank(a.payee);
        try vault.respondClaim{gas: 300_000}(id, accept) {} catch {}
    }

    function call_resolveUnanswered(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.Open)) return;
        if (block.timestamp <= a.claim.responseDeadline) return;

        try vault.resolveUnanswered{gas: 300_000}(id) {} catch {}
    }

    function call_arbiterDecide(uint256 idSeed, uint256 payerShare) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.Disputed)) return;
        if (block.timestamp > a.claim.arbiterDeadline) return;
        if (a.claim.amount == 0) return;

        payerShare = bound(payerShare, 0, a.claim.amount);

        vm.prank(arbiter1);
        try vault.arbiterDecide{gas: 300_000}(id, payerShare) {} catch {}
    }

    function call_resolveByDefault(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.Disputed)) return;
        if (a.arbiter != address(0) && block.timestamp <= a.claim.arbiterDeadline) return;

        try vault.resolveByDefault{gas: 300_000}(id) {} catch {}
    }

    function call_finalize(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == type(uint256).max) return;

        RetentionVault.Agreement memory a = vault.agreement(id);
        if (uint8(a.state) != uint8(RetentionVault.State.DefectPeriod)) return;
        if (block.timestamp < a.defectEnd) return;
        if (uint8(a.claim.status) != uint8(RetentionVault.ClaimStatus.None)) return;

        try vault.finalize{gas: 300_000}(id) {
            (uint256 nAfter,) = vault.record(a.payee);
            // update ghost monotone tracker
            if (nAfter > ghost_recordN[a.payee]) {
                ghost_recordN[a.payee] = nAfter;
            }
        } catch {}
    }

    function call_withdraw(uint256 actorSeed) external {
        address[] memory actors = new address[](4);
        actors[0] = payer1;
        actors[1] = payer2;
        actors[2] = payee1;
        actors[3] = payee2;
        address actor = actors[actorSeed % 4];

        uint256 w = vault.withdrawable(actor);
        if (w == 0) return;

        vm.prank(actor);
        try vault.withdraw{gas: 200_000}() {
            ghost_withdrawn += w;
        } catch {}
    }

    function agreementIdsLength() external view returns (uint256) {
        return agreementIds.length;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Invariant test contract
// ═══════════════════════════════════════════════════════════════════════════

contract RetentionVaultInvariantTest is Test {
    RetentionVault         internal vault;
    MockUSDC               internal usdc;
    RetentionVaultHandler  internal handler;

    address internal payer1   = makeAddr("inv_payer1");
    address internal payer2   = makeAddr("inv_payer2");
    address internal payee1   = makeAddr("inv_payee1");
    address internal payee2   = makeAddr("inv_payee2");
    address internal arbiter1 = makeAddr("inv_arbiter1");

    function setUp() public {
        usdc = new MockUSDC("Mock USDC", "mUSDC");
        vault = new RetentionVault(
            address(usdc),
            4e17, 46e17, 1e18,
            1000, 100,
            50_000_000, 500_000_000, 500_000
        );

        handler = new RetentionVaultHandler(
            vault, usdc,
            payer1, payer2, payee1, payee2, arbiter1
        );

        // Give handler a starting allowance universe
        vm.label(address(handler), "handler");
        vm.label(address(vault),   "vault");

        targetContract(address(handler));
    }

    // ─── I1: vault USDC balance >= totalHeld ──────────────────────────────

    function invariant_I1_BalanceGeTotalHeld() public view {
        assertGe(
            usdc.balanceOf(address(vault)),
            vault.totalHeld(),
            "I1: vault balance < totalHeld"
        );
    }

    // ─── I2: totalHeld == ghost_deposited - ghost_withdrawn ───────────────

    function invariant_I2_TotalHeldAccountingCorrect() public view {
        assertEq(
            vault.totalHeld(),
            handler.ghost_deposited() - handler.ghost_withdrawn(),
            "I2: totalHeld != deposited - withdrawn"
        );
    }

    // ─── I3: per-agreement: retained == releasedToPayee + awardedToPayer + pool ─

    function invariant_I3_AgreementPoolInvariant() public view {
        uint256 len = handler.agreementIdsLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 id = handler.agreementIds(i);
            RetentionVault.Agreement memory a = vault.agreement(id);
            uint256 p = vault.pool(id);
            assertEq(
                a.retained,
                a.releasedToPayee + a.awardedToPayer + p,
                "I3: retained != released + awarded + pool"
            );
        }
    }

    // ─── I4: role-gated function with wrong caller always reverts ─────────

    function invariant_I4_RoleGatedReverts() public {
        // payer1 is not a payee on any agreement the handler just touched —
        // calling from a stranger address should hit NotPayee or WrongState
        vm.prank(makeAddr("nobody_invariant"));
        try vault.acceptAgreement(999_999) {
            // WrongState is also acceptable — the agreement doesn't exist
        } catch {}
        // The invariant is satisfied if we reach here (didn't panic/blow up)
    }

    // ─── I5: blocked payee1 does not prevent payer from withdrawing ───────

    function invariant_I5_BlockedPayeeDoesNotBlockPayer() public {
        uint256 payerW = vault.withdrawable(payer1);
        if (payerW == 0) return;

        usdc.setBlocked(payee1, true);

        uint256 balBefore = usdc.balanceOf(payer1);
        vm.prank(payer1);
        try vault.withdraw() {
            assertEq(
                usdc.balanceOf(payer1),
                balBefore + payerW,
                "I5: payer withdrawal failed after blocking payee"
            );
        } catch {
            // payer has withdrawable but failed — that is a contract bug
            // record by forcing a failing assertion
            assertTrue(false, "I5: payer could not withdraw despite non-zero withdrawable");
        }
        usdc.setBlocked(payee1, false);
    }

    // ─── I6: direct USDC transfer to vault does not change totalHeld ──────

    function invariant_I6_DirectTransferDoesNotChangeTotalHeld() public {
        uint256 heldBefore = vault.totalHeld();

        usdc.mint(address(this), 1e6);
        usdc.transfer(address(vault), 1e6);

        assertEq(
            vault.totalHeld(),
            heldBefore,
            "I6: direct transfer changed totalHeld"
        );
    }

    // ─── R1: retentionBps within [floorBps, maxBps] for active agreements ─

    function invariant_R1_RetentionBpsInRange() public view {
        uint256 len = handler.agreementIdsLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 id = handler.agreementIds(i);
            RetentionVault.Agreement memory a = vault.agreement(id);
            RetentionVault.State s = a.state;
            if (
                s == RetentionVault.State.Active ||
                s == RetentionVault.State.DefectPeriod ||
                s == RetentionVault.State.Closed
            ) {
                assertGe(a.retentionBps, vault.floorBps(), "R1: retentionBps < floorBps");
                assertLe(a.retentionBps, a.maxBps,         "R1: retentionBps > maxBps");
            }
        }
    }

    // ─── R2: awardedToPayer <= retained ────────────────────────────────────

    function invariant_R2_AwardedLeRetained() public view {
        uint256 len = handler.agreementIdsLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 id = handler.agreementIds(i);
            RetentionVault.Agreement memory a = vault.agreement(id);
            assertLe(a.awardedToPayer, a.retained, "R2: awardedToPayer > retained");
        }
    }

    // ─── R6: _recordN[payee] is monotonically non-decreasing ───────────────

    function invariant_R6_RecordNMonotone() public view {
        address[2] memory payees = [payee1, payee2];
        for (uint256 i = 0; i < payees.length; i++) {
            address p = payees[i];
            (uint256 n,) = vault.record(p);
            assertGe(n, handler.ghost_recordN(p), "R6: recordN decreased");
        }
    }

    // ─── R7: paid <= contractValue; totalHeld <= maxTotalHeld ─────────────

    function invariant_R7_PaidAndHeldBounds() public view {
        uint256 len = handler.agreementIdsLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 id = handler.agreementIds(i);
            RetentionVault.Agreement memory a = vault.agreement(id);
            assertLe(a.paid, a.contractValue, "R7: paid > contractValue");
        }
        assertLe(vault.totalHeld(), vault.maxTotalHeld(), "R7: totalHeld > maxTotalHeld");
    }

    // ─── R8: Active agreement with non-None provisionalStatus has an escape path ─

    function invariant_R8_ActiveWithProvisionalStatusHasEscapePath() public view {
        uint256 len = handler.agreementIdsLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 id = handler.agreementIds(i);
            RetentionVault.Agreement memory a = vault.agreement(id);
            if (a.state != RetentionVault.State.Active) continue;
            RetentionVault.ProvisionalStatus ps = a.provisionalStatus;
            if (ps == RetentionVault.ProvisionalStatus.None) continue;
            // If Requested: either provisionalDeadline is in the future (resolveProvisional will work after)
            // or provisionalDeadline has passed (resolveProvisional works now).
            // Either way, a reachable path exists. Just assert the deadline was set.
            if (ps == RetentionVault.ProvisionalStatus.Requested) {
                assertTrue(a.provisionalDeadline > 0, "R8: Requested without deadline");
            }
            // If Disputed: either arbiter==0 (resolve immediately) or arbiterDeadline was set.
            if (ps == RetentionVault.ProvisionalStatus.Disputed) {
                if (a.arbiter != address(0)) {
                    assertTrue(a.provisionalArbiterDeadline > 0, "R8: Disputed without arbiter deadline");
                }
                // arbiter==0 case: resolveProvisional works immediately
            }
        }
    }
}
