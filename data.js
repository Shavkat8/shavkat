// ═══════════════════════════════════════════════════════
// data.js — загрузка данных: Binance, Yahoo Finance, MOEX
// ═══════════════════════════════════════════════════════

const Data = (() => {

  let _ws          = null;
  let _pollTimer   = null;
  let _currentSym  = null;
  let _currentType = null;
  let _onCandle    = null;   // callback(candles, isNewBar)
  let _onStatus    = null;   // callback('live'|'loading'|'off'|'poll')

  // ─── PUBLIC API ───────────────────────────────────────

  async function load(sym, type, tf, onCandle, onStatus) {
    _currentSym  = sym;
    _currentType = type;
    _onCandle    = onCandle;
    _onStatus    = onStatus;

    disconnect();
    onStatus('loading');

    const tfCfg = TIMEFRAMES[tf] || TIMEFRAMES['5m'];

    try {
      let candles;
      if (type === 'crypto' || type === 'crypto_perp') {
        candles = await fetchBinance(sym, type, tfCfg);
        connectBinanceWS(sym, type, tf, candles);
      } else if (type === 'moex') {
        candles = await fetchMOEX(sym, tfCfg);
        startPoll(() => fetchMOEX(sym, tfCfg), candles, 30000);
        onStatus('poll');
      } else {
        // Yahoo: stock, futures, forex
        const yahooSym = toYahooSym(sym);
        candles = await fetchYahoo(yahooSym, tfCfg);
        startPoll(() => fetchYahoo(yahooSym, { ...tfCfg, range: '1d' }), candles, 30000);
        onStatus('poll');
      }
      return candles;
    } catch (e) {
      onStatus('off');
      throw e;
    }
  }

  function disconnect() {
    if (_ws) { try { _ws.close(); } catch(e) {} _ws = null; }
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ─── BINANCE REST ─────────────────────────────────────

  async function fetchBinance(sym, type, tfCfg) {
    let pair = normalizeCryptoPair(sym);
    let url;

    if (type === 'crypto_perp') {
      // Binance Futures (USDM perpetual)
      url = `https://fapi.binance.com/fapi/v1/klines?symbol=${pair.replace('_PERP','')}&interval=${tfCfg.binance}&limit=${tfCfg.limit}`;
    } else {
      url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tfCfg.binance}&limit=${tfCfg.limit}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Binance ${resp.status}: ${pair} не найден`);
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('Нет данных Binance');

    return data.map(k => ({
      time:  +k[0],
      open:  +k[1],
      high:  +k[2],
      low:   +k[3],
      close: +k[4],
      vol:   +k[5],
    }));
  }

  // ─── BINANCE WEBSOCKET ────────────────────────────────

  function connectBinanceWS(sym, type, tf, existingCandles) {
    const pair    = normalizeCryptoPair(sym).toLowerCase().replace('_perp','');
    const tfLabel = (TIMEFRAMES[tf] || TIMEFRAMES['5m']).binance;

    let wsUrl;
    if (type === 'crypto_perp') {
      wsUrl = `wss://fstream.binance.com/ws/${pair}@kline_${tfLabel}`;
    } else {
      wsUrl = `wss://stream.binance.com:9443/ws/${pair}@kline_${tfLabel}`;
    }

    _ws = new WebSocket(wsUrl);

    _ws.onopen  = () => _onStatus('live');
    _ws.onerror = () => _onStatus('off');
    _ws.onclose = () => _onStatus('off');

    _ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      const k   = msg.k;
      const c   = {
        time:  +k.t,
        open:  +k.o,
        high:  +k.h,
        low:   +k.l,
        close: +k.c,
        vol:   +k.v,
      };

      const last = existingCandles[existingCandles.length - 1];
      let isNewBar = false;

      if (last && last.time === c.time) {
        existingCandles[existingCandles.length - 1] = c;
      } else {
        existingCandles.push(c);
        if (existingCandles.length > CFG.maxCandles) existingCandles.shift();
        isNewBar = true;
      }

      _onCandle(existingCandles, isNewBar);
    };
  }

  // ─── YAHOO FINANCE ────────────────────────────────────

  async function fetchYahoo(sym, tfCfg) {
    const yInterval = tfCfg.yahoo;
    const yRange    = tfCfg.range;

    // Используем несколько прокси для надёжности
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${yInterval}&range=${yRange}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;

    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('Прокси недоступен');

    const wrapper = await resp.json();
    const json    = JSON.parse(wrapper.contents);
    const result  = json?.chart?.result?.[0];

    if (!result) {
      const errMsg = json?.chart?.error?.description || 'Нет данных';
      throw new Error(`Yahoo: ${errMsg}`);
    }

    const ts = result.timestamp;
    const q  = result.indicators.quote[0];

    const candles = ts
      .map((t, i) => ({
        time:  t * 1000,
        open:  q.open[i],
        high:  q.high[i],
        low:   q.low[i],
        close: q.close[i],
        vol:   q.volume?.[i] || 0,
      }))
      .filter(c => c.open != null && c.close != null && !isNaN(c.close));

    if (candles.length === 0) throw new Error('Пустые данные');
    return candles;
  }

  // ─── MOEX (Московская биржа) ──────────────────────────
  // ISS API: iss.moex.com — бесплатный, без ключей

  async function fetchMOEX(sym, tfCfg) {
    // Маппинг таймфрейма в MOEX interval
    const moexInterval = toMOEXInterval(tfCfg.binance);
    const till = new Date().toISOString().slice(0, 10);

    // Считаем from дату
    const from = getMOEXFromDate(tfCfg.binance);

    const url = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${sym}/candles.json?interval=${moexInterval}&from=${from}&till=${till}&start=0`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('MOEX прокси недоступен');

    const wrapper = await resp.json();
    const json    = JSON.parse(wrapper.contents);

    const columns = json?.candles?.columns;
    const data    = json?.candles?.data;

    if (!columns || !data || data.length === 0) {
      throw new Error(`MOEX: тикер ${sym} не найден или нет данных`);
    }

    const iOpen  = columns.indexOf('open');
    const iClose = columns.indexOf('close');
    const iHigh  = columns.indexOf('high');
    const iLow   = columns.indexOf('low');
    const iVol   = columns.indexOf('volume');
    const iTime  = columns.indexOf('begin');

    return data.map(row => ({
      time:  new Date(row[iTime]).getTime(),
      open:  +row[iOpen],
      high:  +row[iHigh],
      low:   +row[iLow],
      close: +row[iClose],
      vol:   +row[iVol] || 0,
    })).filter(c => c.open && c.close);
  }

  function toMOEXInterval(binanceTF) {
    const map = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 24 };
    return map[binanceTF] || 5;
  }

  function getMOEXFromDate(tf) {
    const now  = new Date();
    const days = { '1m': 2, '5m': 5, '15m': 10, '30m': 15, '1h': 30, '4h': 90, '1d': 730 };
    const d    = days[tf] || 5;
    now.setDate(now.getDate() - d);
    return now.toISOString().slice(0, 10);
  }

  // ─── POLLING (для stocks/forex/moex) ─────────────────

  function startPoll(fetchFn, existingCandles, intervalMs) {
    if (_pollTimer) clearInterval(_pollTimer);

    _pollTimer = setInterval(async () => {
      try {
        const fresh = await fetchFn();
        if (!fresh || fresh.length === 0) return;

        const lastT = existingCandles.length ? existingCandles[existingCandles.length - 1].time : 0;
        let isNewBar = false;

        fresh.forEach(c => {
          if (c.time > lastT) {
            existingCandles.push(c);
            isNewBar = true;
          } else if (c.time === lastT) {
            existingCandles[existingCandles.length - 1] = c;
          }
        });

        if (existingCandles.length > CFG.maxCandles) {
          existingCandles.splice(0, existingCandles.length - CFG.maxCandles);
        }

        _onCandle(existingCandles, isNewBar);
      } catch (e) { /* silent poll error */ }
    }, intervalMs);
  }

  // ─── HELPERS ─────────────────────────────────────────

  function normalizeCryptoPair(sym) {
    const s = sym.toUpperCase().replace('_PERP', '');
    if (s.endsWith('USDT') || s.endsWith('BUSD') || s.endsWith('BTC') || s.endsWith('ETH')) return s;
    return s + 'USDT';
  }

  function toYahooSym(sym) {
    // Для РФ акций добавляем .ME (Moscow Exchange) — Yahoo иногда имеет
    // но для MOEX лучше использовать напрямую ISS
    return sym;
  }

  return { load, disconnect };

})();
