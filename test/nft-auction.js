const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
require("dotenv").config();

async function getCurrentTimestamp() {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

describe("NFT Auction", function () {
    const provider = waffle.provider;
    const tokenId = 1;
    const authorFee = 500;
    const offerId = 0;
    const anotherOfferId = 1;

    let nft;
    let nftAuction;

    let owner;
    let bidder1;
    let bidder2;
    let author;
    let charity;

    let currentTimestamp
    let endTimestamp;

    beforeEach(async function () {
        currentTimestamp = await getCurrentTimestamp()
        endTimestamp = currentTimestamp + 20;
        const collectionUri = "ipfs://test";
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
        await nftAuction.deployed();

        await nft.setApprovalForAll(nftAuction.address, true);
        await nft.mintTo(nftAuction.address, tokenId);

        await expect(nftAuction.createOffer(
            tokenId, nft.address, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"),
            currentTimestamp, endTimestamp, authorFee, author.address, charity.address
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            offerId, tokenId, nft.address, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"),
            currentTimestamp, endTimestamp, authorFee, author.address, charity.address
        );

        expect(await nftAuction.offerIsActive(offerId)).to.be.true;
    });

    it("Make a bid", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, ethers.utils.parseEther("0.2"));
    });

    it("Make max bid and purchase NFT", async function () {
        const authorBalance = await provider.getBalance(author.address);
        const charityBalance = await provider.getBalance(charity.address);
        const bidAmount = ethers.utils.parseEther("10");

        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: bidAmount }))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, offerId);

        const authorFeeAmount = bidAmount.mul(authorFee).div(10000);
        const charityAmount = charityBalance.add(bidAmount.sub(authorFeeAmount));

        expect(await provider.getBalance(author.address)).to.be.equal(authorBalance.add(authorFeeAmount));
        expect(await provider.getBalance(charity.address)).to.be.equal(charityAmount);
    });

    it("Close offer", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, ethers.utils.parseEther("0.2"));

        await network.provider.send("evm_mine", [endTimestamp + 10]);

        await expect(nftAuction.connect(bidder1).closeOffer(offerId))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, offerId);

        expect(await nftAuction.offerIsActive(offerId)).to.be.false;

        expect(await nft.ownerOf(tokenId)).to.be.equal(bidder1.address)
    });

    it("Close offer as admin", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(offerId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, ethers.utils.parseEther("0.2"));

        await network.provider.send("evm_mine", [endTimestamp + 10]);

        await expect(nftAuction.closeOffer(offerId))
            .to.emit(nftAuction, 'CloseOffer').withArgs(offerId, bidder1.address, ethers.utils.parseEther("0.2"));

        expect(await nftAuction.offerIsActive(offerId)).to.be.false;
    });

    it("Outbid", async function () {
        const bidder1Bid = ethers.utils.parseEther("0.2");
        let bidder1Balance = await provider.getBalance(bidder1.address);

        const bidTx = await nftAuction.connect(bidder1).makeBid(offerId, { value: bidder1Bid });

        await expect(bidTx).to.emit(nftAuction, 'MakeBid').withArgs(offerId, bidder1Bid);

        const bidReceipt = await bidTx.wait();

        bidder1Balance = bidder1Balance.sub(bidReceipt.gasUsed.mul(bidReceipt.effectiveGasPrice));

        await expect(nftAuction.connect(bidder2).makeBid(offerId, { value: ethers.utils.parseEther("0.3") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(offerId, ethers.utils.parseEther("0.3"));

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
    });

    it("Create another offer", async function () {
        let anotherTokenId;
        const anotherCurrentTimestamp = await getCurrentTimestamp();
        const anotherEndTimestamp = anotherCurrentTimestamp + 30;

        await nft.mintTo(nftAuction.address, "uri");

        anotherTokenId = await nft.totalSupply();

        await expect(nftAuction.createOffer(
            anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            anotherOfferId, anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        );

        await expect(nftAuction.connect(bidder1).makeBid(anotherOfferId, { value: ethers.utils.parseEther("1.1") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(anotherOfferId, ethers.utils.parseEther("1.1"));

        await network.provider.send("evm_mine", [anotherEndTimestamp + 10]);

        await expect(nftAuction.closeOffer(anotherOfferId))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, anotherOfferId);

        expect(await nftAuction.offerIsActive(anotherOfferId)).to.be.false
    })

    it("Prevent creation of offer duplicate", async function () {
        const anotherCurrentTimestamp = await getCurrentTimestamp()
        const anotherEndTimestamp = anotherCurrentTimestamp + 30

        await expect(nftAuction.createOffer(
            tokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        )).to.be.revertedWith("Offer for this token already exists")
    })

    it("Change max fee", async function () {
        await expect(nftAuction.changeMaxFee(5000))
            .to.emit(nftAuction, "ChangeMaxFee").withArgs(5000)
    });

    it("Access Control", async function () {
        const anotherTokenId = 2
        const anotherCurrentTimestamp = await getCurrentTimestamp()
        const anotherEndTimestamp = anotherCurrentTimestamp + 30

        await expect(nftAuction.connect(bidder1).createOffer(
            anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        )).to.be.revertedWith("Artist or admin only")

        await expect(nftAuction.connect(bidder1).changeMaxFee(5000))
            .to.be.revertedWith("Admin only")

        await nftAuction.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ARTIST_ROLE")), bidder1.address)

        await expect(nftAuction.connect(bidder1).createOffer(
            anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
            author.address, charity.address
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            anotherOfferId, anotherTokenId, nft.address, ethers.utils.parseEther("1"), 0, anotherCurrentTimestamp, anotherEndTimestamp, 5,
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
    });
});
