const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

async function getCurrentTimestamp() {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

describe("NFT Auction", function () {
    const tokenId = 1;

    let nft;
    let nftAuction;
    let owner;
    let bidder1;
    let bidder2;
    let endTimestamp;

    beforeEach(async function () {
        endTimestamp = await getCurrentTimestamp() + 20;
        const NFT = await hre.ethers.getContractFactory("NFT");
        const NftAuction = await hre.ethers.getContractFactory("NftAuction");
        const ProxyRegistry = await hre.ethers.getContractFactory("ProxyRegistry");

        [owner, bidder1, bidder2] = await hre.ethers.getSigners();

        const proxyRegistry = await ProxyRegistry.deploy();
        await proxyRegistry.deployed();

        nft = await NFT.deploy(proxyRegistry.address);
        await nft.deployed();

        nftAuction = await NftAuction.deploy(nft.address);
        await nftAuction.deployed();

        await nft.setApprovalForAll(nftAuction.address, true);
        await nft.mintTo(owner.address);

        await expect(nftAuction.createOffer(tokenId, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"), endTimestamp))
            .to.emit(nftAuction, 'CreateOffer').withArgs(
                tokenId, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"), endTimestamp
            );

        expect(await nftAuction.offerIsActive(tokenId)).to.be.true;
    });

    it("Make a bid", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));
    });

    it("Make max bid and purchase NFT", async function () {
        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("10") }))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, tokenId);
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
        const provider = waffle.provider;
        let bidder1Balance = await provider.getBalance(bidder1.address);

        await expect(nftAuction.connect(bidder1).makeBid(tokenId, { value: ethers.utils.parseEther("0.2") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.2"));

        bidder1Balance = (await provider.getBalance(bidder1.address)).add(ethers.utils.parseEther("0.2"));

        await expect(nftAuction.connect(bidder2).makeBid(tokenId, { value: ethers.utils.parseEther("0.3") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(tokenId, ethers.utils.parseEther("0.3"));

        expect(await provider.getBalance(bidder1.address)).to.be.equal(bidder1Balance);
    });

    it("Create another offer", async function () {
        let anotherTokenId;
        const anotherEndTimestamp = await getCurrentTimestamp() + 30;

        await nft.mintTo(owner.address);

        anotherTokenId = await nft.totalSupply();

        await expect(nftAuction.createOffer(anotherTokenId, ethers.utils.parseEther("1"), 0, anotherEndTimestamp))
            .to.emit(nftAuction, 'CreateOffer').withArgs(
                anotherTokenId, ethers.utils.parseEther("1"), 0, anotherEndTimestamp
            );

        await expect(nftAuction.connect(bidder1).makeBid(anotherTokenId, { value: ethers.utils.parseEther("1.1") }))
            .to.emit(nftAuction, 'MakeBid').withArgs(anotherTokenId, ethers.utils.parseEther("1.1"));

        await network.provider.send("evm_mine", [anotherEndTimestamp + 10]);

        await expect(nftAuction.closeOffer(anotherTokenId))
            .to.emit(nftAuction, 'PurchaseItem').withArgs(bidder1.address, anotherTokenId);

        expect(await nftAuction.offerIsActive(anotherTokenId)).to.be.false;
    });
});
