// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract NftAuction is
    AccessControlEnumerable,
    Pausable,
    ReentrancyGuard,
    ERC721Holder
{
    bytes32 public constant ARTIST_ROLE = keccak256("ARTIST_ROLE");

    Offer[] public offers;

    mapping(address => mapping(uint256 => bool)) public offerExistence; // offerExistence[nftAddress][tokenId]

    mapping(address => mapping(uint256 => uint256)) public refunds; // refunds[address][tokenId] = amount

    uint256 public maxFee; // basis points: a * 1500 / 10000 = 15%

    struct Offer {
        uint256 tokenId;
        IERC721 nft;
        uint256 maxBid;
        uint256 currentBid;
        uint256 startTimestamp;
        uint256 endTimestamp;
        address bidder;
        uint256 artistFee; // basis points
        bool exists;
        bool closed;
        address payable artistAddress;
        address payable charityAddress;
    }

    event CreateOffer(
        uint256 offerId,
        uint256 tokenId,
        address nft,
        uint256 initialBid,
        uint256 maxBid,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 artistFee,
        address artistAddress,
        address charityAddress
    );

    event MakeBid(uint256 offerId, uint256 amount);

    event WithdrawRefund(uint256 offerId, uint256 amount);

    event CloseOffer(uint256 offerId, address recipient, uint256 amount);

    event PurchaseItem(address recipient, uint256 offerId);

    event ChangeMaxFee(uint256 maxFee);

    modifier onlyArtistOrAdmin() {
        require(
            hasRole(ARTIST_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Artist or admin only"
        );
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Admin only");
        _;
    }

    constructor(uint256 _maxFee) {
        maxFee = _maxFee;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createOffer(
        uint256 tokenId,
        IERC721 nft,
        uint256 initialBid,
        uint256 maxBid,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 artistFee,
        address payable artistAddress,
        address payable charityAddress
    ) external onlyArtistOrAdmin whenNotPaused {
        address nftAddress = address(nft);

        require(
            !offerExistence[nftAddress][tokenId],
            "Offer for this token already exists"
        );
        require(artistFee <= maxFee, "Fee is too high");
        require(artistAddress != address(0), "Wrong artist address");
        require(charityAddress != address(0), "Wrong charity address");
        require(
            endTimestamp >= block.timestamp,
            "End timestamp can not be in past"
        );
        require(
            endTimestamp > startTimestamp,
            "End timestamp must be bigger than start timestamp"
        );

        offers.push(
            Offer({
                tokenId: tokenId,
                nft: nft,
                maxBid: maxBid,
                currentBid: initialBid,
                startTimestamp: startTimestamp,
                endTimestamp: endTimestamp,
                bidder: msg.sender,
                artistFee: artistFee,
                exists: true,
                closed: false,
                artistAddress: artistAddress,
                charityAddress: charityAddress
            })
        );

        offerExistence[nftAddress][tokenId] = true;

        emit CreateOffer(
            offers.length - 1,
            tokenId,
            nftAddress,
            initialBid,
            maxBid,
            startTimestamp,
            endTimestamp,
            artistFee,
            artistAddress,
            charityAddress
        );
    }

    function offerIsActive(uint256 offerId) public view returns (bool) {
        return
            offers[offerId].exists &&
            block.timestamp >= offers[offerId].startTimestamp &&
            block.timestamp < offers[offerId].endTimestamp &&
            !offers[offerId].closed;
    }

    function closeOffer(uint256 offerId) external whenNotPaused {
        require(offers[offerId].exists, "Offer does not exist");
        require(!offers[offerId].closed, "Offer already closed");
        require(
            block.timestamp >= offers[offerId].endTimestamp,
            "Offer is active"
        );
        require(
            msg.sender == offers[offerId].bidder ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "You can not close offer"
        );

        offers[offerId].closed = true;
        purchaseItem(offers[offerId].bidder, offerId);

        emit CloseOffer(
            offerId,
            offers[offerId].bidder,
            offers[offerId].currentBid
        );
    }

    function getOffersCount() external view returns (uint256) {
        return offers.length;
    }

    function getOffers() external view returns (Offer[] memory) {
        return offers;
    }

    function makeBid(uint256 offerId) external payable whenNotPaused {
        require(offerIsActive(offerId), "Offer is not active");
        require(
            msg.value > offers[offerId].currentBid,
            "Amount must be bigger than current bid"
        );

        addRefund(offerId, offers[offerId].bidder, offers[offerId].currentBid);

        offers[offerId].currentBid = msg.value;
        offers[offerId].bidder = msg.sender;

        emit MakeBid(offerId, msg.value);

        if (offers[offerId].maxBid > 0 && msg.value >= offers[offerId].maxBid) {
            // @todo
            offers[offerId].closed = true;
            purchaseItem(msg.sender, offerId);
        }
    }

    function withdrawRefund(uint256 offerId)
        external
        whenNotPaused
        nonReentrant
    {
        require(
            msg.sender != offers[offerId].bidder,
            "Withdraw is not available for the highest bid"
        );
        require(refunds[msg.sender][offerId] > 0, "No funds found for refund");

        uint256 refundAmount = refunds[msg.sender][offerId];

        refunds[msg.sender][offerId] = 0;

        Address.sendValue(payable(msg.sender), refundAmount);

        emit WithdrawRefund(offerId, refundAmount);
    }

    function addRefund(
        uint256 offerId,
        address bidder,
        uint256 value
    ) internal {
        refunds[bidder][offerId] += value;
    }

    function getRefunds(address bidder)
        external
        view
        returns (uint256[] memory)
    {
        uint256 offersLength = offers.length;
        uint256[] memory bidderRefunds = new uint256[](offersLength);

        for (uint256 offerId = 0; offerId < offersLength; offerId++) {
            bidderRefunds[offerId] = refunds[bidder][offerId];
        }

        return bidderRefunds;
    }

    function getRefund(address bidder, uint256 offerId)
        external
        view
        returns (uint256)
    {
        return refunds[bidder][offerId];
    }

    // @todo rework to pull?
    function purchaseItem(address recipient, uint256 offerId)
        internal
        nonReentrant
    {
        offers[offerId].nft.transferFrom(
            address(this),
            recipient,
            offers[offerId].tokenId
        ); // do not use safe transfer to prevent stuck of money in auction contract

        uint256 artistAmount = (offers[offerId].currentBid *
            offers[offerId].artistFee) / 10000;
        uint256 charityAmount = offers[offerId].currentBid - artistAmount;

        Address.sendValue(offers[offerId].artistAddress, artistAmount);
        Address.sendValue(offers[offerId].charityAddress, charityAmount);

        emit PurchaseItem(recipient, offerId);
    }

    function changeMaxFee(uint256 _maxFee) external onlyAdmin {
        maxFee = _maxFee;

        emit ChangeMaxFee(maxFee);
    }

    function pause() external onlyAdmin {
        super._pause();
    }

    function unpause() external onlyAdmin {
        super._unpause();
    }
}
