const hre = require("hardhat");
const pinata = require("./pinata");
require("dotenv").config();

async function uploadCollectionData(feeRecipient) {
  const collectionJson = require("../metadata/collection.json");
  const imageCid = await pinata.pinFileToIPFS(
    process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET, "./images/collection.png"
  );

  collectionJson.image = process.env.PINATA_BASE_URI + imageCid;
  collectionJson.fee_recipient = feeRecipient;

  const metaCid = await pinata.pinJSONToIPFS(
    process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET, "collection.json", collectionJson
  );

  return metaCid;
}

async function main() {
  let owner;
  [owner] = await hre.ethers.getSigners();

  const metaCid = await uploadCollectionData(owner.address);
  const collectionUri = process.env.PINATA_BASE_URI + metaCid;

  const NFT = await hre.ethers.getContractFactory("NFT");
  const NftAuction = await hre.ethers.getContractFactory("NftAuction");

  const nft = await NFT.deploy(
    process.env.NFT_NAME,
    process.env.NFT_SYMBOL,
    process.env.PINATA_BASE_URI,
    collectionUri,
    process.env.PROXY_REGISTRY_ADDRESS
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
      process.env.PROXY_REGISTRY_ADDRESS,
    ],
  });*/

  const nftAuction = await NftAuction.deploy(nft.address);
  await nftAuction.deployed();

  await nft.setApprovalForAll(nftAuction.address, true);

  console.log("NFT deployed to:", nft.address);
  console.log("Auction deployed to:", nftAuction.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
