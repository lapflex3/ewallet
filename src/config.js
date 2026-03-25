const FREE_AI_EMAILS = new Set([
  'lapflex100@gmail.com',
  'nikrazif@nasadef.com.my',
  'laptoprazif@gmail.com'
]);

const AI_PACKAGES = {
  beginner: { key: 'beginner', label: 'Beginner', priceBCH: 0.5 },
  advance: { key: 'advance', label: 'Advance', priceBCH: 1.0 },
  intermediate: { key: 'intermediate', label: 'Intermediate', priceBCH: 2.0 }
};

const PAYMENT_ADDRESSES = {
  BCH: 'qzwkx7uuy6hly5v4ryp5jtv5w7x7qlx3kvynv59rvu',
  BTC: '1D7NUAzsVBDHPcUxZ31iec3KWkDwVog8AJ'
};

const PAYMENT_METHODS = ['CIMB', 'MAYBANK', 'TNG', 'DEBIT_CARD', 'VISA', 'MASTERCARD'];

const FX_RATES = {
  MYR_USDT: 0.21,
  MYR_BTC: 0.0000033,
  MYR_BCH: 0.00092
};

module.exports = {
  FREE_AI_EMAILS,
  AI_PACKAGES,
  PAYMENT_ADDRESSES,
  PAYMENT_METHODS,
  FX_RATES
};
