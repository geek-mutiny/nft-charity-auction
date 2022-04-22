// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./NFT.sol";

contract NftAuction is Ownable {
    using Address for address;
    using SafeMath for uint256;

    NFT nft;

    mapping(uint256 => Offer) private offers;

    struct Offer {
        uint256 maxBid;
        uint256 currentBid;
        uint256 startTimestamp;
        uint256 endTimestamp;
        address bidder;
        bool closed;
    }

    event CreateOffer(
        uint256 tokenId,
        uint256 initialBid,
        uint256 maxBid,
        uint256 endTimestamp
    );

    event MakeBid(uint256 tokenId, uint256 amount);

    event CloseOffer(uint256 tokenId, address recipient, uint256 amount);

    event PurchaseItem(address recipient, uint256 tokenId);

    constructor(NFT _nft) {
        nft = _nft;
    }

    function createOffer(
        uint256 tokenId,
        uint256 initialBid,
        uint256 maxBid,
        uint256 endTimestamp
    ) external onlyOwner {
        //require(auctions[tokenId], "Auction already exists");
        offers[tokenId] = Offer({
            maxBid: maxBid,
            currentBid: initialBid,
            startTimestamp: block.timestamp,
            endTimestamp: endTimestamp,
            bidder: owner(),
            closed: false
        });

        emit CreateOffer(tokenId, initialBid, maxBid, endTimestamp);
    }

    function offerIsActive(uint256 tokenId) external view returns (bool) {
        return
            block.timestamp >= offers[tokenId].startTimestamp &&
            block.timestamp < offers[tokenId].endTimestamp;
    }

    function closeOffer(uint256 tokenId) public {
        require(!offers[tokenId].closed, "Offer already closed");
        require(
            block.timestamp >= offers[tokenId].endTimestamp,
            "Offer is active"
        );
        require(
            msg.sender == offers[tokenId].bidder || msg.sender == owner(),
            "You can not close offer"
        );

        offers[tokenId].closed = true;
        purchaseItem(offers[tokenId].bidder, tokenId);

        emit CloseOffer(
            tokenId,
            offers[tokenId].bidder,
            offers[tokenId].currentBid
        );
    }

    function makeBid(uint256 tokenId) external payable {
        require(
            block.timestamp >= offers[tokenId].startTimestamp,
            "Offer has not started yet"
        );
        require(
            block.timestamp < offers[tokenId].endTimestamp,
            "Offer ended"
        );
        require(
            msg.value > offers[tokenId].currentBid,
            "Amount must be bigger than current bid"
        );

        revertPreviousBid(tokenId);

        offers[tokenId].currentBid = msg.value;
        offers[tokenId].bidder = msg.sender;

        emit MakeBid(tokenId, msg.value);

        if (offers[tokenId].maxBid > 0 && msg.value >= offers[tokenId].maxBid) {
            offers[tokenId].closed = true;
            purchaseItem(msg.sender, tokenId);
        }
    }

    function revertPreviousBid(uint256 tokenId) internal {
        payable(offers[tokenId].bidder).transfer(offers[tokenId].currentBid);
    }

    function purchaseItem(address recipient, uint256 tokenId) internal {
        nft.safeTransferFrom(owner(), recipient, tokenId);

        emit PurchaseItem(recipient, tokenId);
    }
}
