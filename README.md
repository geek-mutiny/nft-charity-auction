# NFT Charity Auction

NFT Charity Auction Hardhat project.

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
node scripts/sample-script.js
npx hardhat help
npx hardhat run --network rinkeby scripts/deploy.js
npx hardhat run --network rinkeby scripts/mint.js
```

Fuzz testing:
```shell
docker pull trailofbits/eth-security-toolbox
docker run -it -v "$PWD":/src trailofbits/eth-security-toolbox
cd /src
echidna-test . --contract NftAuctionFuzzTest
```
