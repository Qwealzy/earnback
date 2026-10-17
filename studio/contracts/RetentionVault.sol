// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract RetentionVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 constant WAD = 1e18;

    enum State {
        Proposed,
        Active,
        DefectPeriod,
        Closed,
        Cancelled
    }

    enum ClaimStatus {
        None,
        Open,
        Disputed
    }

    enum ProvisionalStatus {
        None,
        Requested,
        Disputed
    }

    struct Claim {
        uint256 amount;
        bytes32 evidenceHash;
        uint256 openedAt;
        uint256 responseDeadline;
        uint256 arbiterDeadline;
        ClaimStatus status;
    }

    struct Agreement {
        address payer;
        address payee;
        address arbiter;
        uint256 contractValue;
        uint256 maxBps;
        uint256 minBps;
        uint256 defectPeriod;
        uint256 responseWindow;
        uint256 arbiterWindow;
        uint256 retentionBps;
        uint256 paid;
        uint256 retained;
        uint256 releasedToPayee;
        uint256 awardedToPayer;
        bool payerSigned;
        bool payeeSigned;
        uint256 defectEnd;
        State state;
        Claim claim;
        bool upheld;
        ProvisionalStatus provisionalStatus;
        uint256 provisionalDeadline;
        uint256 provisionalArbiterDeadline;
        bytes32 provisionalObjectionHash;
    }

    error ZeroAddress();
    error SameAddress();
    error InvalidBps();
    error InvalidValue();
    error InvalidPeriod();
    error NotPayer();
    error NotPayee();
    error NotArbiter();
    error NotParty();
    error WrongState();
    error AlreadySigned();
    error ClaimExists();
    error NoOpenClaim();
    error DeadlineNotPassed();
    error DeadlinePassed();
    error ZeroAmount();
    error ExceedsContractValue();
    error ExceedsMaxHeld();
    error ExceedsPool();
    error ExceedsClaimAmount();
    error InvalidPayerShare();
    error ArbiterNotSet();
    error CannotUpdateRecord();
    error WrongProvisionalStatus();
    error PayerCannotSignWhileDisputed();

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

    mapping(uint256 => Agreement) private _agreements;
    uint256 private _nextId;
    mapping(address => uint256) public withdrawable;
    uint256 private _totalHeld;
    mapping(address => uint256) private _recordN;
    mapping(address => uint256) private _recordK;

    IERC20 public immutable usdc;
    uint256 public immutable priorA;
    uint256 public immutable priorB;
    uint256 public immutable zWad;
    uint256 public immutable capBps;
    uint256 public immutable floorBps;
    uint256 public immutable maxAgreementValue;
    uint256 public immutable maxTotalHeld;
    uint256 public immutable minRecordValue;

    constructor(
        address usdc_,
        uint256 priorA_,
        uint256 priorB_,
        uint256 zWad_,
        uint256 capBps_,
        uint256 floorBps_,
        uint256 maxAgreementValue_,
        uint256 maxTotalHeld_,
        uint256 minRecordValue_
    ) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert InvalidValue();
        if (capBps_ > 10_000) revert InvalidBps();
        if (floorBps_ == 0 || floorBps_ > capBps_) revert InvalidBps();
        if (maxAgreementValue_ == 0 || maxTotalHeld_ == 0) revert InvalidValue();
        if (priorA_ == 0 || priorB_ == 0) revert InvalidValue();
        // Validate that p0 = pUpper(priorA_, priorB_) > 0 at deployment time,
        // so rateFor can never divide-by-zero after deployment.
        {
            uint256 s = priorA_ + priorB_;
            uint256 variance = (priorA_ * WAD / s) * (priorB_ * WAD / s) / WAD * WAD / (s + WAD);
            uint256 sd = Math.sqrt(variance * WAD);
            uint256 p0 = priorA_ * WAD / s + zWad_ * sd / WAD;
            if (p0 == 0) revert InvalidValue();
        }

        usdc = IERC20(usdc_);
        priorA = priorA_;
        priorB = priorB_;
        zWad = zWad_;
        capBps = capBps_;
        floorBps = floorBps_;
        maxAgreementValue = maxAgreementValue_;
        maxTotalHeld = maxTotalHeld_;
        minRecordValue = minRecordValue_;
    }

    function createAgreement(
        address payee,
        address arbiter,
        uint256 contractValue,
        uint256 maxBps,
        uint256 minBps,
        uint256 defectPeriod,
        uint256 responseWindow,
        uint256 arbiterWindow
    ) external nonReentrant returns (uint256 id) {
        if (payee == address(0)) revert ZeroAddress();
        if (msg.sender == payee) revert SameAddress();
        if (arbiter != address(0) && (arbiter == msg.sender || arbiter == payee)) revert SameAddress();
        if (contractValue == 0 || contractValue > maxAgreementValue) revert InvalidValue();
        if (maxBps > capBps) revert InvalidBps();
        if (minBps < floorBps || minBps > maxBps) revert InvalidBps();
        if (defectPeriod < 60 || defectPeriod > 730 days) revert InvalidPeriod();
        if (responseWindow < 60 || responseWindow > 30 days) revert InvalidPeriod();
        if (arbiterWindow < 60 || arbiterWindow > 30 days) revert InvalidPeriod();

        id = _nextId;
        _nextId = id + 1;

        Agreement storage a = _agreements[id];
        a.payer = msg.sender;
        a.payee = payee;
        a.arbiter = arbiter;
        a.contractValue = contractValue;
        a.maxBps = maxBps;
        a.minBps = minBps;
        a.defectPeriod = defectPeriod;
        a.responseWindow = responseWindow;
        a.arbiterWindow = arbiterWindow;
        a.state = State.Proposed;

        emit AgreementCreated(id, msg.sender, payee, arbiter, contractValue);
    }

    function cancelProposal(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payer) revert NotPayer();
        if (a.state != State.Proposed) revert WrongState();

        a.state = State.Cancelled;

        emit AgreementCancelled(id);
    }

    function acceptAgreement(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payee) revert NotPayee();
        if (a.state != State.Proposed) revert WrongState();

        uint256 computed = rateFor(a.payee, a.maxBps);
        if (computed < a.minBps) {
            computed = a.minBps;
        } else if (computed > a.maxBps) {
            computed = a.maxBps;
        }

        a.retentionBps = computed;
        a.state = State.Active;

        (uint256 n, uint256 k) = record(a.payee);
        emit AgreementAccepted(id, computed, n, k);
    }

    function payProgress(uint256 id, uint256 amount, bytes32 ref) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payer) revert NotPayer();
        if (a.state != State.Active) revert WrongState();
        if (amount == 0) revert ZeroAmount();
        if (a.paid + amount > a.contractValue) revert ExceedsContractValue();

        uint256 newTotalHeld = _totalHeld + amount;
        if (newTotalHeld > maxTotalHeld) revert ExceedsMaxHeld();

        uint256 cut = amount * a.retentionBps / 10_000;

        a.retained += cut;
        a.paid += amount;
        withdrawable[a.payee] += amount - cut;
        _totalHeld = newTotalHeld;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit ProgressPaid(id, amount, cut, ref);
    }

    function signProvisional(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payer && msg.sender != a.payee) revert NotParty();
        if (a.state != State.Active) revert WrongState();

        if (msg.sender == a.payer) {
            if (a.payerSigned) revert AlreadySigned();
            // payer cannot sign while provisional is Disputed
            if (a.provisionalStatus == ProvisionalStatus.Disputed) revert PayerCannotSignWhileDisputed();
            a.payerSigned = true;
        } else {
            // payee
            if (a.payeeSigned) revert AlreadySigned();
            a.payeeSigned = true;
        }

        emit ProvisionalSigned(id, msg.sender);

        if (a.payerSigned && a.payeeSigned) {
            // Both signed: accept immediately
            _acceptProvisional(id);
        } else if (msg.sender == a.payee && !a.payerSigned) {
            // Payee signed first: set Requested so payer has a deadline
            a.provisionalStatus = ProvisionalStatus.Requested;
            a.provisionalDeadline = block.timestamp + a.responseWindow;
            emit ProvisionalRequested(id, a.provisionalDeadline);
        }
        // If payer signed first and payee hasn't, nothing extra to do —
        // payee's subsequent signProvisional will trigger the both-signed branch.
    }

    function objectProvisional(uint256 id, bytes32 reasonHash) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payer) revert NotPayer();
        if (a.state != State.Active) revert WrongState();
        if (a.provisionalStatus != ProvisionalStatus.Requested) revert WrongProvisionalStatus();
        if (block.timestamp > a.provisionalDeadline) revert DeadlinePassed();

        a.provisionalStatus = ProvisionalStatus.Disputed;
        a.provisionalArbiterDeadline = block.timestamp + a.arbiterWindow;
        a.provisionalObjectionHash = reasonHash;

        emit ProvisionalObjected(id, reasonHash);
    }

    function arbiterDecideProvisional(uint256 id, bool accept) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.arbiter) revert NotArbiter();
        if (a.state != State.Active) revert WrongState();
        if (a.provisionalStatus != ProvisionalStatus.Disputed) revert WrongProvisionalStatus();
        if (block.timestamp > a.provisionalArbiterDeadline) revert DeadlinePassed();

        emit ProvisionalDecided(id, accept);

        if (accept) {
            _acceptProvisional(id);
        } else {
            // Reject: reset so payee can request again later
            a.payeeSigned = false;
            a.provisionalStatus = ProvisionalStatus.None;
            a.provisionalDeadline = 0;
            a.provisionalArbiterDeadline = 0;
        }
    }

    function resolveProvisional(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (a.state != State.Active) revert WrongState();

        if (a.provisionalStatus == ProvisionalStatus.Requested) {
            if (block.timestamp <= a.provisionalDeadline) revert DeadlineNotPassed();
            emit ProvisionalResolved(id, "silence");
            _acceptProvisional(id);
        } else if (a.provisionalStatus == ProvisionalStatus.Disputed) {
            if (a.arbiter != address(0) && block.timestamp <= a.provisionalArbiterDeadline) revert DeadlineNotPassed();
            emit ProvisionalResolved(id, "default");
            _acceptProvisional(id);
        } else {
            revert WrongProvisionalStatus();
        }
    }

    function openClaim(uint256 id, uint256 amount, bytes32 evidenceHash) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payer) revert NotPayer();
        if (a.state != State.DefectPeriod) revert WrongState();
        if (block.timestamp >= a.defectEnd) revert DeadlinePassed();
        if (a.claim.status != ClaimStatus.None) revert ClaimExists();
        if (amount == 0) revert ZeroAmount();
        if (amount > available(id)) revert ExceedsPool();

        a.claim.amount = amount;
        a.claim.evidenceHash = evidenceHash;
        a.claim.openedAt = block.timestamp;
        a.claim.responseDeadline = block.timestamp + a.responseWindow;
        a.claim.arbiterDeadline = 0;
        a.claim.status = ClaimStatus.Open;

        emit ClaimOpened(id, amount, evidenceHash);
    }

    function respondClaim(uint256 id, bool accept) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.payee) revert NotPayee();
        if (a.claim.status != ClaimStatus.Open) revert NoOpenClaim();
        if (block.timestamp > a.claim.responseDeadline) revert DeadlinePassed();

        uint256 amount = a.claim.amount;

        if (accept) {
            a.awardedToPayer += amount;
            withdrawable[a.payer] += amount;
            a.upheld = true;
            _clearClaim(a);
        } else {
            a.claim.status = ClaimStatus.Disputed;
            a.claim.arbiterDeadline = block.timestamp + a.arbiterWindow;
        }

        emit ClaimAnswered(id, accept);
    }

    function resolveUnanswered(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (a.claim.status != ClaimStatus.Open) revert NoOpenClaim();
        if (block.timestamp <= a.claim.responseDeadline) revert DeadlineNotPassed();

        uint256 amount = a.claim.amount;
        a.awardedToPayer += amount;
        withdrawable[a.payer] += amount;
        a.upheld = true;
        _clearClaim(a);

        emit ClaimResolved(id, amount, "silence");
    }

    function arbiterDecide(uint256 id, uint256 payerShare) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.arbiter) revert NotArbiter();
        if (a.claim.status != ClaimStatus.Disputed) revert NoOpenClaim();
        if (block.timestamp > a.claim.arbiterDeadline) revert DeadlinePassed();
        if (payerShare > a.claim.amount) revert ExceedsClaimAmount();

        if (payerShare > 0) {
            a.awardedToPayer += payerShare;
            withdrawable[a.payer] += payerShare;
            a.upheld = true;
        }

        _clearClaim(a);

        emit ClaimDecided(id, payerShare);
    }

    function resolveByDefault(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (a.claim.status != ClaimStatus.Disputed) revert NoOpenClaim();
        if (a.arbiter != address(0) && block.timestamp <= a.claim.arbiterDeadline) revert DeadlineNotPassed();

        _clearClaim(a);

        emit ClaimResolved(id, 0, "default");
    }

    function finalize(uint256 id) external nonReentrant {
        Agreement storage a = _agreements[id];
        if (a.state != State.DefectPeriod) revert WrongState();
        if (block.timestamp < a.defectEnd) revert DeadlineNotPassed();
        if (a.claim.status != ClaimStatus.None) revert ClaimExists();

        uint256 remaining = pool(id);
        withdrawable[a.payee] += remaining;
        a.releasedToPayee += remaining;
        a.state = State.Closed;

        if (a.payer != a.payee && a.contractValue >= minRecordValue) {
            _recordN[a.payee] += 1;
            if (a.upheld) {
                _recordK[a.payee] += 1;
            }
        }

        emit Finalized(id, remaining);
    }

    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert ZeroAmount();

        withdrawable[msg.sender] = 0;
        _totalHeld -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function agreement(uint256 id) external view returns (Agreement memory) {
        return _agreements[id];
    }

    function pool(uint256 id) public view returns (uint256) {
        Agreement storage a = _agreements[id];
        return a.retained - a.releasedToPayee - a.awardedToPayer;
    }

    function available(uint256 id) public view returns (uint256) {
        Agreement storage a = _agreements[id];
        return pool(id) - (a.claim.status == ClaimStatus.Open ? a.claim.amount : 0);
    }

    function totalHeld() external view returns (uint256) {
        return _totalHeld;
    }

    function record(address payee) public view returns (uint256 n, uint256 k) {
        return (_recordN[payee], _recordK[payee]);
    }

    function credibilityWad(address payee) external view returns (uint256) {
        uint256 n = _recordN[payee];
        return n * WAD * WAD / (n * WAD + priorA + priorB);
    }

    function pUpper(uint256 a1, uint256 b1) internal view returns (uint256) {
        uint256 s = a1 + b1;
        uint256 pHat = a1 * WAD / s;
        uint256 variance = (a1 * WAD / s) * (b1 * WAD / s) / WAD * WAD / (s + WAD);
        uint256 sd = Math.sqrt(variance * WAD);
        return pHat + zWad * sd / WAD;
    }

    function rateFor(address payee, uint256 maxBps) public view returns (uint256 bps) {
        (uint256 n, uint256 k) = record(payee);
        uint256 pu  = pUpper(priorA + k * WAD, priorB + (n - k) * WAD);
        uint256 p0  = pUpper(priorA, priorB);
        bps = maxBps * pu / p0;
        if (bps > maxBps) bps = maxBps;
        if (bps < floorBps) bps = floorBps;
    }

    function _acceptProvisional(uint256 id) internal {
        Agreement storage a = _agreements[id];
        uint256 half = pool(id) / 2;
        withdrawable[a.payee] += half;
        a.releasedToPayee += half;
        a.defectEnd = block.timestamp + a.defectPeriod;
        a.state = State.DefectPeriod;
        // clear provisional tracking
        a.provisionalStatus = ProvisionalStatus.None;
        a.provisionalDeadline = 0;
        a.provisionalArbiterDeadline = 0;
        emit ProvisionalAccepted(id, half, a.defectEnd);
    }

    function _clearClaim(Agreement storage a) internal {
        delete a.claim;
    }
}
