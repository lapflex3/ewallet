function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

function getAiTradingSignal({ symbol = 'BTCUSDT', timeframe = '1h', risk = 'medium' }) {
  const signalSeed = `${symbol}:${timeframe}:${risk}:${new Date().toISOString().slice(0, 13)}`;
  const r = seededRandom(signalSeed);

  let action = 'HOLD';
  if (r > 0.66) action = 'BUY';
  if (r < 0.33) action = 'SELL';

  const confidence = Math.round((55 + (r * 40)) * 100) / 100;
  const stopLossPct = risk === 'high' ? 3.5 : risk === 'low' ? 1.2 : 2.0;
  const takeProfitPct = risk === 'high' ? 7.0 : risk === 'low' ? 2.5 : 4.0;

  return {
    model: 'Hybrid Momentum v1 (demo)',
    symbol,
    timeframe,
    risk,
    action,
    confidence,
    setup: {
      stopLossPct,
      takeProfitPct
    },
    generatedAt: new Date().toISOString(),
    disclaimer: 'Signal ini adalah demo dan bukan nasihat kewangan.'
  };
}

module.exports = { getAiTradingSignal };
