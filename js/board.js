/* 与大肥鱼一起下象棋 · 棋盘 / 棋子 / 行棋动画 / 觉醒特效 */
(function (root) {
  'use strict';
  var XQ = root.XQ;
  var NS = 'http://www.w3.org/2000/svg';
  var NAMES = XQ.NAMES;

  function mk(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function raf(fn) {
    return (window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); })(fn);
  }

  var IMG = {};
  function pieceSrc(side, t) {
    return 'assets/pieces/' + (side === 0 ? '红_' : '黑_') + NAMES[side][t] + '.png';
  }
  function preload() {
    for (var side = 0; side < 2; side++) {
      for (var t = 1; t <= 7; t++) {
        var src = pieceSrc(side, t);
        if (IMG[src]) continue;
        var im = new Image();
        im.src = src;
        IMG[src] = im;
      }
    }
  }
  preload();

  /* ---------------- 棋盘底图 ---------------- */

  var DEFS =
    '<linearGradient id="woodGrad" x1="0" y1="0" x2="0.35" y2="1">' +
    '<stop offset="0" stop-color="#f6e3bd"/><stop offset=".45" stop-color="#eccf9f"/>' +
    '<stop offset=".78" stop-color="#e0bd85"/><stop offset="1" stop-color="#d3aa71"/></linearGradient>' +
    '<linearGradient id="frameGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#8d5f31"/><stop offset=".5" stop-color="#6f4722"/>' +
    '<stop offset="1" stop-color="#9a6a3a"/></linearGradient>' +
    '<radialGradient id="boardVin" cx=".5" cy=".42" r=".78">' +
    '<stop offset=".55" stop-color="rgba(120,80,30,0)"/><stop offset="1" stop-color="rgba(90,55,15,.20)"/></radialGradient>' +
    '<radialGradient id="greenGlow" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="rgba(70,255,150,.62)"/><stop offset=".55" stop-color="rgba(30,220,110,.36)"/>' +
    '<stop offset="1" stop-color="rgba(20,180,90,0)"/></radialGradient>' +
    '<radialGradient id="whiteGlow" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="rgba(255,255,255,.62)"/><stop offset=".6" stop-color="rgba(255,255,255,.28)"/>' +
    '<stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>' +
    '<radialGradient id="blueGlow" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="rgba(110,215,255,.62)"/><stop offset=".55" stop-color="rgba(50,160,255,.34)"/>' +
    '<stop offset="1" stop-color="rgba(30,110,255,0)"/></radialGradient>' +
    '<radialGradient id="goldGlow" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="rgba(255,226,160,.58)"/><stop offset=".6" stop-color="rgba(240,190,100,.26)"/>' +
    '<stop offset="1" stop-color="rgba(240,190,100,0)"/></radialGradient>' +
    '<linearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0" stop-color="#2f9dff"/><stop offset=".55" stop-color="#8fe2ff"/>' +
    '<stop offset="1" stop-color="rgba(210,245,255,0)"/></linearGradient>' +
    '<filter id="fxBlur" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur stdDeviation="2.2"/></filter>';

  function boardBaseSvg() {
    var svg = mk('svg', {
      viewBox: '-34 -34 968 1068',
      preserveAspectRatio: 'xMidYMid meet',
      class: 'xq-svg'
    });
    var defs = mk('defs', {});
    defs.innerHTML = DEFS;
    svg.appendChild(defs);

    // 外框（木框）
    svg.appendChild(mk('rect', {
      x: -22, y: -22, width: 944, height: 1044, rx: 18,
      fill: 'url(#frameGrad)', stroke: 'rgba(60,35,10,.55)', 'stroke-width': 2
    }));
    svg.appendChild(mk('rect', {
      x: -14, y: -14, width: 928, height: 1028, rx: 12,
      fill: 'none', stroke: 'rgba(255,232,190,.55)', 'stroke-width': 2
    }));
    // 棋盘面
    svg.appendChild(mk('rect', {
      x: 0, y: 0, width: 900, height: 1000, rx: 8,
      fill: 'url(#woodGrad)', stroke: 'rgba(120,78,32,.5)', 'stroke-width': 2
    }));
    // 木纹
    var grain = mk('g', { opacity: '.5' });
    for (var i = 0; i < 14; i++) {
      var y = 20 + i * 72 + (i % 3) * 7;
      grain.appendChild(mk('path', {
        d: 'M14 ' + y + ' C 220 ' + (y - 7) + ', 420 ' + (y + 8) + ', 886 ' + (y - 4),
        fill: 'none', stroke: 'rgba(150,100,45,.16)', 'stroke-width': 1.6
      }));
    }
    svg.appendChild(grain);
    svg.appendChild(mk('rect', { x: 0, y: 0, width: 900, height: 1000, rx: 8, fill: 'url(#boardVin)' }));

    // 网格
    var g = mk('g', {});
    for (var r = 0; r < 10; r++) {
      g.appendChild(mk('line', { x1: 50, y1: 50 + r * 100, x2: 850, y2: 50 + r * 100, class: 'grid-line' }));
    }
    for (var c = 0; c < 9; c++) {
      var x = 50 + c * 100;
      if (c === 0 || c === 8) {
        g.appendChild(mk('line', { x1: x, y1: 50, x2: x, y2: 950, class: 'grid-line' }));
      } else {
        g.appendChild(mk('line', { x1: x, y1: 50, x2: x, y2: 450, class: 'grid-line' }));
        g.appendChild(mk('line', { x1: x, y1: 550, x2: x, y2: 950, class: 'grid-line' }));
      }
    }
    // 九宫
    [[350, 50, 550, 250], [550, 50, 350, 250], [350, 750, 550, 950], [550, 750, 350, 950]].forEach(function (p) {
      g.appendChild(mk('line', { x1: p[0], y1: p[1], x2: p[2], y2: p[3], class: 'grid-line' }));
    });
    // 外框线
    g.appendChild(mk('rect', { x: 50, y: 50, width: 800, height: 900, fill: 'none', class: 'grid-frame' }));
    svg.appendChild(g);

    // 炮位 / 兵位标记
    var marks = mk('g', {});
    var pts = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
    pts.forEach(function (pt) {
      var cx = 50 + pt[1] * 100, cy = 50 + pt[0] * 100, d = 9, L = 12;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        marks.appendChild(mk('path', {
          d: 'M' + (cx + s[0] * d) + ' ' + (cy + s[1] * (d + L)) +
            'L' + (cx + s[0] * d) + ' ' + (cy + s[1] * d) +
            'L' + (cx + s[0] * (d + L)) + ' ' + (cy + s[1] * d),
          class: 'mark', fill: 'none'
        }));
      });
    });
    svg.appendChild(marks);

    var t1 = mk('text', { x: 296, y: 530, class: 'river-text', 'text-anchor': 'middle' });
    t1.textContent = '楚 河';
    var t2 = mk('text', { x: 636, y: 530, class: 'river-text', 'text-anchor': 'middle' });
    t2.textContent = '漢 界';
    svg.appendChild(t1);
    svg.appendChild(t2);
    return svg;
  }

  /* ---------------- 视图 ---------------- */

  function BoardView(svg) {
    this.svg = svg;
    this.flip = false;
    this.base = boardBaseSvg();
    this.layers = null;
    this.px = function (c) { return this.flip ? 850 - 100 * c : 50 + 100 * c; };
    this.py = function (r) { return this.flip ? 950 - 100 * r : 50 + 100 * r; };
    this.build();
  }

  BoardView.prototype.build = function () {
    var svg = this.svg;
    if (!svg) return;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', this.base.getAttribute('viewBox'));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var defs = this.base.querySelector('defs').cloneNode(true);
    svg.appendChild(defs);
    var kids = Array.prototype.slice.call(this.base.childNodes).filter(function (n) { return n.nodeName !== 'defs'; });
    var self = this;
    kids.forEach(function (n) { svg.appendChild(n.cloneNode(true)); });
    this.layerLast = mk('g', { class: 'last-layer' });
    this.layerGlow = mk('g', { class: 'glow-layer' });
    this.layerHint = mk('g', { class: 'hint-layer' });
    this.layerPieces = mk('g', { class: 'pieces-layer' });
    this.layerGhost = mk('g', { class: 'ghost-layer' });
    this.layerFx = mk('g', { class: 'fx-layer' });
    [this.layerLast, this.layerGlow, this.layerHint, this.layerPieces, this.layerGhost, this.layerFx].forEach(function (l) {
      svg.appendChild(l);
    });
    self.layers = true;
  };

  BoardView.prototype.setFlip = function (flip) {
    this.flip = !!flip;
  };

  BoardView.prototype.PX = function (c) { return this.flip ? 850 - 100 * c : 50 + 100 * c; };
  BoardView.prototype.PY = function (r) { return this.flip ? 950 - 100 * r : 50 + 100 * r; };

  BoardView.prototype.clear = function (layer) {
    while (layer && layer.firstChild) layer.removeChild(layer.firstChild);
  };

  BoardView.prototype.clearFx = function () { this.clear(this.layerFx); };

  BoardView.prototype.pieceNodeAt = function (sq) {
    return this.layerPieces.querySelector('.piece[data-sq="' + sq + '"]');
  };

  BoardView.prototype.pieceEl = function (st, p, sq, ui) {
    var self = this;
    var r = XQ.rowOf(sq), c = XQ.colOf(sq), side = p >> 3, t = p & 7;
    var g = mk('g', {
      class: 'piece ' + (side === 0 ? 'red' : 'black'),
      transform: 'translate(' + this.PX(c) + ',' + this.PY(r) + ')'
    });
    g.setAttribute('data-sq', sq);
    g.setAttribute('data-side', side);
    g.setAttribute('data-type', t);
    if (ui.awakeable(sq, p)) g.classList.add('awakeable');
    if (ui.sel === sq) g.classList.add('selected');
    if (ui.bonus && ui.bonus.sq === sq) g.classList.add('pending');

    var body = mk('g', { class: 'piece-body' });
    body.appendChild(mk('ellipse', { class: 'p-shadow', cx: 0, cy: 16, rx: 34, ry: 10 }));
    var src = pieceSrc(side, t);
    var im = mk('image', {
      x: -48, y: -48, width: 96, height: 96,
      preserveAspectRatio: 'xMidYMid meet', class: 'piece-img'
    });
    im.setAttribute('href', src);
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', src);
    body.appendChild(im);
    body.appendChild(mk('circle', { r: 53, class: 'glow', 'stroke-dasharray': '3 6' }));
    body.appendChild(mk('circle', { r: 50, class: 'ring' }));
    g.appendChild(body);
    return g;
  };

  /**
   * 渲染整盘
   * ui: { sel, moves, lastMove, hint, over, bonus, choiceHighlights, checkRing, awakeable(sq,p), showHints }
   */
  BoardView.prototype.render = function (st, ui) {
    if (!st) return;
    ui = ui || {};
    var self = this;
    this.clear(this.layerLast);
    this.clear(this.layerGlow);
    this.clear(this.layerHint);
    this.clear(this.layerPieces);
    this.clear(this.layerGhost);

    // 上一步
    if (ui.lastMove) {
      [ui.lastMove.f, ui.lastMove.t].forEach(function (sq) {
        self.layerLast.appendChild(mk('rect', {
          x: self.PX(XQ.colOf(sq)) - 42, y: self.PY(XQ.rowOf(sq)) - 42,
          width: 84, height: 84, rx: 10, class: 'last-mark'
        }));
      });
    }

    // 将军
    if (!ui.over && XQ.inCheck(st, st.turn)) {
      var k = XQ.findKing(st, st.turn);
      if (k >= 0) {
        this.layerHint.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(k)), cy: this.PY(XQ.rowOf(k)), r: 48, class: 'check-ring'
        }));
      }
    }

    // 相连兵白光
    if (st.mode === 'awake') {
      for (var pi = 0; pi < 90; pi++) {
        var pp = st.board[pi];
        if (!pp || (pp & 7) !== 7) continue;
        if (!isPawnPair(st, pp >> 3, pi)) continue;
        this.layerGlow.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(pi)), cy: this.PY(XQ.rowOf(pi)), r: 50,
          fill: 'url(#whiteGlow)', class: 'pawn-link-glow'
        }));
        this.layerGlow.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(pi)), cy: this.PY(XQ.rowOf(pi)), r: 43,
          fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1.8,
          class: 'pawn-link-glow'
        }));
      }
    }

    // 选择候补棋子（并肩 / 易位续行）
    if (ui.choiceHighlights && ui.choiceHighlights.length) {
      var seen = {};
      ui.choiceHighlights.forEach(function (hq) {
        if (seen[hq]) return;
        seen[hq] = 1;
        self.layerGlow.appendChild(mk('circle', {
          cx: self.PX(XQ.colOf(hq)), cy: self.PY(XQ.rowOf(hq)), r: 53,
          fill: 'url(#goldGlow)', class: 'choice-glow'
        }));
        self.layerGlow.appendChild(mk('circle', {
          cx: self.PX(XQ.colOf(hq)), cy: self.PY(XQ.rowOf(hq)), r: 47,
          fill: 'none', stroke: '#ffd27a', 'stroke-width': 2.6,
          'stroke-dasharray': '4 6', class: 'choice-glow'
        }));
      });
    }

    // 选中傌：可换位的己方棋子绿光
    if (!ui.over && ui.sel >= 0 && st.mode === 'awake' && (st.board[ui.sel] & 7) === 4) {
      var seen2 = {};
      (ui.moves || []).forEach(function (m) {
        if (m.f !== ui.sel || m.kind !== 'swap' || seen2[m.t]) return;
        seen2[m.t] = 1;
        self.layerGlow.appendChild(mk('circle', {
          cx: self.PX(XQ.colOf(m.t)), cy: self.PY(XQ.rowOf(m.t)), r: 52,
          fill: 'url(#greenGlow)', class: 'swap-glow'
        }));
        self.layerGlow.appendChild(mk('circle', {
          cx: self.PX(XQ.colOf(m.t)), cy: self.PY(XQ.rowOf(m.t)), r: 46,
          fill: 'none', stroke: 'rgba(90,255,160,.75)', 'stroke-width': 2.4,
          'stroke-dasharray': '4 7', class: 'swap-glow'
        }));
      });
    }

    // 可走点
    if (ui.sel >= 0 && !ui.over) {
      var byT = {};
      (ui.moves || []).forEach(function (m) {
        if (m.f !== ui.sel) return;
        (byT[m.t] = byT[m.t] || []).push(m);
      });
      Object.keys(byT).forEach(function (key) {
        var variants = byT[key], t = +key;
        var x = self.PX(XQ.colOf(t)), y = self.PY(XQ.rowOf(t));
        var target = st.board[t];
        var isCap = target && (target >> 3) !== st.turn;
        var isSwap = variants.some(function (v) { return v.kind === 'swap'; });
        if (isSwap) {
          // 绿光已提示
        } else if (isCap) {
          self.layerHint.appendChild(mk('circle', { cx: x, cy: y, r: 44, class: 'hint-cap' }));
        } else {
          self.layerHint.appendChild(mk('circle', { cx: x, cy: y, r: 13, class: 'hint-dot' }));
        }
        var linked = variants.filter(function (v) { return v.extra && v.extra.length; })[0];
        if (linked) {
          linked.extra.forEach(function (ex) {
            self.layerHint.appendChild(mk('circle', {
              cx: self.PX(XQ.colOf(ex.t)), cy: self.PY(XQ.rowOf(ex.t)), r: 41, class: 'hint-cap2'
            }));
          });
        }
        if (variants.length > 1) {
          self.layerHint.appendChild(mk('circle', {
            cx: x, cy: y, r: 34, fill: 'none', stroke: '#ffd27a',
            'stroke-width': 1.8, 'stroke-dasharray': '3 5', opacity: 0.85
          }));
        }
      });
    }

    // 提示
    if (ui.hint) {
      var hf = ui.hint.f, ht = ui.hint.t;
      this.layerHint.appendChild(mk('line', {
        x1: this.PX(XQ.colOf(hf)), y1: this.PY(XQ.rowOf(hf)),
        x2: this.PX(XQ.colOf(ht)), y2: this.PY(XQ.rowOf(ht)),
        stroke: '#ffd27a', 'stroke-width': 4, 'stroke-dasharray': '10 8', opacity: 0.9
      }));
      this.layerHint.appendChild(mk('circle', {
        cx: this.PX(XQ.colOf(ht)), cy: this.PY(XQ.rowOf(ht)), r: 40,
        fill: 'none', stroke: '#ffd27a', 'stroke-width': 4
      }));
    }

    // 棋子
    for (var i = 0; i < 90; i++) {
      var p = st.board[i];
      if (!p) continue;
      this.layerPieces.appendChild(this.pieceEl(st, p, i, ui));
    }

    // 易位续行：待走棋子背后的傌残影
    if (ui.bonus && ui.bonus.kind === 'horse' && !ui.animating) {
      var gq = ui.bonus.sq;
      var gx = this.PX(XQ.colOf(gq)), gy = this.PY(XQ.rowOf(gq));
      var gg = mk('g', { class: 'horse-ghost' });
      gg.appendChild(mk('circle', {
        cx: gx, cy: gy, r: 52, fill: 'none', stroke: 'rgba(120,255,180,.55)',
        'stroke-width': 2, 'stroke-dasharray': '3 8'
      }));
      [-1, 1].forEach(function (dir) {
        var tx = mk('text', {
          transform: 'translate(' + (gx + dir * 18) + ',' + (gy + dir * 8) + ') scale(' + (1.28 + Math.abs(dir) * 0.08) + ')',
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': 'STKaiti,KaiTi,serif', 'font-size': 54, 'font-weight': 600,
          fill: '#4dff9e', opacity: dir < 0 ? 0.36 : 0.2
        });
        tx.textContent = NAMES[ui.bonus.side || 0][4];
        gg.appendChild(tx);
      });
      this.layerGhost.appendChild(gg);
    }
  };

  function isPawnPair(st, side, sq) {
    var r = XQ.rowOf(sq), c = XQ.colOf(sq);
    if (!(side === 0 ? r <= 4 : r >= 5)) return false;
    for (var s = -1; s <= 1; s += 2) {
      var nc = c + s;
      if (nc < 0 || nc > 8) continue;
      var q = st.board[r * 9 + nc];
      if (q && (q >> 3) === side && (q & 7) === 7) return true;
    }
    return false;
  }

  BoardView.prototype.isPawnPair = isPawnPair;

  /* ---------------- 动画 ---------------- */

  BoardView.prototype.animateMove = function (from, to, opts) {
    opts = opts || {};
    var node = this.pieceNodeAt(to);
    if (!node) return 0;
    if (opts.expectType && +node.getAttribute('data-type') !== opts.expectType) return 0;
    var body = node.querySelector('.piece-body');
    if (!body) return 0;
    var dx = this.PX(XQ.colOf(from)) - this.PX(XQ.colOf(to));
    var dy = this.PY(XQ.rowOf(from)) - this.PY(XQ.rowOf(to));
    if (!dx && !dy) return 0;
    var dur = opts.dur || 260;
    var delay = opts.delay || 0;
    var arc = opts.arc === undefined ? -5 : opts.arc;
    if (node.parentNode === this.layerPieces) this.layerPieces.appendChild(node);
    body.setAttribute('transform', 'translate(' + dx + ',' + dy + ')');
    var self = this;
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      var elapsed = now - t0 - delay;
      if (elapsed < 0) { raf(step); return; }
      var k = Math.min(1, elapsed / dur);
      var e = 1 - Math.pow(1 - k, 3);
      var lift = Math.sin(Math.PI * k) * arc;
      body.setAttribute('transform',
        'translate(' + (dx * (1 - e)).toFixed(2) + ',' + (dy * (1 - e) - lift).toFixed(2) + ')');
      if (opts.transparent) body.style.opacity = String(1 - 0.68 * Math.sin(Math.PI * k));
      if (k < 1) raf(step);
      else {
        body.removeAttribute('transform');
        body.style.opacity = '';
      }
    }
    raf(step);
    return delay + dur;
  };

  /* ---------------- 觉醒特效 ---------------- */

  BoardView.prototype.fxTrail = function (from, to, side, delay) {
    var color = side === 0 ? '#ff7a5c' : '#a9c4e8';
    var x0 = this.PX(XQ.colOf(from)), y0 = this.PY(XQ.rowOf(from));
    var x1 = this.PX(XQ.colOf(to)), y1 = this.PY(XQ.rowOf(to));
    for (var i = 1; i <= 3; i++) {
      var k = i / 4;
      var c = mk('circle', {
        cx: x0 + (x1 - x0) * k, cy: y0 + (y1 - y0) * k,
        r: 8 - i * 1.4, fill: color, class: 'fx-trail'
      });
      c.style.animationDelay = ((delay || 0) + i * 55) + 'ms';
      this.layerFx.appendChild(c);
      (function (el, wait) {
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, wait);
      })(c, (delay || 0) + i * 55 + 800);
    }
  };

  BoardView.prototype.fxRookShards = function (sq, side, delay) {
    var x = this.PX(XQ.colOf(sq)), y = this.PY(XQ.rowOf(sq));
    var cols = side === 0
      ? ['#f7e8c8', '#d9b26a', '#cf5a3f']
      : ['#f2ead8', '#d9b26a', '#9aa7b8'];
    var g = mk('g', {});
    g.appendChild(mk('circle', {
      cx: x, cy: y, r: 46, fill: 'none', stroke: '#ffe2ac', 'stroke-width': 3, class: 'fx-ring'
    }));
    for (var i = 0; i < 18; i++) {
      var ang = (i / 18) * Math.PI * 2 + Math.random() * 0.5;
      var dist = 30 + Math.random() * 62;
      var dx = Math.cos(ang) * dist;
      var dy = Math.sin(ang) * dist * 0.55 + 48 + Math.random() * 42;
      var wrap = mk('g', { transform: 'translate(' + x + ',' + y + ')' });
      var shard = mk('path', {
        d: 'M0 -10 L7 8 L-6 6 Z',
        fill: cols[i % cols.length], stroke: 'rgba(50,28,10,.35)', 'stroke-width': 0.8,
        class: 'fx-shard'
      });
      shard.style.setProperty('--dx', dx.toFixed(1) + 'px');
      shard.style.setProperty('--dy', dy.toFixed(1) + 'px');
      shard.style.setProperty('--rot', ((Math.random() * 720 - 360) | 0) + 'deg');
      shard.style.animationDelay = ((delay || 0) + Math.random() * 90) + 'ms';
      wrap.appendChild(shard);
      g.appendChild(wrap);
    }
    this.layerFx.appendChild(g);
    setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, (delay || 0) + 1700);
  };

  BoardView.prototype.fxHorseGhostTrail = function (from, to, side) {
    var name = NAMES[side][4];
    var x0 = this.PX(XQ.colOf(from)), y0 = this.PY(XQ.rowOf(from));
    var x1 = this.PX(XQ.colOf(to)), y1 = this.PY(XQ.rowOf(to));
    [0.28, 0.58, 0.88].forEach(function (k, i) {
      var tx = mk('text', {
        x: (x0 + (x1 - x0) * k).toFixed(1), y: (y0 + (y1 - y0) * k - 8).toFixed(1),
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'STKaiti,KaiTi,serif', 'font-size': 52, 'font-weight': 600,
        fill: '#8cffbe', opacity: 0.4, class: 'fx-ghost', filter: 'url(#fxBlur)'
      });
      tx.textContent = name;
      tx.style.animationDelay = (i * 55) + 'ms';
      this.layerFx.appendChild(tx);
      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000); })(tx);
    }, this);
  };

  BoardView.prototype.fxSpawnRook = function (sq, side) {
    var x = this.PX(XQ.colOf(sq)), y = this.PY(XQ.rowOf(sq));
    var real = this.pieceNodeAt(sq);
    if (real) real.style.opacity = '0';
    var g = mk('g', {});
    g.appendChild(mk('circle', {
      cx: x, cy: y, r: 60, fill: 'url(#goldGlow)', opacity: 0.85, class: 'fx-spawn-glow'
    }));
    var ghost = mk('text', {
      x: x, y: y + 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'STKaiti,KaiTi,serif', 'font-size': 64, 'font-weight': 600,
      fill: '#ffe2ac', class: 'fx-spawn-ghost', filter: 'url(#fxBlur)'
    });
    ghost.textContent = NAMES[side][5];
    g.appendChild(ghost);
    var cols = side === 0 ? ['#f7e8c8', '#d9b26a', '#cf5a3f'] : ['#f2ead8', '#d9b26a', '#9aa7b8'];
    for (var i = 0; i < 20; i++) {
      var ang = (i / 20) * Math.PI * 2 + 0.25;
      var rad = 58 + Math.random() * 38;
      var sx = Math.cos(ang) * rad, sy = Math.sin(ang) * rad;
      var wrap = mk('g', { transform: 'translate(' + (x + sx).toFixed(1) + ',' + (y + sy).toFixed(1) + ')' });
      var shard = mk('path', {
        d: 'M0 -7 L5.5 6 L-4.5 4 Z', fill: cols[i % cols.length], stroke: 'rgba(50,28,10,.3)', 'stroke-width': 0.7,
        class: 'fx-spawn-shard'
      });
      shard.style.setProperty('--sx', (-sx).toFixed(1) + 'px');
      shard.style.setProperty('--sy', (-sy).toFixed(1) + 'px');
      shard.style.animationDelay = (Math.random() * 140) + 'ms';
      wrap.appendChild(shard);
      g.appendChild(wrap);
    }
    g.appendChild(mk('circle', {
      cx: x, cy: y, r: 46, fill: 'none', stroke: '#ffe2ac', 'stroke-width': 3, class: 'fx-ring'
    }));
    this.layerFx.appendChild(g);
    setTimeout(function () {
      if (real) {
        real.style.transition = 'opacity .22s ease';
        real.style.opacity = '';
        setTimeout(function () { real.style.transition = ''; }, 260);
      }
    }, 520);
    setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 1400);
  };

  BoardView.prototype.fxElephantFlame = function (sq) {
    var x = this.PX(XQ.colOf(sq)), y = this.PY(XQ.rowOf(sq));
    var g = mk('g', {});
    g.appendChild(mk('circle', {
      cx: x, cy: y, r: 62, fill: 'url(#blueGlow)', class: 'fx-blue-glow'
    }));
    for (var i = -3; i <= 3; i++) {
      var sc = 0.8 + Math.random() * 0.55;
      var wrap = mk('g', { transform: 'translate(' + (x + i * 15) + ',' + (y - 16) + ') scale(' + sc.toFixed(2) + ')' });
      var flame = mk('path', {
        d: 'M0 0 C-12 -18 -7 -36 0 -54 C7 -36 12 -18 0 0 Z',
        fill: 'url(#flameGrad)', class: 'fx-flame', filter: 'url(#fxBlur)'
      });
      flame.style.animationDelay = (Math.abs(i) * 22) + 'ms';
      wrap.appendChild(flame);
      g.appendChild(wrap);
    }
    g.appendChild(mk('circle', {
      cx: x, cy: y, r: 48, fill: 'none', stroke: 'rgba(130,220,255,.95)', 'stroke-width': 3.5, class: 'fx-ring'
    }));
    this.layerFx.appendChild(g);
    setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 620);
  };

  /* ---------------- 指针 ---------------- */

  BoardView.prototype.pointerToSquare = function (evt) {
    var svg = this.svg;
    if (!svg) return -1;
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var m = svg.getScreenCTM();
    if (!m) return -1;
    var p = pt.matrixTransform(m.inverse());
    var c = this.flip ? Math.round((850 - p.x) / 100) : Math.round((p.x - 50) / 100);
    var r = this.flip ? Math.round((950 - p.y) / 100) : Math.round((p.y - 50) / 100);
    if (r < 0 || r > 9 || c < 0 || c > 8) return -1;
    // 点击点离交叉点太远则忽略
    var dx = p.x - this.PX(c), dy = p.y - this.PY(r);
    if (Math.sqrt(dx * dx + dy * dy) > 62) return -1;
    return r * 9 + c;
  };

  /* ---------------- 复盘静态渲染 ---------------- */

  function renderStatic(container, snap, mode, anim) {
    if (!container || !snap || !snap.board) return;
    var view = new BoardViewImmutable(snap, mode);
    container.innerHTML = '';
    container.appendChild(view.svg);
    view.paint(anim);
  }

  function BoardViewImmutable(snap, mode) {
    var st = {
      board: Array.prototype.slice.call(snap.board),
      turn: snap.turn || 0,
      kingOut: (snap.kingOut || [false, false]).slice(),
      rookSpawned: (snap.rookSpawned || [false, false]).slice(),
      bonus: snap.bonus || null,
      captured: [(snap.captured && snap.captured[0] ? snap.captured[0] : []).slice(),
        (snap.captured && snap.captured[1] ? snap.captured[1] : []).slice()],
      ply: snap.ply || 0,
      lastMove: snap.lastMove || null,
      mode: mode === 'classic' ? 'classic' : 'awake'
    };
    this.st = st;
    this.mode = st.mode;
    this.svg = boardBaseSvg();
    this.svg.removeAttribute('class');
    this.svg.setAttribute('class', 'rv-svg');
    this.flip = false;
    this.layerLast = mk('g', {});
    this.layerGlow = mk('g', {});
    this.layerHint = mk('g', {});
    this.layerPieces = mk('g', {});
    this.layerFx = mk('g', {});
    [this.layerLast, this.layerGlow, this.layerHint, this.layerPieces, this.layerFx].forEach(function (l) {
      this.svg.appendChild(l);
    }, this);
  }
  BoardViewImmutable.prototype.PX = function (c) { return 50 + 100 * c; };
  BoardViewImmutable.prototype.PY = function (r) { return 50 + 100 * r; };
  BoardViewImmutable.prototype.paint = function (anim) {
    var self = this, st = this.st;
    if (st.lastMove && st.lastMove.f !== undefined) {
      [st.lastMove.f, st.lastMove.t].forEach(function (sq) {
        self.layerLast.appendChild(mk('rect', {
          x: self.PX(XQ.colOf(sq)) - 42, y: self.PY(XQ.rowOf(sq)) - 42,
          width: 84, height: 84, rx: 10, class: 'last-mark'
        }));
      });
    }
    if (XQ.inCheck(st, st.turn)) {
      var k = XQ.findKing(st, st.turn);
      if (k >= 0) {
        this.layerHint.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(k)), cy: this.PY(XQ.rowOf(k)), r: 48, class: 'check-ring'
        }));
      }
    }
    if (st.mode === 'awake') {
      for (var pi = 0; pi < 90; pi++) {
        var pp = st.board[pi];
        if (!pp || (pp & 7) !== 7) continue;
        if (!isPawnPair(st, pp >> 3, pi)) continue;
        this.layerGlow.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(pi)), cy: this.PY(XQ.rowOf(pi)), r: 50,
          fill: 'url(#whiteGlow)', class: 'pawn-link-glow'
        }));
        this.layerGlow.appendChild(mk('circle', {
          cx: this.PX(XQ.colOf(pi)), cy: this.PY(XQ.rowOf(pi)), r: 43,
          fill: 'none', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1.8,
          class: 'pawn-link-glow'
        }));
      }
    }
    for (var i = 0; i < 90; i++) {
      var p = st.board[i];
      if (!p) continue;
      var side = p >> 3, t = p & 7;
      var g = mk('g', {
        class: 'piece ' + (side === 0 ? 'red' : 'black'),
        transform: 'translate(' + this.PX(XQ.colOf(i)) + ',' + this.PY(XQ.rowOf(i)) + ')'
      });
      g.setAttribute('data-sq', i);
      g.setAttribute('data-side', side);
      g.setAttribute('data-type', t);
      if (st.mode === 'awake' && awakeable(st, p, i)) g.classList.add('awakeable');
      if (st.bonus && st.bonus.sq === i) g.classList.add('pending');
      var body = mk('g', { class: 'piece-body' });
      body.appendChild(mk('ellipse', { class: 'p-shadow', cx: 0, cy: 16, rx: 34, ry: 10 }));
      body.appendChild(mk('circle', { r: 53, class: 'glow', 'stroke-dasharray': '3 6' }));
      body.appendChild(mk('circle', { r: 50, class: 'ring' }));
      var src = pieceSrc(side, t);
      var im = mk('image', { x: -48, y: -48, width: 96, height: 96, preserveAspectRatio: 'xMidYMid meet', class: 'piece-img' });
      im.setAttribute('href', src);
      im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', src);
      body.appendChild(im);
      g.appendChild(body);
      this.layerPieces.appendChild(g);
    }
    if (!anim || anim.from === undefined) return;
    var node, from, to;
    if (anim.kind === 'swap') {
      fly(this.layerPieces.querySelector('.piece[data-sq="' + anim.from + '"]'), this.PX(XQ.colOf(anim.to)), this.PY(XQ.rowOf(anim.to)), anim.to, anim.from, this);
      fly(this.layerPieces.querySelector('.piece[data-sq="' + anim.to + '"]'), this.PX(XQ.colOf(anim.from)), this.PY(XQ.rowOf(anim.from)), anim.from, anim.to, this);
    } else {
      fly(this.layerPieces.querySelector('.piece[data-sq="' + anim.to + '"]'), this.PX(XQ.colOf(anim.from)), this.PY(XQ.rowOf(anim.from)), anim.from, anim.to, this);
      (anim.extra || []).forEach(function (ex) {
        fly(self.layerPieces.querySelector('.piece[data-sq="' + ex.t + '"]'), self.PX(XQ.colOf(ex.f)), self.PY(XQ.rowOf(ex.f)), ex.f, ex.t, self);
      });
    }
  };

  function awakeable(st, p, sq) {
    if (st.mode !== 'awake') return false;
    var side = p >> 3, t = p & 7;
    var aw = XQ.awakenState(st, side);
    if (t === 5) return aw.rook;
    if (t === 3) return aw.elephant;
    if (t === 1) return aw.king;
    if (t === 7) return isPawnPair(st, side, sq);
    return false;
  }

  function fly(node, x0, y0, fromSq, toSq, self) {
    if (!node) return;
    var body = node.querySelector('.piece-body');
    if (!body) return;
    var dx = x0 - self.PX(XQ.colOf(toSq));
    var dy = y0 - self.PY(XQ.rowOf(toSq));
    if (!dx && !dy) return;
    body.setAttribute('transform', 'translate(' + dx + ',' + dy + ')');
    var t0 = null, dur = 300;
    function step(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      var lift = Math.sin(Math.PI * k) * -7;
      body.setAttribute('transform',
        'translate(' + (dx * (1 - e)).toFixed(2) + ',' + (dy * (1 - e) + lift).toFixed(2) + ')');
      if (k < 1) raf(step);
      else body.removeAttribute('transform');
    }
    raf(step);
  }

  root.DFY = root.DFY || {};
  root.DFY.Board = {
    create: function (svg) { return new BoardView(svg); },
    renderStatic: renderStatic,
    pieceSrc: pieceSrc,
    awakeable: awakeable,
    isPawnPair: isPawnPair
  };
})(window);
