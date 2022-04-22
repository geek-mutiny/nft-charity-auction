// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ERC721Tradable.sol";

contract NFT is ERC721Tradable {
    string private _baseTokenURI;

    string private _contractURI;

    constructor(
        string memory name,
        string memory symbol,
        string memory baseTokenUri,
        string memory contractUri,
        address _proxyRegistryAddress
    ) ERC721Tradable(name, symbol, _proxyRegistryAddress) {
        _baseTokenURI = baseTokenUri;
        _contractURI = contractUri;
    }

    function baseTokenURI() public view override returns (string memory) {
        return _baseTokenURI;
    }

    function contractURI() public view returns (string memory) {
        return _contractURI;
    }
}