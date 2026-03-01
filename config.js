// ═══════════════════════════════════════════════════════
// config.js — глобальная конфигурация индикатора
// ═══════════════════════════════════════════════════════

const CFG = {
  // Уровни
  minTouches:    2,
  zonePercent:   0.003,   // 0.3% — ширина зоны кластера
  alertPct:      0.005,   // 0.5% — зона предупреждения
  pivotLen:      5,       // баров для подтверждения пивота с каждой стороны
  maxCandles:    500,

  // Пробой
  breakoutPct:   0.002,   // цена закрылась за уровень на 0.2% → пробой

  // Таймфрейм
  timeframe:     '5m',

  // Candlestick visual
  candleWidth:   7,
  candleGap:     1,
};

// Доступные таймфреймы
const TIMEFRAMES = {
  '1m':  { label: '1М',   binance: '1m',   yahoo: '1m',  range: '1d',  limit: 500 },
  '5m':  { label: '5М',   binance: '5m',   yahoo: '5m',  range: '5d',  limit: 500 },
  '15m': { label: '15М',  binance: '15m',  yahoo: '15m', range: '5d',  limit: 500 },
  '30m': { label: '30М',  binance: '30m',  yahoo: '30m', range: '10d', limit: 500 },
  '1h':  { label: '1Ч',   binance: '1h',   yahoo: '60m', range: '30d', limit: 500 },
  '4h':  { label: '4Ч',   binance: '4h',   yahoo: '1d',  range: '60d', limit: 500 },
  '1d':  { label: '1Д',   binance: '1d',   yahoo: '1d',  range: '2y',  limit: 500 },
};

// Пресеты инструментов
const PRESETS = {
  crypto: [
    { sym: 'BTCUSDT',  label: 'BTC' },
    { sym: 'ETHUSDT',  label: 'ETH' },
    { sym: 'SOLUSDT',  label: 'SOL' },
    { sym: 'BNBUSDT',  label: 'BNB' },
    { sym: 'XRPUSDT',  label: 'XRP' },
  ],
  futures_crypto: [
    { sym: 'BTCUSDT_PERP', label: 'BTC-PERP' },
    { sym: 'ETHUSDT_PERP', label: 'ETH-PERP' },
  ],
  stocks_us: [
    { sym: 'AAPL',  label: 'AAPL' },
    { sym: 'TSLA',  label: 'TSLA' },
    { sym: 'NVDA',  label: 'NVDA' },
    { sym: 'MSFT',  label: 'MSFT' },
  ],
  stocks_ru: [
    { sym: 'SBER',  label: 'СБЕР' },
    { sym: 'GAZP',  label: 'ГАЗП' },
    { sym: 'LKOH',  label: 'ЛУКОЙЛ' },
    { sym: 'YNDX',  label: 'ЯНДЕКС' },
    { sym: 'ROSN',  label: 'РОСНЕФТЬ' },
    { sym: 'GMKN',  label: 'НОРНИКЕЛЬ' },
  ],
  futures_com: [
    { sym: 'GC=F',  label: 'GOLD' },
    { sym: 'SI=F',  label: 'SILVER' },
    { sym: 'CL=F',  label: 'OIL WTI' },
    { sym: 'BZ=F',  label: 'BRENT' },
    { sym: 'ES=F',  label: 'S&P500 FUT' },
    { sym: 'NQ=F',  label: 'NASDAQ FUT' },
  ],
  forex: [
    { sym: 'EURUSD=X', label: 'EUR/USD' },
    { sym: 'USDRUB=X', label: 'USD/RUB' },
    { sym: 'GBPUSD=X', label: 'GBP/USD' },
  ],
};

// Определение типа инструмента по тикеру
function detectAssetType(sym) {
  const s = sym.toUpperCase();
  // Крипто бессрочные фьючерсы
  if (s.endsWith('_PERP') || s.includes(':PERP')) return 'crypto_perp';
  // Крипто спот
  if (s.endsWith('USDT') || s.endsWith('BUSD') || s.endsWith('BTC')) return 'crypto';
  // РФ акции (MOEX тикеры — 4 буквы, нет цифр, нет =)
  const RU_TICKERS = ['SBER','GAZP','LKOH','YNDX','ROSN','GMKN','NVTK','TATN','MGNT','MTSS',
    'ALRS','POLY','PLZL','AFLT','VTBR','RUAL','CHMF','NLMK','PIKK','OZON','VKCO','TCSG','FIXP'];
  if (RU_TICKERS.includes(s)) return 'moex';
  // Фьючерсы Yahoo (=F)
  if (s.endsWith('=F')) return 'futures';
  // Forex (=X)
  if (s.endsWith('=X')) return 'forex';
  // US акции по умолчанию
  return 'stock';
}
