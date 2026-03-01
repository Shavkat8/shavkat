// ═══════════════════════════════════════════════════════
// app.js — главный контроллер приложения
// ═══════════════════════════════════════════════════════

const App = (() => {

  let _candles    = [];
  let _lastPrice  = 0;
  let _openPrice  = 0;
  let _currentSym = null;
  let _currentType = null;
  let _tf         = '5m';
  let _paused     = false;
  let _uiTimer    = null;

  // ─── INIT ─────────────────────────────────────────────

  function init() {
    Chart.init(document.getElementById('chart'));
    UI.initSettings();
    UI.syncSettingsFromCFG();
    UI.showOverlay(null);
    UI.setStatus('off');
    bindEvents();
    UI.setActiveTimeframe(_tf);
  }

  // ─── LOAD SYMBOL ─────────────────────────────────────

  async function load(sym, forceType) {
    if (!sym) return;
    sym = sym.trim().toUpperCase();
    if (!sym) return;

    document.getElementById('symInput').value = sym;

    const type = forceType || detectAssetType(sym);
    _currentSym  = sym;
    _currentType = type;

    UI.showOverlay('Загрузка ' + sym + '...');
    UI.setStatus('loading');
    UI.resetAlert();

    _candles   = [];
    _lastPrice = 0;
    _openPrice = 0;
    Levels.reset();
    Chart.update([], 0, new Set());

    try {
      const candles = await Data.load(
        sym, type, _tf,
        onCandleUpdate,
        (s) => UI.setStatus(s)
      );

      _candles   = candles;
      _lastPrice = candles[candles.length - 1].close;
      _openPrice = candles[0].open;

      Levels.detect(_candles);
      refreshChart();

      UI.hideOverlay();
      UI.setSymInfo(sym, type, _tf);
      UI.setPrice(_lastPrice, _openPrice);

      startUILoop();
      Chart.start();

    } catch (e) {
      UI.hideOverlay();
      UI.showError(e.message || 'Ошибка загрузки');
      UI.setStatus('off');
      console.error('[WLI] Load error:', e);
    }
  }

  // ─── CANDLE UPDATE CALLBACK ───────────────────────────

  function onCandleUpdate(candles, isNewBar) {
    if (_paused) return;
    _candles   = candles;
    _lastPrice = candles[candles.length - 1].close;
    if (isNewBar) Levels.detect(_candles);
    refreshChart();
  }

  // ─── REFRESH CHART ────────────────────────────────────

  function refreshChart() {
    const levels   = Levels.getAll();
    const nearIds  = new Set(Levels.getNearLevels(_lastPrice).map(l => l.id));
    Chart.update(_candles, _lastPrice, nearIds);
    UI.checkAlertBanner(_lastPrice, levels);
  }

  // ─── UI LOOP (sidebar update every 500ms) ─────────────

  function startUILoop() {
    if (_uiTimer) clearInterval(_uiTimer);
    _uiTimer = setInterval(() => {
      if (_paused) return;
      UI.setPrice(_lastPrice, _openPrice);
      UI.renderLevels(Levels.getAll(), _lastPrice);
    }, 500);
  }

  // ─── CONTROLS ─────────────────────────────────────────

  function togglePause() {
    _paused = !_paused;
    const btn = document.getElementById('btnPause');
    btn.textContent = _paused ? '▶ СТАРТ' : '⏸ ПАУЗА';
    btn.classList.toggle('active', !_paused);
  }

  function resetLevels() {
    Levels.reset();
    Levels.detect(_candles);
    UI.resetAlert();
    refreshChart();
  }

  function setTimeframe(tf) {
    if (tf === _tf) return;
    _tf = tf;
    CFG.timeframe = tf;
    UI.setActiveTimeframe(tf);
    if (_currentSym) load(_currentSym, _currentType);
  }

  // ─── EVENT BINDING ────────────────────────────────────

  function bindEvents() {
    // Enter в поле поиска
    document.getElementById('symInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') load(document.getElementById('symInput').value);
    });

    // Настройки → пересчёт уровней
    ['slMinT','slZone','slAlert','slPivot','slBreak'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        Levels.reset();
        Levels.detect(_candles);
        refreshChart();
      });
    });

    // Таймфрейм кнопки
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => setTimeframe(btn.dataset.tf));
    });

    // Кнопка загрузить
    document.getElementById('loadBtn').addEventListener('click', () => {
      load(document.getElementById('symInput').value);
    });

    // Пауза / сброс
    document.getElementById('btnPause').addEventListener('click', togglePause);
    document.getElementById('btnReset').addEventListener('click', resetLevels);
  }

  return { init, load, togglePause, resetLevels, setTimeframe };

})();

// ─── BOOTSTRAP ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
