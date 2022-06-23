const hre = require("hardhat");
const fs = require('fs');
const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET);
require("dotenv").config();

async function uploadCollectionData(feeRecipient) {
  const collectionJson = require("../metadata/collection.json");
  const { IpfsHash: imageCid } = await pinata.pinFileToIPFS(
    fs.createReadStream("./images/collection.png"),
    {
      pinataMetadata: {
        name: process.env.NFT_SYMBOL + "-collection.png"
      }
    }
  );

  collectionJson.image = process.env.PINATA_BASE_URI + imageCid;
  collectionJson.fee_recipient = feeRecipient;

  const { IpfsHash: metaCid } = await pinata.pinJSONToIPFS(collectionJson, {
    pinataMetadata: {
      name: process.env.NFT_SYMBOL + "-collection.json"
    }
  });

  return metaCid;
}

async function main() {
  let proxyRegistryAddress;

  const [owner] = await hre.ethers.getSigners();

  if (hre.network.name === 'rinkeby') {
    proxyRegistryAddress = process.env.RINKEBY_PROXY_REGISTRY_ADDRESS;
  } else { // mainnet
    proxyRegistryAddress = process.env.MAINNET_PROXY_REGISTRY_ADDRESS;
  }

  const metaCid = await uploadCollectionData(owner.address);
  const collectionUri = process.env.PINATA_BASE_URI + metaCid;

  const NFT = await hre.ethers.getContractFactory("NFT");
  const NftAuction = await hre.ethers.getContractFactory("NftAuction");
  const Multicall2 = await hre.ethers.getContractFactory("Multicall2");

  const nft = await NFT.deploy(
    process.env.NFT_NAME,
    process.env.NFT_SYMBOL,
    process.env.PINATA_BASE_URI,
    collectionUri,
    proxyRegistryAddress
  );
  await nft.deployed();

  // Verify NFT contract
  /*await hre.run("verify:verify", {
    address: nft.address,
    constructorArguments: [
      process.env.NFT_NAME,
      process.env.NFT_SYMBOL,
      process.env.PINATA_BASE_URI,
      collectionUri,
      process.env.MAINNET_PROXY_REGISTRY_ADDRESS,
    ],
  });*/

  const nftAuction = await NftAuction.deploy(
    process.env.AUCTION_MAX_FEE
  );
  await nftAuction.deployed();

  const tx = await nft.setApprovalForAll(nftAuction.address, true);
  await tx.wait()

  const multicall2 = await Multicall2.deploy();
  await multicall2.deployed();

  console.log("NFT deployed to:", nft.address);
  console.log("Auction deployed to:", nftAuction.address);
  console.log("Multicall2 deployed to:", multicall2.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
