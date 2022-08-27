const hre = require("hardhat")
require("dotenv").config()

let nftAuction

const getCurrentTimestamp = async () => {
    return (await ethers.provider.getBlock("latest")).timestamp
}

const createOffer = async (
    tokenId, nftAddress, minBid, maxBid, startTimestamp, endTimestamp, artistFee, artistAddress, charityAddress
) => {
    const tx = await nftAuction.createOffer(
        tokenId,
        nftAddress,
        minBid,
        maxBid,
        startTimestamp,
        endTimestamp,
        artistFee,
        artistAddress,
        charityAddress
    )
    const receipt = await tx.wait()
    console.log('Receipt:', receipt)
}

async function main() {
    const [owner] = await hre.ethers.getSigners()
    const currentTimestamp = await getCurrentTimestamp()
    const startTimestamp = 1661979600 // 2022-09-01 00:00:00
    const endTimestamp = 1664571599 // 2022-09-30 23:59:59
    nftAuction = await hre.ethers.getContractAt("NftAuction", process.env.AUCTION_ADDRESS)

    await createOffer(
        1,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("1"),
        ethers.constants.Zero,
        startTimestamp,
        endTimestamp,
        1000, // author fee basis points
        process.env.AUCTION_AUTHOR_ADDRESS, // author
        process.env.AUCTION_CHARITY_ADDRESS // charity
    )

    await createOffer(
        2,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("1"),
        ethers.constants.Zero,
        startTimestamp,
        endTimestamp,
        1000, // author fee %
        process.env.AUCTION_AUTHOR_ADDRESS, // author
        process.env.AUCTION_CHARITY_ADDRESS // charity
    )

    await createOffer(
        3,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("1"),
        ethers.constants.Zero,
        startTimestamp,
        endTimestamp,
        1000, // author fee %
        process.env.AUCTION_AUTHOR_ADDRESS, // author
        process.env.AUCTION_CHARITY_ADDRESS // charity
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
