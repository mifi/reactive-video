const crypto = require('crypto');
const { promisify } = require('util');
const uri2path = require('file-uri-to-path');

const randomBytes = promisify(crypto.randomBytes);

async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

const uriifyPath = (path) => (path.startsWith('file://') ? uri2path(path) : path);

module.exports = {
  generateSecret,
  uriifyPath,
};
