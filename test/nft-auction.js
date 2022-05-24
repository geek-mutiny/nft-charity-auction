const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
require("dotenv").config();

async function getCurrentTimestamp() {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

describe("NFT Auction", function () {
    const provider = waffle.provider;
    const tokenId = 1;
    const authorFee = 5;
    const marketingFee = 5;

    let nft;
    let nftAuction;
    let owner;
    let bidder1;
    let bidder2;
    let author;
    let marketing;
    let charity;
    let endTimestamp;

    beforeEach(async function () {
        endTimestamp = await getCurrentTimestamp() + 20;
        const collectionUri = "ipfs://test";
        const NFT = await hre.ethers.getContractFactory("NFT");
        const NftAuction = await hre.ethers.getContractFactory("NftAuction");
        const ProxyRegistry = await hre.ethers.getContractFactory("ProxyRegistry");

        [owner, bidder1, bidder2, author, marketing, charity] = await hre.ethers.getSigners();

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

        nftAuction = await NftAuction.deploy(
            nft.address,
            process.env.AUCTION_MAX_FEE
        );
        await nftAuction.deployed();

        await nft.setApprovalForAll(nftAuction.address, true);
        await nft.mintTo(owner.address, tokenId);

        await expect(nftAuction.createOffer(
            tokenId, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"), endTimestamp,
            authorFee, marketingFee, author.address, marketing.address, charity.address
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            tokenId, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"), endTimestamp,
            authorFee, marketingFee, author.address, marketing.address, charity.address
        );

        expect(await nftAuction.offerIsActive(tokenId)).to.be.true;
    });

    it("Make a bid", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));
    });

    it("Make max bid and purchase NFT", async function () {
        const authorBalance = await provider.getBalance(author.address);
        const marketingBalance = await provider.getBalance(marketing.address);
        const charityBalance = await provider.getBalance(charity.address);
        const bidAmount = ethers.utils.parseEther("10");

        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: bidAmount }))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, tokenId);

        const authorFeeAmount = bidAmount.mul(authorFee).div(100);
        const marketingFeeAmount = bidAmount.mul(marketingFee).div(100);
        const charityAmount = charityBalance.add(bidAmount.sub(authorFeeAmount).sub(marketingFeeAmount));

        expect(await provider.getBalance(author.address)).to.be.equal(authorBalance.add(authorFeeAmount));
        expect(await provider.getBalance(marketing.address)).to.be.equal(marketingBalance.add(marketingFeeAmount));
        expect(await provider.getBalance(charity.address)).to.be.equal(charityAmount);
    });

    it("Close offer", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));

        await network.provider.send("evm_mine", [endTimestamp + 10]);

        await expect(nftAuction.connect(bidder1).closeOffer(tokenId))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, tokenId);

        expect(await nftAuction.offerIsActive(tokenId)).to.be.false;
    });

    it("Close offer as admin", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));

        await network.provider.send("evm_mine", [endTimestamp + 10]);

        await expect(nftAuction.closeOffer(tokenId))
            .to.emit(nftAuction, 'CloseOffer').withArgs(tokenId, bidder1.address, ethers.utils.parseEther("0.2"));

        expect(await nftAuction.offerIsActive(tokenId)).to.be.false;
    });

    it("Outbid", async function () {
        const bidder1Bid = ethers.utils.parseEther("0.2");
        let bidder1Balance = await provider.getBalance(bidder1.address);

        const bidTx = await nftAuction.connect(bidder1).makeBid(tokenId, { value: bidder1Bid });

        await expect(bidTx).to.emit(nftAuction, 'MakeBid').withArgs(tokenId, bidder1Bid);

        const bidReceipt = await bidTx.wait();

        bidder1Balance = bidder1Balance.sub(bidReceipt.gasUsed.mul(bidReceipt.effectiveGasPrice));

        await expect(nftAuction.connect(bidder2).makeBid(tokenId, { value: ethers.utils.parseEther("0.3") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.3"));

        const withdrawTx = await nftAuction.connect(bidder1).withdrawRefund(tokenId);

        await expect(withdrawTx).to.emit(nftAuction, 'WithdrawRefund').withArgs(tokenId, bidder1Bid);

        const withdrawReceipt = await withdrawTx.wait();

        bidder1Balance = bidder1Balance.sub(withdrawReceipt.gasUsed.mul(withdrawReceipt.effectiveGasPrice));

        expect(await provider.getBalance(bidder1.address)).to.be.equal(bidder1Balance);
    });

    it("Create another offer", async function () {
        let anotherTokenId;
        const anotherEndTimestamp = await getCurrentTimestamp() + 30;

        await nft.mintTo(owner.address, "uri");

        anotherTokenId = await nft.totalSupply();

        await expect(nftAuction.createOffer(
            anotherTokenId, ethers.utils.parseEther("1"), 0, anotherEndTimestamp, 5, 5,
            author.address, marketing.address, charity.address
        )).to.emit(nftAuction, 'CreateOffer').withArgs(
            anotherTokenId, ethers.utils.parseEther("1"), 0, anotherEndTimestamp, 5, 5,
            author.address, marketing.address, charity.address
        );

        await expect(nftAuction.connect(bidder1).makeBid(anotherTokenId, { value: ethers.utils.parseEther("1.1") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(anotherTokenId, ethers.utils.parseEther("1.1"));

        await network.provider.send("evm_mine", [anotherEndTimestamp + 10]);

        await expect(nftAuction.closeOffer(anotherTokenId))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, anotherTokenId);

        expect(await nftAuction.offerIsActive(anotherTokenId)).to.be.false;
    });

    it("Pause contract", async function () {
        await expect(nftAuction.pause())
            .to.emit(nftAuction, "Paused").withArgs(owner.address);

        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.be.revertedWith("Pausable: paused");

        await expect(nftAuction.unpause())
            .to.emit(nftAuction, "Unpaused").withArgs(owner.address);

        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));
    });
});
