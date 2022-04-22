const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

require("dotenv").config();

module.exports.pinFileToIPFS = (pinataApiKey, pinataSecretApiKey, file) => {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

    let data = new FormData();

    data.append(`file`, fs.createReadStream(file));

    return axios
        .post(url, data, {
            maxBodyLength: 'Infinity', //this is needed to prevent axios from erroring out with large directories
            headers: {
                'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataSecretApiKey
            }
        })
        .then(function (response) {
            return response.data.IpfsHash;
        })
        .catch(function (error) {
            console.log(error);
        });
};

module.exports.pinJSONToIPFS = (pinataApiKey, pinataSecretApiKey, jsonName, jsonBody) => {
    const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
    const json = {
        pinataMetadata: {
            name: jsonName
        },
        pinataContent: jsonBody
    };

    return axios
        .post(url, json, {
            headers: {
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataSecretApiKey
            }
        })
        .then(function (response) {
            return response.data.IpfsHash;
        })
        .catch(function (error) {
            //handle error here
        });
};
