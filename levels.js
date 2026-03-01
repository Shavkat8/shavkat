// ═══════════════════════════════════════════════════════
// levels.js — алгоритм волновых уровней
// ═══════════════════════════════════════════════════════

const Levels = (() => {

  // ─── СОСТОЯНИЕ УРОВНЕЙ ────────────────────────────────
  // Каждый уровень:
  // {
  //   id, price, type: 'sup'|'res',
  //   touches, firstIdx, lastIdx,
  //   broken: bool,          ← пробит?
  //   brokenAt: number|null  ← цена закрытия, пробившая уровень
  //   confirmedBreak: bool   ← закрылся за уровень на breakoutPct
  // }

  let _levels = [];

  // ─── PUBLIC ───────────────────────────────────────────

  function detect(candles) {
    if (candles.length < CFG.pivotLen * 2 + 3) return _levels;

    const p = CFG.pivotLen;
    const pivots = [];

    // Ищем pivot high и pivot low
    for (let i = p; i < candles.length - p; i++) {
      const c = candles[i];
      let isHigh = true, isLow = true;

      for (let j = 1; j <= p; j++) {
        if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
        if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isLow  = false;
      }

      if (isHigh) pivots.push({ price: c.high, type: 'res', idx: i });
      if (isLow)  pivots.push({ price: c.low,  type: 'sup', idx: i });
    }

    // Кластеризуем пивоты в уровни
    const clusters = [];
    pivots.forEach(pv => {
      const zone = pv.price * CFG.zonePercent;
      const ex   = clusters.find(
        l => Math.abs(l.price - pv.price) < zone && l.type === pv.type
      );
      if (ex) {
        ex.price    = (ex.price * ex.touches + pv.price) / (ex.touches + 1);
        ex.touches++;
        ex.lastIdx  = Math.max(ex.lastIdx, pv.idx);
        ex.firstIdx = Math.min(ex.firstIdx, pv.idx);
      } else {
        clusters.push({
          id:       Math.random().toString(36).slice(2),
          price:    pv.price,
          type:     pv.type,
          touches:  1,
          firstIdx: pv.idx,
          lastIdx:  pv.idx,
          broken:   false,
          brokenAt: null,
          confirmedBreak: false,
        });
      }
    });

    // Фильтруем по минимальному числу касаний
    const active = clusters.filter(l => l.touches >= CFG.minTouches);

    // Переносим состояние пробоя из предыдущих уровней (по близкой цене)
    active.forEach(newL => {
      const oldL = _levels.find(
        o => Math.abs(o.price - newL.price) / newL.price < CFG.zonePercent * 2
          && o.type === newL.type
      );
      if (oldL) {
        newL.id             = oldL.id;
        newL.broken         = oldL.broken;
        newL.brokenAt       = oldL.brokenAt;
        newL.confirmedBreak = oldL.confirmedBreak;
      }
    });

    _levels = active;

    // Проверяем пробои по последним свечам
    checkBreakouts(candles);

    return _levels;
  }

  // ─── ПРОВЕРКА ПРОБОЯ ─────────────────────────────────

  function checkBreakouts(candles) {
    if (candles.length < 2) return;

    const last  = candles[candles.length - 1];
    const prev  = candles[candles.length - 2];

    _levels.forEach(lv => {
      if (lv.confirmedBreak) return; // уже пробит, не пересматриваем

      const pct = CFG.breakoutPct;

      if (lv.type === 'res') {
        // Пробой сопротивления: свеча закрылась ВЫШЕ уровня на > breakoutPct
        if (last.close > lv.price * (1 + pct) && prev.close > lv.price * (1 + pct)) {
          lv.broken         = true;
          lv.brokenAt       = last.close;
          lv.confirmedBreak = true;
        }
      } else {
        // Пробой поддержки: свеча закрылась НИЖЕ уровня на > breakoutPct
        if (last.close < lv.price * (1 - pct) && prev.close < lv.price * (1 - pct)) {
          lv.broken         = true;
          lv.brokenAt       = last.close;
          lv.confirmedBreak = true;
        }
      }
    });
  }

  // ─── УТИЛИТЫ ─────────────────────────────────────────

  function getNearLevels(price) {
    return _levels.filter(l => Math.abs(price - l.price) / l.price < CFG.alertPct);
  }

  function reset() {
    _levels = [];
  }

  function getAll() {
    return _levels;
  }

  return { detect, checkBreakouts, getNearLevels, reset, getAll };

})();
