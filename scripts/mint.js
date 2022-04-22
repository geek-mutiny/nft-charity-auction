const hre = require("hardhat");
const pinata = require("./pinata");
require("dotenv").config();

async function uploadTokenData(tokenId) {
    const metadata = require("../metadata/nfts/" + tokenId + ".json");
    const imageCid = await pinata.pinFileToIPFS(
        process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET, "./images/nfts/" + tokenId + ".png"
    );

    metadata.image = process.env.PINATA_BASE_URI + imageCid;

    const metaCid = await pinata.pinJSONToIPFS(
        process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET, tokenId + ".json", metadata
    );

    return metaCid;
}

async function main() {
    let owner;
    [owner] = await hre.ethers.getSigners();

    const nft = await hre.ethers.getContractAt("NFT", process.env.NFT_ADDRESS);
    const newTokenId = (await nft.totalSupply()).add(1);
    const metaCid = await uploadTokenData(newTokenId);
    await nft.mintTo(owner.address, metaCid);

    console.log('NFT ' + newTokenId + ' with CID = ' + metaCid + ' minted to ' + owner.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
