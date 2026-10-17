// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    error Blocked();

    mapping(address => bool) public blocked;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setBlocked(address account, bool status) external {
        blocked[account] = status;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (blocked[from] || blocked[to]) revert Blocked();
        super._update(from, to, amount);
    }
}
