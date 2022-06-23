const hre = require("hardhat")
require("dotenv").config()

let nftAuction

const getCurrentTimestamp = async () => {
    return (await ethers.provider.getBlock("latest")).timestamp
}

const createOffer = async (
    tokenId, nftAddress, initialBid, maxBid, startTimestamp, endTimestamp, artistFee, artistAddress, charityAddress
) => {
    const tx = await nftAuction.createOffer(
        tokenId,
        nftAddress,
        initialBid,
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
    nftAuction = await hre.ethers.getContractAt("NftAuction", process.env.AUCTION_ADDRESS)

    await createOffer(
        1,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("0.00001"),
        ethers.constants.Zero,
        currentTimestamp + 60,
        currentTimestamp + 1200,
        500, // author fee basis points
        '', // author (test)
        '' // charity
    )

    await createOffer(
        2,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("0.00002"),
        ethers.constants.Zero,
        currentTimestamp + 90,
        currentTimestamp + (86400 * 4),
        900, // author fee %
        owner.address, // author
        '' // charity
    )

    await createOffer(
        3,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("0.00003"),
        ethers.constants.Zero,
        currentTimestamp + 86400,
        currentTimestamp + (86400 * 5),
        800, // author fee %
        owner.address, // author
        '' // charity
    )

    await createOffer(
        4,
        process.env.NFT_ADDRESS,
        ethers.utils.parseEther("0.00004"),
        ethers.utils.parseEther("0.00009"),
        currentTimestamp + 120,
        currentTimestamp + (86400 * 2),
        2000, // author fee %
        owner.address, // author
        '' // charity
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
