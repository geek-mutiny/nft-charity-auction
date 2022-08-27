// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../../NftAuction.sol";

contract NftAuctionFuzzTest is NftAuction {
    constructor() NftAuction(10) {}

    // function echidna_test_maxFee() public view returns (bool) {
    //     return !hasRole(ARTIST_ROLE, msg.sender);
    // }

    function echidna_test_offerCreation() public view returns (bool) {
        return offers.length == 1 && offers[0].exists;
    }
}
