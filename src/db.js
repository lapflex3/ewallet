const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const defaultDb = () => ({
  users: [],
  sessions: [],
  transactions: [],
  subscriptions: [],
  trades: [],
  deposits: [],
  withdrawals: [],
  settings: {
    fxRates: {},
    spotPrices: {}
  }
});

function ensureShape(db) {
  const next = { ...defaultDb(), ...(db || {}) };
  next.users = Array.isArray(next.users) ? next.users : [];
  next.sessions = Array.isArray(next.sessions) ? next.sessions : [];
  next.transactions = Array.isArray(next.transactions) ? next.transactions : [];
  next.subscriptions = Array.isArray(next.subscriptions) ? next.subscriptions : [];
  next.trades = Array.isArray(next.trades) ? next.trades : [];
  next.deposits = Array.isArray(next.deposits) ? next.deposits : [];
  next.withdrawals = Array.isArray(next.withdrawals) ? next.withdrawals : [];
  next.settings = { ...defaultDb().settings, ...(next.settings || {}) };
  next.settings.fxRates = { ...(next.settings.fxRates || {}) };
  next.settings.spotPrices = { ...(next.settings.spotPrices || {}) };
  return next;
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

function readDb() {
  ensureDb();
  return ensureShape(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(ensureShape(db), null, 2));
}

module.exports = { readDb, writeDb };
