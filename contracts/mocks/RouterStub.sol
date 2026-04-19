// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal stub for unit tests. Deploy script should use a real Uniswap V2 Router02 address.
contract RouterStub {
    function factory() external pure returns (address) {
        return address(1);
    }

    function WETH() external pure returns (address) {
        return address(2);
    }
}
