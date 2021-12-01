const crypto = require('crypto');
const { promisify } = require('util');

const randomBytes = promisify(crypto.randomBytes);

async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

module.exports = {
  generateSecret,
};
