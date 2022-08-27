const hre = require("hardhat")
const fs = require('fs')
const pinataSDK = require('@pinata/sdk')
const pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET)
require("dotenv").config()

const verifyContract = async (contract, args) => {
  const { address } = contract

  console.log("Waiting 5 block confirmations...")

  await contract.deployTransaction.wait(5) // needed if verifyContract() is called immediately after deployment
  try {
    console.log("Verifying contract...")

    await hre.run("verify:verify", {
      address: address,
      constructorArguments: args,
    })
  } catch (err) {
    if (err.message.includes("Reason: Already Verified")) {
      console.log("Contract is already verified!")
    }
  }
}

async function uploadCollectionData(feeRecipient) {
  const collectionJson = require("../metadata/collection.json");
  const { IpfsHash: imageCid } = await pinata.pinFileToIPFS(
    fs.createReadStream("./images/collection.png"),
    {
      pinataMetadata: {
        name: process.env.NFT_SYMBOL + "-collection.png"
      }
    }
  )

  collectionJson.image = process.env.PINATA_BASE_URI + imageCid
  collectionJson.fee_recipient = feeRecipient

  const { IpfsHash: metaCid } = await pinata.pinJSONToIPFS(collectionJson, {
    pinataMetadata: {
      name: process.env.NFT_SYMBOL + "-collection.json"
    }
  })

  return metaCid
}

async function main() {
  let proxyRegistryAddress

  const [owner] = await hre.ethers.getSigners()

  if (hre.network.name === 'rinkeby') {
    proxyRegistryAddress = process.env.RINKEBY_PROXY_REGISTRY_ADDRESS
  } else { // mainnet
    proxyRegistryAddress = process.env.MAINNET_PROXY_REGISTRY_ADDRESS
  }
//stop
  // const metaCid = await uploadCollectionData(process.env.AUCTION_CHARITY_ADDRESS)
  // const collectionUri = process.env.PINATA_BASE_URI + metaCid

  // const NFT = await hre.ethers.getContractFactory("NFT")
  const NftAuction = await hre.ethers.getContractFactory("NftAuction")
  const Multicall2 = await hre.ethers.getContractFactory("Multicall2")

  /*const nft = await NFT.deploy(
    process.env.NFT_NAME,
    process.env.NFT_SYMBOL,
    process.env.PINATA_BASE_URI,
    collectionUri,
    proxyRegistryAddress
  )
  await nft.deployed()

  await verifyContract(nft, [
    process.env.NFT_NAME,
    process.env.NFT_SYMBOL,
    process.env.PINATA_BASE_URI,
    collectionUri,
    proxyRegistryAddress,
  ])*/
  const nft = await hre.ethers.getContractAt("NFT", process.env.NFT_ADDRESS)

  const nftAuction = await NftAuction.deploy(
    process.env.AUCTION_MAX_FEE
  )
  await nftAuction.deployed()

  await verifyContract(nftAuction, [
    process.env.AUCTION_MAX_FEE,
  ])

  const tx = await nft.setApprovalForAll(nftAuction.address, true)
  await tx.wait()

  const multicall2 = await Multicall2.deploy()
  await multicall2.deployed()

  await verifyContract(multicall2, [])

  console.log("NFT deployed to:", nft.address)
  console.log("Auction deployed to:", nftAuction.address)
  console.log("Multicall2 deployed to:", multicall2.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
