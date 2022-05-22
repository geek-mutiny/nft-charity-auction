// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./NFT.sol";

contract NftAuction is Ownable, Pausable, ReentrancyGuard {
    using Address for address;
    using SafeMath for uint256;

    NFT nft;

    mapping(uint256 => Offer) private offers;

    uint256 public maxFee;

    address public authorAddress;

    address public marketingAddress;

    address public charityAddress;

    struct Offer {
        uint256 maxBid;
        uint256 currentBid;
        uint256 startTimestamp;
        uint256 endTimestamp;
        address bidder;
        uint256 authorFee;
        uint256 marketingFee;
        mapping(address => uint256) refunds;
        bool exists;
        bool closed;
    }

    event CreateOffer(
        uint256 tokenId,
        uint256 initialBid,
        uint256 maxBid,
        uint256 endTimestamp,
        uint256 authorFee,
        uint256 marketingFee
    );

    event MakeBid(uint256 tokenId, uint256 amount);

    event WithdrawRefund(uint256 tokenId, uint256 amount);

    event CloseOffer(uint256 tokenId, address recipient, uint256 amount);

    event PurchaseItem(address recipient, uint256 tokenId);

    constructor(
        NFT _nft,
        uint256 _maxFee,
        address _authorAddress,
        address _marketingAddress,
        address _charityAddress
    ) {
        require(_authorAddress != address(0), "Wrong author address");
        require(_marketingAddress != address(0), "Wrong marketing address");
        require(_charityAddress != address(0), "Wrong charity address");

        nft = _nft;
        maxFee = _maxFee;
        authorAddress = _authorAddress;
        marketingAddress = _marketingAddress;
        charityAddress = _charityAddress;
    }

    function createOffer(
        uint256 tokenId,
        uint256 initialBid,
        uint256 maxBid,
        uint256 endTimestamp,
        uint256 authorFee,
        uint256 marketingFee
    ) external onlyOwner whenNotPaused {
        require(!offers[tokenId].exists, "Offer already exists");
        require(authorFee.add(marketingFee) <= maxFee, "Fees are too high");

        Offer storage newOffer = offers[tokenId];

        newOffer.maxBid = maxBid;
        newOffer.currentBid = initialBid;
        newOffer.startTimestamp = block.timestamp;
        newOffer.endTimestamp = endTimestamp;
        newOffer.bidder = owner();
        newOffer.authorFee = authorFee;
        newOffer.marketingFee = marketingFee;
        newOffer.exists = true;
        newOffer.closed = false;

        emit CreateOffer(
            tokenId,
            initialBid,
            maxBid,
            endTimestamp,
            authorFee,
            marketingFee
        );
    }

    function offerIsActive(uint256 tokenId) public view returns (bool) {
        return
            offers[tokenId].exists &&
            block.timestamp >= offers[tokenId].startTimestamp &&
            block.timestamp < offers[tokenId].endTimestamp &&
            !offers[tokenId].closed;
    }

    function closeOffer(uint256 tokenId) external whenNotPaused {
        require(offers[tokenId].exists, "Offer does not exist");
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

    function makeBid(uint256 tokenId) external payable whenNotPaused {
        require(offerIsActive(tokenId), "Offer is not active");
        require(
            msg.value > offers[tokenId].currentBid,
            "Amount must be bigger than current bid"
        );

        addRefund(tokenId);

        offers[tokenId].currentBid = msg.value;
        offers[tokenId].bidder = msg.sender;

        emit MakeBid(tokenId, msg.value);

        if (offers[tokenId].maxBid > 0 && msg.value >= offers[tokenId].maxBid) {
            offers[tokenId].closed = true;
            purchaseItem(msg.sender, tokenId);
        }
    }

    function withdrawRefund(uint256 tokenId)
        external
        whenNotPaused
        nonReentrant
    {
        require(
            msg.sender != offers[tokenId].bidder,
            "Withdraw is not available for the highest bid"
        );
        require(
            offers[tokenId].refunds[msg.sender] > 0,
            "No funds found for refund"
        );

        uint256 refund = offers[tokenId].refunds[msg.sender];

        offers[tokenId].refunds[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: refund}("");

        require(success);

        emit WithdrawRefund(tokenId, refund);
    }

    function addRefund(uint256 tokenId) internal {
        uint256 refund = offers[tokenId].refunds[offers[tokenId].bidder];

        offers[tokenId].refunds[offers[tokenId].bidder] = refund.add(
            offers[tokenId].currentBid
        );
    }

    // @todo rework to pull
    function purchaseItem(address recipient, uint256 tokenId)
        internal
        nonReentrant
    {
        nft.safeTransferFrom(owner(), recipient, tokenId);

        uint256 authorAmount = offers[tokenId]
            .currentBid
            .mul(offers[tokenId].authorFee)
            .div(100);
        uint256 marketingAmount = offers[tokenId]
            .currentBid
            .mul(offers[tokenId].marketingFee)
            .div(100);
        uint256 charityAmount = offers[tokenId]
            .currentBid
            .sub(authorAmount)
            .sub(marketingAmount);

        (bool authorSuccess, ) = authorAddress.call{value: authorAmount}("");
        require(authorSuccess);

        (bool marketingSuccess, ) = marketingAddress.call{
            value: marketingAmount
        }("");
        require(marketingSuccess);

        (bool charitySuccess, ) = charityAddress.call{value: charityAmount}("");
        require(charitySuccess);

        emit PurchaseItem(recipient, tokenId);
    }

    function pause() external onlyOwner {
        super._pause();
    }

    function unpause() external onlyOwner {
        super._unpause();
    }
}
