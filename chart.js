// ═══════════════════════════════════════════════════════
// chart.js — отрисовка свечного графика и уровней
// ═══════════════════════════════════════════════════════

const Chart = (() => {

  let _canvas   = null;
  let _ctx      = null;
  let _animId   = null;
  let _candles  = [];
  let _lastPrice = 0;
  let _nearIds   = new Set();

  // Цвета
  const C = {
    bg:         '#06090f',
    grid:       'rgba(20,30,46,.55)',
    candleUp:   '#00e676',
    candleDown: '#f5455c',
    price:      '#4fc3f7',
    sup:        '#00e676',
    res:        '#f5455c',
    alert:      '#ffcc02',
    supBroken:  '#607d8b',   // пробитая поддержка — серо-синий
    resBroken:  '#607d8b',   // пробитое сопротивление
    text:       'rgba(184,212,236,.9)',
  };

  // ─── INIT ─────────────────────────────────────────────

  function init(canvasEl) {
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!_canvas) return;
    _canvas.width  = _canvas.parentElement.clientWidth;
    _canvas.height = _canvas.parentElement.clientHeight;
    draw();
  }

  // ─── RENDER LOOP ──────────────────────────────────────

  function start() {
    stop();
    const loop = () => { draw(); _animId = requestAnimationFrame(loop); };
    _animId = requestAnimationFrame(loop);
  }

  function stop() {
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
  }

  // ─── UPDATE DATA ──────────────────────────────────────

  function update(candles, lastPrice, nearIds) {
    _candles   = candles;
    _lastPrice = lastPrice;
    _nearIds   = nearIds || new Set();
  }

  // ─── MAIN DRAW ────────────────────────────────────────

  function draw() {
    if (!_canvas || !_ctx) return;
    const W = _canvas.width;
    const H = _canvas.height;
    const ctx = _ctx;

    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H);

    if (_candles.length < 2) return;

    const CW   = CFG.candleWidth;
    const GAP  = CFG.candleGap;
    const STEP = CW + GAP;
    const LABEL_W = 165;  // ширина зоны лейблов справа

    const visCount = Math.floor((W - LABEL_W) / STEP);
    const start    = Math.max(0, _candles.length - visCount);
    const slice    = _candles.slice(start);

    // Диапазон цен
    let minP = Infinity, maxP = -Infinity;
    slice.forEach(c => {
      if (c.high > maxP) maxP = c.high;
      if (c.low  < minP) minP = c.low;
    });

    // Добавляем уровни в диапазон
    Levels.getAll().forEach(l => {
      if (l.price > maxP) maxP = l.price;
      if (l.price < minP) minP = l.price;
    });

    const pad = (maxP - minP) * 0.1;
    minP -= pad; maxP += pad;
    if (maxP === minP) return;

    const toY  = p => H - ((p - minP) / (maxP - minP)) * H;
    const drawW = W - LABEL_W;

    // Рисуем уровни
    drawLevels(ctx, W, H, drawW, LABEL_W, toY);

    // Рисуем свечи
    drawCandles(ctx, slice, STEP, CW, toY);

    // Текущая цена
    if (_lastPrice > 0) drawCurrentPrice(ctx, W, H, LABEL_W, toY);
  }

  // ─── GRID ─────────────────────────────────────────────

  function drawGrid(ctx, W, H) {
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 0; x < W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // ─── LEVELS ───────────────────────────────────────────

  function drawLevels(ctx, W, H, drawW, LABEL_W, toY) {
    const levels = Levels.getAll();
    const t = Date.now() / 380;

    levels.forEach(lv => {
      const y      = toY(lv.price);
      if (y < -20 || y > H + 20) return;

      const isNear    = _nearIds.has(lv.id);
      const isBroken  = lv.confirmedBreak;

      // Выбираем цвет
      let col;
      if (isBroken)          col = C.supBroken;
      else if (isNear)       col = C.alert;
      else if (lv.type==='sup') col = C.sup;
      else                   col = C.res;

      const alpha = isBroken ? 0.35 : isNear ? 0.9 : 0.6;

      // Зона уровня (полупрозрачный фон)
      if (!isBroken) {
        const zH = Math.max(2, (lv.price * CFG.zonePercent / (toY(0) - toY(1))) * 0.5);
        const zoneFill = lv.type === 'sup'
          ? `rgba(0,230,118,${isNear ? .07 : .03})`
          : `rgba(245,69,92,${isNear ? .07 : .03})`;
        ctx.fillStyle = zoneFill;
        ctx.fillRect(0, y - 6, drawW, 12);
      }

      // Линия уровня
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth   = isBroken ? 1 : isNear ? 1.5 : 1;

      if (isBroken) {
        // Пробитый уровень — пунктир крупный
        ctx.setLineDash([8, 6]);
      } else if (!isNear) {
        // Непробитый обычный — мелкий пунктир
        ctx.setLineDash([5, 4]);
      } else {
        // Близкий активный — сплошная
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(drawW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Лейбл
      drawLevelLabel(ctx, lv, col, y, W, LABEL_W, isNear, isBroken, t);

      // Точки касаний слева
      drawTouchDots(ctx, lv, col, y, alpha);

      // Пульсирующая точка если рядом
      if (isNear && !isBroken) {
        const r = 5 + Math.sin(t) * 2.5;
        ctx.beginPath();
        ctx.arc(drawW - 5, y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.2 + Math.abs(Math.sin(t)) * 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawLevelLabel(ctx, lv, col, y, W, LABEL_W, isNear, isBroken, t) {
    const lx = W - LABEL_W + 4;
    const lw = LABEL_W - 8;

    // Фон лейбла
    ctx.fillStyle = isBroken
      ? 'rgba(96,125,139,.12)'
      : (isNear ? `rgba(${lv.type==='sup'?'0,230,118':'245,69,92'},.18)` : `rgba(${lv.type==='sup'?'0,230,118':'245,69,92'},.09)`);
    ctx.fillRect(lx, y - 11, lw, 22);

    // Граница лейбла
    ctx.strokeStyle = col;
    ctx.lineWidth   = 0.5;
    ctx.globalAlpha = isBroken ? 0.3 : 0.7;
    ctx.strokeRect(lx, y - 11, lw, 22);
    ctx.globalAlpha = 1;

    // Текст
    const typeStr    = lv.type === 'sup' ? 'SUP' : 'RES';
    const brokenStr  = isBroken ? ' ✕' : '';
    const priceStr   = formatPrice(lv.price);
    const touchStr   = `×${lv.touches}`;

    ctx.fillStyle   = col;
    ctx.globalAlpha = isBroken ? 0.5 : 1;
    ctx.font        = `600 10px 'JetBrains Mono', monospace`;
    ctx.fillText(`${typeStr} ${priceStr}  ${touchStr}${brokenStr}`, lx + 6, y + 4);
    ctx.globalAlpha = 1;
  }

  function drawTouchDots(ctx, lv, col, y, alpha) {
    const count = Math.min(lv.touches, 10);
    ctx.fillStyle   = col;
    ctx.globalAlpha = alpha * 0.7;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(12 + i * 11, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── CANDLES ──────────────────────────────────────────

  function drawCandles(ctx, slice, STEP, CW, toY) {
    slice.forEach((c, i) => {
      const x    = i * STEP + CW / 2;
      const isUp = c.close >= c.open;
      const col  = isUp ? C.candleUp : C.candleDown;

      const yH = toY(c.high);
      const yL = toY(c.low);
      const yO = toY(c.open);
      const yC = toY(c.close);

      const bodyTop = Math.min(yO, yC);
      const bodyH   = Math.max(1, Math.abs(yO - yC));

      // Фитиль
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();

      // Тело
      ctx.fillStyle   = col;
      ctx.globalAlpha = isUp ? 0.75 : 0.85;
      ctx.fillRect(x - CW / 2, bodyTop, CW, bodyH);
      ctx.globalAlpha = 1;
    });
  }

  // ─── CURRENT PRICE LINE ───────────────────────────────

  function drawCurrentPrice(ctx, W, H, LABEL_W, toY) {
    const py = toY(_lastPrice);
    if (py < 0 || py > H) return;

    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(79,195,247,.6)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W - LABEL_W, py); ctx.stroke();
    ctx.setLineDash([]);

    // Лейбл текущей цены
    const lx = W - LABEL_W + 4;
    ctx.fillStyle   = 'rgba(79,195,247,.18)';
    ctx.fillRect(lx, py - 11, LABEL_W - 8, 22);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(lx, py - 11, LABEL_W - 8, 22);
    ctx.fillStyle   = '#4fc3f7';
    ctx.font        = `700 11px 'JetBrains Mono', monospace`;
    ctx.fillText('▶  ' + formatPrice(_lastPrice), lx + 6, py + 4);
  }

  // ─── HELPERS ──────────────────────────────────────────

  function formatPrice(p) {
    if (!p || isNaN(p)) return '—';
    if (p >= 10000)  return p.toFixed(1);
    if (p >= 1000)   return p.toFixed(2);
    if (p >= 100)    return p.toFixed(3);
    if (p >= 10)     return p.toFixed(4);
    if (p >= 1)      return p.toFixed(5);
    return p.toFixed(6);
  }

  return { init, start, stop, resize, update, formatPrice };

})();
