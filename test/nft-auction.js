const { expect } = require("chai")
const { ethers, waffle } = require("hardhat")
require("dotenv").config()

describe("NFT Auction", function () {
    const provider = waffle.provider
    const tokenId = 1
    const authorFee = 500
    const offerId = 0
    const anotherOfferId = 1

    let nft
    let nftAuction

    let owner
    let bidder1
    let bidder2
    let author
    let charity

    let currentTimestamp
    let endTimestamp

    const getCurrentTimestamp = async () => {
        return (await ethers.provider.getBlock("latest")).timestamp
    }

    const createOfferSuccess = async (
        signer, offerId,
        tokenId, nftAddress, minBid, maxBid, startTimestamp,
        endTimestamp, authorFee, artistAddress, charityAddress
    ) => {
        await expect(nftAuction.connect(signer).createOffer(
            tokenId, nftAddress, minBid, maxBid, startTimestamp,
            endTimestamp, authorFee, artistAddress, charityAddress
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            offerId, tokenId, nftAddress, minBid, maxBid, startTimestamp,
            endTimestamp, authorFee, artistAddress, charityAddress
        )
    }

    const createOfferFail = async (
        signer, error,
        tokenId, nftAddress, minBid, maxBid, startTimestamp,
        endTimestamp, authorFee, artistAddress, charityAddress
    ) => {
        await expect(nftAuction.connect(signer).createOffer(
            tokenId, nftAddress, minBid, maxBid, startTimestamp,
            endTimestamp, authorFee, artistAddress, charityAddress
        )).to.be.revertedWith(error)
    }

    const makeBidSuccess = async (
        signer, offerId, value
    ) => {
        await expect(nftAuction.connect(signer).makeBid(offerId, { value: value }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, value);
    }

    const makeBidFail = async (
        signer, error, offerId, value
    ) => {
        await expect(nftAuction.connect(signer).makeBid(offerId, { value: value }))
            .to.be.revertedWith(error)
    }

    beforeEach(async function () {
        currentTimestamp = await getCurrentTimestamp()
        endTimestamp = currentTimestamp + 20

        const minBid = ethers.utils.parseEther("0.1")
        const maxBid = ethers.utils.parseEther("10")
        const collectionUri = "ipfs://test"

        const NFT = await hre.ethers.getContractFactory("NFT");
        const NftAuction = await hre.ethers.getContractFactory("NftAuction");
        const ProxyRegistry = await hre.ethers.getContractFactory("ProxyRegistry");

        [owner, bidder1, bidder2, author, charity] = await hre.ethers.getSigners();

        const proxyRegistry = await ProxyRegistry.deploy();
        await proxyRegistry.deployed();

        nft = await NFT.deploy(
            process.env.NFT_NAME,
            process.env.NFT_SYMBOL,
            process.env.PINATA_BASE_URI,
            collectionUri,
            proxyRegistry.address
        );
        await nft.deployed();

        nftAuction = await NftAuction.deploy(process.env.AUCTION_MAX_FEE)
        await nftAuction.deployed()

        // await nft.setApprovalForAll(nftAuction.address, true)
        await nft.mintTo(owner.address, tokenId)
        await nft.approve(nftAuction.address, tokenId)

        await createOfferSuccess(
            owner, offerId,
            tokenId, nft.address, minBid, maxBid, currentTimestamp,
            endTimestamp, authorFee, author.address, charity.address
        )
    })

    it("Create offer", async function () {
        const anotherTokenId = 2
        const minBid = ethers.utils.parseEther("1")

        await createOfferFail(
            owner, "Offer for this token already exists",
            tokenId, nft.address, minBid, 0, await getCurrentTimestamp(), await getCurrentTimestamp() + 30, 500,
            author.address, charity.address
        )
        await createOfferFail(
            owner, "Fee is too high",
            anotherTokenId, nft.address, minBid, 0, await getCurrentTimestamp(), await getCurrentTimestamp() + 30, 5000,
            author.address, charity.address
        )
        await createOfferFail(
            owner, "Wrong artist address",
            anotherTokenId, nft.address, minBid, 0, await getCurrentTimestamp(), await getCurrentTimestamp() + 30, 500,
            ethers.constants.AddressZero, charity.address
        )
        await createOfferFail(
            owner, "Wrong charity address",
            anotherTokenId, nft.address, minBid, 0, await getCurrentTimestamp(), await getCurrentTimestamp() + 30, 500,
            author.address, ethers.constants.AddressZero
        )
        await createOfferFail(
            owner, "Max bid must be equal or bigger than min bid",
            anotherTokenId, nft.address, minBid, ethers.utils.parseEther("0.1"),
            await getCurrentTimestamp(), await getCurrentTimestamp() + 30, 500,
            author.address, charity.address
        )
        await createOfferFail(
            owner, "End timestamp can not be in past",
            anotherTokenId, nft.address, minBid, 0, await getCurrentTimestamp(), await getCurrentTimestamp() - 120, 500,
            author.address, charity.address
        )
        await createOfferFail(
            owner, "End timestamp must be bigger than start timestamp",
            anotherTokenId, nft.address, minBid, 0, await getCurrentTimestamp() + 30, await getCurrentTimestamp() + 20, 500,
            author.address, charity.address
        )
    })

    it("Make a bid", async () => {
        await makeBidFail(
            bidder2, "Offer does not exist",
            5, ethers.utils.parseEther("5")
        )
        await makeBidFail(
            bidder2, "Amount must be equal or bigger than min bid",
            offerId, ethers.utils.parseEther("0.01")
        )
        await makeBidSuccess(bidder1, offerId, ethers.utils.parseEther("0.2"))
        await makeBidSuccess(bidder2, offerId, ethers.utils.parseEther("0.3"))
        await makeBidFail(
            bidder2, "Amount must be bigger than current bid",
            offerId, ethers.utils.parseEther("0.2")
        )
    })

    it("Make max bid and close offer", async () => { // @todo remove?
        const authorBalance = await provider.getBalance(author.address);
        const charityBalance = await provider.getBalance(charity.address);
        const bidAmount = ethers.utils.parseEther("10");

        await makeBidSuccess(bidder1, offerId, bidAmount)

        await makeBidFail(
            bidder2, "Max bid already placed",
            offerId, ethers.utils.parseEther("20")
        )

        await expect(nftAuction.connect(bidder1).closeOffer(offerId))
            .to.emit(nftAuction, 'CloseOffer').withArgs(offerId, bidder1.address, bidAmount)

        const authorFeeAmount = bidAmount.mul(authorFee).div(10000);
        const charityAmount = charityBalance.add(bidAmount.sub(authorFeeAmount));

        expect(await provider.getBalance(author.address)).to.be.equal(authorBalance.add(authorFeeAmount));
        expect(await provider.getBalance(charity.address)).to.be.equal(charityAmount);
    })

    it("Close past offer", async () => {
        const bidAmount = ethers.utils.parseEther("0.2")

        await makeBidSuccess(bidder1, offerId, bidAmount)

        await network.provider.send("evm_mine", [endTimestamp + 10])

        await makeBidFail(
            bidder2, "Offer has ended",
            offerId, ethers.utils.parseEther("20")
        )

        await expect(nftAuction.connect(bidder1).closeOffer(offerId))
            .to.emit(nftAuction, 'CloseOffer').withArgs(offerId, bidder1.address, bidAmount)

        expect(await nft.ownerOf(tokenId)).to.be.equal(bidder1.address)
    })

    it("Cancel offer", async function () {
        // check completedOfferOnly modifier
        await expect(nftAuction.connect(bidder1).cancelOffer(123)) // unknown offer
            .to.be.revertedWith("Offer does not exist")
        await expect(nftAuction.connect(bidder1).cancelOffer(offerId)) // end date
            .to.be.revertedWith("Offer is active")

        await network.provider.send("evm_mine", [endTimestamp + 10])

        // other tests
        await expect(nftAuction.connect(bidder1).cancelOffer(offerId))
            .to.emit(nftAuction, 'CancelOffer').withArgs(offerId)

        expect(await nft.ownerOf(tokenId)).to.be.equal(author.address)
    });

    it("Outbid", async function () {
        const bidder1Bid = ethers.utils.parseEther("0.2");
        let bidder1Balance = await provider.getBalance(bidder1.address);

        const bidTx = await nftAuction.connect(bidder1).makeBid(offerId, { value: bidder1Bid });

        await expect(bidTx).to.emit(nftAuction, 'MakeBid').withArgs(offerId, bidder1Bid);

        const bidReceipt = await bidTx.wait();

        bidder1Balance = bidder1Balance.sub(bidReceipt.gasUsed.mul(bidReceipt.effectiveGasPrice));

        await makeBidSuccess(bidder2, offerId, ethers.utils.parseEther("0.3"))

        // check user refunds
        expect(await nftAuction.getRefunds(bidder1.address))
            .to.be.an('array').that.deep.includes(bidder1Bid)

        const withdrawTx = await nftAuction.connect(bidder1).withdrawRefund(offerId);

        await expect(withdrawTx).to.emit(nftAuction, 'WithdrawRefund').withArgs(offerId, bidder1Bid);

        const withdrawReceipt = await withdrawTx.wait();

        bidder1Balance = bidder1Balance.sub(withdrawReceipt.gasUsed.mul(withdrawReceipt.effectiveGasPrice));

        expect(await provider.getBalance(bidder1.address)).to.be.equal(bidder1Balance);

        // check user refunds
        expect(await nftAuction.getRefunds(bidder1.address))
            .to.be.an('array').that.deep.includes(ethers.constants.Zero)
    })

    it("Withdraw refund as active bidder", async () => {
        // Withdraw empty refund
        await expect(nftAuction.connect(bidder1).withdrawRefund(offerId))
            .to.be.revertedWith("No funds found for refund")

        // make several bids from one account
        await makeBidSuccess(bidder1, offerId, ethers.utils.parseEther("0.2"))
        await makeBidSuccess(bidder1, offerId, ethers.utils.parseEther("0.3"))
        await makeBidSuccess(bidder1, offerId, ethers.utils.parseEther("0.4"))

        // check refund value
        expect(await nftAuction.getRefunds(bidder1.address))
            .to.be.an('array').that.deep.includes(ethers.utils.parseEther("0.5"))

        // check refund value (single)
        expect(await nftAuction.getRefund(bidder1.address, offerId)).to.be.equal(ethers.utils.parseEther("0.5"))

        // withdraw
        await expect(nftAuction.connect(bidder1).withdrawRefund(offerId))
            .to.emit(nftAuction, 'WithdrawRefund').withArgs(offerId, ethers.utils.parseEther("0.5"))

        // check that last bid value left in contract
        expect(await provider.getBalance(nftAuction.address)).to.be.equal(ethers.utils.parseEther("0.4"))

        // check that refund value has been reset
        expect(await nftAuction.getRefunds(bidder1.address))
            .to.be.an('array').that.deep.includes(ethers.constants.Zero)
    })

    it("Create another offer", async function () {
        let anotherTokenId;
        const anotherCurrentTimestamp = await getCurrentTimestamp();
        const anotherEndTimestamp = anotherCurrentTimestamp + 30;
        const bidAmount = ethers.utils.parseEther("1.1")
        const minBid = ethers.utils.parseEther("1")

        await nft.mintTo(owner.address, "uri");

        anotherTokenId = await nft.totalSupply();

        await nft.approve(nftAuction.address, anotherTokenId)

        await createOfferSuccess(
            owner, anotherOfferId,
            anotherTokenId, nft.address, minBid, 0, anotherCurrentTimestamp,
            anotherEndTimestamp, 5, author.address, charity.address
        )

        await expect(nftAuction.connect(bidder1).makeBid(anotherOfferId, { value: bidAmount }))
            .to.emit(nftAuction, 'MakeBid').withArgs(anotherOfferId, bidAmount);

        await network.provider.send("evm_mine", [anotherEndTimestamp + 10]);

        await expect(nftAuction.closeOffer(anotherOfferId))
            .to.emit(nftAuction, 'CloseOffer').withArgs(anotherOfferId, bidder1.address, bidAmount)
    })

    it("Change max fee", async function () {
        await expect(nftAuction.changeMaxFee(5000))
            .to.emit(nftAuction, "ChangeMaxFee").withArgs(5000)
    })

    it("Access Control", async function () {
        const anotherTokenId = 2
        const anotherCurrentTimestamp = await getCurrentTimestamp()
        const anotherEndTimestamp = anotherCurrentTimestamp + 30
        const minBid = ethers.utils.parseEther("1")

        await nft.mintTo(author.address, "uri")

        await createOfferFail(
            author, "Artist or admin only",
            anotherTokenId, nft.address, minBid, 0, anotherCurrentTimestamp, anotherEndTimestamp, 500,
            author.address, charity.address
        )

        await expect(nftAuction.connect(author).changeMaxFee(5000))
            .to.be.revertedWith("Admin only")

        await nftAuction.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ARTIST_ROLE")), author.address)

        await nft.connect(author).approve(nftAuction.address, anotherTokenId)

        await createOfferSuccess(
            author, anotherOfferId,
            anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0,
            anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        )
    })

    it("Pause contract", async function () {
        await expect(nftAuction.pause())
            .to.emit(nftAuction, "Paused").withArgs(owner.address);

        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: ethers.utils.parseEther("0.2") }))
            .to.be.revertedWith("Pausable: paused");

        await expect(nftAuction.unpause())
            .to.emit(nftAuction, "Unpaused").withArgs(owner.address);

        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, ethers.utils.parseEther("0.2"));
    })
})
