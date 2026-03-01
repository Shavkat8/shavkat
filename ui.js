// ═══════════════════════════════════════════════════════
// ui.js — управление интерфейсом (сайдбар, алерты, статус)
// ═══════════════════════════════════════════════════════

const UI = (() => {

  let _alertTimeout  = null;
  let _lastAlertedId = null;
  let _openPrice     = 0;

  // ─── STATUS ───────────────────────────────────────────

  function setStatus(s) {
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusTxt');
    dot.className = 'status-dot ' + s;
    const labels = { live: 'LIVE', loading: 'ЗАГРУЗКА', poll: 'POLLING', off: 'OFFLINE' };
    txt.textContent = labels[s] || s.toUpperCase();
  }

  // ─── PRICE DISPLAY ────────────────────────────────────

  function setPrice(price, openPrice) {
    _openPrice = openPrice || _openPrice || price;
    const el  = document.getElementById('priceBig');
    const ch  = document.getElementById('priceChange');
    const pct = _openPrice ? ((price - _openPrice) / _openPrice * 100) : 0;
    const up  = price >= _openPrice;

    el.textContent = Chart.formatPrice(price);
    el.className   = 'price-big ' + (up ? 'up' : 'down');
    ch.textContent = (up ? '▲ +' : '▼ ') + pct.toFixed(2) + '%';
    ch.className   = 'price-change ' + (up ? 'up' : 'down');
  }

  function setOpenPrice(p) { _openPrice = p; }

  // ─── OVERLAY ──────────────────────────────────────────

  function showOverlay(msg) {
    const ov = document.getElementById('overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = msg
      ? `<div class="spinner"></div><div class="overlay-txt">${msg}</div>`
      : `<div class="logo-big">WAVE LEVEL INDICATOR</div>
         <div class="overlay-hint">Выберите инструмент для анализа</div>`;
  }

  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  // ─── ERROR ────────────────────────────────────────────

  function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = '⚠ ' + msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 7000);
  }

  // ─── ALERT BANNER ─────────────────────────────────────

  function checkAlertBanner(lastPrice, levels) {
    const near = levels
      .filter(l => !l.confirmedBreak)
      .find(l => Math.abs(lastPrice - l.price) / l.price < CFG.alertPct);

    const banner = document.getElementById('alertBanner');

    if (near && near.id !== _lastAlertedId) {
      _lastAlertedId = near.id;
      const tp   = near.type === 'sup' ? 'ПОДДЕРЖКА' : 'СОПРОТИВЛЕНИЕ';
      const dist = ((Math.abs(lastPrice - near.price) / near.price) * 100).toFixed(2);
      banner.innerHTML = `⚡ ${tp}  ${Chart.formatPrice(near.price)}  &nbsp;×${near.touches}&nbsp; · ${dist}% до уровня`;
      banner.classList.add('show');
      if (_alertTimeout) clearTimeout(_alertTimeout);
      _alertTimeout = setTimeout(() => {
        banner.classList.remove('show');
        _lastAlertedId = null;
      }, 6000);
    }
  }

  function resetAlert() {
    _lastAlertedId = null;
    document.getElementById('alertBanner').classList.remove('show');
  }

  // ─── SYM INFO ─────────────────────────────────────────

  function setSymInfo(sym, type, tf) {
    const typeLabels = {
      crypto:      '🔷 Крипто (Binance WS)',
      crypto_perp: '⚡ Перп. фьючерс (Binance WS)',
      moex:        '🇷🇺 МосБиржа (MOEX ISS)',
      stock:       '📈 Акция США (Yahoo Finance)',
      futures:     '📦 Фьючерс (Yahoo Finance)',
      forex:       '💱 Форекс (Yahoo Finance)',
    };
    const tfLabel = (TIMEFRAMES[tf] || {}).label || tf;
    document.getElementById('symInfo').innerHTML =
      `<b>${sym}</b> · ${typeLabels[type] || type}<br>Таймфрейм: <b>${tfLabel}</b> · Обновление: ${type.startsWith('crypto') ? 'реальное время' : '~30 сек'}`;
  }

  // ─── LEVELS SIDEBAR ───────────────────────────────────

  function renderLevels(levels, lastPrice) {
    const nearSet = new Set(
      levels.filter(l => !l.confirmedBreak && Math.abs(lastPrice - l.price) / l.price < CFG.alertPct).map(l => l.id)
    );
    const broken  = levels.filter(l => l.confirmedBreak);
    const active  = levels.filter(l => !l.confirmedBreak).sort((a, b) => b.price - a.price);

    // Stats
    document.getElementById('stLevels').textContent = active.length;
    document.getElementById('stMaxT').textContent   = active.length ? Math.max(...active.map(l => l.touches)) : 0;
    document.getElementById('stSup').textContent    = active.filter(l => l.type === 'sup').length;
    document.getElementById('stRes').textContent    = active.filter(l => l.type === 'res').length;
    document.getElementById('stBroken').textContent = broken.length;

    const list = document.getElementById('levelsList');

    if (!active.length && !broken.length) {
      list.innerHTML = '<div class="no-lvl">Накапливаю данные…</div>';
      return;
    }

    let html = '';

    // Активные уровни
    active.forEach(lv => {
      const near = nearSet.has(lv.id);
      const dots = Array.from({ length: Math.min(lv.touches, 8) }, () => '<div class="lc-dot"></div>').join('');
      const dist = ((Math.abs(lastPrice - lv.price) / lv.price) * 100).toFixed(2);
      html += `
        <div class="level-card ${lv.type}${near ? ' near' : ''}">
          <div class="lc-row">
            <div class="lc-price">${Chart.formatPrice(lv.price)}</div>
            <div style="display:flex;align-items:center;gap:5px">
              ${near ? '<span class="lc-near-ico">⚡</span>' : ''}
              <div class="lc-badge">${lv.type === 'sup' ? 'SUP' : 'RES'}</div>
            </div>
          </div>
          <div class="lc-meta">
            <div class="lc-dots">${dots}</div>
            <span class="lc-touch-count">${lv.touches} каc.</span>
            <span class="lc-dist">${dist}%</span>
          </div>
        </div>`;
    });

    // Пробитые уровни
    if (broken.length) {
      html += `<div class="broken-header">— Пробитые уровни —</div>`;
      broken.sort((a, b) => b.price - a.price).forEach(lv => {
        const dots = Array.from({ length: Math.min(lv.touches, 6) }, () => '<div class="lc-dot broken"></div>').join('');
        html += `
          <div class="level-card broken">
            <div class="lc-row">
              <div class="lc-price broken-price">${Chart.formatPrice(lv.price)}</div>
              <div class="lc-badge broken-badge">${lv.type === 'sup' ? 'SUP' : 'RES'} ✕</div>
            </div>
            <div class="lc-meta">
              <div class="lc-dots">${dots}</div>
              <span class="lc-touch-count">${lv.touches} каc.</span>
            </div>
          </div>`;
      });
    }

    list.innerHTML = html;
  }

  // ─── TIMEFRAME BUTTONS ────────────────────────────────

  function setActiveTimeframe(tf) {
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === tf);
    });
    document.getElementById('currentTF').textContent = (TIMEFRAMES[tf] || {}).label || tf;
  }

  // ─── SETTINGS PANEL ───────────────────────────────────

  function initSettings() {
    // Bind sliders → CFG
    const bind = (id, valId, key, transform, display) => {
      const el = document.getElementById(id);
      const vl = document.getElementById(valId);
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        CFG[key] = transform(v);
        vl.textContent = display(v);
      });
    };

    bind('slMinT',   'valMinT',   'minTouches',  v => parseInt(v),    v => v);
    bind('slZone',   'valZone',   'zonePercent', v => v / 1000,       v => (v/10).toFixed(1));
    bind('slAlert',  'valAlert',  'alertPct',    v => v / 1000,       v => (v/10).toFixed(1));
    bind('slPivot',  'valPivot',  'pivotLen',    v => parseInt(v),    v => v);
    bind('slBreak',  'valBreak',  'breakoutPct', v => v / 1000,       v => (v/10).toFixed(1));
  }

  function syncSettingsFromCFG() {
    const set = (id, valId, val, display) => {
      document.getElementById(id).value = val;
      document.getElementById(valId).textContent = display(val);
    };
    set('slMinT',  'valMinT',  CFG.minTouches,             v => v);
    set('slZone',  'valZone',  CFG.zonePercent * 1000,     v => (v/10).toFixed(1));
    set('slAlert', 'valAlert', CFG.alertPct * 1000,        v => (v/10).toFixed(1));
    set('slPivot', 'valPivot', CFG.pivotLen,               v => v);
    set('slBreak', 'valBreak', CFG.breakoutPct * 1000,     v => (v/10).toFixed(1));
  }

  return {
    setStatus, setPrice, setOpenPrice,
    showOverlay, hideOverlay, showError,
    checkAlertBanner, resetAlert,
    setSymInfo, renderLevels,
    setActiveTimeframe, initSettings, syncSettingsFromCFG,
  };

})();
