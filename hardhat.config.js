require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter")
require("dotenv").config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  // defaultNetwork: "rinkeby",
  networks: {
    mainnet: {
      url: process.env.MAINNET_NETWORK_URL,
      chainId: process.env.MAINNET_CHAIN_ID | 0,
      accounts: [process.env.PRIVATE_KEY]
    },
    rinkeby: {
      url: process.env.RINKEBY_NETWORK_URL,
      chainId: process.env.RINKEBY_CHAIN_ID | 0,
      accounts: [process.env.PRIVATE_KEY]
    },
    goerli: {
      url: process.env.GOERLI_NETWORK_URL,
      chainId: process.env.GOERLI_CHAIN_ID | 0,
      accounts: [process.env.PRIVATE_KEY]
    },
    mumbai: {
      url: process.env.MUMBAI_NETWORK_URL,
      chainId: process.env.MUMBAI_CHAIN_ID | 0,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.MAINNET_ETHERSCAN_KEY,
      rinkeby: process.env.RINKEBY_ETHERSCAN_KEY,
      goerli: process.env.GOERLI_ETHERSCAN_KEY,
      polygonMumbai: process.env.MUMBAI_ETHERSCAN_KEY
    }
  },
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
