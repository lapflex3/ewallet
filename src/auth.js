const crypto = require('crypto');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function verifyPassword(password, passwordHash) {
  return hashPassword(password) === passwordHash;
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  normalizeEmail,
  hashPassword,
  verifyPassword,
  createToken
};
