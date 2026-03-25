const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');

const { readDb, writeDb } = require('./db');
const { normalizeEmail, hashPassword, verifyPassword, createToken } = require('./auth');
const { getAiTradingSignal } = require('./aiModel');
const {
  FREE_AI_EMAILS,
  AI_PACKAGES,
  PAYMENT_ADDRESSES,
  PAYMENT_METHODS,
  FX_RATES
} = require('./config');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const BTC_PER_BCH = Number(process.env.BTC_PER_BCH || 0.0066);
const DEFAULT_SPOT_PRICES = {
  BTCUSDT: 64000,
  BCHUSDT: 420
};

const ADMIN_BOOTSTRAP = {
  email: normalizeEmail(process.env.ADMIN_EMAIL || 'admin@ewallet.local'),
  password: String(process.env.ADMIN_PASSWORD || 'Admin@123456'),
  name: String(process.env.ADMIN_NAME || 'Super Admin')
};

function nowIso() {
  return new Date().toISOString();
}

function buildWallet() {
  return {
    MYR: 0,
    USDT: 0,
    BTC: 0,
    BCH: 0
  };
}

function initSettings(db) {
  if (!db.settings) db.settings = {};
  db.settings.fxRates = { ...FX_RATES, ...(db.settings.fxRates || {}) };
  db.settings.spotPrices = { ...DEFAULT_SPOT_PRICES, ...(db.settings.spotPrices || {}) };
}

function ensureAdminUser() {
  const db = readDb();
  initSettings(db);

  const found = db.users.find((u) => u.email === ADMIN_BOOTSTRAP.email);
  if (!found) {
    db.users.push({
      id: randomUUID(),
      email: ADMIN_BOOTSTRAP.email,
      name: ADMIN_BOOTSTRAP.name,
      passwordHash: hashPassword(ADMIN_BOOTSTRAP.password),
      role: 'admin',
      active: true,
      wallet: buildWallet(),
      createdAt: nowIso()
    });
    writeDb(db);
    return;
  }

  if (found.role !== 'admin' || found.active !== true) {
    found.role = 'admin';
    found.active = true;
    writeDb(db);
  }
}

function getUserSafe(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    active: user.active !== false,
    wallet: user.wallet,
    createdAt: user.createdAt,
    freeAiEligible: FREE_AI_EMAILS.has(user.email)
  };
}

function getSessionToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

function getActiveSubscription(db, userId) {
  const now = Date.now();
  return db.subscriptions
    .filter((sub) => sub.userId === userId && sub.status === 'active' && new Date(sub.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0] || null;
}

function hasAiAccess(user, db) {
  if ((user.role || 'user') === 'admin') return true;
  if (FREE_AI_EMAILS.has(user.email)) return true;
  return Boolean(getActiveSubscription(db, user.id));
}

function withAuth(req, res, next) {
  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ error: 'Token diperlukan.' });

  const db = readDb();
  initSettings(db);

  const session = db.sessions.find((s) => s.token === token);
  if (!session) return res.status(401).json({ error: 'Token tidak sah.' });

  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'Pengguna tidak wujud.' });
  if (user.active === false) return res.status(403).json({ error: 'Akaun tidak aktif. Hubungi admin.' });

  req.db = db;
  req.user = user;
  req.token = token;
  return next();
}

function withAdmin(req, res, next) {
  if ((req.user.role || 'user') !== 'admin') {
    return res.status(403).json({ error: 'Akses admin diperlukan.' });
  }
  return next();
}

function convertAmount(fromCurrency, toCurrency, amount, rates) {
  if (fromCurrency === toCurrency) return amount;

  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const amt = Number(amount);

  if (!(amt > 0)) throw new Error('Jumlah tidak sah.');

  if (from === 'MYR') {
    const key = `MYR_${to}`;
    if (!rates[key]) throw new Error('Pair exchange tidak disokong.');
    return amt * rates[key];
  }

  if (to === 'MYR') {
    const key = `MYR_${from}`;
    if (!rates[key]) throw new Error('Pair exchange tidak disokong.');
    return amt / rates[key];
  }

  const toMyr = convertAmount(from, 'MYR', amt, rates);
  return convertAmount('MYR', to, toMyr, rates);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ewallet-crypto-ai', time: nowIso() });
});

app.get('/api/config/public', (_req, res) => {
  const db = readDb();
  initSettings(db);

  res.json({
    paymentMethods: PAYMENT_METHODS,
    aiPackages: AI_PACKAGES,
    paymentAddresses: PAYMENT_ADDRESSES,
    rates: db.settings.fxRates
  });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email dan password diperlukan.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password minimum 6 aksara.' });
  }

  const db = readDb();
  initSettings(db);

  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'Email sudah didaftarkan.' });
  }

  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    name: String(name || '').trim() || 'User',
    passwordHash: hashPassword(password),
    role: 'user',
    active: true,
    wallet: buildWallet(),
    createdAt: nowIso()
  };

  const token = createToken();
  db.users.push(user);
  db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
  writeDb(db);

  return res.status(201).json({ token, user: getUserSafe(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  const db = readDb();
  initSettings(db);

  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  if (user.active === false) {
    return res.status(403).json({ error: 'Akaun tidak aktif. Hubungi admin.' });
  }

  const token = createToken();
  db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
  writeDb(db);

  return res.json({ token, user: getUserSafe(user) });
});

app.post('/api/auth/logout', withAuth, (req, res) => {
  req.db.sessions = req.db.sessions.filter((s) => s.token !== req.token);
  writeDb(req.db);
  res.json({ message: 'Logout berjaya.' });
});

app.get('/api/me', withAuth, (req, res) => {
  const activeSubscription = getActiveSubscription(req.db, req.user.id);
  res.json({
    user: getUserSafe(req.user),
    activeSubscription,
    aiAccess: hasAiAccess(req.user, req.db)
  });
});

app.post('/api/wallet/deposit', withAuth, (req, res) => {
  const { method, amount, currency = 'MYR', note = '' } = req.body || {};
  const upperMethod = String(method || '').trim().toUpperCase();
  const upperCurrency = String(currency || '').trim().toUpperCase();
  const parsedAmount = Number(amount);

  if (!PAYMENT_METHODS.includes(upperMethod)) {
    return res.status(400).json({ error: `Method mesti salah satu: ${PAYMENT_METHODS.join(', ')}` });
  }

  if (!(parsedAmount > 0)) {
    return res.status(400).json({ error: 'Jumlah deposit tidak sah.' });
  }

  if (!Object.prototype.hasOwnProperty.call(req.user.wallet, upperCurrency)) {
    return res.status(400).json({ error: 'Mata wang tidak disokong.' });
  }

  const deposit = {
    id: randomUUID(),
    userId: req.user.id,
    amount: parsedAmount,
    currency: upperCurrency,
    method: upperMethod,
    note,
    status: 'completed',
    createdAt: nowIso()
  };

  req.user.wallet[upperCurrency] += parsedAmount;

  req.db.deposits.push(deposit);
  req.db.transactions.push({
    id: randomUUID(),
    userId: req.user.id,
    type: 'deposit',
    amount: parsedAmount,
    currency: upperCurrency,
    method: upperMethod,
    createdAt: nowIso()
  });

  writeDb(req.db);
  return res.status(201).json({ message: 'Deposit berjaya.', deposit, wallet: req.user.wallet });
});

app.post('/api/wallet/withdraw', withAuth, (req, res) => {
  const { method, amount, currency = 'MYR', destination } = req.body || {};
  const upperMethod = String(method || '').trim().toUpperCase();
  const upperCurrency = String(currency || '').trim().toUpperCase();
  const parsedAmount = Number(amount);

  if (!PAYMENT_METHODS.includes(upperMethod)) {
    return res.status(400).json({ error: `Method mesti salah satu: ${PAYMENT_METHODS.join(', ')}` });
  }

  if (!(parsedAmount > 0)) {
    return res.status(400).json({ error: 'Jumlah withdrawal tidak sah.' });
  }

  if ((req.user.wallet[upperCurrency] || 0) < parsedAmount) {
    return res.status(400).json({ error: 'Baki tidak mencukupi.' });
  }

  req.user.wallet[upperCurrency] -= parsedAmount;

  const withdrawal = {
    id: randomUUID(),
    userId: req.user.id,
    amount: parsedAmount,
    currency: upperCurrency,
    method: upperMethod,
    destination: String(destination || '').trim() || 'manual-review',
    status: 'processing',
    createdAt: nowIso()
  };

  req.db.withdrawals.push(withdrawal);
  req.db.transactions.push({
    id: randomUUID(),
    userId: req.user.id,
    type: 'withdrawal',
    amount: parsedAmount,
    currency: upperCurrency,
    method: upperMethod,
    createdAt: nowIso()
  });

  writeDb(req.db);
  return res.status(201).json({ message: 'Withdrawal diterima.', withdrawal, wallet: req.user.wallet });
});

app.post('/api/exchange/quote', withAuth, (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body || {};

  try {
    const from = String(fromCurrency || '').toUpperCase();
    const to = String(toCurrency || '').toUpperCase();
    const parsedAmount = Number(amount);

    const converted = convertAmount(from, to, parsedAmount, req.db.settings.fxRates);
    return res.json({
      fromCurrency: from,
      toCurrency: to,
      fromAmount: parsedAmount,
      toAmount: Number(converted.toFixed(8)),
      quotedAt: nowIso()
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/exchange/execute', withAuth, (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body || {};
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  const parsedAmount = Number(amount);

  try {
    if ((req.user.wallet[from] || 0) < parsedAmount) {
      return res.status(400).json({ error: 'Baki tidak mencukupi untuk exchange.' });
    }

    const converted = convertAmount(from, to, parsedAmount, req.db.settings.fxRates);
    req.user.wallet[from] -= parsedAmount;
    req.user.wallet[to] = (req.user.wallet[to] || 0) + converted;

    const tx = {
      id: randomUUID(),
      userId: req.user.id,
      type: 'exchange',
      fromCurrency: from,
      toCurrency: to,
      fromAmount: parsedAmount,
      toAmount: Number(converted.toFixed(8)),
      createdAt: nowIso()
    };

    req.db.transactions.push(tx);
    writeDb(req.db);

    return res.status(201).json({ message: 'Exchange berjaya.', transaction: tx, wallet: req.user.wallet });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/trading/order', withAuth, (req, res) => {
  const { symbol = 'BTCUSDT', side = 'BUY', amount } = req.body || {};

  const upperSymbol = String(symbol).toUpperCase();
  const upperSide = String(side).toUpperCase();
  const parsedAmount = Number(amount);
  const prices = req.db.settings.spotPrices;

  if (!prices[upperSymbol]) {
    return res.status(400).json({ error: 'Symbol tidak disokong.' });
  }

  if (!['BUY', 'SELL'].includes(upperSide)) {
    return res.status(400).json({ error: 'Side mesti BUY atau SELL.' });
  }

  if (!(parsedAmount > 0)) {
    return res.status(400).json({ error: 'Amount tidak sah.' });
  }

  const base = upperSymbol.replace('USDT', '');
  const price = prices[upperSymbol];

  let baseQty = 0;
  let quoteQty = 0;

  if (upperSide === 'BUY') {
    quoteQty = parsedAmount;
    baseQty = quoteQty / price;
    if ((req.user.wallet.USDT || 0) < quoteQty) {
      return res.status(400).json({ error: 'USDT tidak mencukupi.' });
    }
    req.user.wallet.USDT -= quoteQty;
    req.user.wallet[base] = (req.user.wallet[base] || 0) + baseQty;
  } else {
    baseQty = parsedAmount;
    quoteQty = baseQty * price;
    if ((req.user.wallet[base] || 0) < baseQty) {
      return res.status(400).json({ error: `${base} tidak mencukupi.` });
    }
    req.user.wallet[base] -= baseQty;
    req.user.wallet.USDT = (req.user.wallet.USDT || 0) + quoteQty;
  }

  const trade = {
    id: randomUUID(),
    userId: req.user.id,
    symbol: upperSymbol,
    side: upperSide,
    price,
    baseQty: Number(baseQty.toFixed(8)),
    quoteQty: Number(quoteQty.toFixed(2)),
    createdAt: nowIso()
  };

  req.db.trades.push(trade);
  req.db.transactions.push({
    id: randomUUID(),
    userId: req.user.id,
    type: 'trade',
    symbol: upperSymbol,
    side: upperSide,
    baseQty: trade.baseQty,
    quoteQty: trade.quoteQty,
    createdAt: nowIso()
  });

  writeDb(req.db);
  return res.status(201).json({ message: 'Order berjaya dilaksanakan.', trade, wallet: req.user.wallet });
});

app.get('/api/ai-trading/status', withAuth, (req, res) => {
  const freeEligible = FREE_AI_EMAILS.has(req.user.email);
  const activeSubscription = getActiveSubscription(req.db, req.user.id);

  return res.json({
    email: req.user.email,
    freeEligible,
    activeSubscription,
    aiAccess: hasAiAccess(req.user, req.db),
    packages: AI_PACKAGES,
    paymentAddresses: PAYMENT_ADDRESSES
  });
});

app.get('/api/ai-trading/signal', withAuth, (req, res) => {
  if (!hasAiAccess(req.user, req.db)) {
    return res.status(402).json({
      error: 'Akses AI trading memerlukan subscription.',
      packages: AI_PACKAGES,
      paymentAddresses: PAYMENT_ADDRESSES
    });
  }

  const { symbol, timeframe, risk } = req.query;
  const signal = getAiTradingSignal({ symbol, timeframe, risk });

  req.db.transactions.push({
    id: randomUUID(),
    userId: req.user.id,
    type: 'ai_signal',
    symbol: signal.symbol,
    action: signal.action,
    confidence: signal.confidence,
    createdAt: nowIso()
  });
  writeDb(req.db);

  return res.json(signal);
});

app.post('/api/subscriptions/quote', withAuth, (req, res) => {
  const { packageKey, network = 'BCH' } = req.body || {};
  const key = String(packageKey || '').trim().toLowerCase();
  const upperNetwork = String(network || '').trim().toUpperCase();

  const pkg = AI_PACKAGES[key];
  if (!pkg) return res.status(400).json({ error: 'Package tidak sah.' });

  if (!['BCH', 'BTC'].includes(upperNetwork)) {
    return res.status(400).json({ error: 'Network mesti BCH atau BTC.' });
  }

  const amount = upperNetwork === 'BCH'
    ? pkg.priceBCH
    : Number((pkg.priceBCH * BTC_PER_BCH).toFixed(8));

  return res.json({
    package: pkg,
    network: upperNetwork,
    amount,
    payTo: PAYMENT_ADDRESSES[upperNetwork],
    validForMinutes: 30,
    note: 'Selepas transfer, panggil endpoint /api/subscriptions/confirm untuk aktifkan.'
  });
});

app.post('/api/subscriptions/confirm', withAuth, (req, res) => {
  const { packageKey, network = 'BCH', txHash, amountPaid } = req.body || {};
  const key = String(packageKey || '').trim().toLowerCase();
  const upperNetwork = String(network || '').trim().toUpperCase();
  const pkg = AI_PACKAGES[key];

  if (!pkg) return res.status(400).json({ error: 'Package tidak sah.' });
  if (!txHash) return res.status(400).json({ error: 'txHash diperlukan.' });
  if (!['BCH', 'BTC'].includes(upperNetwork)) {
    return res.status(400).json({ error: 'Network mesti BCH atau BTC.' });
  }

  const expected = upperNetwork === 'BCH'
    ? pkg.priceBCH
    : Number((pkg.priceBCH * BTC_PER_BCH).toFixed(8));

  const paid = Number(amountPaid);
  if (!(paid > 0)) return res.status(400).json({ error: 'amountPaid tidak sah.' });

  if (paid < expected) {
    return res.status(400).json({
      error: 'Bayaran tidak mencukupi.',
      expected,
      paid
    });
  }

  const start = new Date();
  const end = new Date(start.getTime() + (30 * 24 * 60 * 60 * 1000));

  const subscription = {
    id: randomUUID(),
    userId: req.user.id,
    packageKey: pkg.key,
    packageLabel: pkg.label,
    network: upperNetwork,
    expectedAmount: expected,
    paidAmount: paid,
    txHash: String(txHash),
    status: 'active',
    startedAt: start.toISOString(),
    expiresAt: end.toISOString(),
    createdAt: nowIso()
  };

  req.db.subscriptions.push(subscription);
  req.db.transactions.push({
    id: randomUUID(),
    userId: req.user.id,
    type: 'subscription',
    packageKey: pkg.key,
    network: upperNetwork,
    amount: paid,
    createdAt: nowIso()
  });

  writeDb(req.db);

  return res.status(201).json({
    message: 'Subscription AI trading aktif.',
    subscription,
    paymentAddress: PAYMENT_ADDRESSES[upperNetwork]
  });
});

app.get('/api/history', withAuth, (req, res) => {
  const tx = req.db.transactions
    .filter((item) => item.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ count: tx.length, transactions: tx });
});

app.get('/api/admin/overview', withAuth, withAdmin, (req, res) => {
  const totalUsers = req.db.users.length;
  const activeUsers = req.db.users.filter((u) => u.active !== false).length;
  const admins = req.db.users.filter((u) => (u.role || 'user') === 'admin').length;
  const pendingWithdrawals = req.db.withdrawals.filter((w) => w.status === 'processing').length;

  res.json({
    totalUsers,
    activeUsers,
    admins,
    sessions: req.db.sessions.length,
    totalTransactions: req.db.transactions.length,
    pendingWithdrawals,
    openSubscriptions: req.db.subscriptions.filter((s) => s.status === 'active').length,
    settings: req.db.settings
  });
});

app.get('/api/admin/users', withAuth, withAdmin, (req, res) => {
  const users = req.db.users.map((u) => ({
    ...getUserSafe(u),
    sessions: req.db.sessions.filter((s) => s.userId === u.id).length,
    subscription: getActiveSubscription(req.db, u.id)
  }));
  res.json({ count: users.length, users });
});

app.patch('/api/admin/users/:userId', withAuth, withAdmin, (req, res) => {
  const { userId } = req.params;
  const { role, active, name } = req.body || {};
  const target = req.db.users.find((u) => u.id === userId);

  if (!target) return res.status(404).json({ error: 'User tidak dijumpai.' });
  if (target.id === req.user.id && active === false) {
    return res.status(400).json({ error: 'Admin tidak boleh nyahaktifkan diri sendiri.' });
  }

  if (role !== undefined) {
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role mesti admin atau user.' });
    }
    target.role = role;
  }

  if (active !== undefined) {
    target.active = Boolean(active);
    if (!target.active) {
      req.db.sessions = req.db.sessions.filter((s) => s.userId !== target.id);
    }
  }

  if (name !== undefined) {
    target.name = String(name || '').trim() || target.name;
  }

  writeDb(req.db);
  res.json({ message: 'Profil pengguna dikemas kini.', user: getUserSafe(target) });
});

app.post('/api/admin/users/:userId/wallet-adjust', withAuth, withAdmin, (req, res) => {
  const { userId } = req.params;
  const { currency, amount, reason = 'admin-adjustment' } = req.body || {};

  const target = req.db.users.find((u) => u.id === userId);
  if (!target) return res.status(404).json({ error: 'User tidak dijumpai.' });

  const upperCurrency = String(currency || '').toUpperCase();
  const delta = Number(amount);
  if (!Object.prototype.hasOwnProperty.call(target.wallet, upperCurrency)) {
    return res.status(400).json({ error: 'Currency tidak disokong.' });
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Amount tidak sah.' });
  }
  if ((target.wallet[upperCurrency] || 0) + delta < 0) {
    return res.status(400).json({ error: 'Pelarasan menyebabkan baki negatif.' });
  }

  target.wallet[upperCurrency] += delta;
  req.db.transactions.push({
    id: randomUUID(),
    userId: target.id,
    type: 'admin_wallet_adjust',
    currency: upperCurrency,
    amount: delta,
    reason: String(reason),
    byAdminId: req.user.id,
    createdAt: nowIso()
  });

  writeDb(req.db);
  res.status(201).json({ message: 'Wallet berjaya diselaraskan.', wallet: target.wallet });
});

app.get('/api/admin/transactions', withAuth, withAdmin, (req, res) => {
  const tx = [...req.db.transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ count: tx.length, transactions: tx });
});

app.get('/api/admin/subscriptions', withAuth, withAdmin, (req, res) => {
  const subs = [...req.db.subscriptions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ count: subs.length, subscriptions: subs });
});

app.patch('/api/admin/subscriptions/:id', withAuth, withAdmin, (req, res) => {
  const { id } = req.params;
  const { status, expiresAt } = req.body || {};

  const sub = req.db.subscriptions.find((s) => s.id === id);
  if (!sub) return res.status(404).json({ error: 'Subscription tidak dijumpai.' });

  if (status !== undefined) {
    if (!['active', 'expired', 'revoked'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak sah.' });
    }
    sub.status = status;
  }

  if (expiresAt !== undefined) {
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'expiresAt tidak sah.' });
    }
    sub.expiresAt = date.toISOString();
  }

  writeDb(req.db);
  res.json({ message: 'Subscription berjaya dikemas kini.', subscription: sub });
});

app.get('/api/admin/settings', withAuth, withAdmin, (req, res) => {
  res.json({ settings: req.db.settings, paymentMethods: PAYMENT_METHODS, aiPackages: AI_PACKAGES });
});

app.put('/api/admin/settings', withAuth, withAdmin, (req, res) => {
  const { fxRates, spotPrices } = req.body || {};

  if (fxRates !== undefined) {
    const nextRates = { ...req.db.settings.fxRates };
    Object.entries(fxRates).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) nextRates[k.toUpperCase()] = n;
    });
    req.db.settings.fxRates = nextRates;
  }

  if (spotPrices !== undefined) {
    const nextPrices = { ...req.db.settings.spotPrices };
    Object.entries(spotPrices).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) nextPrices[k.toUpperCase()] = n;
    });
    req.db.settings.spotPrices = nextPrices;
  }

  writeDb(req.db);
  res.json({ message: 'Tetapan berjaya dikemas kini.', settings: req.db.settings });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

ensureAdminUser();

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Bootstrap admin: ${ADMIN_BOOTSTRAP.email}`);
});
