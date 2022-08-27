const hre = require("hardhat");
const fs = require('fs');
const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET);
require("dotenv").config();

async function uploadTokenData(tokenId) {
    const metadata = require("../metadata/nfts/" + tokenId + ".json");

    const { IpfsHash: imageCid } = await pinata.pinFileToIPFS(
        fs.createReadStream("./images/nfts/" + tokenId + ".jpg"),
        {
            pinataMetadata: {
                name: process.env.NFT_SYMBOL + "-" + tokenId + ".jpg"
            }
        }
    );

    metadata.image = process.env.PINATA_BASE_URI + imageCid;

    const { IpfsHash: metaCid } = await pinata.pinJSONToIPFS(metadata, {
        pinataMetadata: {
            name: process.env.NFT_SYMBOL + "-" + tokenId + ".json"
        }
    });

    return metaCid;
}

async function main() {
    let owner;
    [owner] = await hre.ethers.getSigners();
    const receiverAddress = owner.address;

    const nft = await hre.ethers.getContractAt("NFT", process.env.NFT_ADDRESS);
    const newTokenId = (await nft.totalSupply()).add(1);
    const metaCid = await uploadTokenData(newTokenId);
    await nft.mintTo(receiverAddress, metaCid);

    console.log('NFT ' + newTokenId + ' with CID = ' + metaCid + ' minted to ' + receiverAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
