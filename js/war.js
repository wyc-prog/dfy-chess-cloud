/* 与大肥鱼一起下象棋 · 战棋模式
 * 80×80 地形战棋：经典棋子、行动值、地形消耗、村庄/城池经济、士隐身/相侦测、三档 AI、沙盘、联机房间。
 * 独立于象棋对局，不依赖 AI 接口；大肥鱼在这里是对手。
 */
(function () {
  'use strict';

  var W = 80, H = 80, TILE = 64;
  var TERRAIN = {
    0: { name: '绿地', cost: { light: 1, heavy: 1 } },
    1: { name: '丘陵', cost: { light: 3, heavy: 4 } },
    2: { name: '中型山地', cost: { light: 4, heavy: 7 }, block: ['rook'] },
    3: { name: '大型山地', cost: { light: 5, heavy: null }, block: ['rook', 'horse', 'cannon'] },
    4: { name: '小森林', cost: { light: 2, heavy: 3 } },
    5: { name: '大森林', cost: { light: 3, heavy: 7 } },
    6: { name: '河流', cost: { pawn: 3, horse: 3 } },
    7: { name: '危险水域', cost: null },
    8: { name: '道路', cost: { light: .5, heavy: .5 } },
    9: { name: '村庄', cost: { light: .5, heavy: .5 }, building: 'village' },
    10: { name: '城池', cost: { light: .5, heavy: .5 }, building: 'city' }
  };
  var UNITS = {
    king: { name: '将', price: 200, hp: 7, ap: 5, range: [1, 3], dmg: 2, light: true, ability: 'gold' },
    advisor: { name: '士', price: 150, hp: 5, ap: 5, range: [1, 1], dmg: 2, light: true, ability: 'stealth' },
    elephant: { name: '相', price: 150, hp: 5, ap: 5, range: [1, 4], dmg: 1, light: true, ability: 'heal' },
    pawn: { name: '兵', price: 15, hp: 3, ap: 5, range: [1, 1], dmg: 1, light: true },
    horse: { name: '马', price: 75, hp: 4, ap: 10, range: [1, 1], dmg: 1, light: false },
    cannon: { name: '炮', price: 175, hp: 3, ap: 7, range: [5, 10], dmg: 1, light: false, bonus: ['pawn', 'elephant', 'advisor', 'king', 'horse'] },
    rook: { name: '俥', price: 125, hp: 6, ap: 9, range: [1, 2], dmg: 1, light: false },
    tower: { name: '防御塔', price: 0, hp: 8, ap: 0, range: [1, 10], dmg: 1, light: false, static: true, building: true }
  };
  Object.keys(UNITS).forEach(function (k) { UNITS[k].type = k; });
  var TYPE_ORDER = ['king', 'advisor', 'elephant', 'rook', 'horse', 'cannon', 'pawn'];
  var PIECE = {
    0: { king: '红_帥.png', advisor: '红_仕.png', elephant: '红_相.png', pawn: '红_兵.png', horse: '红_傌.png', cannon: '红_炮.png', rook: '红_俥.png' },
    1: { king: '黑_將.png', advisor: '黑_士.png', elephant: '黑_象.png', pawn: '黑_卒.png', horse: '黑_馬.png', cannon: '黑_砲.png', rook: '黑_車.png' }
  };
  var T_IMG = {
    0: '绿地.png', 1: 'hill.png', 2: 'mountain_m.png', 3: 'mountain_l.png',
    4: 'forest_s.png', 5: 'forest_l.png', 6: 'river_h.png', 7: 'water_base.png',
    8: 'road_h.png', 9: 'village.png', 10: 'city.png'
  };
  var MAPS = [
    { name: '青川原', seed: 23001 },
    { name: '赤壁渡', seed: 23002 },
    { name: '云梦泽', seed: 23003 },
    { name: '白鹿关', seed: 23004 },
    { name: '雁回谷', seed: 23005 },
    { name: '长风原', seed: 23006 }
  ];
  var CAMPS = { red: { x: 40, y: 70 }, black: { x: 40, y: 9 } };
  var FORMATION = [
    ['king', 0, 0], ['advisor', -1, -1], ['advisor', 1, -1], ['elephant', -2, -1], ['elephant', 2, -1],
    ['rook', -3, 0], ['rook', 3, 0], ['horse', -2, 1], ['horse', 2, 1],
    ['cannon', -3, 2], ['cannon', 3, 2],
    ['pawn', -4, 3], ['pawn', -2, 3], ['pawn', 0, 3], ['pawn', 2, 3], ['pawn', 4, 3]
  ];
  var SAND_KEY = 'dfy.v1.warSandbox';
  var AI_WEIGHT_KEY = 'dfy.v1.aiWeights';
  var AI_LESSON_KEY = 'dfy.v1.aiLessons';
  var AI_STRATEGY_KEY = 'dfy.v1.aiStrategyStats';
  var STRATEGY_KEYS = ['defend', 'hunt', 'capture', 'develop', 'grab', 'mass'];
  function freshWeights() {
    return { defend: 1, hunt: 1, capture: 1, develop: 1, grab: 1, mass: 1 };
  }
  function freshGameStats() {
    return [
      { defend: 0, hunt: 0, capture: 0, develop: 0, grab: 0, mass: 0 },
      { defend: 0, hunt: 0, capture: 0, develop: 0, grab: 0, mass: 0 }
    ];
  }
  function freshStrategyStats() {
    var out = {};
    STRATEGY_KEYS.forEach(function (k) { out[k] = { picks: 0, wins: 0, losses: 0 }; });
    return out;
  }
  function loadAIStrategyStats() {
    var def = freshStrategyStats();
    try {
      var v = JSON.parse(localStorage.getItem(AI_STRATEGY_KEY) || 'null');
      if (v && typeof v === 'object') STRATEGY_KEYS.forEach(function (k) {
        if (v[k]) {
          def[k].picks = Math.max(0, +v[k].picks || 0);
          def[k].wins = Math.max(0, +v[k].wins || 0);
          def[k].losses = Math.max(0, +v[k].losses || 0);
        }
      });
    } catch (e) { }
    return def;
  }
  function loadAIWeights() {
    var def = freshWeights();
    try {
      var v = JSON.parse(localStorage.getItem(AI_WEIGHT_KEY) || 'null');
      if (v && typeof v === 'object') STRATEGY_KEYS.forEach(function (k) {
        if (isFinite(+v[k])) def[k] = Math.max(0.7, Math.min(1.4, +v[k]));
      });
    } catch (e) { }
    return def;
  }
  function loadAILessons() {
    try { var v = JSON.parse(localStorage.getItem(AI_LESSON_KEY) || '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch (e) { return []; }
  }
  function saveAIState() {
    try {
      localStorage.setItem(AI_WEIGHT_KEY, JSON.stringify(S.aiWeights));
      localStorage.setItem(AI_LESSON_KEY, JSON.stringify((S.aiLessons || []).slice(-30)));
      localStorage.setItem(AI_STRATEGY_KEY, JSON.stringify(S.aiStrategy || freshStrategyStats()));
    } catch (e) { }
  }

  var IMG = {};
  var S = {
    screen: 'menu', mode: 'ai', diff: 'ultimate', mapChoice: 0, map: null,
    units: [], gold: [50, 50], turnSide: 0, round: 1, over: null,
    fx: [], sandboxName: '自由地图', customName: '',
    sbStartGold: [50, 50], sbStory: { enabled: false, title: '', text: '', image: '' }, storyOpening: null,
    sbTool: 'click', sbLibTab: 'terrain', sbBrush: null, sbRegion: null, sbUndo: [],
    sbHighlight: null, sbDevMode: false, sbDragMaterial: null, sbMarquee: null, sbPaintDown: false, sbScale: 1,
    selected: null, reach: null, attackable: [], blocked: [], threatened: null,
    path: null, hover: null, healMode: false, aiRunning: false, revealAll: false,
    pending: [], towerRange: null, inspectTower: null,
    mySide: 0, viewerSide: 0, log: [], sandbox: null, tool: { kind: 'terrain', code: 0 },
    online: null, roomCode: '', waitGuest: false,
    aiPlan: null, aiSide: 1, selfplayTraining: null, gameEpoch: 0,
    aiWeights: freshWeights(), aiLessons: [], aiStrategy: freshStrategyStats(), aiGameStats: null,
    cam: { x: 0, y: 0, tile: TILE }, camAnim: null, drag: null, click: null
  };
  var cv, ctx, stage, mini, mctx, dpr = 1;
  var raf = null, lastFrame = 0, dirty = true, lastMoveBusy = false;
  var waterPattern = null;
  var menus = {};

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function idx(x, y) { return y * W + x; }
  function inMap(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pendingBusy() { return !!(S.pending && S.pending.length); }
  function moveAnimBusy() {
    var now = performance.now();
    return !!(S.units && S.units.some(function (u) { return u.anim && now < u.anim.t0 + u.anim.dur; }));
  }
  function scheduleEffect(delay, fn) {
    if (!S.pending) S.pending = [];
    S.pending.push({ at: performance.now() + Math.max(0, delay), fn: fn });
    dirty = true;
  }
  function processPending() {
    if (!S.pending || !S.pending.length) return false;
    var now = performance.now(), due = [];
    S.pending = S.pending.filter(function (p) {
      if (p.at <= now) { due.push(p); return false; }
      return true;
    });
    if (!due.length) return false;
    due.forEach(function (p) {
      if (S.over) return;
      try { p.fn(); } catch (e) { }
    });
    dirty = true;
    refreshHud();
    return true;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function rnd(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtAp(v) { return (v % 2 === 0) ? String(v / 2) : (v / 2).toFixed(1); }
  function log(text) {
    S.log.push(text);
    if (S.log.length > 60) S.log.shift();
    var el = $('warLog');
    if (el) {
      el.innerHTML = S.log.map(function (t) { return '<p>' + t + '</p>'; }).join('');
      el.scrollTop = el.scrollHeight;
    }
  }
  function toast(text) {
    var el = $('warToast'); if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function hint(text) {
    var el = $('warHint'); if (!el) return;
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text; el.classList.add('show');
  }
  function fishLine(text) {
    var el = $('warFishLine'); if (el) el.textContent = text;
  }
  function sideName(s) { return s === 0 ? '红方' : '黑方'; }
  function sideColor(s) { return s === 0 ? 'red' : 'black'; }

  /* ---------- 图片 ---------- */
  function preload(cb) {
    var list = [];
    Object.keys(T_IMG).forEach(function (k) { list.push(['assets/war/' + T_IMG[k], T_IMG[k]]); });
    list.push(['assets/war/village.png', 'village'], ['assets/war/city.png', 'city']);
    list.push(['assets/war/water_rock.png', 'water_rock']);
    list.push(['assets/war/water_base_cropped.png', 'water_base_cropped']);
    list.push(['assets/war/water_rock_cropped.png', 'water_rock_cropped']);
    list.push(['assets/war/attack.png', 'attack'], ['assets/war/threat.png', 'threat']);
    list.push(['assets/war/slash.png', 'fx_slash'], ['assets/war/heal.png', 'fx_heal'],
      ['assets/war/cannon_fire.png', 'fx_cannon_fire'], ['assets/war/cannonball.png', 'fx_cannonball'],
      ['assets/war/fireball.png', 'fx_fireball'], ['assets/war/arrow.png', 'fx_arrow'],
      ['assets/war/tower_red.png', 'p0_tower'], ['assets/war/tower_black.png', 'p1_tower']);
    list.push(['assets/war/river_v.png', 'river_v'], ['assets/war/river_h.png', 'river_h'], ['assets/war/river_corner.png', 'river_corner'],
      ['assets/war/river_cross.png', 'river_cross'], ['assets/war/river_t.png', 'river_t'], ['assets/war/terrain_edge_n.png', 'terrain_edge_n'], ['assets/war/terrain_edge_s.png', 'terrain_edge_s'], ['assets/war/terrain_edge_e.png', 'terrain_edge_e'], ['assets/war/terrain_edge_w.png', 'terrain_edge_w'],
      ['assets/war/river_end.png', 'river_end'], ['assets/war/river_puddle.png', 'river_puddle'],
      ['assets/war/river_fill_nw.png', 'river_fill_nw'], ['assets/war/river_fill_ne.png', 'river_fill_ne'],
      ['assets/war/river_fill_sw.png', 'river_fill_sw'], ['assets/war/river_fill_se.png', 'river_fill_se'],
      ['assets/war/river_corner_down.png', 'river_corner_down'], ['assets/war/river_corner_left.png', 'river_corner_left'],
      ['assets/war/river_corner_up.png', 'river_corner_up'],
      ['assets/war/road_v.png', 'road_v'], ['assets/war/road_h.png', 'road_h'], ['assets/war/road_corner.png', 'road_corner'],
      ['assets/war/road_cross.png', 'road_cross'], ['assets/war/road_t.png', 'road_t']);
    for (var side = 0; side < 2; side++) {
      Object.keys(PIECE[side]).forEach(function (t) {
        list.push(['assets/pieces/' + PIECE[side][t], 'p' + side + '_' + t]);
      });
    }
    var left = list.length;
    list.forEach(function (it) {
      var im = new Image();
      im.onload = function () { if (--left <= 0) cb(); };
      im.onerror = function () { if (--left <= 0) cb(); };
      im.src = it[0];
      IMG[it[1]] = im;
    });
    if (!list.length) cb();
  }

  /* ---------- 地图生成 ---------- */
  function baseZone(x, y) {
    return Math.abs(x - CAMPS.red.x) <= 6 && Math.abs(y - CAMPS.red.y) <= 4 ||
      Math.abs(x - CAMPS.black.x) <= 6 && Math.abs(y - CAMPS.black.y) <= 4;
  }
  function growBlob(m, code, target, seedN, rand) {
    var n = 0, tries = 0;
    while (n < target && tries < 9000) {
      tries++;
      var cx = (rand() * W) | 0, cy = (rand() * H) | 0;
      if (baseZone(cx, cy)) continue;
      if (m.terrain[idx(cx, cy)] !== 0) continue;
      var q = [[cx, cy]], seen = {};
      seen[idx(cx, cy)] = 1;
      var cluster = 0, maxSize = 35 + ((rand() * 90) | 0);
      while (q.length && cluster < maxSize && n < target) {
        var p = q.shift(), x = p[0], y = p[1];
        if (!inMap(x, y) || m.terrain[idx(x, y)] !== 0 || baseZone(x, y)) continue;
        m.terrain[idx(x, y)] = code; n++; cluster++;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        dirs.forEach(function (d) {
          var nx = x + d[0], ny = y + d[1];
          if (inMap(nx, ny) && m.terrain[idx(nx, ny)] === 0 && !seen[idx(nx, ny)] && rand() < 0.62) {
            seen[idx(nx, ny)] = 1; q.push([nx, ny]);
          }
        });
      }
    }
    return n;
  }
  function riverPath(m, rand, horizontal) {
    var x, y, len = horizontal ? W : H;
    if (horizontal) {
      y = 16 + ((rand() * (H - 32)) | 0);
      for (x = 0; x < W; x++) {
        if (rand() < .38) y = clamp(y + (rand() < .5 ? -1 : 1), 6, H - 7);
        if (baseZone(x, y)) continue;
        m.terrain[idx(x, y)] = 6;
        if (rand() < .25 && y + 1 < H && !baseZone(x, y + 1)) m.terrain[idx(x, y + 1)] = 6;
      }
    } else {
      x = 12 + ((rand() * (W - 24)) | 0);
      for (y = 0; y < H; y++) {
        if (rand() < .38) x = clamp(x + (rand() < .5 ? -1 : 1), 6, W - 7);
        if (baseZone(x, y)) continue;
        m.terrain[idx(x, y)] = 6;
        if (rand() < .25 && x + 1 < W && !baseZone(x + 1, y)) m.terrain[idx(x + 1, y)] = 6;
      }
    }
  }
  function addRoadLine(m, horizontal, at) {
    for (var i = 2; i < (horizontal ? W : H) - 2; i++) {
      var x = horizontal ? i : at, y = horizontal ? at : i;
      if (!inMap(x, y)) continue;
      var t = m.terrain[idx(x, y)];
      if (t === 9 || t === 10) continue;
      m.terrain[idx(x, y)] = 8;
    }
  }
  function connectBuilding(m, x, y) {
    var best = null, bd = 1e9;
    for (var yy = 2; yy < H - 2; yy += 2) for (var xx = 2; xx < W - 2; xx += 2) {
      if (m.terrain[idx(xx, yy)] === 8) {
        var d = Math.abs(xx - x) + Math.abs(yy - y);
        if (d < bd && d > 0) { bd = d; best = [xx, yy]; }
      }
    }
    if (!best) return;
    var cx = x, cy = y;
    var guard = 0;
    while (cx !== best[0] && guard++ < 120) {
      cx += cx < best[0] ? 1 : -1;
      var t = m.terrain[idx(cx, cy)];
      if (t !== 9 && t !== 10) m.terrain[idx(cx, cy)] = 8;
    }
    while (cy !== best[1] && guard++ < 240) {
      cy += cy < best[1] ? 1 : -1;
      t = m.terrain[idx(cx, cy)];
      if (t !== 9 && t !== 10) m.terrain[idx(cx, cy)] = 8;
    }
  }
  function baseClear(m, side, rand) {
    var c = side === 0 ? CAMPS.red : CAMPS.black;
    for (var y = c.y - 4; y <= c.y + 4; y++) for (var x = c.x - 5; x <= c.x + 5; x++) {
      if (inMap(x, y)) {
        m.terrain[idx(x, y)] = 0;
        m.owner[idx(x, y)] = -1;
      }
    }
    m.terrain[idx(c.x, c.y)] = 10;
    m.owner[idx(c.x, c.y)] = side;
    m.acted[idx(c.x, c.y)] = 0;
  }
  function genMap(seed) {
    var rand = rnd(seed);
    var m = {
      seed: seed,
      w: W, h: H,
      terrain: new Uint8Array(W * H),
      owner: new Int8Array(W * H),
      acted: new Uint8Array(W * H),
      units: [],
      mapName: ''
    };
    for (var i = 0; i < m.owner.length; i++) m.owner[i] = -1;
    // 山地 15%：丘陵/中型/大型
    growBlob(m, 1, 330, 70, rand);
    growBlob(m, 2, 320, 60, rand);
    growBlob(m, 3, 310, 52, rand);
    // 森林 15%：小/大
    growBlob(m, 4, 470, 70, rand);
    growBlob(m, 5, 490, 55, rand);
    // 河流/水面 15%
    riverPath(m, rand, true);
    riverPath(m, rand, false);
    growBlob(m, 6, 420, 45, rand);
    growBlob(m, 7, 380, 30, rand);
    // 先定双方主城，再铺路、放建筑；每张地图独立生成，不共享地形数组
    baseClear(m, 0, rand);
    baseClear(m, 1, rand);
    // 道路主干：4 横 4 竖，跨水/山处当作桥/隧道，保证整张图道路连通
    [16, 32, 48, 64].forEach(function (at) { addRoadLine(m, true, at); addRoadLine(m, false, at); });
    // 建筑
    var built = 0, guard = 0;
    while (built < 30 && guard++ < 6000) {
      var bx = 5 + ((rand() * (W - 10)) | 0), by = 5 + ((rand() * (H - 10)) | 0);
      if (baseZone(bx, by)) continue;
      var tt = m.terrain[idx(bx, by)];
      if (tt !== 0 && tt !== 8) continue;
      var cluster = 1 + ((rand() * 4) | 0);
      for (var k = 0; k < cluster && built < 30; k++) {
        var x = bx + ((rand() * 5) | 0) - 2, y = by + ((rand() * 5) | 0) - 2;
        if (!inMap(x, y) || baseZone(x, y)) continue;
        tt = m.terrain[idx(x, y)];
        if (tt !== 0 && tt !== 8) continue;
        m.terrain[idx(x, y)] = rand() < .28 ? 10 : 9;
        m.owner[idx(x, y)] = -1;
        built++;
      }
    }
    // 所有建筑（含主城）都必须接入道路
    for (var bi = 0; bi < m.terrain.length; bi++) {
      if (m.terrain[bi] === 9 || m.terrain[bi] === 10) connectBuilding(m, bi % W, (bi / W) | 0);
    }
    // 比例补齐（只补草地，不覆盖建筑/道路）
    var mt = 0, ft = 0, wt = 0;
    for (var ci = 0; ci < m.terrain.length; ci++) {
      var ct = m.terrain[ci];
      if (ct === 1 || ct === 2 || ct === 3) mt++;
      else if (ct === 4 || ct === 5) ft++;
      else if (ct === 6 || ct === 7) wt++;
    }
    if (mt < 960) growBlob(m, 1, 960 - mt, 30, rand);
    if (ft < 960) growBlob(m, 4, 960 - ft, 30, rand);
    if (wt < 960) growBlob(m, 6, 960 - wt, 24, rand);
    return m;
  }
  function mapCounts(m) {
    var c = {};
    for (var i = 0; i < m.terrain.length; i++) c[m.terrain[i]] = (c[m.terrain[i]] || 0) + 1;
    return c;
  }

  /* ---------- 单位 ---------- */
  function makeUnit(side, type, x, y) {
    var d = UNITS[type];
    return {
      id: 'u' + (makeUnit._n = (makeUnit._n || 0) + 1),
      side: side, type: type, x: x, y: y,
      hp: d.hp, hpMax: d.hp, ap: d.ap * 2, apMax: d.ap * 2, apBonus: 0,
      acted: false, stealth: false, idle: -1, didOperate: false, detectedBy: [false, false],
      postMove: false, alive: true, dev: null, devHidden: false
    };
  }
  function unitAt(x, y, ignoreHiddenFor) {
    for (var i = 0; i < S.units.length; i++) {
      var u = S.units[i];
      if (u.alive && u.x === x && u.y === y) {
        if (ignoreHiddenFor != null && u.stealth && u.side !== ignoreHiddenFor && !u.detectedBy[ignoreHiddenFor]) continue;
        return u;
      }
    }
    return null;
  }
  function rawUnitAt(x, y) {
    for (var i = 0; i < S.units.length; i++) {
      var u = S.units[i];
      if (u.alive && !u.devHidden && u.x === x && u.y === y) return u;
    }
    return null;
  }
  function unitVisible(u, viewer) {
    if (!u || !u.alive || u.devHidden) return false;
    if (S.revealAll || u.side === viewer) return true;
    if (u.stealth && !u.detectedBy[viewer]) return false;
    return true;
  }
  function findFreeCell(m, side, type, px, py, used) {
    var d = UNITS[type];
    for (var r = 0; r < 10; r++) {
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        var x = px + dx, y = py + dy;
        if (!inMap(x, y)) continue;
        if (!baseZone(x, y) && (x < 3 || y < 3 || x > W - 4 || y > H - 4)) continue;
        if (used[x + ',' + y]) continue;
        if (m.units.some(function (u) { return u.x === x && u.y === y; })) continue;
        var t = m.terrain[idx(x, y)];
        if (!passableTerrain(d, t)) continue;
        used[x + ',' + y] = 1;
        return [x, y];
      }
    }
    return [px, py];
  }
  function placeArmy(m, side) {
    var base = side === 0 ? CAMPS.red : CAMPS.black;
    var used = {};
    FORMATION.forEach(function (f) {
      var type = f[0], dx = f[1], dy = side === 0 ? f[2] : -f[2];
      var px = base.x + dx, py = base.y + dy;
      var xy = findFreeCell(m, side, type, px, py, used);
      if (!xy) return;
      var u = makeUnit(side, type, xy[0], xy[1]);
      m.units.push(u);
    });
  }
  function placeDefenseTower(m, side) {
    var base = side === 0 ? CAMPS.red : CAMPS.black;
    var xy = findFreeCell(m, side, 'tower', base.x + (side === 0 ? -5 : 5), base.y + (side === 0 ? -2 : 2), {});
    if (!xy || !inMap(xy[0], xy[1])) return;
    if (m.units.some(function (u) { return u.x === xy[0] && u.y === xy[1]; })) return;
    if (!passableTerrain(UNITS.tower, m.terrain[idx(xy[0], xy[1])])) return;
    m.units.push(makeUnit(side, 'tower', xy[0], xy[1]));
  }
  function newBattle(seed, mode) {
    var m = genMap(seed);
    placeArmy(m, 0);
    placeArmy(m, 1);
    placeDefenseTower(m, 0); placeDefenseTower(m, 1);
    S.map = m;
    S.units = m.units;
    S.gold = [50, 50];
    S.turnSide = 0;
    S.round = 1;
    S.over = null;
    S.fx = []; S.pending = [];
    S.log = [];
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null;
    S.path = null; S.healMode = false; S.aiRunning = false;
    S.revealAll = false;
    S.viewerSide = S.mySide;
    S.cam.tile = TILE;
    focusCell(CAMPS[sideColor(S.mySide) === 'red' ? 'red' : 'black'].x, CAMPS[sideColor(S.mySide) === 'red' ? 'red' : 'black'].y);
    beginTurn(0);
  }

  /* ---------- 地形/移动 ---------- */
  function passableTerrain(d, t) {
    if (t === 6) return d.type === 'pawn' || d.type === 'horse';
    var def = TERRAIN[t];
    if (!def || !def.cost) return false;
    if (def.block && def.block.indexOf(d.type) >= 0) return false;
    var c = def.cost[d.light ? 'light' : 'heavy'];
    return c != null;
  }
  function cost2(d, t) {
    if (t === 6) return (d.type === 'pawn' || d.type === 'horse') ? 6 : null;
    var def = TERRAIN[t];
    if (!def || !def.cost) return null;
    if (def.block && def.block.indexOf(d.type) >= 0) return null;
    var c = def.cost[d.light ? 'light' : 'heavy'];
    if (c == null) return null;
    return Math.round(c * 2);
  }
  function cellCostTo(u, x, y) {
    return cost2(UNITS[u.type], S.map.terrain[idx(x, y)]);
  }
  function computeReach(u, blockHidden) {
    var n = W * H;
    var dist = new Int16Array(n); dist.fill(32767);
    var prev = new Int16Array(n); prev.fill(-1);
    var start = idx(u.x, u.y);
    dist[start] = 0;
    var heap = [[0, start]];
    function push(c, i) { heap.push([c, i]); }
    function pop() {
      var best = 0;
      for (var i = 1; i < heap.length; i++) if (heap[i][0] < heap[best][0]) best = i;
      var v = heap[best]; heap[best] = heap[heap.length - 1]; heap.pop(); return v;
    }
    while (heap.length) {
      var cur = pop(), c = cur[0], id = cur[1];
      if (c > dist[id]) continue;
      var x = id % W, y = (id / W) | 0;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = x + dirs[k][0], ny = y + dirs[k][1];
        if (!inMap(nx, ny)) continue;
        var occ = blockHidden ? rawUnitAt(nx, ny) : unitAt(nx, ny, u.side);
        if (occ) continue;
        var cost = cellCostTo(u, nx, ny);
        if (cost == null) continue;
        var nid = idx(nx, ny);
        if (dist[id] + cost > u.ap) continue;
        if (dist[id] + cost < dist[nid]) {
          dist[nid] = dist[id] + cost; prev[nid] = id; push(dist[nid], nid);
        }
      }
    }
    return { dist: dist, prev: prev };
  }
  function pathTo(reach, x, y) {
    var id = idx(x, y);
    if (reach.dist[id] === 32767) return null;
    var out = [];
    while (id >= 0) { out.push([id % W, (id / W) | 0]); id = reach.prev[id]; }
    out.reverse();
    return out;
  }
  function moveUnit(u, path) {
    if (!path || path.length < 2) return false;
    var spent = 0, last = path[0];
    var steps = [];
    var intercepted = false;
    for (var i = 1; i < path.length; i++) {
      var x = path[i][0], y = path[i][1];
      var occ = rawUnitAt(x, y);
      if (occ && occ.side !== u.side && occ.stealth && !occ.detectedBy[u.side]) {
        // 隐身士不挡路：走到前一格停下，士立即现身并反击
        stealthIntercept(occ, u);
        u.acted = true; u.postMove = false;
        intercepted = true;
        break;
      }
      if (occ) break;
      var c = cellCostTo(u, x, y);
      if (c == null || spent + c > u.ap) break;
      spent += c; last = [x, y]; steps.push([x, y]);
    }
    if (!steps.length) return false;
    var oldX = u.x, oldY = u.y;
    u.anim = S.battleMode === 'selfplay' ? null : { path: [[oldX, oldY]].concat(steps), t0: performance.now(), dur: Math.min(560, 180 + steps.length * 70) };
    u.x = last[0]; u.y = last[1]; u.ap -= spent; u.didOperate = true;
    if (u.type === 'advisor') u.stealth = true;
    if (u.type === 'elephant') u.idle = 0;
    u.postMove = false;
    elephantReveal();
    if (!intercepted && canPostMove(u.type)) {
      var after = attackTargets(u);
      if (after.length) { u.postMove = true; u.acted = false; }
      else u.acted = true;
    } else {
      u.acted = true;
    }
    if (u.type === 'advisor' && u.stealth && !intercepted) log('士隐身了，无法得知动向。');
    else log(sideName(u.side) + ' ' + UNITS[u.type].name + ' 移动到 (' + u.x + ',' + u.y + ')');
    dirty = true;
    return true;
  }
  function canPostMove(type) {
    return type === 'king' || type === 'advisor' || type === 'pawn' || type === 'horse' || type === 'rook';
  }

  /* ---------- 攻击/治疗 ---------- */
  function attackDamage(u, t) {
    var d = UNITS[u.type].dmg;
    if (u.type === 'cannon' && UNITS[u.type].bonus.indexOf(t.type) >= 0) d += 1;
    return d;
  }
  function cannonAuraProtects(t) {
    if (!t || t.type === 'elephant' || t.type === 'tower') return false;
    return S.units.some(function (e) {
      return e.alive && !e.devHidden && e.side === t.side && e.type === 'elephant' && e !== t &&
        dist(e, t) >= 1 && dist(e, t) <= 5;
    });
  }
  function canAttack(u, t) {
    if (!u || !t || !u.alive || !t.alive || u.side === t.side) return false;
    if (!unitVisible(t, u.side)) return false;
    var d = dist(u, t), r = UNITS[u.type].range;
    // 攻击范围只由单位数据决定，不读取 AP/行动值
    if (r[0] === 1 && r[1] === 1) {
      // 1 格攻击 = 周围 8 格（斜向也能砍到），不是只算上下左右
      if (Math.max(Math.abs(u.x - t.x), Math.abs(u.y - t.y)) !== 1) return false;
    } else if (d < r[0] || d > r[1]) return false;
    // 相自身可以被炮击中；相周围 1-5 格内的己方其他棋子不会被炮击中
    if (u.type === 'cannon' && cannonAuraProtects(t)) return false;
    return true;
  }
  function attackTargets(u) {
    var out = [];
    S.units.forEach(function (t) {
      if (canAttack(u, t)) out.push(t);
    });
    return out;
  }
  function damageUnit(t, d, by) {
    t.hp -= d;
    if (t.hp <= 0) {
      t.hp = 0; t.alive = false;
      if (t === S.inspectTower) {
        S.towerRange = null; S.inspectTower = null;
        if ($('warUnit')) refreshUnit();
      }
      log(sideName(by.side) + ' ' + UNITS[by.type].name + ' 击败了 ' + sideName(t.side) + ' ' + UNITS[t.type].name);
      if (t.type === 'king') fishLine('（手一抖）将倒了……可只要城池还在，这局就没完。');
    } else {
      log(sideName(by.side) + ' ' + UNITS[by.type].name + ' 攻击 ' + sideName(t.side) + ' ' + UNITS[t.type].name + '，造成 ' + d + ' 伤害');
    }
  }
  function doAttack(u, t) {
    if (!canAttack(u, t) || u.acted) return false;
    // 行棋动画没结束时先排队，行棋动画结束再开始攻击动画
    if (u.anim && performance.now() < u.anim.t0 + u.anim.dur) {
      if (!u._attackQueued) {
        u._attackQueued = true;
        var remain = Math.max(0, u.anim.t0 + u.anim.dur - performance.now());
        scheduleEffect(remain, function () {
          u._attackQueued = false;
          if (S.over || !u.alive || !t.alive) return;
          if (u.anim) u.anim = null;
          doAttack(u, t);
        });
        refreshHud(); render();
        toast('行棋动画结束后攻击');
      }
      return true;
    }
    var wasStealth = u.type === 'advisor' && u.stealth;
    u.acted = true;
    u.postMove = false;
    if (u.stealth) u.stealth = false;
    u.idle = 0;
    u.didOperate = true;
    if (wasStealth) log(sideName(u.side) + ' 士 现身，破除隐身，恢复通报');
    var dmg = attackDamage(u, t);
    var hitDelay = attackFx(u, t);
    clearSelection();
    refreshHud();
    render();
    scheduleEffect(hitDelay, function () {
      if (S.over || !u.alive || !t.alive) return;
      damageUnit(t, dmg, u);
      refreshHud();
      checkOver();
      if (S.battleMode === 'online' && S.online && S.online.role === 'host') broadcastState();
      render();
    });
    return true;
  }
  function stealthIntercept(advisor, mover) {
    advisor.stealth = false;
    log('士 现身截停了 ' + sideName(mover.side) + ' ' + UNITS[mover.type].name + '，并反击');
    var hitDelay = attackFx(advisor, mover);
    refreshHud();
    render();
    scheduleEffect(hitDelay, function () {
      if (S.over || !mover.alive) return;
      damageUnit(mover, UNITS.advisor.dmg, advisor);
      refreshHud();
      checkOver();
      if (S.battleMode === 'online' && S.online && S.online.role === 'host') broadcastState();
      render();
    });
  }
  function elephantReveal() {
    S.units.forEach(function (e) {
      if (!e.alive || e.devHidden || e.type !== 'elephant') return;
      S.units.forEach(function (t) {
        if (!t.alive || t.devHidden || t.type !== 'advisor' || t.side === e.side || !t.stealth) return;
        var d = dist(e, t);
        if (d >= 1 && d <= 5) {
          t.stealth = false;
          t.detectedBy[e.side] = true;
          log(sideName(e.side) + ' 相 自动侦测到 ' + sideName(t.side) + ' 士，破除隐身');
        }
      });
    });
  }
  function addFx(fx) {
    if (!S.fx) S.fx = [];
    fx.t0 = fx.t0 || performance.now();
    S.fx.push(fx);
    if (S.fx.length > 60) S.fx.shift();
    dirty = true;
  }
  function projDur(d, type) {
    // 距离越远飞行越久；a=2 作为固定距离系数，避免远距离瞬间命中
    var base = type === 'cannon' ? 150 : 170;
    var per = type === 'cannon' ? 28 : 36;
    return clamp(base + d * per, 180, 720);
  }
  function towerArrowDur(d) {
    // 用户规则：速度 = (1/3)·d·a，a=2；按该速度飞行时间约为 1.5 秒
    return 1500;
  }
  function defenseTowersAct() {
    if (S.battleMode === 'sandbox' || !S.map) return;
    var range = UNITS.tower.range;
    S.units.forEach(function (tw) {
      if (S.over || !tw.alive || tw.devHidden || tw.type !== 'tower') return;
      if (tw._firedRound === S.round) return;
      var best = null, bd = Infinity;
      S.units.forEach(function (t) {
        if (!t.alive || t.devHidden || t.side === tw.side || t.type === 'tower') return;
        if (!unitVisible(t, tw.side)) return;
        var d = Math.hypot(t.x - tw.x, t.y - tw.y);
        if (d < range[0] || d > range[1]) return;
        if (cannonAuraProtects(t)) return;
        if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && t.id < best.id)) {
          best = t; bd = d;
        }
      });
      if (!best) return;
      tw._firedRound = S.round;
      tw.acted = true; tw.didOperate = true; tw.idle = 0;
      var hitDelay = attackFx(tw, best);
      refreshHud();
      scheduleEffect(hitDelay, function () {
        if (S.over || !best.alive) return;
        damageUnit(best, UNITS.tower.dmg, tw);
        log(sideName(tw.side) + ' 防御塔向 ' + sideName(best.side) + ' ' + UNITS[best.type].name + ' 射箭，造成 1 点伤害');
        refreshHud();
        checkOver();
        if (S.battleMode === 'online' && S.online && S.online.role === 'host') broadcastState();
        render();
      });
    });
  }
  function attackFx(u, t) {
    if (S.battleMode === 'selfplay') return 0;
    var now = performance.now(), d = dist(u, t);
    if (u.type === 'tower') {
      var tdur = towerArrowDur(d);
      addFx({ type: 'arrow', x1: u.x, y1: u.y, x2: t.x, y2: t.y, side: u.side, t0: now, dur: tdur, arc: 0 });
      return tdur;
    }
    if (u.type === 'cannon') {
      var cdur = projDur(d, 'cannon');
      addFx({ type: 'cannon_fire', x1: u.x, y1: u.y, x2: t.x, y2: t.y, side: u.side, t0: now, dur: 100 });
      addFx({
        type: 'cannonball', x1: u.x, y1: u.y, x2: t.x, y2: t.y, side: u.side,
        t0: now + 100, dur: cdur, arc: Math.min(3, 0.8 + d * .16)
      });
      return 100 + cdur;
    }
    var type = 'slash';
    if (u.type === 'king') type = (Math.abs(t.x - u.x) <= 1 && Math.abs(t.y - u.y) <= 1) ? 'slash' : 'arrow';
    else if (u.type === 'horse') type = 'impact';
    else if (u.type === 'elephant') type = 'fireball';
    var fdur = type === 'slash' ? 100 : (type === 'impact' ? 300 : projDur(d, type));
    addFx({
      type: type, x1: u.x, y1: u.y, x2: t.x, y2: t.y, side: u.side,
      t0: now, dur: fdur,
      arc: Math.min(2.6, 0.6 + d * .2)
    });
    return fdur;
  }
  function healTargets(u) {
    var out = [];
    S.units.forEach(function (t) {
      if (t.side === u.side && t.alive && !t.devHidden && t.type !== 'tower' && t.hp < t.hpMax && dist(u, t) >= 1 && dist(u, t) <= 4) out.push(t);
    });
    return out;
  }
  function doHeal(u, t) {
    if (u.type !== 'elephant' || u.acted || u.postMove || !t || t.side !== u.side || t.devHidden || t.type === 'tower') return false;
    if (dist(u, t) < 1 || dist(u, t) > 4 || t.hp >= t.hpMax) return false;
    u.acted = true; u.idle = 0; u.didOperate = true;
    var dur = projDur(dist(u, t), 'heal');
    addFx({ type: 'heal', x1: u.x, y1: u.y, x2: t.x, y2: t.y, side: u.side, t0: performance.now(), dur: dur, arc: Math.min(2.6, .6 + dist(u, t) * .2) });
    clearSelection(); refreshHud(); render();
    scheduleEffect(dur, function () {
      if (S.over || !t.alive || t.hp >= t.hpMax) return;
      var h = Math.min(2, t.hpMax - t.hp);
      t.hp += h;
      log('相 为 ' + sideName(t.side) + ' ' + UNITS[t.type].name + ' 治疗 ' + h + ' 点');
      refreshHud(); render();
      if (S.battleMode === 'online' && S.online && S.online.role === 'host') broadcastState();
    });
    return true;
  }
  function kingGold(u) {
    if (u.type !== 'king' || u.acted || u.postMove) return false;
    u.acted = true; u.idle = 0; u.didOperate = true;
    S.gold[u.side] += 20;
    log(sideName(u.side) + ' 将 收取 20 金币');
    clearSelection(); refreshHud(); render(); return true;
  }

  /* ---------- 建筑 ---------- */
  function buildingAt(x, y) {
    if (!inMap(x, y)) return null;
    var t = S.map.terrain[idx(x, y)];
    if (t !== 9 && t !== 10) return null;
    return { x: x, y: y, kind: t === 9 ? 'village' : 'city', owner: S.map.owner[idx(x, y)], acted: !!S.map.acted[idx(x, y)] };
  }
  function canOccupy(u, b) {
    if (!u || !b || u.acted || u.postMove || b.owner === u.side) return false;
    if (b.kind === 'village') return true; // 村庄：任何棋子都能占领
    return ['king', 'advisor', 'elephant', 'pawn'].indexOf(u.type) >= 0; // 城池：将/士/相/兵
  }
  function occupy(u) {
    var b = buildingAt(u.x, u.y);
    if (!canOccupy(u, b)) return false;
    S.map.owner[idx(u.x, u.y)] = u.side;
    S.map.acted[idx(u.x, u.y)] = 1;
    u.acted = true; u.idle = 0; u.didOperate = true;
    log(sideName(u.side) + ' 占领了' + (b.kind === 'city' ? '城池' : '村庄') + ' (' + u.x + ',' + u.y + ')');
    checkOver();
    clearSelection(); refreshHud(); render();
    return true;
  }
  function collectBuilding(x, y) {
    var b = buildingAt(x, y);
    if (!b || b.owner === -1 || b.owner !== S.turnSide || b.acted) return false;
    S.map.acted[idx(x, y)] = 1;
    S.gold[b.owner] += 15;
    log(sideName(b.owner) + ' ' + (b.kind === 'city' ? '城池' : '村庄') + ' 收取 15 金币');
    refreshHud(); render(); return true;
  }
  function allowedProduce(kind) {
    return kind === 'village' ? ['pawn', 'advisor', 'elephant'] : ['pawn', 'advisor', 'elephant', 'rook', 'horse', 'cannon', 'king'];
  }
  function pxCountSide(side, type) {
    var n = 0;
    S.units.forEach(function (u) { if (u.alive && u.side === side && u.type === type) n++; });
    return n;
  }
  function priceOf(type, side) {
    if (type === 'pawn') return 15 + 20 * pxCountSide(side, 'pawn');
    var base = UNITS[type] ? UNITS[type].price : 0;
    if (!base) return 0;
    return base + 10 * pxCountSide(side, type);
  }
  function produce(x, y, type) {
    var b = buildingAt(x, y);
    if (!b || b.owner !== S.turnSide || b.acted) return false;
    if (rawUnitAt(x, y)) return false;
    if (allowedProduce(b.kind).indexOf(type) < 0) return false;
    var price = priceOf(type, b.owner);
    if (S.gold[b.owner] < price) return false;
    S.gold[b.owner] -= price;
    S.map.acted[idx(x, y)] = 1;
    var u = makeUnit(b.owner, type, x, y);
    u.acted = true;
    S.units.push(u);
    elephantReveal();
    log(sideName(b.owner) + ' 在' + (b.kind === 'city' ? '城池' : '村庄') + '生产 ' + UNITS[type].name + '（' + price + '金）');
    refreshHud(); render(); return true;
  }

  /* ---------- 回合 ---------- */
  function resetBuildings(side) {
    for (var i = 0; i < S.map.terrain.length; i++) {
      if (S.map.terrain[i] === 9 || S.map.terrain[i] === 10) {
        if (S.map.owner[i] === side) S.map.acted[i] = 0;
      }
    }
  }
  function beginTurn(side) {
    if (S.over) return;
    S.turnSide = side;
    if (S.battleMode === 'hotseat') S.viewerSide = side;
    else if (S.battleMode === 'ai') S.viewerSide = 0;
    else if (S.battleMode === 'online') S.viewerSide = S.mySide;
    applyDevSchedule();
    // 相：被动自动侦测，不再要求闲置一回合
    S.units.forEach(function (u) {
      if (u.side === side && u.alive) {
        var operated = !!u.didOperate || !!u.acted;
        if (u.type === 'rook') {
          if (u.idle == null || u.idle < 0) { u.idle = 0; u.apBonus = 0; }
          else if (operated) { u.idle = 0; u.apBonus = 0; }
          else { u.idle++; u.apBonus = (u.apBonus || 0) + 2; }
        } else {
          u.idle = 0;
          u.apBonus = 0;
        }
        u.didOperate = false;
        u.acted = false; u.postMove = false;
        u.ap = u.apMax + (u.apBonus || 0);
      }
    });
    S.units.forEach(function (t) { if (t.side !== side) t.detectedBy[side] = false; });
    resetBuildings(side);
    elephantReveal();
    if (side === 0 && S.battleMode !== 'sandbox') defenseTowersAct();
    clearSelection();
    refreshHud();
    render();
    if (S.battleMode === 'ai' && side === 1) setTimeout(runAI, 450);
    else if (S.battleMode === 'selfplay') setTimeout(function () { runAI(side); }, 120);
    else if (S.battleMode === 'hotseat') {
      var hk = S.customName ? S.units.filter(function (u) { return u.side === side && u.type === 'king' && u.alive; })[0] : null;
      if (hk) cameraToCell(hk.x, hk.y, true);
      else cameraToCell((side === 0 ? CAMPS.red : CAMPS.black).x, (side === 0 ? CAMPS.red : CAMPS.black).y, true);
    }
  }
  function endTurn(force) {
    if (S.over || S.aiRunning || S.screen !== 'game') return;
    if (S.battleMode === 'selfplay') return;
    if ((pendingBusy() || moveAnimBusy()) && !force) { toast('等当前动画结束'); return; }
    if (S.battleMode === 'ai' && S.turnSide === 1 && !force) return;
    if (S.battleMode === 'online' && S.mySide !== S.turnSide && !force) return;
    if (S.battleMode === 'online' && S.online && S.online.role === 'guest' && !force) {
      sendOnlineAction({ type: 'end' });
      return;
    }
    var next = 1 - S.turnSide;
    if (S.turnSide === 1) S.round++;
    log('—— ' + sideName(S.turnSide) + '结束回合 ——');
    beginTurn(next);
    if (S.battleMode === 'online' && S.online && S.online.role === 'host') broadcastState();
  }
  function devActive(u, round) {
    var a = u.dev && u.dev.appear ? +u.dev.appear : 1;
    var d = u.dev && u.dev.disappear ? +u.dev.disappear : Infinity;
    return round >= a && round < d;
  }
  function visibleUnitAt(x, y) {
    for (var i = 0; i < S.units.length; i++) {
      var u = S.units[i];
      if (u.alive && !u.devHidden && u.x === x && u.y === y) return u;
    }
    return null;
  }
  function findDevFreeCell(u) {
    for (var r = 0; r < 12; r++) {
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        var x = u.x + dx, y = u.y + dy;
        if (!inMap(x, y) || visibleUnitAt(x, y)) continue;
        if (!passableTerrain(UNITS[u.type], S.map.terrain[idx(x, y)])) continue;
        return [x, y];
      }
    }
    return null;
  }
  function applyDevSchedule() {
    S.units.forEach(function (u) {
      if (!u.alive) return;
      if (!u.dev) { u.devHidden = false; return; }
      var active = devActive(u, S.round);
      if (!active) { u.devHidden = true; return; }
      if (!u.devHidden) return;
      if (!visibleUnitAt(u.x, u.y)) { u.devHidden = false; return; }
      var xy = findDevFreeCell(u);
      if (xy) { u.x = xy[0]; u.y = xy[1]; u.devHidden = false; }
    });
  }
  function checkOver() {
    if (S.over) return true;
    var k0 = false, k1 = false, c0 = 0, c1 = 0;
    S.units.forEach(function (u) {
      if (!u.alive || u.devHidden || u.type !== 'king') return;
      if (u.side === 0) k0 = true;
      else k1 = true;
    });
    for (var i = 0; i < S.map.terrain.length; i++) {
      if (S.map.terrain[i] !== 10) continue; // 只算城池，不算村庄
      if (S.map.owner[i] === 0) c0++;
      else if (S.map.owner[i] === 1) c1++;
    }
    var d0 = !k0 && c0 === 0, d1 = !k1 && c1 === 0;
    if (d0 && d1) { finish(-1, '双方都没有将和城池'); return true; }
    if (d0) { finish(1, '红方没有将和城池'); return true; }
    if (d1) { finish(0, '黑方没有将和城池'); return true; }
    return false;
  }
  function goldSources(side) {
    var king = false, buildings = 0;
    S.units.forEach(function (u) {
      if (u.alive && !u.devHidden && u.side === side && u.type === 'king') king = true;
    });
    for (var i = 0; i < S.map.terrain.length; i++) {
      var t = S.map.terrain[i];
      if ((t === 9 || t === 10) && S.map.owner[i] === side) buildings++;
    }
    return { king: king, buildings: buildings, can: king || buildings > 0 };
  }
  function learnFromGame(winner, why) {
    if (winner < 0 || S.diff !== 'super') return;
    var training = S.battleMode === 'selfplay' && !!S.selfplayTraining;
    var normalAI = S.battleMode === 'ai';
    if (!training && !normalAI) return;
    var loser = 1 - winner;
    var cause = [];
    function kingAlive(side) {
      return S.units.some(function (u) { return u.alive && u.side === side && u.type === 'king'; });
    }
    function cityCount(side) {
      var n = 0;
      for (var i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === 10 && S.map.owner[i] === side) n++;
      return n;
    }
    var loserIsAI = training || (normalAI && winner === 0);
    var loserKing = kingAlive(loser), loserCities = cityCount(loser);
    if (loserIsAI) {
      if (!loserKing) cause.push('主将被击杀');
      if (loserCities === 0) cause.push('城池全失');
      if ((S.gold[winner] || 0) - (S.gold[loser] || 0) > 120) cause.push('经济落后');
      if (!cause.length) cause.push(why || '战线被压穿');
    } else {
      cause.push('恶梦取胜');
    }
    var stats = S.aiGameStats || [{}, {}];
    var ws = stats[winner] || {}, ls = stats[loser] || {};
    var allKeys = STRATEGY_KEYS;
    var winBest = 'develop', loseBest = 'develop';
    allKeys.forEach(function (k) {
      if ((ws[k] || 0) > (ws[winBest] || 0)) winBest = k;
      if ((ls[k] || 0) > (ls[loseBest] || 0)) loseBest = k;
    });
    var w = S.aiWeights || freshWeights();
    var delta = { defend: 0, hunt: 0, capture: 0, develop: 0, grab: 0, mass: 0 };
    if (loserIsAI) {
      if (!loserKing) delta.defend += 0.018;
      if (loserCities === 0) { delta.defend += 0.022; delta.capture += 0.01; delta.grab += 0.006; }
      if (cause.indexOf('经济落后') >= 0) { delta.develop += 0.02; delta.grab += 0.008; }
    }
    var totalW = 0, totalL = 0;
    allKeys.forEach(function (k) { totalW += ws[k] || 0; totalL += ls[k] || 0; });
    allKeys.forEach(function (k) {
      if (training) {
        var total = (ws[k] || 0) + (ls[k] || 0);
        if (total > 0) delta[k] += ((ws[k] || 0) - (ls[k] || 0)) / total * 0.018;
      } else if (normalAI) {
        var aw = stats[1] ? (stats[1][k] || 0) : 0;
        var at = 0; allKeys.forEach(function (x) { at += stats[1] ? (stats[1][x] || 0) : 0; });
        if (at > 0) delta[k] += (aw / at) * (winner === 1 ? 0.02 : -0.02);
      }
      w[k] = Math.max(0.7, Math.min(1.4, (w[k] || 1) + delta[k]));
    });
    S.aiWeights = w;
    // 策略统计：把胜方/败方的使用差记为一次策略得失
    if (!S.aiStrategy) S.aiStrategy = freshStrategyStats();
    allKeys.forEach(function (k) {
      var st = S.aiStrategy[k];
      if (!st) return;
      if (training) {
        if ((ws[k] || 0) > (ls[k] || 0)) st.wins++;
        else if ((ws[k] || 0) < (ls[k] || 0)) st.losses++;
      } else if (normalAI && stats[1]) {
        if (winner === 1) st.wins += stats[1][k] || 0;
        else st.losses += stats[1][k] || 0;
      }
    });
    S.aiLessons = (S.aiLessons || []).concat([{
      at: Date.now(), winner: winner, loser: loser, why: why,
      cause: cause, winnerStrategy: winBest, loserStrategy: loseBest,
      weights: {
        defend: +w.defend.toFixed(3), hunt: +w.hunt.toFixed(3), capture: +w.capture.toFixed(3),
        develop: +w.develop.toFixed(3), grab: +w.grab.toFixed(3), mass: +w.mass.toFixed(3)
      }
    }]).slice(-30);
    saveAIState();
  }
  function finish(winner, why) {
    S.over = { winner: winner, why: why };
    S.selected = null; S.reach = null; S.attackable = [];
    log(winner === -1 ? '对局结束：平局（' + why + '）' : '对局结束：' + sideName(winner) + '胜（' + why + '）');
    if (winner === -1) fishLine('（看看两边空空的将位和城池）都没了……这局算平。');
    else fishLine(winner === S.mySide ? '这局你赢了……我记住你的走法了。' : '（轻轻敲了敲棋盘）这局我拿下啦。');
    if (S.battleMode === 'selfplay' && S.selfplayTraining) {
      learnFromGame(winner, why);
      S.selfplayTraining.results.push(winner);
      S.selfplayTraining.left--;
      if (S.selfplayTraining.left > 0) {
        setTimeout(startSelfPlayRound, 500);
      } else {
        setTimeout(showTrainingSummary, 400);
      }
      return;
    }
    if (S.battleMode === 'ai' && S.diff === 'super') learnFromGame(winner, why);
    showOver(winner, why);
  }

  /* ---------- 选择/操作 ---------- */
  function clearSelection() {
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null;
    S.path = null; S.healMode = false;
    S.towerRange = null; S.inspectTower = null;
    if ($('warUnit')) refreshUnit();
  }
  function selectUnit(u) {
    if (!u || !u.alive || u.side !== S.turnSide) return;
    if (UNITS[u.type] && UNITS[u.type].static) {
      toast('防御塔：8点血，无法移动/指挥；每回合自动射箭');
      return;
    }
    if (S.battleMode === 'online' && u.side !== S.mySide) return;
    if (u.acted) { toast('这枚棋子本回合已经行动过了'); return; }
    S.selected = u; S.healMode = false; S.path = null;
    if (u.postMove) {
      S.reach = null;
      S.attackable = attackTargets(u);
      S.blocked = [];
      S.threatened = computeThreatened(u);
      refreshUnit(); render();
      if (!S.attackable.length) toast('已经移动过，这个位置没有可攻击目标；点空处结束行动');
      return;
    }
    S.reach = computeReach(u);
    S.attackable = attackTargets(u);
    S.blocked = computeBlocked(u);
    S.threatened = computeThreatened(u);
    refreshUnit();
    render();
  }
  function inspectTower(u) {
    if (!u || !u.alive || u.type !== 'tower') return;
    clearSelection();
    S.towerRange = { x: u.x, y: u.y, side: u.side, r0: UNITS.tower.range[0], r1: UNITS.tower.range[1] };
    S.inspectTower = u;
    var el = $('warUnit');
    if (el) {
      var img = u.side === 0 ? 'assets/war/tower_red.png' : 'assets/war/tower_black.png';
      el.innerHTML = '<div class="war-unit-head"><img src="' + img + '" alt="" />' +
        '<div><div class="war-unit-name">' + sideName(u.side) + ' · 防御塔</div>' +
        '<div class="tiny">建筑 · 无法移动/无法指挥</div></div></div>' +
        '<div class="war-unit-stats"><span>血 <b>' + u.hp + '/' + u.hpMax + '</b></span>' +
        '<span>可攻击 <b>' + UNITS.tower.range[0] + '-' + UNITS.tower.range[1] + '</b></span>' +
        '<span>伤害 <b>' + UNITS.tower.dmg + '</b></span></div>' +
        '<p class="tiny">每回合开始自动攻击范围内最近的敌方棋子，每回合一次；不能攻击被敌方相庇护的敌方棋子。</p>' +
        '<p class="tiny" style="color:#2d7db3">棋盘上的蓝色区域就是这座防御塔的可攻击范围。</p>';
    }
    toast('防御塔可攻击范围：' + UNITS.tower.range[0] + '-' + UNITS.tower.range[1] + ' 格');
    render();
  }
  function computeBlocked(u) {
    var out = [];
    var r = Math.ceil(u.ap / 2) + 2;
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var x = u.x + dx, y = u.y + dy;
      if (!inMap(x, y) || (dx === 0 && dy === 0)) continue;
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      var t = S.map.terrain[idx(x, y)];
      var occ = unitAt(x, y, u.side);
      if (!passableTerrain(UNITS[u.type], t) || occ) out.push([x, y]);
    }
    return out;
  }
  function computeThreatened(u) {
    var map = {};
    S.units.forEach(function (e) {
      if (!e.alive || e.side === u.side || !unitVisible(e, u.side)) return;
      var d = UNITS[e.type], r0 = d.range[0], r1 = d.range[1];
      var one = r0 === 1 && r1 === 1;
      if (r1 > 20) return;
      for (var dy = -r1; dy <= r1; dy++) for (var dx = -r1; dx <= r1; dx++) {
        var dd = one ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
        if (one ? dd !== 1 : (dd < r0 || dd > r1)) continue;
        var x = e.x + dx, y = e.y + dy;
        if (!inMap(x, y)) continue;
        if ((e.type === 'cannon' || e.type === 'tower') && cannonAuraProtects({ x: x, y: y, side: u.side, type: u.type })) continue;
        map[x + ',' + y] = 1;
      }
    });
    return map;
  }
  function computeAIThreat(side) {
    var map = {};
    S.units.forEach(function (e) {
      if (!e.alive || e.devHidden || e.side === side) return;
      var r0 = UNITS[e.type].range[0], r1 = UNITS[e.type].range[1];
      var one = r0 === 1 && r1 === 1;
      if (r1 > 20) return;
      for (var dy = -r1; dy <= r1; dy++) for (var dx = -r1; dx <= r1; dx++) {
        var dd = one ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
        if (one ? dd !== 1 : (dd < r0 || dd > r1)) continue;
        var x = e.x + dx, y = e.y + dy;
        if (inMap(x, y)) map[x + ',' + y] = 1;
      }
    });
    return map;
  }
  function clickCell(x, y) {
    if (S.over || S.screen !== 'game') return;
    if (S.battleMode === 'selfplay') { toast('恶梦自弈中，请观战'); return; }
    if (S.battleMode === 'sandbox') { sandboxPaint(x, y); return; }
    if (pendingBusy() || moveAnimBusy()) { toast('等当前动画结束'); return; }
    // 点防御塔显示可攻击范围；若已选中的己方棋子能打这座塔，则仍然正常攻击
    var preU = unitAt(x, y, S.viewerSide);
    if (preU && preU.type === 'tower') {
      var canHitTower = S.selected && S.selected.side === S.turnSide && !S.selected.acted && canAttack(S.selected, preU);
      if (!canHitTower) { inspectTower(preU); return; }
      S.towerRange = null; S.inspectTower = null;
    } else if (S.towerRange) {
      S.towerRange = null; S.inspectTower = null;
      refreshUnit();
    }
    if (S.battleMode === 'online' && S.turnSide !== S.mySide) { toast('等待对方行动'); return; }
    if (S.battleMode === 'ai' && (S.turnSide !== 0 || S.aiRunning)) { toast('大肥鱼正在行动'); return; }
    if (S.aiRunning) { toast('大肥鱼正在行动'); return; }
    var guest = S.battleMode === 'online' && S.online && S.online.role === 'guest';
    var u = unitAt(x, y, S.viewerSide);
    var b = buildingAt(x, y);
    if (S.healMode && S.selected && u) {
      if (S.selected.type === 'elephant' && u.side === S.selected.side && u.hp < u.hpMax) {
        if (guest) { sendOnlineAction({ type: 'heal', unitId: S.selected.id, targetId: u.id }); return; }
        doHeal(S.selected, u); broadcastIfHost(); return;
      }
    }
    if (S.selected) {
      if (u && u.side !== S.selected.side && canAttack(S.selected, u)) {
        var su = S.selected, tgt = u;
        if (guest) { sendOnlineAction({ type: 'attack', unitId: su.id, targetId: tgt.id }); return; }
        doAttack(su, tgt);
        broadcastIfHost();
        return;
      }
      if (S.selected.postMove) {
        // 移动后不攻击：点空处/己方/建筑都表示结束这枚棋子的行动
        var pm = S.selected;
        pm.acted = true; pm.postMove = false;
        clearSelection(); refreshHud(); render();
        return;
      }
      if (!u && S.reach) {
        var path = pathTo(S.reach, x, y);
        if (path && path.length > 1) {
          if (guest) { sendOnlineAction({ type: 'move', unitId: S.selected.id, x: x, y: y }); return; }
          var mover = S.selected;
          moveUnit(mover, path);
          if (mover.postMove && mover.alive) {
            S.reach = null; S.path = null;
            S.attackable = attackTargets(mover);
            refreshUnit(); refreshHud(); render();
            hint('移动后进入攻击范围：点红圈敌人攻击，点空处结束行动');
          } else {
            clearSelection(); refreshHud(); render();
          }
          checkOver();
          broadcastIfHost();
          return;
        }
        if (!path) {
          var why2;
          var t3 = S.map.terrain[idx(x, y)];
          var c3 = cellCostTo(S.selected, x, y);
          if (c3 == null) why2 = TERRAIN[t3].name + '：这枚棋子不能进入';
          else why2 = '到不了：行动值不够，或前方有棋子/隐身士挡路';
          toast(why2);
          return;
        }
      }
      if (b && S.selected && b.owner !== S.selected.side && S.selected.x === x && S.selected.y === y) {
        if (guest) { sendOnlineAction({ type: 'occupy', unitId: S.selected.id }); return; }
        if (occupy(S.selected)) broadcastIfHost();
        return;
      }
    }
    if (u && u.side === S.turnSide && !u.acted) { selectUnit(u); return; }
    if (b) {
      if (b.owner === S.turnSide) openBuilding(b);
      else if (u && u.side === S.turnSide && u.x === x && u.y === y) {
        S.selected = u; refreshUnit(); render();
        toast('点「占领」占领这个' + (b.kind === 'city' ? '城池' : '村庄'));
      }
      return;
    }
    if (u) selectUnit(u);
    else { clearSelection(); refreshUnit(); render(); }
  }
  function refreshUnit() {
    var el = $('warUnit'); if (!el) return;
    var u = S.selected;
    if (!u) {
      el.innerHTML = '<h3>棋子</h3><p class="tiny">点棋子看行动范围，点地图移动或攻击。</p>';
      return;
    }
    var d = UNITS[u.type];
    var b = buildingAt(u.x, u.y);
    var html = '<div class="war-unit-head"><img src="assets/pieces/' + PIECE[u.side][u.type] + '" alt="" />' +
      '<div><div class="war-unit-name">' + sideName(u.side) + ' · ' + d.name + '</div><div class="tiny">' +
      (u.postMove ? '已移动，可攻击' : (u.acted ? '本回合已行动' : '可行动')) + '</div></div></div>';
    html += '<div class="war-unit-stats"><span>血 <b>' + u.hp + '/' + u.hpMax + '</b></span><span>行动值 <b>' + fmtAp(u.ap) + '/' + fmtAp(u.apMax) + '</b></span><span>攻 <b>' + d.range[0] + '-' + d.range[1] + '</b></span><span>伤害 <b>' + d.dmg + '</b></span></div>';
    var ab = [];
    if (u.type === 'king') ab.push('可花一次行动拿 20 金币');
    if (u.type === 'advisor') ab.push(u.stealth ? '隐身中；周期性消失/再现' : '移动后隐身；被敌人路过时会现身反击');
    if (u.type === 'elephant') ab.push('可治疗；自动侦测 1-5 格内敌方士并破除隐身；相自身可以被炮击中；相周围 1-5 格内的己方其他棋子不会被炮击中；己方庇护区白色、敌方庇护区淡红色');
    if (u.type === 'cannon') ab.push('射程 5-10，固定不随行动值变化；对兵/相/士/将/马伤害 +1');
    if (u.type === 'rook') ab.push('被动：每闲置一回合 +1 行动值，行动后恢复基础行动值' + (u.apBonus ? '；当前已累积 +' + fmtAp(u.apBonus) : ''));
    if (u.type === 'pawn') ab.push('生产价格：15 金 + 己方场上每个兵 20 金（当前 ' + priceOf('pawn', u.side) + ' 金）');
    else ab.push('生产价格：基础价 + 己方场上同兵种数 ×10 金（当前 ' + priceOf(u.type, u.side) + ' 金）');
    if (u.type === 'pawn' || u.type === 'horse' || u.type === 'rook' || u.type === 'king' || u.type === 'advisor') {
      ab.push('移动后若敌人进入攻击范围，可以直接接一次攻击');
    }
    if (ab.length) html += '<p class="tiny">' + ab.join('；') + '</p>';
    if (u.postMove) html += '<p class="tiny" style="color:#b46b12">已移动过：点红圈敌人攻击；点空处或下方按钮结束行动。</p>';
    var acts = [];
    if (!u.acted && !u.postMove) {
      if (u.type === 'king') acts.push('<button data-act="gold">拿 20 金币</button>');
      if (u.type === 'elephant') acts.push('<button data-act="heal">治疗' + (S.healMode ? '（选目标）' : '') + '</button>');
      if (b && b.owner === u.side && !b.acted) acts.push('<button data-act="manage">经营' + (b.kind === 'city' ? '城池' : '村庄') + '</button>');
      if (b && b.owner !== u.side && canOccupy(u, b)) acts.push('<button data-act="occupy">占领' + (b.kind === 'city' ? '城池' : '村庄') + '</button>');
    } else if (u.postMove) {
      acts.push('<button data-act="endAct">结束行动</button>');
    }
    html += '<div class="war-unit-actions">' + acts.join('') + '</div>';
    el.innerHTML = html;
    el.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.getAttribute('data-act');
        var guest = S.battleMode === 'online' && S.online && S.online.role === 'guest';
        if (a === 'gold') {
          if (guest) { sendOnlineAction({ type: 'gold', unitId: u.id }); return; }
          kingGold(u); broadcastIfHost();
        }
        if (a === 'heal') { S.healMode = !S.healMode; refreshUnit(); toast('点一个受伤的己方棋子治疗'); }
        if (a === 'manage') { openBuilding(b); }
        if (a === 'endAct') {
          u.acted = true; u.postMove = false;
          clearSelection(); refreshHud(); render();
        }
        if (a === 'occupy') {
          if (guest) { sendOnlineAction({ type: 'occupy', unitId: u.id }); return; }
          occupy(u); broadcastIfHost();
        }
      });
    });
  }

  /* ---------- 建筑弹窗 ---------- */
  function modal(html) {
    var root = $('warModalRoot'); if (!root) return;
    root.innerHTML = '<div class="war-modal"><div class="war-modal-panel">' + html + '</div></div>';
    root.querySelector('.war-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    var b = root.querySelector('.war-modal-close'); if (b) b.addEventListener('click', closeModal);
  }
  function closeModal() { var r = $('warModalRoot'); if (r) r.innerHTML = ''; }
  function openBuilding(b) {
    var kind = b.kind === 'city' ? '城池' : '村庄';
    var canProduce = !rawUnitAt(b.x, b.y);
    var html = '<button class="war-modal-close" type="button">×</button><h2>' + sideName(b.owner) + '的' + kind + '</h2>';
    html += '<p>每回合一次建筑行动。' + (b.acted ? '这个回合已经用过了。' : '可以收 15 金币' + (canProduce ? '，或生产棋子' : '（格子上有棋子，暂时不能生产）') + '。') + '</p>';
    if (!b.acted) {
      html += '<div class="war-opt-row"><button class="war-opt-btn" data-b="collect">收 15 金币</button></div>';
      if (canProduce) {
        html += '<h3>生产</h3>';
        allowedProduce(b.kind).forEach(function (t) {
          var d = UNITS[t];
          html += '<div class="war-prod-row"><span>' + d.name + ' · ' + priceOf(t, b.owner) + '金</span><button class="war-opt-btn" data-prod="' + t + '">生产</button></div>';
        });
      }
    }
    modal(html);
    var panel = document.querySelector('.war-modal-panel');
    panel.querySelectorAll('[data-b]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (S.battleMode === 'online' && S.online && S.online.role === 'guest') {
          sendOnlineAction({ type: 'collect', x: b.x, y: b.y }); closeModal(); return;
        }
        collectBuilding(b.x, b.y); broadcastIfHost(); closeModal();
      });
    });
    panel.querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-prod');
        if (S.battleMode === 'online' && S.online && S.online.role === 'guest') {
          sendOnlineAction({ type: 'produce', x: b.x, y: b.y, unitType: t }); closeModal(); return;
        }
        produce(b.x, b.y, t); broadcastIfHost(); closeModal();
      });
    });
  }
  function showOver(winner, why) {
    var title = winner === -1 ? '平局' : (winner === S.mySide ? '你赢了' : sideName(winner) + '胜');
    var whyText = winner === -1 ? '双方都没有将和城池。' : (why || '一方没有将和城池。');
    var html = '<button class="war-modal-close" type="button">×</button><div class="war-over-title">' + title + '</div>' +
      '<p style="text-align:center">' + whyText + '</p>' +
      '<div class="war-opt-row" style="justify-content:center"><button class="war-opt-btn" id="warOverAgain">再来一局</button><button class="war-opt-btn" id="warOverMenu">回菜单</button></div>';
    modal(html);
    var a = $('warOverAgain'), m = $('warOverMenu');
    if (a) a.addEventListener('click', function () { closeModal(); startGame(S.battleMode, S.mapChoice, S.diff); });
    if (m) m.addEventListener('click', function () { closeModal(); showMenu(); });
  }

  /* ---------- AI ---------- */
  function visibleEnemies(side) {
    return S.units.filter(function (u) { return u.alive && u.side !== side && unitVisible(u, side); });
  }
  function enemyKing(side) {
    var list = visibleEnemies(side).filter(function (u) { return u.type === 'king'; });
    return list[0] || null;
  }
  function pathHeapPush(heap, c, id) {
    heap.push([c, id]);
    var i = heap.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
  }
  function pathHeapPop(heap) {
    var top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      while (true) {
        var l = i * 2 + 1, r = l + 1, s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        var t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s;
      }
    }
    return top;
  }
  // 以真实移动消耗计算到目标的最快路径；其他棋子（含己方）按当前站位阻挡
  function travelCostTo(u, tx, ty) {
    if (!inMap(tx, ty)) return 1e9;
    var n = W * H, start = idx(u.x, u.y), goal = idx(tx, ty);
    if (start === goal) return 0;
    var dist = new Int32Array(n); dist.fill(1000000000);
    dist[start] = 0;
    var heap = []; pathHeapPush(heap, 0, start);
    while (heap.length) {
      var cur = pathHeapPop(heap), c = cur[0], id = cur[1];
      if (c > dist[id]) continue;
      if (id === goal) return c;
      var x = id % W, y = (id / W) | 0;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = x + dirs[k][0], ny = y + dirs[k][1];
        if (!inMap(nx, ny)) continue;
        var nid = idx(nx, ny);
        var occ = rawUnitAt(nx, ny);
        // 目标格允许被敌/我棋子占着（攻城/救援要走到这里），其余棋子阻挡
        if (occ && nid !== goal) continue;
        var cost = cellCostTo(u, nx, ny);
        if (cost == null) continue;
        if (c + cost < dist[nid]) {
          dist[nid] = c + cost;
          pathHeapPush(heap, c + cost, nid);
        }
      }
    }
    return 1e9;
  }
  // 反向 Dijkstra：每个格子到目标格的剩余最快移动消耗，用于评分
  function movementFieldTo(u, tx, ty) {
    var n = W * H, goal = idx(tx, ty);
    var dist = new Int32Array(n); dist.fill(1000000000);
    if (!inMap(tx, ty)) return dist;
    dist[goal] = 0;
    var heap = []; pathHeapPush(heap, 0, goal);
    while (heap.length) {
      var cur = pathHeapPop(heap), c = cur[0], id = cur[1];
      if (c > dist[id]) continue;
      var x = id % W, y = (id / W) | 0;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = x + dirs[k][0], ny = y + dirs[k][1];
        if (!inMap(nx, ny)) continue;
        var nid = idx(nx, ny);
        if (rawUnitAt(nx, ny)) continue;
        // 反向走 nx -> 当前格，进入当前格的地形消耗
        var cost = cellCostTo(u, x, y);
        if (cost == null) continue;
        if (c + cost < dist[nid]) {
          dist[nid] = c + cost;
          pathHeapPush(heap, c + cost, nid);
        }
      }
    }
    return dist;
  }
  function aiScoreMove(u, cell, enemy, threat, task, reach, field) {
    var sx = cell.x, sy = cell.y;
    var score = 0;
    var ek = enemyKing(u.side);
    var target = ek || enemy;
    var totalPath = null;
    if (S.diff === 'super' && reach && field) {
      var pc = reach.dist[idx(sx, sy)];
      var rc = field[idx(sx, sy)];
      if (pc < 32767 && rc < 1000000000) totalPath = pc + rc;
    }
    if (target) {
      if (totalPath != null) score -= totalPath * 2;
      else score -= (Math.abs(sx - target.x) + Math.abs(sy - target.y)) * 2;
    }
    if (u.type === 'cannon' && target) {
      var dd = Math.hypot(sx - target.x, sy - target.y);
      if (dd >= UNITS.cannon.range[0] && dd <= UNITS.cannon.range[1]) score += 18;
      else if (dd > 9) score -= (dd - 9);
    }
    var t = S.map.terrain[idx(sx, sy)];
    if (t === 9 || t === 10) {
      var own = S.map.owner[idx(sx, sy)];
      if (own !== u.side && (t === 9 || ['king', 'advisor', 'elephant', 'pawn'].indexOf(u.type) >= 0)) {
        score += 10;
        if (!ek) score += 30; // 对方将没了：抢光他们的村庄/城池
      }
    }
    if (threat && threat[sx + ',' + sy]) score -= 8;
    if (u.hp < u.hpMax && threat && threat[sx + ',' + sy]) score -= 4;
    if (S.diff === 'super') {
      // 知道胜负条件：优先拔掉对方城池；自己只剩一座城时回防；对方无城就去追将
      var plan = S.aiPlan;
      var enemyCities = plan ? plan.enemyCities : countOwnedCities(1 - u.side);
      var ownCities = plan ? plan.ownCities : countOwnedCities(u.side);
      var role = unitRole(u);
      var keep = plan && plan.ownCityTarget;
      if ((role === 'guard' || role === 'support') && keep) {
        score -= (Math.abs(sx - keep.x) + Math.abs(sy - keep.y)) * 2.5;
      }
      if (role === 'siege' && ek) {
        var sd = Math.hypot(sx - ek.x, sy - ek.y);
        if (sd < 4) score -= (4 - sd) * 12;
        else if (sd >= 5 && sd <= 10) score += 6;
      }
      if (role === 'ambush' && u.stealth && ek) {
        score -= (Math.abs(sx - ek.x) + Math.abs(sy - ek.y)) * 1.2;
      }
      if (role === 'objective' && plan && plan.enemyCityTarget) {
        var pc = plan.enemyCityTarget;
        score -= (Math.abs(sx - pc.x) + Math.abs(sy - pc.y)) * 1.5;
      }
      // 单个棋子也独立判断：有剩余行动值却停在目标外，视为浪费
      if (reach && field && field[idx(sx, sy)] < 1000000000) {
        var leftAp = u.ap - reach.dist[idx(sx, sy)];
        if (leftAp > 0 && field[idx(sx, sy)] > leftAp) score -= leftAp * 1.2;
      }
      if (task) {
        var td = field && field[idx(sx, sy)] < 1000000000 ? field[idx(sx, sy)] : (Math.abs(sx - task.x) + Math.abs(sy - task.y));
        if (task.kind === 'defend') score -= td * 6;
        else if (task.kind === 'hunt') score -= td * 3;
        else if (task.kind === 'capture') score -= td * 2;
        else if (task.kind === 'grab') score -= td * 2.5;
        else if (task.kind === 'mass') score -= td * 2;
        if (sx === task.x && sy === task.y) score += (task.kind === 'capture' || task.kind === 'grab' || task.kind === 'mass') ? 30 : 8;
      }
      if (ek && enemyCities === 0) {
        score -= (Math.abs(sx - ek.x) + Math.abs(sy - ek.y)) * 4;
      } else if (enemyCities > 0) {
        var ec = plan && plan.enemyCityTarget ? plan.enemyCityTarget : nearestOwnedCity(1 - u.side, sx, sy);
        if (ec) score -= (Math.abs(sx - ec.x) + Math.abs(sy - ec.y)) * 2;
      }
      if (ownCities <= 1) {
        var oc = plan && plan.ownCityTarget ? plan.ownCityTarget : nearestOwnedCity(u.side, sx, sy);
        if (oc) score -= (Math.abs(sx - oc.x) + Math.abs(sy - oc.y)) * 2;
      }
    }
    return score;
  }

  function dist2(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
  function ownedBuildings(side) {
    var list = [];
    for (var i = 0; i < S.map.terrain.length; i++) {
      var t = S.map.terrain[i];
      if ((t === 9 || t === 10) && S.map.owner[i] === side) list.push({ x: i % W, y: (i / W) | 0, kind: t === 9 ? 'village' : 'city' });
    }
    return list;
  }
  function countOwnedCities(side) {
    var n = 0;
    for (var i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === 10 && S.map.owner[i] === side) n++;
    return n;
  }
  function nearestOwnedCity(side, x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < S.map.terrain.length; i++) {
      if (S.map.terrain[i] !== 10 || S.map.owner[i] !== side) continue;
      var xx = i % W, yy = (i / W) | 0;
      var d = Math.abs(xx - x) + Math.abs(yy - y);
      if (d < bd) { bd = d; best = { x: xx, y: yy }; }
    }
    return best;
  }
  function nearestEnemyBuilding(side, x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < S.map.terrain.length; i++) {
      var t = S.map.terrain[i];
      if ((t !== 9 && t !== 10) || S.map.owner[i] === side || S.map.owner[i] === -1) continue;
      var xx = i % W, yy = (i / W) | 0;
      var d = Math.abs(xx - x) + Math.abs(yy - y);
      if (d < bd) { bd = d; best = { x: xx, y: yy, kind: t === 9 ? 'village' : 'city' }; }
    }
    return best;
  }
  function nearestResourceBuilding(side, x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < S.map.terrain.length; i++) {
      var t = S.map.terrain[i];
      if ((t !== 9 && t !== 10) || S.map.owner[i] === side) continue;
      var xx = i % W, yy = (i / W) | 0;
      var d = Math.abs(xx - x) + Math.abs(yy - y);
      // 中立村庄最优先，其次敌方村庄，再是城池
      if (S.map.owner[i] === -1 && t === 9) d -= 8;
      if (d < bd) { bd = d; best = { x: xx, y: yy, kind: t === 9 ? 'village' : 'city' }; }
    }
    return best;
  }
  function threatenedBuildings(side) {
    var enemies = visibleEnemies(side);
    var out = [];
    ownedBuildings(side).forEach(function (b) {
      var n = 0, near = null;
      enemies.forEach(function (e) {
        if (dist2(b, e) <= 7) { n++; if (!near || dist2(b, e) < dist2(b, near)) near = e; }
      });
      if (n) out.push({ x: b.x, y: b.y, kind: b.kind, count: n, nearest: near });
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }
  function superStrategyScores(side, threats, ek, enemyCities, ownCities, gold) {
    var threatLevel = threats.reduce(function (n, t) { return n + t.count; }, 0);
    var cityThreats = threats.filter(function (t) { return t.kind === 'city'; }).length;
    var eb = nearestEnemyBuilding(side, cxOf(side), cyOf(side));
    var ebDist = eb ? Math.abs(eb.x - cxOf(side)) + Math.abs(eb.y - cyOf(side)) : 30;
    var army = S.units.filter(function (u) { return u.alive && !u.devHidden && u.side === side && !UNITS[u.type].static; }).length;
    var defend = threatLevel * 20 + cityThreats * 35 + (ownCities <= 1 ? 30 : 0) - (threatLevel === 0 ? 30 : 0);
    var hunt = ek ? 20 + (enemyCities === 0 ? 55 : 0) + (ek.hp <= 2 ? 35 : 0) - ebDist * 1.2 - (ownCities <= 1 ? 15 : 0) : -40;
    var capture = enemyCities > 0 ? 24 + enemyCities * 14 + (ownCities <= 1 ? 25 : 0) - ebDist * 1.6 : 4;
    var develop = (gold >= 150 ? 26 : 0) + (army < 8 ? 18 : 0) - threatLevel * 8;
    var resources = 0, neutralResources = 0;
    for (var ri = 0; ri < S.map.terrain.length; ri++) {
      var rt = S.map.terrain[ri];
      if (rt !== 9 && rt !== 10) continue;
      var ro = S.map.owner[ri];
      if (ro !== side) resources++;
      if (ro === -1) neutralResources++;
    }
    var enemyArmy = S.units.filter(function (u) { return u.alive && !u.devHidden && u.side !== side && !UNITS[u.type].static; }).length;
    var grab = neutralResources * 16 + resources * 7 + (gold < 120 ? 12 : 0) - ebDist * 1.1 - threatLevel * 7;
    var mass = (army - enemyArmy) * 11 + (enemyCities <= 1 ? 15 : 0) - (ownCities <= 1 ? 28 : 0) - threatLevel * 9 + (gold >= 150 ? 8 : 0);
    if (army < 5) mass -= 30;
    var w = S.aiWeights || freshWeights();
    var ss = S.aiStrategy || freshStrategyStats();
    var totalPicks = 0;
    STRATEGY_KEYS.forEach(function (k) { totalPicks += (ss[k] && ss[k].picks) || 0; });
    function explore(k) {
      var p = (ss[k] && ss[k].picks) || 0;
      return 0.16 * Math.sqrt(Math.log(totalPicks + 2) / (p + 1));
    }
    return {
      defend: defend * (w.defend || 1) + explore('defend'),
      hunt: hunt * (w.hunt || 1) + explore('hunt'),
      capture: capture * (w.capture || 1) + explore('capture'),
      develop: develop * (w.develop || 1) + explore('develop'),
      grab: grab * (w.grab || 1) + explore('grab'),
      mass: mass * (w.mass || 1) + explore('mass')
    };
  }
  function buildSuperPlan(side) {
    var plan = { tasks: [], byUnit: {}, threatLevel: 0, strategy: 'develop', scores: {} };
    var used = {};
    function pickUnits(task, n, filter) {
      var pool = S.units.filter(function (u) {
        return u.alive && !u.devHidden && !u.acted && u.side === side && !used[u.id] && UNITS[u.type] && !UNITS[u.type].static && (!filter || filter(u));
      });
      pool.sort(function (a, b) { return dist2(a, task) - dist2(b, task); });
      var ids = [];
      pool.slice(0, n).forEach(function (u) { used[u.id] = 1; ids.push(u.id); plan.byUnit[u.id] = task; });
      return ids;
    }
    var threats = threatenedBuildings(side);
    plan.threatLevel = threats.reduce(function (n, t) { return n + t.count; }, 0);
    plan.enemyCities = countOwnedCities(1 - side);
    plan.ownCities = countOwnedCities(side);
    plan.enemyCityTarget = nearestOwnedCity(1 - side, cxOf(side), cyOf(side));
    plan.ownCityTarget = nearestOwnedCity(side, cxOf(side), cyOf(side));
    var ek = enemyKing(side);
    plan.enemyKing = ek;
    plan.scores = superStrategyScores(side, threats, ek, plan.enemyCities, plan.ownCities, S.gold[side] || 0);
    var best = 'develop', bestScore = -1e9;
    STRATEGY_KEYS.forEach(function (k) {
      if (plan.scores[k] > bestScore) { bestScore = plan.scores[k]; best = k; }
    });
    plan.strategy = best;
    if (S.diff === 'super') {
      if (!S.aiGameStats) S.aiGameStats = freshGameStats();
      var st = S.aiGameStats[side];
      if (st) st[best] = (st[best] || 0) + 1;
      if (!S.aiStrategy) S.aiStrategy = freshStrategyStats();
      if (S.aiStrategy[best]) S.aiStrategy[best].picks = (S.aiStrategy[best].picks || 0) + 1;
    }

    if (best === 'defend') {
      threats.slice(0, 2).forEach(function (t) {
        if (plan.tasks.length >= 3) return;
        var need = t.count >= 4 ? 3 : t.count >= 2 ? 2 : 1;
        var task = { kind: 'defend', x: t.x, y: t.y, count: t.count, score: plan.scores.defend, unitIds: [] };
        task.unitIds = pickUnits(task, need);
        plan.tasks.push(task);
      });
    } else if (best === 'hunt') {
      if (ek) {
        var hunt = { kind: 'hunt', x: ek.x, y: ek.y, targetId: ek.id, score: plan.scores.hunt, unitIds: [] };
        hunt.unitIds = pickUnits(hunt, 3, function (u) { return ['rook', 'horse', 'cannon', 'pawn', 'king'].indexOf(u.type) >= 0; });
        plan.tasks.push(hunt);
      }
    } else if (best === 'capture') {
      var eb = nearestEnemyBuilding(side, cxOf(side), cyOf(side));
      if (eb) {
        var cap = { kind: 'capture', x: eb.x, y: eb.y, targetKind: eb.kind, score: plan.scores.capture, unitIds: [] };
        var canTake = function (u) { return eb.kind !== 'city' || ['king', 'advisor', 'elephant', 'pawn'].indexOf(u.type) >= 0; };
        cap.unitIds = pickUnits(cap, 3, canTake);
        plan.tasks.push(cap);
      }
    } else if (best === 'grab') {
      var rb = nearestResourceBuilding(side, cxOf(side), cyOf(side));
      plan.resourceTarget = rb;
      if (rb) {
        var grab = { kind: 'grab', x: rb.x, y: rb.y, targetKind: rb.kind, score: plan.scores.grab, unitIds: [] };
        grab.unitIds = pickUnits(grab, 3, function (u) { return rb.kind !== 'city' || ['king', 'advisor', 'elephant', 'pawn'].indexOf(u.type) >= 0; });
        plan.tasks.push(grab);
      }
    } else if (best === 'mass') {
      var mt = plan.enemyCityTarget || (ek ? { x: ek.x, y: ek.y, kind: 'king' } : null);
      plan.massTarget = mt;
      if (mt) {
        var mass = { kind: 'mass', x: mt.x, y: mt.y, targetKind: mt.kind || 'city', score: plan.scores.mass, unitIds: [] };
        mass.unitIds = pickUnits(mass, 5, function (u) { return ['rook', 'horse', 'cannon', 'pawn', 'king'].indexOf(u.type) >= 0; });
        plan.tasks.push(mass);
      }
    }
    // 不把全部棋子压在一个方向上：主策略之外保留一支机动/回防力量
    if (plan.tasks.length < 3) {
      if (best === 'defend' && ek && plan.threatLevel < 6) {
        var counter = { kind: 'hunt', x: ek.x, y: ek.y, targetId: ek.id, score: plan.scores.hunt, unitIds: [] };
        counter.unitIds = pickUnits(counter, 2, function (u) { return ['rook', 'horse', 'cannon', 'pawn'].indexOf(u.type) >= 0; });
        if (counter.unitIds.length) plan.tasks.push(counter);
      } else if (best !== 'defend' && threats.length) {
        var t0 = threats[0];
        var cover = { kind: 'defend', x: t0.x, y: t0.y, count: t0.count, score: plan.scores.defend, unitIds: [] };
        cover.unitIds = pickUnits(cover, 1);
        if (cover.unitIds.length) plan.tasks.push(cover);
      }
    }
    if (plan.tasks.length < 3 && best === 'develop') {
      var ekk = ek;
      if (ekk) {
        var devHunt = { kind: 'hunt', x: ekk.x, y: ekk.y, targetId: ekk.id, score: plan.scores.hunt, unitIds: [] };
        devHunt.unitIds = pickUnits(devHunt, 2, function (u) { return ['rook', 'horse', 'cannon'].indexOf(u.type) >= 0; });
        if (devHunt.unitIds.length) plan.tasks.push(devHunt);
      }
    }
    return plan;
  }
  function cxOf(side) {
    var k = S.units.filter(function (u) { return u.alive && u.side === side && u.type === 'king'; })[0];
    return k ? k.x : (side === 0 ? 10 : W - 10);
  }
  function cyOf(side) {
    var k = S.units.filter(function (u) { return u.alive && u.side === side && u.type === 'king'; })[0];
    return k ? k.y : (side === 0 ? H - 10 : 10);
  }
  function superProduction(b, threat) {
    var allowed = allowedProduce(b.kind);
    var side = S.aiSide;
    var hasKing = S.units.some(function (u) { return u.alive && !u.devHidden && u.side === side && u.type === 'king'; });
    if (!hasKing && b.kind === 'city') return 'king';
    var strategy = S.aiPlan ? S.aiPlan.strategy : 'develop';
    var ek = enemyKing(side);
    if (threat > 0 || strategy === 'defend') {
      // 被压城时先补便宜、能立刻挡路的防守子
      var guard = ['pawn', 'advisor', 'elephant'];
      for (var i = 0; i < guard.length; i++) if (allowed.indexOf(guard[i]) >= 0 && S.gold[side] >= priceOf(guard[i], side)) return guard[i];
    }
    if (strategy === 'hunt' || (ek && countOwnedCities(1 - side) === 0)) {
      var hunters = ['horse', 'cannon', 'rook'];
      for (var j = 0; j < hunters.length; j++) if (allowed.indexOf(hunters[j]) >= 0 && S.gold[side] >= priceOf(hunters[j], side)) return hunters[j];
    }
    if (strategy === 'capture') {
      var takers = ['horse', 'cannon', 'rook', 'pawn'];
      for (var j2 = 0; j2 < takers.length; j2++) if (allowed.indexOf(takers[j2]) >= 0 && S.gold[side] >= priceOf(takers[j2], side)) return takers[j2];
    }
    if (strategy === 'grab') {
      // 抢占资源：优先能快速占村、成本低的棋子
      var grabbers = ['horse', 'pawn', 'advisor', 'elephant'];
      for (var jg = 0; jg < grabbers.length; jg++) if (allowed.indexOf(grabbers[jg]) >= 0 && S.gold[side] >= priceOf(grabbers[jg], side)) return grabbers[jg];
    }
    if (strategy === 'mass') {
      // 屯兵强攻：优先能形成正面突破的重子
      var massers = ['rook', 'cannon', 'horse'];
      for (var jm = 0; jm < massers.length; jm++) if (allowed.indexOf(massers[jm]) >= 0 && S.gold[side] >= priceOf(massers[jm], side)) return massers[jm];
    }
    if (S.gold[side] >= priceOf('rook', side) && allowed.indexOf('rook') >= 0) return 'rook';
    if (S.gold[side] >= priceOf('cannon', side) && allowed.indexOf('cannon') >= 0) return 'cannon';
    if (S.gold[side] >= priceOf('horse', side) && allowed.indexOf('horse') >= 0) return 'horse';
    for (var k = 0; k < allowed.length; k++) if (S.gold[side] >= priceOf(allowed[k], side)) return allowed[k];
    return null;
  }
  function unitRole(u) {
    if (!u) return 'front';
    if (u.type === 'king') return 'guard';
    if (u.type === 'advisor') return 'ambush';
    if (u.type === 'elephant') return 'support';
    if (u.type === 'pawn') return 'objective';
    if (u.type === 'horse') return 'raider';
    if (u.type === 'cannon') return 'siege';
    return 'front';
  }
  function unitTaskFor(u) {
    var plan = S.aiPlan;
    if (!plan) return null;
    var role = unitRole(u);
    var pool = plan.tasks.slice();
    var ek = enemyKing(u.side);
    var ownCity = nearestOwnedCity(u.side, u.x, u.y) || plan.ownCityTarget;
    var grabTask = pool.filter(function (t) { return t.kind === 'grab'; })[0];
    var massTask = pool.filter(function (t) { return t.kind === 'mass'; })[0];
    // 资源策略优先让能占村的棋子去抢；强攻策略让机动子去集结
    if (grabTask && (role === 'objective' || role === 'raider' || role === 'front')) return grabTask;
    if (massTask && (role === 'front' || role === 'raider' || role === 'siege' || role === 'ambush')) return massTask;
    // 按棋子的属性/技能决定临时职责，而不是只按“进攻/防守”二分
    if (role === 'guard') {
      if (ownCity) return { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] };
    } else if (role === 'support') {
      var king = S.units.filter(function (x) { return x.alive && x.side === u.side && x.type === 'king'; })[0];
      if (king) return { kind: 'defend', x: king.x, y: king.y, unitIds: [] };
    } else if (role === 'ambush') {
      if (u.stealth && ek) return { kind: 'hunt', x: ek.x, y: ek.y, targetId: ek.id, unitIds: [] };
      if (ownCity) return { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] };
    } else if (role === 'objective') {
      var cap = plan.enemyCityTarget;
      if (cap) return { kind: 'capture', x: cap.x, y: cap.y, unitIds: [] };
      if (ownCity) return { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] };
    } else if (role === 'raider' || role === 'siege') {
      if (ek && plan.threatLevel < 6) return { kind: 'hunt', x: ek.x, y: ek.y, targetId: ek.id, unitIds: [] };
      var ec = plan.enemyCityTarget;
      if (ec) return { kind: 'capture', x: ec.x, y: ec.y, unitIds: [] };
      if (ownCity) return { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] };
    } else {
      // 俥：前线棋子，城危先守，城稳再压
      if (plan.threatLevel >= 3 && ownCity) return { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] };
      if (ek) return { kind: 'hunt', x: ek.x, y: ek.y, targetId: ek.id, unitIds: [] };
    }
    if (pool.length) {
      pool.sort(function (a, b) { return dist2(u, a) - dist2(u, b); });
      return pool[0];
    }
    return ownCity ? { kind: 'defend', x: ownCity.x, y: ownCity.y, unitIds: [] } : null;
  }
  function aiChoose(u, threat) {
    var enemies = visibleEnemies(u.side);
    var heal = healTargets(u);
    if (u.type === 'elephant' && heal.length) {
      heal.sort(function (a, b) { return a.hp - b.hp; });
      return { kind: 'heal', target: heal[0] };
    }
    var task = S.diff === 'super' && S.aiPlan ? S.aiPlan.byUnit[u.id] : null;
    if (!task && S.diff === 'super') task = unitTaskFor(u);
    var atk = attackTargets(u);
    if (task && task.kind === 'mass' && dist2(u, task) > 3) atk = [];
    if (atk.length) {
      var typeVal = { king: 100, cannon: 36, rook: 32, horse: 27, elephant: 22, advisor: 18, pawn: 10 };
      atk.sort(function (a, b) {
        var sa = (typeVal[a.type] || 8) + (a.hp <= attackDamage(u, a) ? 35 : 0) - a.hp;
        var sb = (typeVal[b.type] || 8) + (b.hp <= attackDamage(u, b) ? 35 : 0) - b.hp;
        if (task && task.kind === 'defend') {
          sa += Math.max(0, 24 - dist2(a, task)); sb += Math.max(0, 24 - dist2(b, task));
        } else if (task && task.kind === 'hunt' && a.type === 'king') sa += 50;
        else if (task && task.kind === 'hunt' && b.type === 'king') sb += 50;
        return sb - sa;
      });
      if (S.diff === 'advanced' && Math.random() < 0.35) return { kind: 'wait' };
      return { kind: 'attack', target: atk[0] };
    }
    var reach = computeReach(u);
    var field = null;
    if (S.diff === 'super') {
      var goal = task;
      if (!goal) {
        var ek = enemyKing(u.side);
        goal = ek || (S.aiPlan && (S.aiPlan.enemyCityTarget || S.aiPlan.ownCityTarget));
      }
      if (goal) field = movementFieldTo(u, goal.x, goal.y);
    }
    var best = null, bs = -1e9;
    for (var i = 0; i < reach.dist.length; i++) {
      if (reach.dist[i] === 32767) continue;
      var x = i % W, y = (i / W) | 0;
      if (x === u.x && y === u.y) continue;
      var sc = aiScoreMove(u, { x: x, y: y }, enemies[0], threat, task, reach, field);
      if (S.diff === 'advanced') sc += Math.random() * 10 - 5;
      if (sc > bs) { bs = sc; best = { x: x, y: y }; }
    }
    if (best && (S.diff !== 'advanced' || Math.random() > 0.2)) return { kind: 'move', cell: best, reach: reach };
    if (u.type === 'king') return { kind: 'gold' };
    return { kind: 'wait' };
  }
  function aiUnit(u) {
    if (!u || !u.alive || u.acted || S.over) return;
    var b0 = buildingAt(u.x, u.y);
    if (canOccupy(u, b0)) {
      occupy(u);
      cameraToCell(u.x, u.y);
      return;
    }
    var threat = S.diff === 'super' ? computeAIThreat(u.side) : null;
    if (S.diff === 'super') S.aiPlan = buildSuperPlan(u.side);
    var act = aiChoose(u, threat);
    if (act.kind === 'attack') {
      doAttack(u, act.target);
    } else if (act.kind === 'heal') {
      doHeal(u, act.target);
    } else if (act.kind === 'gold') {
      kingGold(u);
    } else if (act.kind === 'move') {
      var path = pathTo(act.reach, act.cell.x, act.cell.y);
      if (path) {
        moveUnit(u, path);
        if (u.alive && u.postMove) {
          var atk2 = attackTargets(u);
          atk2.sort(function (a, b) {
            var sa = (a.type === 'king' ? 50 : 0) + (a.hp <= attackDamage(u, a) ? 30 : 0) - a.hp;
            var sb = (b.type === 'king' ? 50 : 0) + (b.hp <= attackDamage(u, b) ? 30 : 0) - b.hp;
            return sb - sa;
          });
          if (atk2.length) doAttack(u, atk2[0]);
          else { u.acted = true; u.postMove = false; }
        }
      }
    } else {
      u.acted = true;
    }
  }
  function aiBuildings(side) {
    side = side === 0 ? 0 : 1;
    for (var i = 0; i < S.map.terrain.length; i++) {
      if (S.over) return;
      if ((S.map.terrain[i] === 9 || S.map.terrain[i] === 10) && S.map.owner[i] === side && !S.map.acted[i]) {
        var x = i % W, y = (i / W) | 0;
        var b = buildingAt(x, y);
        var noUnit = !rawUnitAt(x, y);
        var hasKing = S.units.some(function (u) { return u.alive && !u.devHidden && u.side === side && u.type === 'king'; });
        if (S.diff === 'super') {
          // 恶梦：缺将先补将；被压城先补防守子；对方没城时补机动进攻子
          if (noUnit && !hasKing && b.kind === 'city' && S.gold[side] >= priceOf('king', side)) {
            produce(x, y, 'king'); continue;
          }
          var threat = S.aiPlan ? S.aiPlan.threatLevel : threatenedBuildings(side).reduce(function (n, t) { return n + t.count; }, 0);
          if (noUnit) {
            var t = superProduction(b, threat);
            if (t && produce(x, y, t)) continue;
          }
          collectBuilding(x, y);
          continue;
        }
        if (noUnit && !hasKing && b.kind === 'city' && S.gold[side] >= priceOf('king', side)) {
          produce(x, y, 'king'); continue;
        }
        if (noUnit && S.gold[side] >= 75 && Math.random() < 0.5) {
          var opts = b.kind === 'village' ? ['pawn', 'advisor', 'elephant'] : ['pawn', 'advisor', 'elephant', 'rook', 'horse', 'cannon'];
          var t = pick(opts);
          if (S.gold[side] >= priceOf(t, side)) { produce(x, y, t); continue; }
        }
        collectBuilding(x, y);
      }
    }
  }
  function runAI(side) {
    side = side === 0 ? 0 : 1;
    if (S.over || S.aiRunning) return;
    S.aiRunning = true;
    S.aiSide = side;
    var aiEpoch = S.gameEpoch || 0;
    S.viewerSide = S.battleMode === 'selfplay' ? 0 : 1 - side;
    fishLine(pick(['（认真看着棋盘）轮到我了。', '（把棋子拿起来）这一步我想好了。', '（托腮）让我看看你的破绽。']));
    if (S.diff === 'super') S.aiPlan = buildSuperPlan(side);
    else S.aiPlan = null;
    var list = S.units.filter(function (u) { return u.alive && !u.devHidden && u.side === side && UNITS[u.type] && !UNITS[u.type].static; });
    var i = 0;
    function step() {
      if ((S.gameEpoch || 0) !== aiEpoch || S.over || S.screen !== 'game') { S.aiRunning = false; return; }
      if (pendingBusy() || moveAnimBusy()) { setTimeout(step, 120); return; }
      if (i >= list.length) {
        try { aiBuildings(side); } catch (e) { console.error('AI building error', e); }
        setTimeout(function () {
          S.aiRunning = false;
          if (S.over) return;
          if (S.battleMode === 'selfplay') {
            S.round++;
            log('—— 恶梦自弈：' + sideName(side) + '结束回合 ——');
            beginTurn(1 - side);
            return;
          }
          if (side === 1) {
            S.round++;
            log('—— 大肥鱼结束回合 ——');
            beginTurn(0);
            var pk = S.customName ? S.units.filter(function (u) { return u.side === 0 && u.type === 'king' && u.alive; })[0] : null;
            cameraToCell(pk ? pk.x : CAMPS.red.x, pk ? pk.y : CAMPS.red.y, true);
            fishLine(pick(['（放下棋子）该你了。', '（看着你）来，让我看看。', '（轻轻敲桌）轮到你了。']));
          }
        }, S.battleMode === 'selfplay' ? 30 : 380);
        return;
      }
      var u = list[i++];
      if (!u.alive || u.acted) { setTimeout(step, S.battleMode === 'selfplay' ? 10 : 120); return; }
      if (S.battleMode === 'selfplay') {
        try { aiUnit(u); } catch (e) { console.error('AI unit error', e); u.acted = true; }
        setTimeout(step, 10);
      } else if (u.stealth) {
        // 隐身士不追踪镜头
        try { aiUnit(u); } catch (e) { console.error('AI unit error', e); u.acted = true; }
        render();
        setTimeout(step, 300);
      } else {
        cameraToCell(u.x, u.y, true);
        setTimeout(function () {
          if (!u.alive || u.acted || S.over) { setTimeout(step, 120); return; }
          try { aiUnit(u); } catch (e) { console.error('AI unit error', e); u.acted = true; }
          render();
          setTimeout(step, 600);
        }, 430);
      }
    }
    setTimeout(step, S.battleMode === 'selfplay' ? 20 : 450);
  }

  /* ---------- 相机/渲染 ---------- */
  function camTarget(x, y) {
    var rect = stage ? stage.getBoundingClientRect() : { width: 900, height: 650 };
    var maxX = Math.max(0, W * S.cam.tile - rect.width);
    var maxY = Math.max(0, H * S.cam.tile - rect.height);
    return {
      x: clamp(x * S.cam.tile - rect.width / 2, 0, maxX),
      y: clamp(y * S.cam.tile - rect.height / 2, 0, maxY)
    };
  }
  function focusCell(x, y) {
    var t = camTarget(x, y);
    S.cam.x = t.x; S.cam.y = t.y; S.camAnim = null;
    clampCam(); dirty = true;
  }
  function cameraToCell(x, y, smooth) {
    if (S.battleMode === 'ai' && S.aiRunning) {
      var u = rawUnitAt(x, y);
      if (u && u.stealth) return;
    }
    var t = camTarget(x, y);
    if (smooth === false) { S.cam.x = t.x; S.cam.y = t.y; S.camAnim = null; dirty = true; return; }
    var dist = Math.abs(t.x - S.cam.x) + Math.abs(t.y - S.cam.y);
    if (dist < 6) { S.cam.x = t.x; S.cam.y = t.y; S.camAnim = null; dirty = true; return; }
    S.camAnim = {
      fromX: S.cam.x, fromY: S.cam.y, toX: t.x, toY: t.y,
      t0: performance.now(), dur: Math.min(620, Math.max(260, Math.sqrt(dist) * 8))
    };
    dirty = true;
  }
  function updateCamera(now) {
    if (!S.camAnim) return;
    var a = S.camAnim;
    var t = (now - a.t0) / a.dur;
    if (t >= 1) {
      S.cam.x = a.toX; S.cam.y = a.toY; S.camAnim = null;
    } else {
      t = Math.max(0, t);
      var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      S.cam.x = a.fromX + (a.toX - a.fromX) * e;
      S.cam.y = a.fromY + (a.toY - a.fromY) * e;
    }
    clampCam();
    dirty = true;
  }
  function clampCam() {
    var rect = stage ? stage.getBoundingClientRect() : { width: 900, height: 650 };
    var maxX = Math.max(0, W * S.cam.tile - rect.width);
    var maxY = Math.max(0, H * S.cam.tile - rect.height);
    S.cam.x = clamp(S.cam.x, 0, maxX);
    S.cam.y = clamp(S.cam.y, 0, maxY);
  }
  function screenCell(px, py) {
    return { x: Math.floor((S.cam.x + px) / S.cam.tile), y: Math.floor((S.cam.y + py) / S.cam.tile) };
  }
  function resizeCanvas() {
    if (!cv || !stage) return;
    var r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampCam(); dirty = true;
  }
  function drawImage(name, x, y, w, h) {
    var im = IMG[name];
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, x, y, w, h);
  }
  function rotateImage(name, px, py, ts, deg) {
    ctx.save();
    ctx.translate(px + ts / 2, py + ts / 2);
    ctx.rotate(deg * Math.PI / 180);
    drawImage(name, -ts / 2, -ts / 2, ts, ts);
    ctx.restore();
  }
  function drawRoadJunction(px, py, ts, n, s, e, w) {
    var cx = px + ts / 2, cy = py + ts / 2;
    ctx.save();
    ctx.lineCap = 'butt';
    function arms(color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      if (n) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py - 1); }
      if (s) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py + ts + 1); }
      if (e) { ctx.moveTo(cx, cy); ctx.lineTo(px + ts + 1, cy); }
      if (w) { ctx.moveTo(cx, cy); ctx.lineTo(px - 1, cy); }
      ctx.stroke();
    }
    arms('#8f6b3c', ts * .42);
    arms('#c99b5c', ts * .32);
    ctx.restore();
  }
  function drawTerrainBase(x, y, t) {
    var px = x * S.cam.tile - S.cam.x, py = y * S.cam.tile - S.cam.y;
    var ts = S.cam.tile + 1;
    // 每种地形用自己的底色；绿地图片只出现在真正的绿地格，不再给所有格垫绿地
    if (t === 0) {
      drawImage(T_IMG[0], px, py, ts, ts);
      return;
    }
    var base = {
      1: '#6f9444',   // 丘陵：草坡
      2: '#737d79',   // 中型山地：岩灰
      3: '#b4c0c4',   // 大型山地：雪岩浅灰
      4: '#426f3b',   // 小森林：深草绿
      5: '#2e5833',   // 大森林：更深的林地
      6: '#4d8bab',   // 河流：水色
      7: '#2d6b89',   // 水面
      8: '#b08a58',   // 道路：土色
      9: '#a58a63',   // 村庄：夯土
      10: '#907b5b'   // 城池：石土
    }[t] || '#6f9444';
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);
    if (t === 9 || t === 10) {
      var b = buildingAt(x, y);
      ctx.fillStyle = b.owner === 0 ? 'rgba(190,45,60,.22)' : b.owner === 1 ? 'rgba(35,45,70,.24)' : 'rgba(255,255,255,.06)';
      ctx.fillRect(px, py, ts, ts);
      drawImage(t === 9 ? 'village' : 'city', px + ts * .08, py + ts * .06, ts * .84, ts * .84);
      if (b.owner >= 0) {
        ctx.strokeStyle = b.owner === 0 ? '#e46272' : '#8994b8';
        ctx.lineWidth = 2; ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
        if (!b.acted && b.owner === S.turnSide) {
          ctx.fillStyle = 'rgba(255,220,110,.85)';
          ctx.beginPath(); ctx.arc(px + ts - 7, py + 7, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      return;
    }
    if (t === 8) {
      // 道路底图用草地，透明路口素材直接叠在草地上
      drawImage(T_IMG[0], px, py, ts, ts);
      var n = roadAt(x, y - 1), s = roadAt(x, y + 1), e = roadAt(x + 1, y), w = roadAt(x - 1, y);
      var rcount = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
      if (rcount >= 4) {
        drawImage('road_cross', px, py, ts, ts);
      } else if (rcount === 3) {
        // 新三叉素材默认连接 上+左+右（缺下），其余方向旋转
        if (!s) drawImage('road_t', px, py, ts, ts);
        else if (!w) rotateImage('road_t', px, py, ts, 90);
        else if (!n) rotateImage('road_t', px, py, ts, 180);
        else if (!e) rotateImage('road_t', px, py, ts, 270);
      } else if (n && s) drawImage('road_v', px, py, ts, ts);
      else if (e && w) drawImage('road_h', px, py, ts, ts);
      else if (n && e) drawImage('road_corner', px, py, ts, ts);
      else if (e && s) rotateImage('road_corner', px, py, ts, 90);
      else if (s && w) rotateImage('road_corner', px, py, ts, 180);
      else if (n && w) rotateImage('road_corner', px, py, ts, 270);
      else if (n || s) drawImage('road_v', px, py, ts, ts);
      else if (e || w) drawImage('road_h', px, py, ts, ts);
      return;
    }
    if (t === 6) {
      var rn = isRiver(x, y - 1), rs = isRiver(x, y + 1), re = isRiver(x + 1, y), rw = isRiver(x - 1, y);
      var wcount = (rn ? 1 : 0) + (rs ? 1 : 0) + (re ? 1 : 0) + (rw ? 1 : 0);
      if (wcount === 0) {
        drawImage('river_puddle', px, py, ts, ts);
        return;
      }
      if (wcount === 1) {
        // 河的尽头默认从右边接入，其余方向旋转
        if (re) drawImage('river_end', px, py, ts, ts);
        else if (rs) rotateImage('river_end', px, py, ts, 90);
        else if (rw) rotateImage('river_end', px, py, ts, 180);
        else if (rn) rotateImage('river_end', px, py, ts, 270);
        return;
      }
      if (wcount >= 4) {
        drawImage('river_cross', px, py, ts, ts);
      } else if (wcount === 3) {
        // 新三叉素材默认连接 上+左+右（缺下），其余方向旋转
        if (!rs) drawImage('river_t', px, py, ts, ts);
        else if (!rw) rotateImage('river_t', px, py, ts, 90);
        else if (!rn) rotateImage('river_t', px, py, ts, 180);
        else if (!re) rotateImage('river_t', px, py, ts, 270);
      } else if (rn && rs) drawImage('river_v', px, py, ts, ts);
      else if (re && rw) drawImage('river_h', px, py, ts, ts);
      else if (rn && re) drawImage('river_corner', px, py, ts, ts);
      else if (re && rs) rotateImage('river_corner', px, py, ts, 90);
      else if (rs && rw) rotateImage('river_corner', px, py, ts, 180);
      else if (rw && rn) rotateImage('river_corner', px, py, ts, 270);
      else drawImage(rn || rs ? 'river_v' : 'river_h', px, py, ts, ts);
      // 四河公共角补河水面：只补角，不补河岸
      var rnw = isRiver(x - 1, y - 1), rne = isRiver(x + 1, y - 1), rsw = isRiver(x - 1, y + 1), rse = isRiver(x + 1, y + 1);
      if (rn && rw && rnw) drawImage('river_fill_nw', px, py, ts, ts);
      if (rn && re && rne) drawImage('river_fill_ne', px, py, ts, ts);
      if (rs && rw && rsw) drawImage('river_fill_sw', px, py, ts, ts);
      if (rs && re && rse) drawImage('river_fill_se', px, py, ts, ts);
      return;
    }
    if (t === 7) {
      // 水面用连续纹理填充，避免每隔一格出现接缝；原图深色边框已裁掉
      var wpat = waterPattern;
      if (!wpat && IMG.water_base_cropped && IMG.water_base_cropped.complete) {
        try { wpat = waterPattern = ctx.createPattern(IMG.water_base_cropped, 'repeat'); } catch (e) { }
      }
      if (wpat) {
        try {
          if (wpat.setTransform) wpat.setTransform(new DOMMatrix().translate(-S.cam.x, -S.cam.y).scale(ts / TILE));
        } catch (e) { }
        ctx.fillStyle = wpat;
        ctx.fillRect(px, py, ts, ts);
      } else {
        drawImage('water_base_cropped', px - .6, py - .6, ts + 1.2, ts + 1.2);
      }
      // 之前概率出现的礁石水面继续保留
      if ((x * 7 + y * 13) % 17 === 0) drawImage('water_rock_cropped', px - .6, py - .6, ts + 1.2, ts + 1.2);
      return;
    }
    var img = T_IMG[t] || T_IMG[0];
    drawImage(img, px, py, ts, ts);
  }
  function roadAt(x, y) {
    if (!inMap(x, y)) return false;
    var t = S.map.terrain[idx(x, y)];
    return t === 8 || t === 9 || t === 10;
  }
  function isRiver(x, y) {
    if (!inMap(x, y)) return false;
    var t = S.map.terrain[idx(x, y)];
    return t === 6 || t === 7;
  }
  function drawUnit(u) {
    if (!u.alive || !unitVisible(u, S.viewerSide)) return;
    var ts = S.cam.tile;
    var vx = u.x, vy = u.y;
    if (u.anim) {
      var now = performance.now();
      var at = (now - u.anim.t0) / u.anim.dur;
      if (at >= 1) u.anim = null;
      else {
        at = Math.max(0, at);
        var path = u.anim.path;
        var f = at * (path.length - 1);
        var i = Math.floor(f);
        var fr = f - i;
        var a = path[i], b = path[Math.min(i + 1, path.length - 1)];
        vx = a[0] + (b[0] - a[0]) * fr;
        vy = a[1] + (b[1] - a[1]) * fr;
      }
    }
    var px = vx * ts - S.cam.x + ts / 2, py = vy * ts - S.cam.y + ts / 2;
    var size = ts * .88;
    if (u === S.selected) {
      ctx.beginPath(); ctx.arc(px, py, ts * .46, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.save();
    var alpha = 1;
    if (u.stealth) {
      alpha = 0.12 + 0.78 * (0.5 + 0.5 * Math.sin(performance.now() / 330));
    } else if (u.acted && u.side === S.turnSide) {
      alpha = .58;
    }
    ctx.globalAlpha = alpha;
    drawImage('p' + u.side + '_' + u.type, px - size / 2, py - size / 2, size, size);
    ctx.restore();
    // 血条：所有阵营统一；绿 > 2/3，黄 <= 2/3，红 <= 1/3，黑框
    var w = ts * .64, h = Math.max(4, ts * .09), bx = px - w / 2, by = py + ts * .30;
    var ratio = Math.max(0, Math.min(1, u.hp / u.hpMax));
    var barColor = ratio > 2 / 3 ? '#43b75b' : (ratio > 1 / 3 ? '#f0c419' : '#e34b4b');
    var bw = Math.max(1.5, Math.round(ts * .035));
    ctx.fillStyle = 'rgba(4,10,12,.78)'; ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = barColor; ctx.fillRect(bx, by, w * ratio, h);
    ctx.strokeStyle = '#000'; ctx.lineWidth = bw;
    ctx.strokeRect(bx - bw / 2, by - bw / 2, w + bw, h + bw);
    if (u.acted && u.side === S.turnSide) {
      ctx.fillStyle = 'rgba(20,40,60,.7)'; ctx.font = 'bold ' + Math.round(ts * .18) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✓', px, py - ts * .28);
    }
    if (u.stealth && u.side === S.viewerSide) {
      ctx.fillStyle = 'rgba(120,80,180,.8)'; ctx.font = Math.round(ts * .2) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('隐', px + ts * .24, py - ts * .2);
    }
  }
  function drawMarkers() {
    var ts = S.cam.tile;
    if (S.threatened) {
      for (var k in S.threatened) {
        var p = k.split(','), x = +p[0], y = +p[1];
        var px = x * ts - S.cam.x, py = y * ts - S.cam.y;
        if (px < -ts || py < -ts || px > cv.clientWidth || py > cv.clientHeight) continue;
        ctx.globalAlpha = .85;
        drawImage('threat', px + ts * .36, py + ts * .36, ts * .28, ts * .28);
      }
    }
    S.attackable.forEach(function (u) {
      if (!u.alive || !unitVisible(u, S.viewerSide)) return;
      var px = u.x * ts - S.cam.x, py = u.y * ts - S.cam.y;
      ctx.globalAlpha = .95;
      drawImage('attack', px + ts * .62, py + ts * .03, ts * .32, ts * .32);
    });
    ctx.globalAlpha = 1;
  }
  function drawFx() {
    if (!S.fx || !S.fx.length) return;
    var now = performance.now(), ts = S.cam.tile;
    function cx(x) { return x * ts - S.cam.x + ts / 2; }
    function cy(y) { return y * ts - S.cam.y + ts / 2; }
    function fxImg(key, x, y, ang, w, h, alpha) {
      var im = IMG[key];
      if (!im || !im.complete || !im.naturalWidth) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang || 0);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    function arcPoint(ax, ay, bx, by, p, amp) {
      return [ax + (bx - ax) * p, ay + (by - ay) * p - Math.sin(Math.PI * p) * amp];
    }
    function paraPoint(ax, ay, bx, by, p, amp) {
      // 抛物线高度 = -x² + amp（x 从 -1 到 1，顶点在中点）
      var x = 2 * p - 1;
      var height = -amp * x * x + amp;
      return [ax + (bx - ax) * p, ay + (by - ay) * p - height];
    }
    S.fx = S.fx.filter(function (f) { return now - f.t0 < f.dur; });
    S.fx.forEach(function (f) {
      if (now < f.t0) return;
      var p = Math.max(0, Math.min(1, (now - f.t0) / f.dur));
      var ax = cx(f.x1), ay = cy(f.y1), bx = cx(f.x2), by = cy(f.y2);
      var ang = Math.atan2(by - ay, bx - ax);
      if (f.type === 'slash') {
        // 以发动者为圆心，沿半圆挥向受击者；到受击者时消失
        var radius = Math.max(ts * .25, Math.hypot(bx - ax, by - ay));
        var start = ang - Math.PI;
        var theta = start + Math.PI * p;
        var sx = ax + Math.cos(theta) * radius;
        var sy = ay + Math.sin(theta) * radius;
        ctx.save();
        ctx.globalAlpha = .75 * (1 - p * .25);
        ctx.strokeStyle = 'rgba(210,250,255,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, radius, start, theta);
        ctx.stroke();
        ctx.restore();
        fxImg('fx_slash', sx, sy, theta + Math.PI / 2, ts * 1.1, ts * .88, .96 * (1 - p * .2));
      } else if (f.type === 'arrow') {
        var mx = ax + (bx - ax) * p, my = ay + (by - ay) * p;
        fxImg('fx_arrow', mx, my, ang + Math.PI / 2, ts * .14, ts * .85, .96);
      } else if (f.type === 'heal') {
        var arc = f.arc || 1;
        var hp = arcPoint(ax, ay, bx, by, p, ts * arc * .5);
        fxImg('fx_heal', hp[0], hp[1], 0, ts * .6, ts * .6, .96);
      } else if (f.type === 'fireball') {
        var farc = f.arc || 1;
        var fp = arcPoint(ax, ay, bx, by, p, ts * farc * .5);
        fxImg('fx_fireball', fp[0], fp[1], 0, ts * .55, ts * .55, .96);
      } else if (f.type === 'cannon_fire') {
        fxImg('fx_cannon_fire', ax, ay, ang, ts * .9, ts * .75, 1 - p);
      } else if (f.type === 'cannonball') {
        var carc = f.arc || 1;
        var cp = paraPoint(ax, ay, bx, by, p, ts * carc * .35);
        var dCells = Math.max(1, Math.hypot(f.x2 - f.x1, f.y2 - f.y1));
        var pp = Math.max(0, p - 15 / (dCells * ts));
        var tp = paraPoint(ax, ay, bx, by, pp, ts * carc * .35);
        ctx.save();
        ctx.globalAlpha = .78;
        ctx.strokeStyle = 'rgba(220,40,40,.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(cp[0], cp[1]); ctx.stroke();
        ctx.restore();
        fxImg('fx_cannonball', cp[0], cp[1], ang + Math.PI, ts * .7, ts * .22, .96);
      } else if (f.type === 'impact') {
        var ix = bx, iy = by;
        ctx.save(); ctx.globalAlpha = .9 * (1 - p);
        ctx.strokeStyle = '#ffe6a6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(ix, iy, ts * (.18 + p * .55), 0, Math.PI * 2); ctx.stroke();
        for (var k = 0; k < 8; k++) {
          var an = k * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(ix + Math.cos(an) * ts * (.22 + p * .18), iy + Math.sin(an) * ts * (.22 + p * .18));
          ctx.lineTo(ix + Math.cos(an) * ts * (.36 + p * .32), iy + Math.sin(an) * ts * (.36 + p * .32));
          ctx.stroke();
        }
        ctx.restore();
      } else if (f.type === 'detect') {
        var x0 = Math.max(0, f.x - f.r), y0 = Math.max(0, f.y - f.r);
        var x1 = Math.min(W - 1, f.x + f.r), y1 = Math.min(H - 1, f.y + f.r);
        ctx.save(); ctx.globalAlpha = .65 * (1 - p);
        ctx.strokeStyle = f.side === 0 ? '#ff6b7a' : '#8fa2ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(x0 * ts - S.cam.x + 2, y0 * ts - S.cam.y + 2, (x1 - x0 + 1) * ts - 4, (y1 - y0 + 1) * ts - 4);
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;
  }
  function drawElephantZones() {
    if (!S.map || S.battleMode === 'sandbox' || S.screen !== 'game') return;
    var ts = S.cam.tile;
    var x0 = Math.max(0, Math.floor(S.cam.x / ts)), y0 = Math.max(0, Math.floor(S.cam.y / ts));
    var x1 = Math.min(W - 1, Math.ceil((S.cam.x + cv.clientWidth) / ts)), y1 = Math.min(H - 1, Math.ceil((S.cam.y + cv.clientHeight) / ts));
    function paint(e, fill) {
      for (var dy = -5; dy <= 5; dy++) for (var dx = -5; dx <= 5; dx++) {
        if (Math.hypot(dx, dy) > 5) continue;
        var x = e.x + dx, y = e.y + dy;
        if (x < x0 || y < y0 || x > x1 || y > y1) continue;
        if (!inMap(x, y)) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(x * ts - S.cam.x, y * ts - S.cam.y, ts, ts);
      }
    }
    // 先画敌方庇护区，再画己方，重合处不会把己方白色盖掉
    S.units.forEach(function (e) {
      if (!e.alive || e.devHidden || e.type !== 'elephant' || e.side === S.viewerSide) return;
      paint(e, 'rgba(255,105,105,.28)');
    });
    S.units.forEach(function (e) {
      if (!e.alive || e.devHidden || e.type !== 'elephant' || e.side !== S.viewerSide) return;
      paint(e, 'rgba(255,255,255,.30)');
    });
  }
  function drawTowerRange() {
    if (!S.map || !S.towerRange || S.battleMode === 'sandbox' || S.screen !== 'game') return;
    if (!S.inspectTower || !S.inspectTower.alive) { S.towerRange = null; S.inspectTower = null; return; }
    var ts = S.cam.tile, tr = S.towerRange;
    var x0 = Math.max(0, Math.floor(S.cam.x / ts)), y0 = Math.max(0, Math.floor(S.cam.y / ts));
    var x1 = Math.min(W - 1, Math.ceil((S.cam.x + cv.clientWidth) / ts)), y1 = Math.min(H - 1, Math.ceil((S.cam.y + cv.clientHeight) / ts));
    ctx.fillStyle = 'rgba(70,175,235,.18)';
    for (var y = Math.max(y0, tr.y - tr.r1); y <= Math.min(y1, tr.y + tr.r1); y++) {
      for (var x = Math.max(x0, tr.x - tr.r1); x <= Math.min(x1, tr.x + tr.r1); x++) {
        var d = Math.hypot(x - tr.x, y - tr.y);
        if (d < tr.r0 || d > tr.r1) continue;
        ctx.fillRect(x * ts - S.cam.x, y * ts - S.cam.y, ts, ts);
      }
    }
    var px = tr.x * ts - S.cam.x, py = tr.y * ts - S.cam.y;
    ctx.strokeStyle = 'rgba(255,220,100,.95)'; ctx.lineWidth = 3;
    ctx.strokeRect(px + 3, py + 3, ts - 6, ts - 6);
  }
    function isDangerAt(x, y) {
    if (!S.map || x < 0 || y < 0 || x >= W || y >= H) return false;
    return S.map.terrain[y * W + x] === 7;
  }
  function drawDangerEdges(x, y) {
    var px = x * S.cam.tile - S.cam.x, py = y * S.cam.tile - S.cam.y;
    var ts = S.cam.tile + 1;
    if (isDangerAt(x, y - 1)) drawImage('terrain_edge_n', px, py, ts, ts);
    if (isDangerAt(x, y + 1)) drawImage('terrain_edge_s', px, py, ts, ts);
    if (isDangerAt(x + 1, y)) drawImage('terrain_edge_e', px, py, ts, ts);
    if (isDangerAt(x - 1, y)) drawImage('terrain_edge_w', px, py, ts, ts);
  }
  function drawTerrain(x, y, t) {
    drawTerrainBase(x, y, t);
    if (t === 0 || t === 8) drawDangerEdges(x, y);
  }
  function drawSandboxOverlay() {
    if (!isSandbox()) return;
    var ts = S.cam.tile;
    function box(x0, y0, x1, y1, fill, stroke) {
      var px = x0 * ts - S.cam.x, py = y0 * ts - S.cam.y;
      var w = (x1 - x0 + 1) * ts, h = (y1 - y0 + 1) * ts;
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(px, py, w, h); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(px + 1, py + 1, w - 2, h - 2); ctx.setLineDash([]); }
    }
    if (S.sbRegion) box(S.sbRegion.x0, S.sbRegion.y0, S.sbRegion.x1, S.sbRegion.y1, 'rgba(80,170,255,.12)', 'rgba(50,140,230,.9)');
    if (S.sbMarquee) {
      var a = S.sbMarquee;
      box(Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.max(a.x0, a.x1), Math.max(a.y0, a.y1), 'rgba(255,220,110,.14)', 'rgba(230,170,40,.95)');
    }
    if (S.sbDragActive && S.sbDragTarget) {
      var px = S.sbDragTarget.x * ts - S.cam.x, py = S.sbDragTarget.y * ts - S.cam.y;
      ctx.fillStyle = 'rgba(255,210,80,.3)'; ctx.fillRect(px, py, ts, ts);
      ctx.strokeStyle = '#e1a02b'; ctx.lineWidth = 3; ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
    }
  }
  function drawOverlays() {
    var ts = S.cam.tile, x0 = Math.max(0, Math.floor(S.cam.x / ts)), y0 = Math.max(0, Math.floor(S.cam.y / ts));
    var x1 = Math.min(W - 1, Math.ceil((S.cam.x + cv.clientWidth) / ts)), y1 = Math.min(H - 1, Math.ceil((S.cam.y + cv.clientHeight) / ts));
    if (S.threatened) {
      for (var k in S.threatened) {
        var p = k.split(','), x = +p[0], y = +p[1];
        if (x < x0 || y < y0 || x > x1 || y > y1) continue;
        ctx.fillStyle = 'rgba(240,190,60,.19)';
        ctx.fillRect(x * ts - S.cam.x, y * ts - S.cam.y, ts, ts);
      }
    }
    if (S.blocked) {
      S.blocked.forEach(function (b) {
        if (b[0] < x0 || b[1] < y0 || b[0] > x1 || b[1] > y1) return;
        ctx.fillStyle = 'rgba(50,55,65,.24)';
        ctx.fillRect(b[0] * ts - S.cam.x, b[1] * ts - S.cam.y, ts, ts);
      });
    }
    if (S.reach) {
      for (var i = 0; i < S.reach.dist.length; i++) {
        if (S.reach.dist[i] === 32767) continue;
        var x2 = i % W, y2 = (i / W) | 0;
        if (x2 < x0 || y2 < y0 || x2 > x1 || y2 > y1) continue;
        if (x2 === S.selected.x && y2 === S.selected.y) continue;
        ctx.fillStyle = 'rgba(66,190,112,.30)';
        ctx.fillRect(x2 * ts - S.cam.x, y2 * ts - S.cam.y, ts, ts);
        ctx.strokeStyle = 'rgba(40,140,80,.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(x2 * ts - S.cam.x + .5, y2 * ts - S.cam.y + .5, ts - 1, ts - 1);
      }
    }
    S.attackable.forEach(function (u) {
      if (!unitVisible(u, S.viewerSide)) return;
      ctx.strokeStyle = 'rgba(230,70,70,.95)'; ctx.lineWidth = 3;
      ctx.strokeRect(u.x * ts - S.cam.x + 3, u.y * ts - S.cam.y + 3, ts - 6, ts - 6);
    });
    if (S.path && S.path.length > 1) {
      ctx.beginPath();
      for (var j = 0; j < S.path.length; j++) {
        var px = S.path[j][0] * ts - S.cam.x + ts / 2, py = S.path[j][1] * ts - S.cam.y + ts / 2;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(255,240,160,.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
  }
  function render() {
    if (!ctx || !cv) return;
    var w = cv.clientWidth, h = cv.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!S.map || S.screen === 'menu' && false) {
      ctx.fillStyle = '#6b8d5b'; ctx.fillRect(0, 0, w, h); return;
    }
    var ts = S.cam.tile;
    var x0 = Math.max(0, Math.floor(S.cam.x / ts)), y0 = Math.max(0, Math.floor(S.cam.y / ts));
    var x1 = Math.min(W - 1, Math.ceil((S.cam.x + w) / ts)), y1 = Math.min(H - 1, Math.ceil((S.cam.y + h) / ts));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      drawTerrain(x, y, S.map.terrain[idx(x, y)]);
    }
    drawElephantZones();
    drawTowerRange();
    drawOverlays();
    S.units.forEach(drawUnit);
    drawFx();
    drawMarkers();
    drawSandboxOverlay();
    drawMinimap();
    dirty = false;
  }
  function drawSbMiniHighlight(cell) {
    if (!isSandbox() || !S.sbHighlight) return;
    var p = S.sbHighlight.split(':');
    if (p[0] === 't') {
      var code = +p[1];
      mctx.fillStyle = 'rgba(255,225,70,.75)';
      for (var i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === code) {
        var x = i % W, y = (i / W) | 0;
        mctx.fillRect(x * cell, y * cell, Math.max(1.5, cell), Math.max(1.5, cell));
      }
    } else if (p[0] === 'tower') {
      var owner = +p[1];
      S.units.forEach(function (u) {
        if (u.side !== owner || u.type !== 'tower') return;
        mctx.strokeStyle = '#ffe14a'; mctx.lineWidth = 2;
        mctx.beginPath(); mctx.arc(u.x * cell, u.y * cell, Math.max(2.5, cell * 1.3), 0, Math.PI * 2); mctx.stroke();
      });
    } else if (p[0] === 'b') {
      var bcode = +p[1], bowner = +p[2];
      mctx.fillStyle = 'rgba(255,225,70,.8)';
      for (var j = 0; j < S.map.terrain.length; j++) if (S.map.terrain[j] === bcode && S.map.owner[j] === bowner) {
        var bx = j % W, by = (j / W) | 0;
        mctx.fillRect(bx * cell, by * cell, Math.max(1.5, cell), Math.max(1.5, cell));
      }
    } else if (p[0] === 'u') {
      var side = +p[1], type = p[2];
      S.units.forEach(function (u) {
        if (u.side !== side || u.type !== type) return;
        mctx.strokeStyle = '#ffe14a'; mctx.lineWidth = 2;
        mctx.beginPath(); mctx.arc(u.x * cell, u.y * cell, Math.max(2.5, cell * 1.3), 0, Math.PI * 2); mctx.stroke();
      });
    }
  }
  function drawMinimap() {
    if (!mini || !S.map) return;
    var w = mini.width, h = mini.height;
    var cell = w / W;
    // 先整体清空，否则移动镜头时上一帧的白色视野框会留在小地图上形成残影
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#79a85c';
    mctx.fillRect(0, 0, w, h);
    for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) {
      var t = S.map.terrain[idx(x, y)];
      mctx.fillStyle = t === 7 ? '#5f8fb3' : t === 6 ? '#72a9c9' : t === 3 ? '#8d8d8d' : t === 2 ? '#a8a8a8' : t === 1 ? '#b0a45c' : t === 5 ? '#2f6b3a' : t === 4 ? '#3f7d45' : t === 8 ? '#c9a76a' : t === 9 ? '#d6b46a' : t === 10 ? '#b78b4a' : '#79a85c';
      mctx.fillRect(x * cell, y * cell, cell * 2, cell * 2);
    }
    // 建筑：红/黑对应色方块，中立白色方块
    var bsize = Math.max(3, cell * 1.8);
    for (var bi = 0; bi < S.map.terrain.length; bi++) {
      var bt = S.map.terrain[bi];
      if (bt !== 9 && bt !== 10) continue;
      var bx = bi % W, by = (bi / W) | 0;
      var bo = S.map.owner[bi];
      mctx.fillStyle = bo === 0 ? '#d7475a' : bo === 1 ? '#39435e' : '#ffffff';
      mctx.fillRect(bx * cell + cell / 2 - bsize / 2, by * cell + cell / 2 - bsize / 2, bsize, bsize);
      mctx.strokeStyle = bo === -1 ? 'rgba(40,60,70,.8)' : 'rgba(255,255,255,.8)';
      mctx.lineWidth = Math.max(1, cell * .25);
      mctx.strokeRect(bx * cell + cell / 2 - bsize / 2, by * cell + cell / 2 - bsize / 2, bsize, bsize);
    }
    S.units.forEach(function (u) {
      if (!u.alive || !unitVisible(u, S.viewerSide)) return;
      mctx.fillStyle = u.side === 0 ? '#d7475a' : '#39435e';
      mctx.beginPath(); mctx.arc(u.x * cell, u.y * cell, Math.max(1.4, cell * .9), 0, Math.PI * 2); mctx.fill();
    });
    drawSbMiniHighlight(cell);
    mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 1.5;
    mctx.strokeRect(S.cam.x / S.cam.tile * cell, S.cam.y / S.cam.tile * cell,
      (stage ? stage.clientWidth : 900) / S.cam.tile * cell, (stage ? stage.clientHeight : 650) / S.cam.tile * cell);
  }
  function hasAnim() {
    if (S.camAnim) return true;
    if (S.pending && S.pending.length) return true;
    var need = false;
    if (S.screen === 'game' && S.units && S.units.some(function (u) { return u.alive && u.stealth && unitVisible(u, S.viewerSide); })) return true;
    if (S.fx && S.fx.length) {
      var fnow = performance.now();
      var before = S.fx.length;
      S.fx = S.fx.filter(function (f) { return fnow - f.t0 < f.dur; });
      if (S.fx.length) return true;
      if (S.fx.length < before) need = true;
    }
    var now = performance.now();
    for (var i = 0; i < S.units.length; i++) {
      var u = S.units[i];
      if (!u.anim) continue;
      if (now - u.anim.t0 >= u.anim.dur) { u.anim = null; need = true; }
      else return true;
    }
    // 最后一次动画已经被移除时，强制补一帧清掉画布上的残影
    return need;
  }
  function frame(ts) {
    updateCamera(ts);
    processPending();
    var mb = moveAnimBusy();
    if (mb !== lastMoveBusy) { lastMoveBusy = mb; refreshHud(); }
    if (dirty || hasAnim() || S.battleMode === 'ai' && S.aiRunning) { render(); }
    raf = requestAnimationFrame(frame);
  }

  /* ---------- UI ---------- */
  function refreshHud() {
    if (!S.map) return;
    var r = $('warRound'), g0 = $('warGold0'), g1 = $('warGold1'), end = $('warEnd');
    if (r) r.textContent = S.round;
    if (g0) g0.textContent = S.gold[0];
    if (g1) g1.textContent = S.gold[1];
    if (end) {
      var can = S.screen === 'game' && !S.over && !S.aiRunning && S.battleMode !== 'sandbox' && S.battleMode !== 'selfplay' && !pendingBusy() && !moveAnimBusy() &&
        !(S.battleMode === 'ai' && S.turnSide === 1) &&
        (S.battleMode !== 'online' || S.mySide === S.turnSide);
      end.disabled = !can;
      end.textContent = S.battleMode === 'hotseat' ? '结束 ' + sideName(S.turnSide) + '回合' : '结束回合';
    }
    var tm = $('warTopMode');
    if (tm) tm.textContent = S.battleMode === 'ai' ? '和大肥鱼玩 · ' + diffName(S.diff) : S.battleMode === 'selfplay' ? '恶梦自弈训练' : S.battleMode === 'hotseat' ? '双人对决' : S.battleMode === 'online' ? '联机对战' : S.battleMode === 'sandbox' ? '战棋沙盘' : '';
    var tb = $('warTurnBadge');
    if (tb) {
      if (S.screen === 'menu') { tb.textContent = '选择玩法'; tb.className = 'war-stat'; }
      else if (S.battleMode === 'sandbox') { tb.textContent = '自由绘制'; tb.className = 'war-stat'; }
      else if (S.battleMode === 'selfplay') {
        var left = S.selfplayTraining ? S.selfplayTraining.left : 1;
        tb.textContent = '自弈 · 第 ' + (S.selfplayTraining ? S.selfplayTraining.total - left + 1 : 1) + ' / ' + (S.selfplayTraining ? S.selfplayTraining.total : 1) + ' 局';
        tb.className = 'war-stat';
      }
      else { tb.textContent = sideName(S.turnSide) + '回合'; tb.className = 'war-stat ' + sideColor(S.turnSide); }
    }
    var tmap = $('warTopMap');
    if (tmap && S.map) {
      var mapLabel = S.customName || (S.battleMode === 'sandbox' ? (S.sandboxName || '自由地图') : (MAPS[S.mapChoice] ? MAPS[S.mapChoice].name : ''));
      if (S.online && S.roomCode) mapLabel += ' · 房间 ' + S.roomCode;
      tmap.textContent = '· ' + mapLabel;
    } else if (tmap) tmap.textContent = '';
    var mi = $('warMapInfo');
    if (mi && S.map) { var c = mapCounts(S.map); mi.textContent = '绿 ' + Math.round((c[0] || 0) / 64) + '% · 山 ' + Math.round(((c[1] || 0) + (c[2] || 0) + (c[3] || 0)) / 64) + '% · 林 ' + Math.round(((c[4] || 0) + (c[5] || 0)) / 64) + '% · 水 ' + Math.round(((c[6] || 0) + (c[7] || 0)) / 64) + '%'; }
    var srcEl = $('warSources');
    if (srcEl && S.map) {
      var gs0 = goldSources(0), gs1 = goldSources(1);
      srcEl.innerHTML = '红：将 ' + (gs0.king ? '✓' : '✗') + ' · 村庄/城池 ' + gs0.buildings +
        '<br>黑：将 ' + (gs1.king ? '✓' : '✗') + ' · 村庄/城池 ' + gs1.buildings;
    }
  }
  function diffName(d) { return d === 'advanced' ? '我让你熟悉规则（高级）' : d === 'super' ? '我要展现真正实力了（恶梦）' : '我认真下（终极）'; }

  /* ---------- 菜单 ---------- */
  function showMenu() {
    leaveSandboxUI();
    S.screen = 'menu'; S.battleMode = null; S.over = null; S.aiRunning = false; S.pending = []; S.towerRange = null; S.inspectTower = null;
    var menu = $('warMenu'); if (menu) menu.hidden = false;
    var sb = $('warSandbox'); if (sb) sb.hidden = true;
    var end = $('warEnd'); if (end) end.disabled = true;
    renderMenu();
    refreshHud(); render();
  }
  function renderMenu() {
    var cards = $('warModeCards');
    if (cards) cards.querySelectorAll('[data-mode]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === S.mode && !!S.mode);
      b.onclick = function () {
        var m = b.getAttribute('data-mode');
        if (m === 'library') { S.mode = 'library'; renderMenu(); return; }
        S.mode = m;
        if (m === 'hotseat' || m === 'ai' || m === 'online') { S.battleMode = m; }
        renderMenu();
      };
    });
    var opts = $('warOptions'); if (!opts) return;
    if (S.mode === 'library') { renderLibrary(); return; }
    var html = '';
    html += '<h3>地图</h3><div class="war-opt-row" id="warMapRow">';
    MAPS.forEach(function (m, i) {
      html += '<button class="war-map-card' + (i === S.mapChoice ? ' on' : '') + '" data-map="' + i + '">' + m.name + '</button>';
    });
    html += '</div>';
    if (S.mode === 'ai') {
      html += '<h3>难度</h3><div class="war-opt-row" id="warDiffRow">';
      [['advanced', '我让你熟悉规则'], ['ultimate', '我认真下'], ['super', '我要展现真正实力了（恶梦）']].forEach(function (d) {
        html += '<button class="war-diff-card' + (d[0] === S.diff ? ' on' : '') + '" data-diff="' + d[0] + '">' + d[1] + '</button>';
      });
      html += '</div>';
    }
    if (S.mode === 'online') {
      html += '<h3>联机房间</h3><p class="tiny">跨电脑：房主创建房间后点“复制跨电脑邀请链接”，把链接发给另一台电脑；对方把链接粘贴到浏览器地址栏打开，或在“房间号”框里粘贴链接后点加入。只填房间号只能在同机浏览器联机。</p>';
      html += '<div class="war-room-box"><button class="war-opt-btn" id="warCreate">创建房间</button><span id="warRoomInfo" class="war-wait"></span></div>';
      html += '<div class="war-room-box"><input id="warServerInput" maxlength="300" placeholder="房主服务器地址（可留空，直接粘贴邀请链接）" /></div>';
      html += '<div class="war-room-box"><input id="warRoomInput" maxlength="300" placeholder="房间号，或粘贴邀请链接" /><button class="war-opt-btn" id="warJoin">加入</button></div>';
    }
    if (S.mode === 'sandbox') {
      html += '<p class="tiny">自由绘制 80×80 地图，随意放棋子；保存到本地保存库。</p>';
    }
    opts.innerHTML = html;
    opts.querySelectorAll('[data-map]').forEach(function (b) { b.onclick = function () { S.mapChoice = +b.getAttribute('data-map'); renderMenu(); }; });
    opts.querySelectorAll('[data-diff]').forEach(function (b) { b.onclick = function () { S.diff = b.getAttribute('data-diff'); renderMenu(); }; });
    var start = $('warStart'); if (start) { start.disabled = !S.mode; start.onclick = startSelected; }
    var create = $('warCreate'); if (create) create.onclick = createRoom;
    var join = $('warJoin'); if (join) join.onclick = joinRoom;
  }
  function startSelected() {
    if (!S.mode) return;
    if (S.mode === 'sandbox') { startSandbox(); return; }
    if (S.mode === 'online') { if (!S.online) { toast('先创建或加入房间'); return; } startOnlineGame(); return; }
    startGame(S.mode, S.mapChoice, S.diff);
  }
  function clearOnline() {
    if (S.online) {
      onlinePollStop(S.online);
      try { if (S.online.chan) S.online.chan.close(); } catch (e) { }
    }
    S.online = null; S.roomCode = ''; S.waitGuest = false;
    hideOnlineOverlay();
    var st = $('warStart'); if (st) { st.disabled = false; st.textContent = '开始'; }
    var info = $('warRoomInfo'); if (info) info.innerHTML = '';
  }
  function startGame(mode, mapIndex, diff) {
    if (mode === 'online') { startOnlineGame(); return; }
    S.gameEpoch = (S.gameEpoch || 0) + 1;
    S.aiGameStats = freshGameStats();
    leaveSandboxUI();
    clearOnline();
    setBoardSize(80, 80);
    S.battleMode = mode; S.mapChoice = mapIndex; S.diff = diff;
    S.mySide = 0;
    var m = genMap(MAPS[mapIndex].seed);
    S.map = m; S.units = m.units;
    placeArmy(m, 0); placeArmy(m, 1);
    placeDefenseTower(m, 0); placeDefenseTower(m, 1);
    S.gold = [50, 50]; S.round = 1; S.over = null; S.log = []; S.fx = []; S.pending = [];
    S.customName = '';
    S.screen = 'game'; S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null; S.healMode = false; S.aiRunning = false;
    S.viewerSide = 0; S.revealAll = mode === 'selfplay';
    S.cam.tile = TILE;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    var sb = $('warSandbox'); if (sb) sb.hidden = true;
    focusCell(CAMPS.red.x, CAMPS.red.y);
    refreshHud(); log('—— 战棋开始：' + MAPS[mapIndex].name + ' ——');
    if (mode === 'ai') fishLine('（把袖子挽起来）我认真下了哦。');
    beginTurn(0);
    render();
  }
  function snapshotSandboxForTraining() {
    if (!S.map) return null;
    return {
      w: W, h: H,
      terrain: Array.from(S.map.terrain),
      owner: Array.from(S.map.owner),
      units: S.units.map(function (u) {
        return { side: u.side, type: u.type, x: u.x, y: u.y, hp: u.hp, dev: u.dev ? { appear: u.dev.appear, disappear: u.dev.disappear } : null };
      }),
      name: S.sandboxName || '沙盘地图'
    };
  }
  function startSelfPlay(training, randomMaps) {
    var current = training && !randomMaps ? snapshotSandboxForTraining() : null;
    S.selfplayTraining = training ? {
      total: 10, left: 10, results: [], map: current, useCurrent: !!current,
      stats: freshGameStats()
    } : null;
    startSelfPlayRound();
  }
  function startSelfPlayRound() {
    var tr = S.selfplayTraining;
    if (!tr || tr.left <= 0) { showTrainingSummary(); return; }
    tr.stats = freshGameStats();
    if (tr.map) {
      var snap = tr.map;
      setBoardSize(snap.w, snap.h);
      S.map = { seed: 0, w: snap.w, h: snap.h, terrain: Uint8Array.from(snap.terrain), owner: Int8Array.from(snap.owner), acted: new Uint8Array(snap.w * snap.h), units: [] };
      S.units = (snap.units || []).map(function (x) {
        var type = UNITS[x.type] ? x.type : 'pawn';
        var u = makeUnit(x.side === 1 ? 1 : 0, type, x.x, x.y);
        if (x.hp != null) u.hp = x.hp;
        if (x.dev) u.dev = { appear: x.dev.appear || null, disappear: x.dev.disappear || null };
        return u;
      });
      S.map.units = S.units;
      S.sandboxName = snap.name;
      startCustomBattle('selfplay', 'super');
      return;
    }
    var idx = Math.floor(Math.random() * MAPS.length);
    startGame('selfplay', idx, 'super');
  }
  function showTrainingSummary() {
    var tr = S.selfplayTraining;
    if (!tr) return;
    var r = [0, 0, 0];
    tr.results.forEach(function (w) { if (w === 0) r[0]++; else if (w === 1) r[1]++; else r[2]++; });
    var lessons = S.aiLessons || [];
    var last = lessons[lessons.length - 1];
    var lessonText = last ? '最近失败经验：' + last.cause.join('、') + '；胜方主策略 ' + last.winnerStrategy + '，败方主策略 ' + last.loserStrategy + '。' : '还没有失败样本。';
    var wt = S.aiWeights || {};
    var weightText = '当前恶梦权重：防守 ' + (+wt.defend || 1).toFixed(2) + ' / 追将 ' + (+wt.hunt || 1).toFixed(2) + ' / 夺城 ' + (+wt.capture || 1).toFixed(2) + ' / 发展 ' + (+wt.develop || 1).toFixed(2);
    var ss = S.aiStrategy || freshStrategyStats();
    var statText = STRATEGY_KEYS.map(function (k) {
      var s = ss[k] || {}; var total = (s.wins || 0) + (s.losses || 0);
      var rate = total ? Math.round((s.wins || 0) / total * 100) : 0;
      return ({ defend: '防守', hunt: '追将', capture: '夺城', develop: '发展', grab: '抢占资源', mass: '屯兵强攻' })[k] + ' ' + (s.picks || 0) + '次/胜率' + rate + '%';
    }).join(' · ');
    modal('<button class="war-modal-close" type="button">×</button><h2>恶梦自弈训练完成</h2>' +
      '<p>共 ' + tr.total + ' 局' + (tr.useCurrent ? '（固定当前地图）' : '（随机地图）') + '：红方胜 ' + r[0] + '，黑方胜 ' + r[1] + '，平局 ' + r[2] + '。</p>' +
      '<p class="tiny">' + esc(lessonText) + '<br>' + esc(weightText) + '<br>' + esc(statText) + '</p>' +
      '<p>两边都使用恶梦策略；失败经验会调整下一轮策略权重。</p>' +
      '<div class="war-opt-row" style="justify-content:center"><button class="war-opt-btn" id="warSelfplayAgain">再来 10 局</button><button class="war-opt-btn" id="warSelfplayClose">关闭</button></div>');
    var a = $('warSelfplayAgain'), b = $('warSelfplayClose');
    if (a) a.addEventListener('click', function () { closeModal(); startSelfPlay(true, !tr.useCurrent); });
    if (b) b.addEventListener('click', function () { closeModal(); showMenu(); });
  }
  function placeArmyAt(m, side, bx, by) {
    var used = {};
    m.units.forEach(function (u) { used[u.x + ',' + u.y] = 1; });
    FORMATION.forEach(function (f) {
      var type = f[0], dx = f[1], dy = side === 0 ? f[2] : -f[2];
      var px = bx + dx, py = by + dy;
      var xy = findFreeCell(m, side, type, px, py, used);
      if (!xy || !passableTerrain(UNITS[type], m.terrain[idx(xy[0], xy[1])])) return;
      var u = makeUnit(side, type, xy[0], xy[1]);
      m.units.push(u);
    });
  }
  function prepareCustomMap(src, srcUnits) {
    src = src || {};
    var terrain = src.terrain ? Uint8Array.from(src.terrain) : new Uint8Array(W * H);
    var owner = src.owner ? Int8Array.from(src.owner) : new Int8Array(W * H);
    for (var oi = 0; oi < owner.length; oi++) if (owner[oi] < -1 || owner[oi] > 1) owner[oi] = -1;
    var m = { seed: 0, w: W, h: H, terrain: terrain, owner: owner, acted: new Uint8Array(W * H), units: [], mapName: '沙盘地图' };
    var used = {};
    var list = (srcUnits || src.units || []).slice();
    list.forEach(function (x) {
      var side = x.side === 1 ? 1 : 0;
      var type = UNITS[x.type] ? x.type : 'pawn';
      var ux = Number(x.x), uy = Number(x.y);
      if (!isFinite(ux) || !isFinite(uy) || !inMap(ux, uy)) { ux = side === 0 ? 10 : W - 10; uy = side === 0 ? H - 10 : 10; }
      ux = Math.round(ux); uy = Math.round(uy);
      var d = UNITS[type];
      if (used[ux + ',' + uy] || !passableTerrain(d, m.terrain[idx(ux, uy)])) {
        var pos = findFreeCell(m, side, type, ux, uy, used);
        ux = pos[0]; uy = pos[1];
      }
      if (used[ux + ',' + uy] && !passableTerrain(d, m.terrain[idx(ux, uy)])) return;
      if (!passableTerrain(d, m.terrain[idx(ux, uy)])) return;
      used[ux + ',' + uy] = 1;
      var u = makeUnit(side, type, ux, uy);
      if (x.hp != null) u.hp = clamp(Number(x.hp) || d.hp, 1, d.hp);
      if (x.dev) u.dev = { appear: x.dev.appear || null, disappear: x.dev.disappear || null };
      m.units.push(u);
    });
    [0, 1].forEach(function (side) {
      var own = m.units.filter(function (u) { return u.side === side && u.alive; });
      if (!own.length) {
        var ax = side === 0 ? 10 : W - 10, ay = side === 0 ? H - 10 : 10;
        var anchor = findFreeCell(m, side, 'king', ax, ay, used);
        placeArmyAt(m, side, anchor[0], anchor[1]);
      } else if (!own.some(function (u) { return u.type === 'king'; })) {
        var p = own[0];
        var xy = findFreeCell(m, side, 'king', p.x, p.y, used);
        if (xy && passableTerrain(UNITS.king, m.terrain[idx(xy[0], xy[1])])) {
          var k = makeUnit(side, 'king', xy[0], xy[1]);
          m.units.push(k);
          used[xy[0] + ',' + xy[1]] = 1;
        }
      }
    });
    [0, 1].forEach(function (side) {
      var has = false;
      for (var i = 0; i < m.terrain.length; i++) {
        if ((m.terrain[i] === 9 || m.terrain[i] === 10) && m.owner[i] === side) { has = true; break; }
      }
      if (!has) {
        var k = m.units.filter(function (u) { return u.side === side && u.type === 'king'; })[0] ||
          m.units.filter(function (u) { return u.side === side; })[0];
        var bx = k ? k.x : (side === 0 ? 10 : W - 10), by = k ? k.y : (side === 0 ? H - 10 : 10);
        if (!inMap(bx, by)) { bx = side === 0 ? 10 : W - 10; by = side === 0 ? H - 10 : 10; }
        var ti = idx(bx, by);
        m.terrain[ti] = 10;
        m.owner[ti] = side;
        m.acted[ti] = 0;
      }
    });
    m.units.forEach(function (u) { u.hp = clamp(u.hp, 1, u.hpMax); });
    return m;
  }
  function startCustomBattle(mode, diff) {
    if (!S.map) { toast('没有可用的沙盘地图'); return; }
    S.gameEpoch = (S.gameEpoch || 0) + 1;
    S.aiGameStats = freshGameStats();
    if (mode === 'online') {
      if (!S.online || S.online.role !== 'host') { toast('先创建房间'); return; }
      if (!S.online.guestJoined) { toast('等待玩家加入后再开始'); return; }
    }
    setBoardSize(S.map.w || 80, S.map.h || 80);
    var prepared = prepareCustomMap(S.map, S.units);
    if (!prepared || !prepared.units.length) { toast('这张沙盘地图无法开始，需要至少一个可放置棋子'); return; }
    var pk0 = prepared.units.filter(function (u) { return u.side === 0 && u.type === 'king'; })[0];
    var pk1 = prepared.units.filter(function (u) { return u.side === 1 && u.type === 'king'; })[0];
    if (!pk0 || !pk1) { toast('这张沙盘地图没有足够可站立的位置，先补一些陆地再试'); return; }
    if (mode === 'online') {
      beginOnlinePregame({ kind: 'custom', mapName: S.sandboxName || '沙盘地图', prepared: prepared });
      return;
    }
    leaveSandboxUI();
    if (mode !== 'online') clearOnline();
    S.battleMode = mode; S.diff = diff || S.diff || 'ultimate';
    S.map = prepared; S.units = prepared.units; prepared.units = S.units;
    var startGold = normalizeStartGold(S.sbStartGold);
    S.gold = [startGold[0], startGold[1]]; S.round = 1; S.over = null; S.log = []; S.fx = []; S.pending = [];
    S.storyOpening = normalizeSbStory(S.sbStory);
    S.customName = S.sandboxName || '沙盘地图';
    S.screen = 'game'; S.mySide = 0; S.viewerSide = 0; S.revealAll = mode === 'selfplay';
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null;
    S.healMode = false; S.aiRunning = false; S.camAnim = null;
    S.cam.tile = TILE;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    var sb = $('warSandbox'); if (sb) sb.hidden = true;
    var k = S.units.filter(function (u) { return u.side === 0 && u.type === 'king'; })[0];
    focusCell(k ? k.x : 40, k ? k.y : 70);
    log('—— 沙盘对战：' + S.customName + ' ——');
    beginTurn(0);
    render();
    if (mode !== 'selfplay') showStoryOpening();
  }
  function openSandboxPlay() {
    var name = S.sandboxName || '自由地图';
    var html = '<button class="war-modal-close" type="button">×</button><h2>用沙盘地图开始</h2>' +
      '<p>当前地图：<b>' + esc(name) + '</b>。缺少的将/主城/道路会在开始时自动补齐，不改动沙盘原图。</p>' +
      '<h3>双人 / 大肥鱼</h3>' +
      '<div class="war-opt-row"><button class="war-opt-btn" data-play="hotseat">双人对决</button>' +
      '<button class="war-opt-btn" data-play="ai" data-diff="advanced">和大肥鱼 · 高级</button>' +
      '<button class="war-opt-btn" data-play="ai" data-diff="ultimate">和大肥鱼 · 终极</button>' +
      '<button class="war-opt-btn" data-play="ai" data-diff="super">和大肥鱼 · 我要展现真正实力了（恶梦）</button></div>' +
      '<h3>恶梦自弈训练</h3>' +
      '<div class="war-opt-row"><button class="war-opt-btn" data-play="selfplay-current">当前地图 · 10 局</button>' +
      '<button class="war-opt-btn" data-play="selfplay-random">随机地图 · 10 局</button></div>' +
      '<p class="tiny">当前地图会固定用这张沙盘；随机地图每局从内置地图随机选。</p>' +
      '<h3>联机对战</h3>' +
      '<div class="war-opt-row"><input id="warPlayServerInput" maxlength="300" placeholder="房主服务器地址（可留空，直接粘贴邀请链接）" style="width:18em;padding:.45vh .55vw;border:2px solid #d6ecfb;border-radius:10px;text-align:center" /></div>' +
      '<div class="war-opt-row"><button class="war-opt-btn" data-play="online-host">创建房间并开始</button>' +
      '<input id="warPlayRoomInput" maxlength="300" placeholder="房间号，或粘贴邀请链接" style="width:14em;padding:.45vh .55vw;border:2px solid #d6ecfb;border-radius:10px;text-align:center" />' +
      '<button class="war-opt-btn" data-play="online-join">加入</button></div>' +
      '<p class="tiny">跨电脑：房主点“复制跨电脑邀请链接”，对方把链接贴到浏览器地址栏，或直接贴在“房间号/邀请链接”框里。只填房间号只能在同机浏览器联机。</p>';
    modal(html);
    var panel = document.querySelector('.war-modal-panel');
    panel.querySelectorAll('[data-play]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-play');
        if (kind === 'online-join') {
          var inp = $('warPlayRoomInput');
          var code = inp ? inp.value.trim() : '';
          var srv = $('warPlayServerInput');
          var server = srv ? srv.value.trim() : '';
          if (!code && !server) { toast('输入房间号，或粘贴邀请链接'); return; }
          closeModal(); joinRoomCode(code, server); return;
        }
        closeModal();
        if (kind === 'hotseat') startCustomBattle('hotseat');
        else if (kind === 'ai') startCustomBattle('ai', btn.getAttribute('data-diff'));
        else if (kind === 'selfplay' || kind === 'selfplay-current') { startSelfPlay(true, false); return; }
        else if (kind === 'selfplay-random') { startSelfPlay(true, true); return; }
        else if (kind === 'online-host') {
          if (!S.online || S.online.role !== 'host') {
            showOnlineOverlay();
            createRoom();
            return;
          }
          showOnlineOverlay();
          if (S.online.guestJoined) toast('玩家已加入，点击“开始游戏”');
          else toast('等待玩家加入，加入后点“开始游戏”');
        }
      });
    });
  }

  /* ---------- 沙盘编辑器 ---------- */
  function isSandbox() { return S.battleMode === 'sandbox' && S.screen === 'game'; }
  function setBoardSize(w, h) { W = w; H = h; }
  function resizeSandbox(nw, nh) {
    nw = Math.round(+nw); nh = Math.round(+nh);
    if (!isFinite(nw) || !isFinite(nh) || nw < 10 || nh < 10 || nw > 200 || nh > 200) {
      toast('画布尺寸需在 10×10 到 200×200 之间'); return;
    }
    if (nw === W && nh === H) { updateSbTop(); return; }
    sbPushUndo();
    var oldW = W, oldH = H, old = S.map;
    var t = new Uint8Array(nw * nh), o = new Int8Array(nw * nh);
    for (var i = 0; i < o.length; i++) o[i] = -1;
    var cw = Math.min(nw, oldW), ch = Math.min(nh, oldH);
    for (var yy = 0; yy < ch; yy++) for (var xx = 0; xx < cw; xx++) {
      t[yy * nw + xx] = old.terrain[yy * oldW + xx];
      o[yy * nw + xx] = old.owner[yy * oldW + xx];
    }
    var before = S.units.length;
    S.units = S.units.filter(function (u) { return u.x < nw && u.y < nh; });
    var removed = before - S.units.length;
    setBoardSize(nw, nh);
    S.map = { seed: 0, terrain: t, owner: o, acted: new Uint8Array(nw * nh), units: S.units, w: nw, h: nh };
    S.map.units = S.units;
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null;
    S.sbRegion = null; S.sbHighlight = null; S.camAnim = null; S.fx = []; S.pending = [];
    S.cam.tile = clamp(TILE * S.sbScale, 28, 96); focusCell(nw / 2, nh / 2);
    var wIn = $('sbW'), hIn = $('sbH');
    if (wIn) wIn.value = nw; if (hIn) hIn.value = nh;
    renderSandboxAll(); refreshHud(); render();
    toast('画布已改为 ' + nw + '×' + nh + (removed ? '，框外 ' + removed + ' 个棋子已移除' : ''));
  }
  function sbEnc(b) {
    if (!b) return '';
    if (b.kind === 'unit') return 'u:' + b.side + ':' + b.type;
    if (b.kind === 'building') return 'b:' + b.code + ':' + b.owner;
    if (b.kind === 'tower') return 'tower:' + b.side;
    return 't:' + b.code;
  }
  function sbDecode(key) {
    var p = String(key).split(':');
    if (p[0] === 'u') return { kind: 'unit', side: +p[1], type: p[2] };
    if (p[0] === 'b') return { kind: 'building', code: +p[1], owner: +p[2] };
    if (p[0] === 'tower') return { kind: 'tower', side: +p[1] };
    return { kind: 'terrain', code: +p[1] };
  }
  function sbMatLabel(brush) {
    if (!brush) return '未选择';
    if (brush.kind === 'unit') return (brush.side === 0 ? '红' : '黑') + UNITS[brush.type].name;
    if (brush.kind === 'tower') return (brush.side === 0 ? '红方' : '黑方') + '防御塔';
    if (brush.kind === 'building') return (brush.owner === -1 ? '中立' : (brush.owner === 0 ? '红方' : '黑方')) + TERRAIN[brush.code].name;
    return TERRAIN[brush.code] ? TERRAIN[brush.code].name : '地形';
  }
  function setSandboxMini(on) {
    mini = on ? $('sbMinimap') : $('warMinimap');
    if (!mini) return;
    mini.width = on ? 220 : 180;
    mini.height = on ? 220 : 180;
    mctx = mini.getContext('2d');
  }
  function enterSandboxUI() {
    var war = $('war'); if (war) war.classList.add('sandbox-mode');
    var top = $('sbTop'); if (top) top.hidden = false;
    var left = $('sbLeft'); if (left) left.hidden = false;
    var right = $('sbCenter'); if (right) right.hidden = false;
    var old = $('warSandbox'); if (old) old.hidden = true;
    var end = $('warEnd'); if (end) end.disabled = true;
    setSandboxMini(true);
    if (typeof resizeCanvas === 'function') resizeCanvas();
  }
  function leaveSandboxUI() {
    var war = $('war'); if (war) war.classList.remove('sandbox-mode');
    var top = $('sbTop'); if (top) top.hidden = true;
    var left = $('sbLeft'); if (left) left.hidden = true;
    var right = $('sbCenter'); if (right) right.hidden = true;
    S.sbDragMaterial = null; S.sbDragActive = false; S.sbMarquee = null; S.sbPaintDown = false; S.sbLastClick = null; S.sbPaintLast = null;
    setSandboxMini(false);
    if (typeof resizeCanvas === 'function') resizeCanvas();
  }
  function updateSbTop() {
    var undo = $('sbTopUndo'); if (undo) undo.disabled = !S.sbUndo.length;
    var sc = $('sbScale'); if (sc) sc.value = String(S.sbScale);
    var wi = $('sbW'); if (wi) wi.value = W;
    var hi = $('sbH'); if (hi) hi.value = H;
  }
  function renderSbLibrary() {
    var box = $('sbLib'); if (!box) return;
    var tabs = document.querySelectorAll('#sbLibTabs [data-lib]');
    tabs.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-lib') === S.sbLibTab); });
    var items = [];
    if (S.sbLibTab === 'terrain') {
      for (var t = 0; t <= 8; t++) items.push({ key: 't:' + t, label: TERRAIN[t].name, img: 'assets/war/' + T_IMG[t], brush: { kind: 'terrain', code: t } });
    } else if (S.sbLibTab === 'red' || S.sbLibTab === 'black') {
      var side = S.sbLibTab === 'red' ? 0 : 1;
      TYPE_ORDER.forEach(function (t) {
        items.push({ key: 'u:' + side + ':' + t, label: UNITS[t].name, img: 'assets/pieces/' + PIECE[side][t], brush: { kind: 'unit', side: side, type: t } });
      });
    } else {
      var owner = S.sbLibTab === 'bred' ? 0 : S.sbLibTab === 'bblack' ? 1 : -1;
      [9, 10].forEach(function (code) {
        items.push({
          key: 'b:' + code + ':' + owner,
          label: (owner === -1 ? '中立' : owner === 0 ? '红' : '黑') + TERRAIN[code].name,
          img: code === 9 ? 'assets/war/village.png' : 'assets/war/city.png',
          brush: { kind: 'building', code: code, owner: owner }
        });
      });
      if (owner !== -1) {
        items.push({
          key: 'tower:' + owner,
          label: (owner === 0 ? '红方' : '黑方') + '防御塔',
          img: owner === 0 ? 'assets/war/tower_red.png' : 'assets/war/tower_black.png',
          brush: { kind: 'tower', side: owner }
        });
      }
    }
    var sel = sbEnc(S.sbBrush);
    box.innerHTML = items.map(function (it) {
      return '<button type="button" class="sb-mat' + (sel === it.key ? ' on' : '') + '" data-mat="' + it.key + '">' +
        '<img src="' + it.img + '" alt="" /><span>' + esc(it.label) + '</span></button>';
    }).join('');
  }
  function renderSbTools() {
    var box = $('sbTools'); if (!box) return;
    var tools = [['click', '点击'], ['brush', '画笔'], ['erase', '橡皮'], ['marquee', '框定']];
    var html = tools.map(function (t) {
      return '<button type="button" class="sb-tool' + (S.sbTool === t[0] ? ' on' : '') + '" data-tool="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    html += '<button type="button" class="sb-tool" data-undo="1"' + (S.sbUndo.length ? '' : ' disabled') + '>撤回</button>';
    if (S.sbRegion) {
      html += '<button type="button" class="sb-mini-btn" data-clear-region="1">清空框内</button>';
      html += '<button type="button" class="sb-mini-btn" data-cancel-region="1">取消框定</button>';
    }
    html += '<p class="tiny" style="grid-column:1/-1;margin:.25vh 0 0">当前素材：' + esc(sbMatLabel(S.sbBrush)) + (S.sbRegion ? ' · 框定 ' + (S.sbRegion.x1 - S.sbRegion.x0 + 1) + '×' + (S.sbRegion.y1 - S.sbRegion.y0 + 1) : '') + '</p>';
    box.innerHTML = html;
  }
  function normalizeStartGold(v) {
    var pair = Array.isArray(v) ? v : [v, v];
    function one(n) { return Math.max(0, Math.min(9999, Math.round(Number(n) || 0))); }
    return [one(pair[0]), one(pair[1])];
  }
  function normalizeSbStory(st) {
    st = st && typeof st === 'object' ? st : {};
    var img = typeof st.image === 'string' && /^data:image\//i.test(st.image) ? st.image : '';
    return {
      enabled: !!st.enabled,
      title: String(st.title || '').slice(0, 60),
      text: String(st.text || '').slice(0, 4000),
      image: img
    };
  }
  function renderSbDev() {
    var box = $('sbDev'); if (!box) return;
    var list = S.units.filter(function (u) { return u.dev; });
    var story = normalizeSbStory(S.sbStory);
    var golds = normalizeStartGold(S.sbStartGold);
    var html = '<button type="button" class="sb-mini-btn' + (S.sbDevMode ? ' on' : '') + '" data-sbdev="toggle">定时出现 / 消失</button>' +
      '<button type="button" class="sb-mini-btn" data-sbdev="preview">预览窗口</button>' +
      '<p class="tiny">开启后点击画布上的棋子，设置第几回合后出现或消失。</p>';
    if (list.length) html += '<div class="sb-dev-list">' + list.map(function (u) {
      return '<div class="sb-dev-item" data-devunit="' + u.id + '">' + (u.side === 0 ? '红' : '黑') + UNITS[u.type].name + ' (' + u.x + ',' + u.y + ') · ' + devLabel(u) + '</div>';
    }).join('') + '</div>';

    html += '<div class="sb-dev-config">' +
      '<h4>开局设置</h4>' +
      '<label class="sb-field">红方开局金币' +
      '<input id="sbStartGold0" type="number" min="0" max="9999" step="10" value="' + golds[0] + '" /></label>' +
      '<label class="sb-field">黑方开局金币' +
      '<input id="sbStartGold1" type="number" min="0" max="9999" step="10" value="' + golds[1] + '" /></label>' +
      '<p class="tiny">红黑双方可以分别设置不同的开局金币。</p>' +
      '<label class="sb-check"><input id="sbStoryOn" type="checkbox"' + (story.enabled ? ' checked' : '') + ' /> 添加剧情开幕</label>' +
      '<div id="sbStoryEditor"' + (story.enabled ? '' : ' hidden') + '>' +
      '<label class="sb-field">标题<input id="sbStoryTitle" maxlength="60" value="' + esc(story.title) + '" placeholder="例如：山谷的黎明" /></label>' +
      '<label class="sb-field">文本<textarea id="sbStoryText" maxlength="4000" rows="4" placeholder="开场剧情文字，可换行">' + esc(story.text) + '</textarea></label>' +
      '<label class="sb-field">图片<input id="sbStoryImage" type="file" accept="image/*" /></label>' +
      (story.image ? '<img id="sbStoryPreview" class="sb-story-preview" src="' + story.image + '" alt="剧情图片" />' : '<img id="sbStoryPreview" class="sb-story-preview" alt="剧情图片" hidden />') +
      '<p class="tiny">应用后，从这张地图开始游戏时会先显示剧情开幕。</p>' +
      '</div>' +
      '<button type="button" class="sb-mini-btn primary" data-sbdev="apply">应用到当前地图</button>' +
      '</div>';
    box.innerHTML = html;
  }
  function devLabel(u) {
    if (!u.dev) return '无';
    var a = u.dev.appear ? '第' + u.dev.appear + '回合后出现' : '一直存在';
    var d = u.dev.disappear ? '第' + u.dev.disappear + '回合后消失' : '不消失';
    return a + ' · ' + d;
  }
  function renderSbCounts() {
    var box = $('sbCounts'); if (!box) return;
    var tc = new Array(9).fill(0), bc = {}, pc = {}, twc = {};
    for (var i = 0; i < S.map.terrain.length; i++) {
      var t = S.map.terrain[i], o = S.map.owner[i];
      if (t === 9 || t === 10) bc[t + ':' + o] = (bc[t + ':' + o] || 0) + 1;
      else if (t >= 0 && t <= 8) tc[t]++;
    }
    S.units.forEach(function (u) {
      if (u.type === 'tower') { twc[u.side] = (twc[u.side] || 0) + 1; return; }
      var k = u.side + ':' + u.type;
      pc[k] = (pc[k] || 0) + 1;
    });
    function grid(title, rows) {
      return '<div class="sb-count-group"><h4>' + title + '</h4><div class="sb-count-grid">' + rows.map(function (r) {
        return '<button type="button" class="sb-count' + (S.sbHighlight === r.key ? ' on' : '') + '" data-count="' + r.key + '"><span>' + esc(r.label) + '</span><b>' + r.count + '</b></button>';
      }).join('') + '</div></div>';
    }
    var terrainRows = [];
    for (var c = 0; c <= 8; c++) terrainRows.push({ key: 't:' + c, label: TERRAIN[c].name, count: tc[c] });
    var buildRows = [];
    [0, 1, -1].forEach(function (o) {
      [9, 10].forEach(function (c) {
        var k = 'b:' + c + ':' + o;
        buildRows.push({ key: k, label: (o === -1 ? '中立' : o === 0 ? '红' : '黑') + TERRAIN[c].name, count: bc[k] || 0 });
      });
      if (o !== -1) buildRows.push({ key: 'tower:' + o, label: (o === 0 ? '红' : '黑') + '防御塔', count: twc[o] || 0 });
    });
    var pieceRows = [];
    [0, 1].forEach(function (side) {
      TYPE_ORDER.forEach(function (type) {
        var k = 'u:' + side + ':' + type;
        pieceRows.push({ key: k, label: (side === 0 ? '红' : '黑') + UNITS[type].name, count: pc[side + ':' + type] || 0 });
      });
    });
    var html = grid('地形', terrainRows) + grid('建筑', buildRows) + grid('棋子', pieceRows);
    var list = S.units.filter(function (u) { return u.dev; });
    html += '<div class="sb-count-group"><h4>开发者模式</h4>';
    if (!list.length) html += '<p class="tiny">还没有设置定时出现/消失。</p>';
    else html += '<div class="sb-dev-list">' + list.map(function (u) {
      return '<div class="sb-dev-item" data-devunit="' + u.id + '">' + (u.side === 0 ? '红' : '黑') + UNITS[u.type].name + ' (' + u.x + ',' + u.y + ')<br>' + devLabel(u) + '</div>';
    }).join('') + '</div>';
    html += '</div>';
    box.innerHTML = html;
  }
  function renderSandboxAll() {
    renderSbLibrary(); renderSbTools(); renderSbDev(); renderSbCounts(); updateSbTop();
  }
  function startSandbox() {
    clearOnline();
    S.battleMode = 'sandbox'; S.screen = 'game'; S.mySide = 0; S.viewerSide = 0; S.revealAll = true;
    setBoardSize(80, 80);
    var m = { seed: 0, w: 80, h: 80, terrain: new Uint8Array(W * H), owner: new Int8Array(W * H), acted: new Uint8Array(W * H), units: [] };
    for (var i = 0; i < m.owner.length; i++) m.owner[i] = -1;
    S.map = m; S.units = m.units; S.gold = [0, 0]; S.round = 1; S.turnSide = 0; S.over = null; S.log = []; S.fx = []; S.pending = [];
    S.sandboxName = '自由地图'; S.customName = '';
    S.sbStartGold = [50, 50]; S.sbStory = { enabled: false, title: '', text: '', image: '' }; S.storyOpening = null;
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null; S.healMode = false; S.aiRunning = false; S.camAnim = null;
    S.sbTool = 'click'; S.sbLibTab = 'terrain'; S.sbBrush = null; S.sbRegion = null; S.sbUndo = [];
    S.sbHighlight = null; S.sbDevMode = false; S.sbDragMaterial = null; S.sbDragActive = false; S.sbDragTarget = null;
    S.sbMarquee = null; S.sbPaintDown = false; S.sbScale = 1; S.sbLastClick = null;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    enterSandboxUI();
    var sc = $('sbScale'); if (sc) sc.value = '1';
    S.cam.tile = TILE; focusCell(40, 40);
    renderSandboxAll();
    refreshHud(); log('—— 战棋沙盘 ——'); render();
  }
  function sbInRegion(x, y) {
    var r = S.sbRegion;
    return !r || (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  }
  function sbSnapshot() {
    return {
      w: W, h: H,
      terrain: Array.from(S.map.terrain), owner: Array.from(S.map.owner), acted: Array.from(S.map.acted),
      units: JSON.parse(JSON.stringify(S.units))
    };
  }
  function sbPushUndo() {
    S.sbUndo.push(sbSnapshot());
    if (S.sbUndo.length > 20) S.sbUndo.shift();
    updateSbTop();
  }
  function sbUndoAction() {
    if (!S.sbUndo.length) { toast('没有可撤回的操作'); return; }
    var snap = S.sbUndo.pop();
    setBoardSize(snap.w, snap.h);
    S.map = { seed: 0, terrain: Uint8Array.from(snap.terrain), owner: Int8Array.from(snap.owner), acted: Uint8Array.from(snap.acted), units: snap.units, w: snap.w, h: snap.h };
    S.units = snap.units;
    S.map.units = S.units;
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null;
    S.sbDragMaterial = null; S.sbDragActive = false; S.sbDragTarget = null;
    focusCell(snap.w / 2, snap.h / 2);
    renderSandboxAll(); refreshHud(); render(); toast('已撤回');
  }
  function sbApplyBrush(x, y, noUndo, bulk) {
    if (!S.sbBrush) { toast('先在左侧素材库选择素材'); return; }
    if (!sbInRegion(x, y)) { toast('不能画出框定范围'); return; }
    var b = S.sbBrush;
    if (!noUndo) sbPushUndo();
    var i = idx(x, y);
    if (b.kind === 'unit') {
      S.units = S.units.filter(function (u) { return !(u.x === x && u.y === y); });
      var u = makeUnit(b.side, b.type, x, y);
      S.units.push(u);
    } else if (b.kind === 'tower') {
      S.units = S.units.filter(function (u) { return !(u.x === x && u.y === y); });
      S.units.push(makeUnit(b.side, 'tower', x, y));
    } else if (b.kind === 'building') {
      S.map.terrain[i] = b.code; S.map.owner[i] = b.owner; S.map.acted[i] = 0;
    } else {
      S.map.terrain[i] = b.code; S.map.owner[i] = -1; S.map.acted[i] = 0;
    }
    S.map.units = S.units;
    if (!bulk) { renderSandboxAll(); refreshHud(); render(); }
    else dirty = true;
  }
  function sbErase(x, y, noUndo, bulk) {
    if (!sbInRegion(x, y)) { toast('不能擦除框定范围外'); return; }
    var u = S.units.filter(function (v) { return v.x === x && v.y === y; })[0];
    if (u) {
      if (!noUndo) sbPushUndo();
      S.units = S.units.filter(function (v) { return v !== u; });
      S.map.units = S.units;
      if (!bulk) { renderSandboxAll(); refreshHud(); render(); }
      else dirty = true;
      return;
    }
    var i = idx(x, y);
    if (S.map.terrain[i] === 0 && S.map.owner[i] === -1) return;
    if (!noUndo) sbPushUndo();
    S.map.terrain[i] = 0; S.map.owner[i] = -1; S.map.acted[i] = 0;
    if (!bulk) { renderSandboxAll(); refreshHud(); render(); }
    else dirty = true;
  }
  function sbPaintCell(x, y, bulk) {
    if (!inMap(x, y)) return;
    if (S.sbTool === 'erase') sbErase(x, y, true, bulk);
    else sbApplyBrush(x, y, true, bulk);
  }
  function sbPaintLine(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps < 1) return;
    for (var i = 1; i <= steps; i++) {
      var x = Math.round(x0 + dx * i / steps), y = Math.round(y0 + dy * i / steps);
      if (inMap(x, y) && sbInRegion(x, y)) sbPaintCell(x, y, true);
    }
    dirty = true;
    render();
  }
  function sandboxPaint(x, y) {
    if (!isSandbox() || !inMap(x, y)) return;
    if (S.sbDevMode) { openSbDevPopup(x, y); return; }
    if (S.sbTool === 'brush') sbApplyBrush(x, y);
    else if (S.sbTool === 'erase') sbErase(x, y);
  }
  function sbClearRegion() {
    if (!S.sbRegion) { toast('还没有框定区域'); return; }
    sbPushUndo();
    for (var y = S.sbRegion.y0; y <= S.sbRegion.y1; y++) for (var x = S.sbRegion.x0; x <= S.sbRegion.x1; x++) {
      if (!inMap(x, y)) continue;
      var i = idx(x, y); S.map.terrain[i] = 0; S.map.owner[i] = -1; S.map.acted[i] = 0;
    }
    S.units = S.units.filter(function (u) { return !(u.x >= S.sbRegion.x0 && u.x <= S.sbRegion.x1 && u.y >= S.sbRegion.y0 && u.y <= S.sbRegion.y1); });
    S.map.units = S.units;
    renderSandboxAll(); refreshHud(); render();
  }
  function sbMaterialAt(x, y) {
    var u = S.units.filter(function (v) { return v.x === x && v.y === y; })[0];
    if (u) return { kind: 'unit', unit: u };
    var t = S.map.terrain[idx(x, y)];
    if (t === 0 && S.map.owner[idx(x, y)] === -1) return null;
    return { kind: 'terrain', code: t, owner: S.map.owner[idx(x, y)], x: x, y: y };
  }
  function sbStartMaterialDrag(x, y) {
    var m = sbMaterialAt(x, y);
    if (!m) return;
    if (m.kind === 'unit') S.sbDragMaterial = { kind: 'unit', id: m.unit.id };
    else S.sbDragMaterial = { kind: 'terrain', x: x, y: y, code: m.code, owner: m.owner };
    S.sbDragActive = false; S.sbDragTarget = null;
    hint('已选中' + (m.kind === 'unit' ? '棋子' : '地形/建筑') + '，按住拖动到目标格；右键取消');
    render();
  }
  function sbCommitDrag(x, y) {
    var m = S.sbDragMaterial;
    S.sbDragActive = false; S.sbDragTarget = null; S.sbDragMaterial = null;
    if (!m || !inMap(x, y)) { render(); return; }
    sbPushUndo();
    if (m.kind === 'unit') {
      var u = S.units.filter(function (v) { return v.id === m.id; })[0];
      if (!u) { render(); return; }
      var other = S.units.filter(function (v) { return v !== u && v.x === x && v.y === y; })[0];
      if (other) { toast('目标格已有棋子'); render(); return; }
      u.x = x; u.y = y;
    } else {
      var from = idx(m.x, m.y), to = idx(x, y);
      if (from === to) { render(); return; }
      var tc = S.map.terrain[from], toOwner = S.map.owner[from];
      S.map.terrain[from] = 0; S.map.owner[from] = -1; S.map.acted[from] = 0;
      S.map.terrain[to] = tc; S.map.owner[to] = toOwner; S.map.acted[to] = 0;
    }
    renderSandboxAll(); refreshHud(); render();
  }
  function openSbDevPopup(x, y) {
    var u = S.units.filter(function (v) { return v.x === x && v.y === y; })[0];
    if (!u) { toast('开发者模式目前只支持棋子：请点棋子'); return; }
    var a = u.dev && u.dev.appear ? u.dev.appear : '';
    var d = u.dev && u.dev.disappear ? u.dev.disappear : '';
    var html = '<button class="war-modal-close" type="button">×</button><h2>定时出现 / 消失</h2>' +
      '<p>' + (u.side === 0 ? '红方' : '黑方') + UNITS[u.type].name + ' · (' + x + ',' + y + ')</p>' +
      '<label class="tiny">第 <input id="sbDevAppear" type="number" min="1" value="' + a + '" style="width:5em" /> 回合后出现（留空=一直存在）</label><br>' +
      '<label class="tiny">第 <input id="sbDevDisappear" type="number" min="1" value="' + d + '" style="width:5em" /> 回合后消失（留空=不消失）</label>' +
      '<p class="tiny">只有同时满足“出现回合 ≤ 当前回合 < 消失回合”时才在场上。出现回合必须小于消失回合。</p>' +
      '<button class="war-opt-btn" id="sbDevOk">确定</button>';
    modal(html);
    var ok = $('sbDevOk'); if (!ok) return;
    ok.addEventListener('click', function () {
      var ar = $('sbDevAppear'), dr = $('sbDevDisappear');
      var av = ar && ar.value ? Math.floor(+ar.value) : null;
      var dv = dr && dr.value ? Math.floor(+dr.value) : null;
      if (av != null && (!isFinite(av) || av < 1)) { toast('出现回合必须 ≥ 1'); return; }
      if (dv != null && (!isFinite(dv) || dv < 1)) { toast('消失回合必须 ≥ 1'); return; }
      if (av != null && dv != null && av >= dv) { toast('出现回合必须小于消失回合'); return; }
      sbPushUndo();
      u.dev = (av != null || dv != null) ? { appear: av, disappear: dv } : null;
      closeModal(); renderSandboxAll(); refreshHud(); render(); toast('已设置定时规则');
    });
  }
  function openSbDevPreview() {
    var max = 20;
    S.units.forEach(function (u) {
      if (!u.dev) return;
      if (u.dev.appear) max = Math.max(max, u.dev.appear + 4);
      if (u.dev.disappear) max = Math.max(max, u.dev.disappear + 4);
    });
    var html = '<button class="war-modal-close" type="button">×</button><h2>开发者模式预览</h2>' +
      '<p class="tiny">拖动回合查看哪些棋子出现/消失。</p>' +
      '<input id="sbPvRound" type="range" min="1" max="' + max + '" value="1" style="width:100%" />' +
      '<p id="sbPvText" class="tiny"></p><canvas id="sbDevPv" width="360" height="360" style="width:100%;max-width:360px;border-radius:12px;border:2px solid #d6ecfb"></canvas>';
    modal(html);
    var slider = $('sbPvRound');
    function draw() {
      var round = +slider.value;
      var c = $('sbDevPv'); if (!c) return;
      var g = c.getContext('2d'), w = c.width, h = c.height;
      var cell = w / W;
      g.clearRect(0, 0, w, h);
      var pal = { 0: '#79a85c', 1: '#b0a45c', 2: '#a8a8a8', 3: '#8d8d8d', 4: '#3f7d45', 5: '#2f6b3a', 6: '#72a9c9', 7: '#5f8fb3', 8: '#c9a76a', 9: '#d6b46a', 10: '#b78b4a' };
      for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) {
        g.fillStyle = pal[S.map.terrain[idx(x, y)]] || '#79a85c';
        g.fillRect(x * cell, y * cell, cell * 2, cell * 2);
      }
      var active = 0, hidden = 0;
      S.units.forEach(function (u) {
        if (!u.alive) return;
        var on = !u.dev || devActive(u, round);
        if (!on) { hidden++; return; }
        active++;
        g.fillStyle = u.side === 0 ? '#d7475a' : '#39435e';
        g.beginPath(); g.arc((u.x + .5) * cell, (u.y + .5) * cell, Math.max(1.4, cell * .85), 0, Math.PI * 2); g.fill();
        if (u.dev) { g.strokeStyle = '#ffd86a'; g.lineWidth = 1.5; g.stroke(); }
      });
      $('sbPvText').textContent = '第 ' + round + ' 回合：场上 ' + active + ' 子，隐藏/未出现 ' + hidden + ' 子';
    }
    slider.addEventListener('input', draw);
    draw();
  }
  function sandboxPaintLegacy() { }

  function applySbStartConfig() {
    var gold0In = $('sbStartGold0');
    var gold1In = $('sbStartGold1');
    var onIn = $('sbStoryOn');
    var titleIn = $('sbStoryTitle');
    var textIn = $('sbStoryText');
    var current = normalizeSbStory(S.sbStory);
    var currentGold = normalizeStartGold(S.sbStartGold);
    S.sbStartGold = normalizeStartGold([
      gold0In ? gold0In.value : currentGold[0],
      gold1In ? gold1In.value : currentGold[1]
    ]);
    S.sbStory = {
      enabled: !!(onIn && onIn.checked),
      title: String(titleIn ? titleIn.value : current.title).slice(0, 60),
      text: String(textIn ? textIn.value : current.text).slice(0, 4000),
      image: current.image
    };
    renderSbDev();
    toast('开局设置已应用到当前地图');
  }

  function showStoryOpening() {
    var st = S.storyOpening;
    if (!st || !st.enabled) return;
    var title = st.title || '剧情开幕';
    var body = esc(st.text || '').replace(/\n/g, '<br>');
    var img = st.image && /^data:image\//i.test(st.image) ? '<img class="war-story-image" src="' + st.image + '" alt="剧情图片" />' : '';
    modal('<div class="war-story">' +
      '<div class="war-story-kicker">剧情开幕</div>' +
      '<h2>' + esc(title) + '</h2>' +
      img +
      (body ? '<div class="war-story-text">' + body + '</div>' : '') +
      '<div class="war-story-actions"><button type="button" class="war-opt-btn" id="warStoryStart">进入战场</button></div>' +
      '</div>');
    var b = $('warStoryStart');
    if (b) b.addEventListener('click', closeModal);
  }

  function saveSandbox() {
    var name = prompt('给这张战棋地图起个名字：', '我的战棋地图');
    if (!name) return;
    var lib = readLib();
    var name = String(name).slice(0, 24);
    S.sandboxName = name;
    lib.unshift({
      name: name, at: Date.now(), w: S.map.w || W, h: S.map.h || H,
      terrain: Array.from(S.map.terrain), owner: Array.from(S.map.owner),
      units: S.units.map(function (u) { return { side: u.side, type: u.type, x: u.x, y: u.y, dev: u.dev ? { appear: u.dev.appear, disappear: u.dev.disappear } : null }; }),
      startGold: normalizeStartGold(S.sbStartGold),
      story: normalizeSbStory(S.sbStory)
    });
    lib = lib.slice(0, 40);
    try { localStorage.setItem(SAND_KEY, JSON.stringify(lib)); } catch (e) { toast('保存失败：浏览器存储不可用'); return; }
    refreshHud();
    toast('已保存到战棋沙盘保存库');
  }
  function readLib() {
    try { var raw = localStorage.getItem(SAND_KEY); var a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function loadSavedMap(m) {
    if (!m) { toast('这张保存地图数据不完整'); return false; }
    var mw = Math.round(+m.w) || 80, mh = Math.round(+m.h) || 80;
    if (!m.terrain || !m.owner || m.terrain.length !== mw * mh || m.owner.length !== mw * mh || mw < 10 || mh < 10 || mw > 200 || mh > 200) { toast('这张保存地图数据不完整'); return false; }
    clearOnline();
    setBoardSize(mw, mh);
    S.battleMode = 'sandbox'; S.screen = 'game'; S.mySide = 0; S.viewerSide = 0; S.revealAll = true;
    S.map = { seed: 0, w: mw, h: mh, terrain: Uint8Array.from(m.terrain), owner: Int8Array.from(m.owner), acted: new Uint8Array(W * H), units: [] };
    S.units = (m.units || []).map(function (x) {
      var type = UNITS[x.type] ? x.type : 'pawn';
      var u = makeUnit(x.side === 1 ? 1 : 0, type, clamp(+x.x || 0, 0, W - 1), clamp(+ySafe(x.y), 0, H - 1));
      if (x.dev) u.dev = { appear: x.dev.appear || null, disappear: x.dev.disappear || null };
      return u;
    });
    function ySafe(v) { return +v || 0; }
    S.map.units = S.units; S.gold = [0, 0]; S.round = 1; S.turnSide = 0; S.over = null; S.log = []; S.fx = []; S.pending = [];
    S.sandboxName = m.name || '已保存沙盘'; S.customName = '';
    S.sbStartGold = normalizeStartGold(m.startGold != null ? m.startGold : [50, 50]);
    S.sbStory = normalizeSbStory(m.story);
    S.storyOpening = null;
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null; S.healMode = false; S.aiRunning = false; S.camAnim = null;
    S.sbTool = 'click'; S.sbLibTab = 'terrain'; S.sbBrush = null; S.sbRegion = null; S.sbUndo = [];
    S.sbHighlight = null; S.sbDevMode = false; S.sbDragMaterial = null; S.sbDragActive = false; S.sbDragTarget = null;
    S.sbMarquee = null; S.sbPaintDown = false; S.sbScale = 1; S.sbLastClick = null;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    enterSandboxUI();
    var sc = $('sbScale'); if (sc) sc.value = '1';
    S.cam.tile = TILE; focusCell(mw / 2, mh / 2); renderSandboxAll(); refreshHud(); log('—— 读取沙盘：' + S.sandboxName + ' ——'); render();
    return true;
  }
  function renderLibrary() {
    var opts = $('warOptions'); if (!opts) return;
    var lib = readLib();
    var html = '<h3>战棋沙盘保存库</h3>';
    if (!lib.length) html += '<p class="tiny">还没有保存的地图。去战棋沙盘画一张，再点保存。</p>';
    else {
      html += '<div class="war-lib-list">';
      lib.forEach(function (m, i) {
        html += '<div class="war-lib-item"><div><b>' + esc(m.name) + '</b><br><span>' + new Date(m.at).toLocaleString() + ' · ' + (m.units ? m.units.length : 0) + ' 子</span></div><div><button class="war-opt-btn" data-load="' + i + '">读取</button> <button class="war-opt-btn" data-fight="' + i + '">对战</button> <button class="war-opt-btn" data-del="' + i + '">删</button></div></div>';
      });
      html += '</div>';
    }
    opts.innerHTML = html;
    var start = $('warStart'); if (start) { start.disabled = true; }
    opts.querySelectorAll('[data-load]').forEach(function (b) {
      b.onclick = function () {
        var m = lib[+b.getAttribute('data-load')];
        if (m) loadSavedMap(m);
      };
    });
    opts.querySelectorAll('[data-fight]').forEach(function (b) {
      b.onclick = function () {
        var m = lib[+b.getAttribute('data-fight')];
        if (m && loadSavedMap(m)) openSandboxPlay();
      };
    });
    opts.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var lib2 = readLib(); lib2.splice(+b.getAttribute('data-del'), 1);
        try { localStorage.setItem(SAND_KEY, JSON.stringify(lib2)); } catch (e) { }
        renderLibrary();
      };
    });
  }

  /* ---------- 联机 ---------- */
  function hideOnlineOverlay() {
    var el = $('warOnline'); if (el) el.hidden = true;
  }
  function showOnlineOverlay() {
    var el = $('warOnline'); if (el) el.hidden = false;
    renderOnlineOverlay();
  }
  function updateRoomInfo() {
    var info = $('warRoomInfo'); if (!info) return;
    var o = S.online;
    if (!o) { info.innerHTML = ''; return; }
    var srv = o.serverUrl || o.base || '';
    if (o.role === 'host') {
      info.innerHTML = '房间号 <span class="war-room-code">' + esc(o.code) + '</span>' +
        (srv ? ' · 服务器 <b>' + esc(srv) + '</b>' : '') +
        ' · ' + (o.guestJoined ? '玩家已加入' : '等待玩家加入');
    } else {
      info.innerHTML = '房间 <b>' + esc(o.code) + '</b> · 已加入，等待房主开始';
    }
  }
  function renderOnlineOverlay() {
    var o = S.online; if (!o) return;
    var room = $('olRoom'); if (room) room.textContent = o.code;
    var serverEl = $('olServer'); if (serverEl) serverEl.textContent = o.serverUrl || o.base || '同机房间';
    var inviteBtn = $('olInvite'); if (inviteBtn) inviteBtn.style.display = o.role === 'host' ? '' : 'none';
    var status = $('olStatus');
    var hostIn = !!o.hostEntered, guestIn = !!o.guestEntered;
    var joined = o.role === 'host' ? !!o.guestJoined : true;
    var players = $('olPlayers');
    if (players) {
      players.innerHTML =
        '<div class="ol-player' + (hostIn ? ' on' : '') + '"><span>' + (o.role === 'host' ? '房主（你）' : '房主') + '</span><b>' + (hostIn ? '已进入' : '未进入') + '</b></div>' +
        '<div class="ol-player' + (guestIn ? ' on' : '') + '"><span>' + (o.role === 'guest' ? '加入者（你）' : '加入者') + '</span><b>' + (guestIn ? '已进入' : (joined ? '未进入' : '未加入')) + '</b></div>';
    }
    var ownIn = o.role === 'host' ? hostIn : guestIn;
    if (status) {
      if (o.phase === 'waiting' || o.phase === 'joined') status.textContent = o.role === 'host' ? (joined ? '玩家已加入，可以开始游戏' : '等待玩家加入') : '已加入房间，等待房主开始';
      else if (o.phase === 'started') status.textContent = ownIn ? '已进入，等待对方进入' : '房主已开始游戏，请点击进入游戏';
      else if (o.phase === 'choosing') status.textContent = '双方已进入游戏，请选择红黑方';
      else status.textContent = '游戏进行中';
    }
    var enter = $('olEnter'), red = $('olRed'), black = $('olBlack'), startBtn = $('olStart');
    if (startBtn) {
      startBtn.classList.toggle('show', o.role === 'host' && (o.phase === 'waiting' || o.phase === 'joined'));
      startBtn.disabled = !joined;
      startBtn.textContent = joined ? '开始游戏' : '等待玩家加入';
    }
    if (enter) {
      enter.classList.toggle('show', o.phase === 'started' && !ownIn);
      enter.disabled = ownIn;
    }
    var choosing = o.phase === 'choosing';
    var ownSide = o.role === 'host' ? o.hostSide : o.guestSide;
    var otherSide = o.role === 'host' ? o.guestSide : o.hostSide;
    if (red) {
      red.classList.toggle('show', choosing);
      red.disabled = !choosing || ownSide != null || otherSide === 0;
      red.textContent = otherSide === 0 ? '红方（对方已选）' : ownSide === 0 ? '红方（已选）' : '选择红方';
    }
    if (black) {
      black.classList.toggle('show', choosing);
      black.disabled = !choosing || ownSide != null || otherSide === 1;
      black.textContent = otherSide === 1 ? '黑方（对方已选）' : ownSide === 1 ? '黑方（已选）' : '选择黑方';
    }
    var hint = $('olHint');
    if (hint) {
      if (o.phase === 'choosing') hint.textContent = ownSide != null ? '你已选择' + (ownSide === 0 ? '红方' : '黑方') + '，等待对方选择' : '先选先得，双方不能同色';
      else hint.textContent = '双方都进入后选择红黑方，选完立即开始。';
    }
  }
  function onlineSend(msg) {
    var o = S.online; if (!o) return;
    if (o.transport === 'bc') {
      try { o.chan.postMessage(msg); } catch (e) { }
      return;
    }
    if (o.transport === 'http') {
      fetch(o.base + '/api/online/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: o.code, token: o.token, data: msg })
      }).catch(function () { });
    }
  }
  function beginOnlinePregame(pending) {
    var o = S.online;
    if (!o || o.role !== 'host') return;
    o.phase = 'started'; o.pending = pending;
    o.hostEntered = false; o.guestEntered = false; o.hostSide = null; o.guestSide = null;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    showOnlineOverlay();
    onlineSend({ type: 'start', pending: { kind: pending.kind, mapName: pending.mapName } });
    toast('已开始联机准备，请双方点击进入游戏');
  }
  function hostAfterEnter() {
    var o = S.online; if (!o) return;
    onlineSend({ type: 'entered', hostEntered: !!o.hostEntered, guestEntered: !!o.guestEntered });
    if (o.hostEntered && o.guestEntered && (o.phase === 'started' || o.phase === 'choosing')) {
      o.phase = 'choosing';
      onlineSend({ type: 'choosing' });
    }
    renderOnlineOverlay();
  }
  function hostEnterGame() {
    var o = S.online; if (!o || o.role !== 'host' || o.phase !== 'started' || o.hostEntered) return;
    o.hostEntered = true; hostAfterEnter();
  }
  function guestEnterGame() {
    var o = S.online; if (!o || o.role !== 'guest' || o.phase !== 'started' || o.guestEntered) return;
    o.guestEntered = true;
    onlineSend({ type: 'enter' });
    renderOnlineOverlay();
    toast('已进入游戏，等待对方');
  }
  function hostChooseSide(side) {
    var o = S.online; if (!o || o.role !== 'host' || o.phase !== 'choosing' || o.hostSide != null) return;
    if (o.guestSide === side) { toast('对方已经选择了这个颜色'); return; }
    o.hostSide = side;
    onlineSend({ type: 'sides', hostSide: o.hostSide, guestSide: o.guestSide });
    renderOnlineOverlay();
    if (o.guestSide != null) startActualOnline();
  }
  function guestChooseSide(side) {
    var o = S.online; if (!o || o.role !== 'guest' || o.phase !== 'choosing' || o.guestSide != null) return;
    if (o.hostSide === side) { toast('房主已经选择了这个颜色'); return; }
    o.guestSide = side;
    onlineSend({ type: 'wantside', side: side });
    renderOnlineOverlay();
  }
  function hostWantside(side) {
    var o = S.online; if (!o || o.role !== 'host' || o.phase !== 'choosing') return;
    if (o.guestSide != null) return;
    if (o.hostSide === side) { onlineSend({ type: 'sideConflict', side: side }); return; }
    o.guestSide = side;
    onlineSend({ type: 'sides', hostSide: o.hostSide, guestSide: o.guestSide });
    renderOnlineOverlay();
    if (o.hostSide != null) startActualOnline();
  }
  function startActualOnline() {
    var o = S.online;
    if (!o || o.role !== 'host' || o.phase === 'playing') return;
    if (o.hostSide == null || o.guestSide == null || o.hostSide === o.guestSide) return;
    o.phase = 'playing';
    hideOnlineOverlay();
    leaveSandboxUI();
    var p = o.pending || { kind: 'normal', mapIndex: S.mapChoice || 0, mapName: '青川原' };
    if (p.kind === 'custom' && p.prepared) {
      var pm = p.prepared;
      setBoardSize(pm.w || W, pm.h || H);
      S.map = pm; S.units = pm.units; pm.units = S.units;
      S.customName = p.mapName || '沙盘地图';
    } else {
      setBoardSize(80, 80);
      S.mapChoice = p.mapIndex != null ? p.mapIndex : 0;
      var m = genMap(MAPS[S.mapChoice].seed);
      S.map = m; S.units = m.units;
      placeArmy(m, 0); placeArmy(m, 1);
      placeDefenseTower(m, 0); placeDefenseTower(m, 1);
      S.customName = '';
    }
    S.battleMode = 'online'; S.screen = 'game';
    S.mySide = o.hostSide; S.viewerSide = o.hostSide;
    S.gold = [50, 50]; S.round = 1; S.turnSide = 0; S.over = null; S.log = []; S.fx = []; S.pending = [];
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null;
    S.healMode = false; S.aiRunning = false; S.camAnim = null;
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    var oldSb = $('warSandbox'); if (oldSb) oldSb.hidden = true;
    S.cam.tile = TILE;
    var hk = S.units.filter(function (u) { return u.alive && u.side === o.hostSide && u.type === 'king'; })[0];
    focusCell(hk ? hk.x : (o.hostSide === 0 ? CAMPS.red.x : CAMPS.black.x), hk ? hk.y : (o.hostSide === 0 ? CAMPS.red.y : CAMPS.black.y));
    log('—— 联机对战：' + (S.customName || MAPS[S.mapChoice].name) + ' ——');
    beginTurn(0);
    broadcastState();
    refreshHud(); render();
    toast('双方已选边，游戏开始：房主' + (o.hostSide === 0 ? '红方' : '黑方') + '，加入者' + (o.guestSide === 0 ? '红方' : '黑方'));
  }
  function onlineLeave() {
    var o = S.online;
    if (o) {
      if (o.transport === 'http') {
        fetch(o.base + '/api/online/leave', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: o.code, token: o.token })
        }).catch(function () { });
      } else {
        try { o.chan.postMessage({ type: 'leave', role: o.role }); } catch (e) { }
      }
    }
    clearOnline();
    hideOnlineOverlay();
    showMenu();
  }
  function bindOnlineUI() {
    var startBtn = $('olStart'); if (startBtn) startBtn.addEventListener('click', function () {
      var o = S.online; if (!o || o.role !== 'host') return;
      if (!o.guestJoined) { toast('等待玩家加入'); return; }
      if (S.battleMode === 'sandbox') startCustomBattle('online');
      else startOnlineGame();
    });
    var enter = $('olEnter'); if (enter) enter.addEventListener('click', function () {
      var o = S.online; if (!o) return;
      if (o.role === 'host') hostEnterGame(); else guestEnterGame();
    });
    var red = $('olRed'); if (red) red.addEventListener('click', function () {
      var o = S.online; if (!o) return;
      if (o.role === 'host') hostChooseSide(0); else guestChooseSide(0);
    });
    var black = $('olBlack'); if (black) black.addEventListener('click', function () {
      var o = S.online; if (!o) return;
      if (o.role === 'host') hostChooseSide(1); else guestChooseSide(1);
    });
    var leave = $('olLeave'); if (leave) leave.addEventListener('click', onlineLeave);
    var invite = $('olInvite'); if (invite) invite.addEventListener('click', function () {
      var o = S.online;
      if (!o || o.role !== 'host' || !o.code) { toast('只有房主可以生成邀请链接'); return; }
      var base = (o.serverUrl || o.base || location.origin).replace(/\/+$/, '');
      if (/\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(base)) {
        toast('当前服务器地址是本机地址，先换成房主电脑的局域网 IP');
        return;
      }
      var url = base + '/war.html?room=' + encodeURIComponent(o.code);
      function done() { toast('邀请链接已复制，发给另一台电脑打开'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { prompt('复制邀请链接：', url); });
      } else {
        prompt('复制邀请链接：', url);
      }
    });
  }
  function makeCode() { var s = ''; var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (var i = 0; i < 5; i++) s += chars[(Math.random() * chars.length) | 0]; return s; }
  function onlineBase(server) {
    var s = String(server || '').trim();
    if (!s) s = location.origin;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    try {
      var u = new URL(s);
      return u.origin;
    } catch (e) {
      return s.replace(/\/+$/, '');
    }
  }
  function parseInviteLink(text) {
    var s = String(text || '').trim();
    if (!/^https?:\/\//i.test(s)) return null;
    try {
      var u = new URL(s);
      var room = (u.searchParams.get('room') || '').trim().toUpperCase();
      if (!room) return null;
      return { room: room, server: u.origin };
    } catch (e) {
      return null;
    }
  }
  function onlineFetchJSON(base, path, opts) {
    opts = opts || {};
    var ctl = null, timer = null;
    try {
      ctl = new AbortController();
      opts.signal = ctl.signal;
      timer = setTimeout(function () { try { ctl.abort(); } catch (e) { } }, 9000);
    } catch (e) { }
    return fetch(base + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, json: j }; });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  function onlinePollStart(o) {
    if (!o || o.transport !== 'http') return;
    o.pollStopped = false;
    function tick() {
      if (S.online !== o || o.pollStopped) return;
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { try { ctl.abort(); } catch (e) { } }, 16000);
      } catch (e) { }
      var url = o.base + '/api/online/events?room=' + encodeURIComponent(o.code) + '&token=' + encodeURIComponent(o.token) + '&since=' + encodeURIComponent(o.since || 0);
      fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; });
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (S.online !== o || o.pollStopped) return;
        var j = res.json || {};
        if (res.status === 404 || res.status === 403) {
          toast(j.error || '联机房间已关闭'); o.pollStopped = true; return;
        }
        if (Array.isArray(j.events)) {
          j.events.forEach(function (ev) {
            if (!ev) return;
            if (typeof ev.id === 'number' && ev.id > (o.since || 0)) o.since = ev.id;
            if (ev.data) handleOnlineMessage(o, ev.data);
          });
        }
        if (j.guestJoined != null) o.guestJoined = !!j.guestJoined;
        o.hostPresent = !!j.hostPresent; o.guestPresent = !!j.guestPresent;
        updateRoomInfo();
        var panel = $('warOnline'); if (panel && !panel.hidden) renderOnlineOverlay();
        if (j.closed) {
          if (o.role === 'guest') { toast('房主已离开房间'); clearOnline(); hideOnlineOverlay(); showMenu(); }
          else o.pollStopped = true;
          return;
        }
        setTimeout(tick, 50);
      }).catch(function () {
        if (timer) clearTimeout(timer);
        if (S.online === o && !o.pollStopped) setTimeout(tick, 1200);
      });
    }
    tick();
  }
  function onlinePollStop(o) { if (o) o.pollStopped = true; }
  function handleOnlineMessage(o, d) {
    if (!o || !d) return;
    if (o.role === 'host') handleHostMessage(d);
    else handleGuestMessage(d);
  }
  function handleHostMessage(d) {
    var o = S.online; if (!o || o.role !== 'host') return;
    if (d.type === 'join') {
      S.waitGuest = true;
      o.guestJoined = true;
      if (o.phase === 'waiting') o.phase = 'joined';
      updateRoomInfo();
      var panel = $('warOnline'); if (panel && !panel.hidden) renderOnlineOverlay();
      toast('玩家已加入房间');
    } else if (d.type === 'enter') {
      if (o.phase !== 'started' && o.phase !== 'choosing') return;
      o.guestEntered = true;
      hostAfterEnter();
    } else if (d.type === 'wantside') {
      hostWantside(+d.side);
    } else if (d.type === 'leave') {
      o.guestJoined = false; o.guestEntered = false; o.guestSide = null;
      if (o.phase === 'started' || o.phase === 'choosing') {
        o.phase = 'waiting'; o.hostEntered = false;
        hideOnlineOverlay();
      }
      updateRoomInfo();
      var p = $('warOnline'); if (p && !p.hidden) renderOnlineOverlay();
      toast('对方已离开房间');
    } else if (d.type === 'action' && S.battleMode === 'online' && S.screen === 'game' && o && S.turnSide === o.guestSide) {
      applyOnlineAction(d.action);
    }
  }
  function handleGuestMessage(d) {
    var o = S.online; if (!o || o.role !== 'guest') return;
    if (d.type === 'start') {
      o.phase = 'started';
      o.pending = d.pending || null;
      o.hostEntered = false; o.guestEntered = false;
      o.hostSide = null; o.guestSide = null;
      var menu = $('warMenu'); if (menu) menu.hidden = true;
      showOnlineOverlay();
      toast('房主已开始游戏，请点击进入');
    } else if (d.type === 'entered') {
      o.hostEntered = !!d.hostEntered;
      o.guestEntered = !!d.guestEntered;
      renderOnlineOverlay();
    } else if (d.type === 'choosing') {
      o.phase = 'choosing';
      o.hostEntered = true; o.guestEntered = true;
      renderOnlineOverlay();
    } else if (d.type === 'sides') {
      o.hostSide = d.hostSide == null ? null : +d.hostSide;
      o.guestSide = d.guestSide == null ? null : +d.guestSide;
      renderOnlineOverlay();
    } else if (d.type === 'sideConflict') {
      if (o.guestSide === +d.side) o.guestSide = null;
      toast('这个颜色已经被房主选择，请选另一个');
      renderOnlineOverlay();
    } else if (d.type === 'leave') {
      toast('房主已离开房间');
      clearOnline(); hideOnlineOverlay(); showMenu();
    } else if (d.type === 'state') {
      if (!d.state) return;
      hideOnlineOverlay();
      o.phase = 'playing';
      leaveSandboxUI();
      S.battleMode = 'online'; S.screen = 'game';
      S.mySide = d.state.guestSide != null ? +d.state.guestSide : (o.guestSide != null ? o.guestSide : 1);
      S.viewerSide = S.mySide;
      var menu = $('warMenu'); if (menu) menu.hidden = true;
      var sb = $('warSandbox'); if (sb) sb.hidden = true;
      deserializeState(d.state);
      refreshHud(); render();
    }
  }
  function createRoomBC() {
    if (S.online && S.online.chan) { try { S.online.chan.close(); } catch (e) { } }
    var code = makeCode();
    S.roomCode = code;
    try {
      var ch = new BroadcastChannel('dfy-war-' + code);
      S.online = {
        role: 'host', transport: 'bc', code: code, chan: ch, base: '', serverUrl: '',
        guestJoined: false, phase: 'waiting',
        hostEntered: false, guestEntered: false,
        hostSide: null, guestSide: null, pending: null, stateSeen: false
      };
      ch.onmessage = function (ev) { handleHostMessage(ev.data || {}); };
      updateRoomInfo();
      var panel = $('warOnline'); if (panel && !panel.hidden) renderOnlineOverlay();
      toast('房间已创建：' + code);
    } catch (e) { toast('当前浏览器不支持同机房间'); }
  }
  function joinRoomCodeBC(code) {
    if (S.online && S.online.chan) { try { S.online.chan.close(); } catch (e) { } }
    try {
      var ch = new BroadcastChannel('dfy-war-' + code);
      S.roomCode = code;
      S.online = {
        role: 'guest', transport: 'bc', code: code, chan: ch, base: '', serverUrl: '', stateSeen: false,
        guestJoined: true, phase: 'waiting',
        hostEntered: false, guestEntered: false,
        hostSide: null, guestSide: null, pending: null
      };
      ch.onmessage = function (ev) { handleGuestMessage(ev.data || {}); };
      ch.postMessage({ type: 'join' });
      updateRoomInfo();
      var start = $('warStart'); if (start) { start.disabled = true; start.textContent = '等待房主'; }
      toast('已加入房间：' + code);
    } catch (e) { toast('当前浏览器不支持同机房间'); }
  }
  function createRoom() {
    if (S.online) {
      onlinePollStop(S.online);
      try { if (S.online.chan) S.online.chan.close(); } catch (e) { }
      S.online = null;
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') { createRoomBC(); return; }
    var base = onlineBase(location.origin);
    toast('正在创建联机房间...');
    onlineFetchJSON(base, '/api/online/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (res) {
      if (!res.ok || !res.json || !res.json.ok) throw new Error((res.json && res.json.error) || '联机服务器不可用');
      var j = res.json;
      S.online = {
        role: 'host', transport: 'http', base: base, code: j.room, token: j.token,
        serverUrl: (j.server && j.server.url) || base, urls: (j.server && j.server.urls) || [],
        since: 0, pollStopped: false, guestJoined: false, phase: 'waiting',
        hostEntered: false, guestEntered: false,
        hostSide: null, guestSide: null, pending: null, stateSeen: false
      };
      S.roomCode = j.room;
      updateRoomInfo();
      onlinePollStart(S.online);
      var panel = $('warOnline'); if (panel && !panel.hidden) renderOnlineOverlay();
      toast('房间已创建：' + j.room + '；对方服务器填 ' + S.online.serverUrl);
    }).catch(function (err) {
      createRoomBC();
      toast('联机服务器连接失败，已退回同机房间：' + (err && err.message ? err.message : ''));
    });
  }
  function joinRoomCode(code, serverUrl) {
    var invite = parseInviteLink(code) || parseInviteLink(serverUrl);
    if (invite) { code = invite.room; serverUrl = invite.server; }
    code = String(code || '').trim().toUpperCase();
    if (!code) { toast('输入房间号，或粘贴邀请链接'); return; }
    if (S.online) {
      onlinePollStop(S.online);
      try { if (S.online.chan) S.online.chan.close(); } catch (e) { }
      S.online = null;
    }
    var explicit = !!(serverUrl && String(serverUrl).trim());
    if (!explicit) toast('只填房间号是同机浏览器连接；跨电脑请填房主服务器地址，或打开房主发的邀请链接');
    var base = onlineBase(serverUrl || location.origin);
    if (!/^https?:\/\//i.test(base)) { joinRoomCodeBC(code); return; }
    toast('正在连接房主服务器...');
    onlineFetchJSON(base, '/api/online/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: code })
    }).then(function (res) {
      if (!res.ok || !res.json || !res.json.ok) throw new Error((res.json && res.json.error) || '加入失败');
      var j = res.json;
      S.online = {
        role: 'guest', transport: 'http', base: base, code: j.room || code, token: j.token,
        serverUrl: base, urls: (j.server && j.server.urls) || [],
        since: 0, pollStopped: false, stateSeen: false,
        guestJoined: true, phase: 'waiting',
        hostEntered: false, guestEntered: false,
        hostSide: null, guestSide: null, pending: null
      };
      S.roomCode = j.room || code;
      onlinePollStart(S.online);
      updateRoomInfo();
      showOnlineOverlay();
      var start = $('warStart'); if (start) { start.disabled = true; start.textContent = '等待房主'; }
      toast('已加入房间：' + S.roomCode);
    }).catch(function (err) {
      if (!explicit) {
        joinRoomCodeBC(code);
        toast('联机服务器连接失败，已退回同机房间：' + (err && err.message ? err.message : ''));
      } else {
        toast('加入失败：' + (err && err.message ? err.message : '检查服务器地址和防火墙'));
      }
    });
  }
  function joinRoom() {
    var inp = $('warRoomInput'); var code = (inp && inp.value || '').trim().toUpperCase();
    var srv = $('warServerInput'); var server = (srv && srv.value || '').trim();
    var invite = parseInviteLink(code) || parseInviteLink(server);
    if (invite) { code = invite.room; server = invite.server; }
    if (!code) { toast('输入房间号，或粘贴邀请链接'); return; }
    joinRoomCode(code, server);
  }
  function startOnlineGame() {
    if (!S.online) { toast('先创建或加入房间'); return; }
    if (S.online.role === 'guest') { toast('等房主开始'); return; }
    if (!S.online.guestJoined) { toast('等待玩家加入后再开始'); return; }
    var mi = S.mapChoice != null ? S.mapChoice : 0;
    beginOnlinePregame({ kind: 'normal', mapIndex: mi, mapName: MAPS[mi].name });
  }
  function serializeState() {
    if (!S.map) return null;
    return {
      mapName: S.customName || MAPS[S.mapChoice].name, mapIndex: S.mapChoice, customName: S.customName, seed: S.map.seed, w: S.map.w || W, h: S.map.h || H,
      hostSide: S.online ? S.online.hostSide : null, guestSide: S.online ? S.online.guestSide : null,
      terrain: Array.from(S.map.terrain), owner: Array.from(S.map.owner), acted: Array.from(S.map.acted),
      units: S.units.map(function (u) { return { id: u.id, side: u.side, type: u.type, x: u.x, y: u.y, hp: u.hp, ap: u.ap, apBonus: u.apBonus || 0, acted: u.acted, postMove: u.postMove, stealth: u.stealth, idle: u.idle, didOperate: u.didOperate, detectedBy: u.detectedBy, dev: u.dev, devHidden: !!u.devHidden }; }),
      gold: S.gold, round: S.round, turnSide: S.turnSide, over: S.over
    };
  }
  function deserializeState(st) {
    if (!st) return;
    var first = !S.online || !S.online.stateSeen;
    if (S.online) S.online.stateSeen = true;
    var oldUnits = first ? null : (S.units || []).slice();
    var oldById = {};
    if (oldUnits) oldUnits.forEach(function (u) { oldById[u.id] = u; });
    var sw = Math.round(+st.w) || 80, sh = Math.round(+st.h) || 80;
    setBoardSize(sw, sh);
    S.map = { seed: st.seed || 0, w: sw, h: sh, terrain: Uint8Array.from(st.terrain), owner: Int8Array.from(st.owner), acted: Uint8Array.from(st.acted), units: [] };
    S.units = (st.units || []).map(function (x) {
      var u = makeUnit(x.side, x.type, x.x, x.y);
      if (x.id) u.id = x.id;
      u.hp = x.hp; u.ap = x.ap; u.apBonus = x.apBonus == null ? 0 : +x.apBonus; u.acted = !!x.acted; u.stealth = !!x.stealth; u.idle = x.idle == null ? -1 : x.idle;
      u.didOperate = !!x.didOperate;
      u.postMove = !!x.postMove;
      u.detectedBy = x.detectedBy || [false, false];
      u.dev = x.dev || null;
      u.devHidden = !!x.devHidden;
      return u;
    });
    S.map.units = S.units;
    S.gold = st.gold || [0, 0]; S.round = st.round || 1; S.turnSide = st.turnSide || 0; S.over = st.over || null;
    if (st.mapIndex != null) S.mapChoice = st.mapIndex;
    S.customName = st.customName || '';
    elephantReveal();
    if (S.battleMode === 'online' && S.online && S.online.role === 'guest') {
      S.mySide = st.guestSide != null ? +st.guestSide : (S.mySide == null ? 1 : S.mySide);
    } else if (S.mySide == null) {
      S.mySide = 0;
    }
    S.viewerSide = S.mySide; S.revealAll = false;
    S.selected = null; S.reach = null; S.attackable = []; S.blocked = []; S.threatened = null; S.path = null; S.towerRange = null; S.inspectTower = null; S.healMode = false; S.fx = []; S.pending = [];
    var menu = $('warMenu'); if (menu) menu.hidden = true;
    S.cam.tile = TILE;
    if (first) {
      var fkSide = S.mySide;
      var fk = S.customName ? S.units.filter(function (u) { return u.side === fkSide && u.type === 'king' && u.alive; })[0] : null;
      var camp = fkSide === 0 ? CAMPS.red : CAMPS.black;
      focusCell(fk ? fk.x : camp.x, fk ? fk.y : camp.y);
    } else {
      // 自己走不追镜头；对方（房主/红方）走时平滑跟过去
      var moved = null;
      S.units.forEach(function (u) {
        if (u.side === 0 && !u.stealth && oldById[u.id] && (oldById[u.id].x !== u.x || oldById[u.id].y !== u.y)) moved = u;
      });
      if (moved) cameraToCell(moved.x, moved.y, true);
    }
    if (S.over) showOver(S.over.winner, S.over.why);
  }
  function broadcastState() {
    if (!S.online || S.online.role !== 'host' || !S.map) return;
    onlineSend({ type: 'state', state: serializeState() });
  }
  function broadcastIfHost() {
    if (S.online && S.online.role === 'host') broadcastState();
  }
  function sendOnlineAction(action) {
    if (!S.online || S.online.role !== 'guest') return;
    onlineSend({ type: 'action', action: action });
  }
  function applyOnlineAction(a) {
    if (!a || !S.online || S.turnSide !== S.online.guestSide) return;
    if (a.type === 'end') { endTurn(true); return; }
    if (a.type === 'collect') { collectBuilding(a.x, a.y); broadcastState(); refreshHud(); render(); return; }
    if (a.type === 'produce') { produce(a.x, a.y, a.unitType); broadcastState(); refreshHud(); render(); return; }
    var u = null; S.units.forEach(function (x) { if (x.id === a.unitId) u = x; });
    if (!u || u.side !== S.online.guestSide || u.acted) return;
    if (!u.stealth) cameraToCell(u.x, u.y, true);
    if (a.type === 'move') {
      var reach = computeReach(u); var path = pathTo(reach, a.x, a.y);
      if (path) moveUnit(u, path);
    } else if (a.type === 'attack') {
      var t = null; S.units.forEach(function (x) { if (x.id === a.targetId) t = x; });
      if (t) doAttack(u, t);
    } else if (a.type === 'heal') {
      var t2 = null; S.units.forEach(function (x) { if (x.id === a.targetId) t2 = x; });
      if (t2) doHeal(u, t2);
    } else if (a.type === 'gold') { kingGold(u); }
    else if (a.type === 'occupy') { occupy(u); }
    broadcastState(); refreshHud(); render();
  }

  /* ---------- 输入 ---------- */
  function bindCanvas() {
    function cellOf(e) {
      var r = cv.getBoundingClientRect();
      return screenCell(e.clientX - r.left, e.clientY - r.top);
    }
    cv.addEventListener('pointerdown', function (e) {
      if (S.screen !== 'game' || !S.map) return;
      var c = cellOf(e);
      if (isSandbox()) {
        if (S.sbDragMaterial) {
          S.sbDragActive = true; S.sbDragTarget = null;
          cv.setPointerCapture(e.pointerId); return;
        }
        if (S.sbTool === 'marquee') {
          S.sbMarquee = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
          cv.setPointerCapture(e.pointerId); render(); return;
        }
        if (S.sbTool === 'brush' || S.sbTool === 'erase') {
          if (!inMap(c.x, c.y)) return;
          if (S.sbTool === 'brush' && !S.sbBrush) { toast('先在左侧素材库选择素材'); return; }
          if (!sbInRegion(c.x, c.y)) { toast('不能操作框定范围外'); return; }
          sbPushUndo();
          S.sbPaintDown = true; S.sbPaintLast = { x: c.x, y: c.y };
          sbPaintCell(c.x, c.y, true);
          render();
          cv.setPointerCapture(e.pointerId);
          return;
        }
      }
      var r = cv.getBoundingClientRect();
      S.drag = { x: e.clientX, y: e.clientY, camX: S.cam.x, camY: S.cam.y, moved: false, px: e.clientX - r.left, py: e.clientY - r.top };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!S.map || S.screen !== 'game') return;
      var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var c = cellOf(e);
      if (isSandbox() && S.sbPaintDown) {
        if (inMap(c.x, c.y) && S.sbPaintLast) {
          if (S.sbPaintLast.x !== c.x || S.sbPaintLast.y !== c.y) {
            sbPaintLine(S.sbPaintLast.x, S.sbPaintLast.y, c.x, c.y);
            S.sbPaintLast = { x: c.x, y: c.y };
          }
        }
        return;
      }
      if (isSandbox() && S.sbDragActive) {
        if (inMap(c.x, c.y)) S.sbDragTarget = c;
        render(); return;
      }
      if (isSandbox() && S.sbMarquee) {
        if (inMap(c.x, c.y)) { S.sbMarquee.x1 = c.x; S.sbMarquee.y1 = c.y; render(); }
        return;
      }
      if (S.drag) {
        var dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) S.drag.moved = true;
        if (S.drag.moved && (!isSandbox() || S.sbTool === 'click')) {
          S.camAnim = null; S.cam.x = S.drag.camX + dx; S.cam.y = S.drag.camY + dy; clampCam(); dirty = true;
        }
      }
      if (!inMap(c.x, c.y)) return;
      if (S.selected && S.reach) {
        var p = pathTo(S.reach, c.x, c.y);
        if (p) { S.path = p; hint('行动值 ' + fmtAp(S.reach.dist[idx(c.x, c.y)]) + ' / ' + fmtAp(S.selected.ap)); }
        else {
          S.path = null;
          var u2 = unitAt(c.x, c.y, S.viewerSide);
          var raw2 = rawUnitAt(c.x, c.y);
          var why;
          if (u2) why = '这个格子上有' + sideName(u2.side) + '的' + UNITS[u2.type].name;
          else if (raw2 && raw2.side !== S.viewerSide && raw2.stealth) why = '前方有东西挡住了，过不去';
          else {
            var t2 = S.map.terrain[idx(c.x, c.y)];
            var c2 = cellCostTo(S.selected, c.x, c.y);
            why = c2 == null ? (TERRAIN[t2].name + '：这枚棋子不能进入') : '到不了：行动值不够，或前方有单位/地形挡路';
          }
          hint(why);
        }
        dirty = true;
      }
    });
    cv.addEventListener('pointerup', function (e) {
      if (isSandbox() && S.sbPaintDown) {
        var pc = cellOf(e);
        if (inMap(pc.x, pc.y) && S.sbPaintLast && (S.sbPaintLast.x !== pc.x || S.sbPaintLast.y !== pc.y)) {
          sbPaintLine(S.sbPaintLast.x, S.sbPaintLast.y, pc.x, pc.y);
        }
        S.sbPaintDown = false; S.sbPaintLast = null;
        renderSandboxAll(); refreshHud(); render();
        return;
      }
      if (isSandbox() && S.sbDragActive) {
        var c = cellOf(e);
        S.sbDragActive = false;
        sbCommitDrag(c.x, c.y);
        return;
      }
      if (isSandbox() && S.sbMarquee) {
        var m = S.sbMarquee; S.sbMarquee = null;
        var x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
        var y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
        S.sbRegion = { x0: x0, y0: y0, x1: x1, y1: y1 };
        renderSandboxAll(); render();
        hint('已框定 ' + (x1 - x0 + 1) + '×' + (y1 - y0 + 1) + '，可用画笔/橡皮在框内操作');
        return;
      }
      if (!S.drag) return;
      var d = S.drag; S.drag = null;
      if (!d.moved) {
        var c2 = cellOf(e);
        if (!inMap(c2.x, c2.y)) return;
        if (isSandbox() && S.sbTool === 'click' && !S.sbDevMode) {
          var now = performance.now();
          if (S.sbLastClick && now - S.sbLastClick.t < 360 && S.sbLastClick.x === c2.x && S.sbLastClick.y === c2.y) {
            S.sbLastClick = null;
            sbStartMaterialDrag(c2.x, c2.y);
            return;
          }
          S.sbLastClick = { x: c2.x, y: c2.y, t: now };
        }
        clickCell(c2.x, c2.y);
      }
    });
    cv.addEventListener('dblclick', function (e) {
      if (!isSandbox() || S.sbDevMode || S.sbTool !== 'click') return;
      var c = cellOf(e);
      if (!inMap(c.x, c.y)) return;
      e.preventDefault();
      sbStartMaterialDrag(c.x, c.y);
    });
    cv.addEventListener('wheel', function (e) {
      if (S.screen !== 'game') return;
      e.preventDefault();
      var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var wx = (S.cam.x + px) / S.cam.tile, wy = (S.cam.y + py) / S.cam.tile;
      S.camAnim = null;
      S.cam.tile = clamp(S.cam.tile * (e.deltaY < 0 ? 1.12 : .89), 28, 96);
      S.cam.x = wx * S.cam.tile - px; S.cam.y = wy * S.cam.tile - py;
      clampCam(); dirty = true;
    }, { passive: false });
    cv.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (isSandbox()) {
        S.sbDragMaterial = null; S.sbDragActive = false; S.sbDragTarget = null;
        S.sbPaintDown = false; S.sbPaintLast = null;
        S.sbBrush = null; S.sbDevMode = false; S.sbRegion = null; S.sbLastClick = null;
        if (S.sbTool === 'erase' || S.sbTool === 'marquee') S.sbTool = 'click';
        renderSandboxAll(); render();
        hint('已取消当前素材/工具/框定');
        return;
      }
      if (S.selected) { clearSelection(); refreshUnit(); render(); }
    });
    if (mini) mini.addEventListener('click', function (e) {
      if (!S.map) return;
      var r = mini.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      focusCell(x, y);
    });
  }

  /* ---------- 初始化 ---------- */
  function helpModal() {
    var html = '<button class="war-modal-close" type="button">×</button><h2>战棋模式 · 玩法</h2>' +
      '<p>双方各 1 将、2 士、2 相、2 俥、2 马、2 炮、5 兵，初始 50 金。每枚棋子每回合一次行动，可以移动或攻击；点棋子看绿色可行走、红色可攻击、灰色被阻挡、金色容易被攻击。</p>' +
      '<p>移动按地形消耗行动值：绿地 1，道路/村庄/城池 0.5，小森林 2/3，大森林 3/7，丘陵 3/4，中型山地 4/7，大型山地 5（俥/马/炮限制），河流只有兵/马能过，危险水域不能进。</p>' +
      '<p>村庄任何棋子站上去都能花一次行动占领；城池只有将/士/相/兵能占领。占领后每回合一次建筑行动，收 15 金或生产；村庄产兵/士/相，城池产全部。</p>' +
      '<p>士移动后隐身，攻击时现身；相会治疗，并自动侦测 1-5 格内的敌方士、破除隐身；相的 1-5 格庇护范围会显示：己方白色、敌方淡红色，<b>相自身可以被炮击中，但该范围内的己方其他棋子不会被炮击中</b>；炮射程 5-10（固定，不受行动值影响），对兵/相/士/将/马伤害 +1。将可花一次行动拿 20 金。</p>' +
      '<p>防御塔：红/黑建筑，8 点血，不能移动、不能指挥；每回合开始自动向 1-10 格内最近的敌方棋子射一箭，伤害 1，不能攻击被对方相庇护的棋子；敌方可以用棋子攻击拆除。点击防御塔会显示蓝色可攻击范围。</p>' +
      '<p>攻击、治疗和防御塔箭矢都是动画命中后才结算伤害/回血；动画期间不能继续操作或结束回合。行棋动画播完后才播放攻击动画。血条统一为绿色，降到 2/3 变黄、降到 1/3 变红，外圈黑色边框。</p>' +
      '<p>士隐身后战报只显示“士隐身了，无法得知动向。”；被相侦测、主动攻击或现身拦截破除隐身后恢复正常通报。</p>' +
      '<p>胜利条件：<b>一方的城池数量为 0，且将的数量为 0 时，该方失败</b>。只算城池，不算村庄；有城池就可以继续打、继续生产将，有将但没城池也还能继续。双方同时都没有将和城池算平局。</p>' +
      '<p>棋子移动有行棋动画；你自己走棋时镜头不动，敌方走棋时镜头平滑跟过去，不会瞬移。</p>' +
      '<p>大肥鱼 AI 分高级/终极/恶梦。没有固定回合上限，直到一方同时没有将和城池。</p>' +
      '<h3>棋子图鉴</h3><table class="war-help-table"><thead><tr><th>棋子</th><th>价格</th><th>血</th><th>行动值</th><th>攻击</th><th>伤害</th><th>功能</th></tr></thead><tbody>' +
      ['king', 'advisor', 'elephant', 'pawn', 'horse', 'cannon', 'rook'].map(function (t) {
        var d = UNITS[t];
        var ability = {
          king: '每回合可花一次行动拿 20 金',
          advisor: '移动后隐身；攻击时现身；被敌人路过会现身反击',
          elephant: '可治疗；侦测 1-5 格敌方士；1-5 格庇护己方，炮不能打庇护内其他棋子',
          pawn: '生产价 15 金 + 己方场上每兵 20 金',
          horse: '唯一能渡河的棋子之一',
          cannon: '射程 5-10，固定；对兵/相/士/将/马伤害 +1',
          rook: '被动：每闲置一回合 +1 行动值，行动后恢复基础行动值'
        }[t];
        var price = t === 'pawn' ? '15 + 20×己方兵数' : d.price + ' + 10×己方同兵种数';
        return '<tr><td>' + d.name + '</td><td>' + price + '</td><td>' + d.hp + '</td><td>' + d.ap + '</td><td>' + d.range[0] + '-' + d.range[1] + '</td><td>' + d.dmg + '</td><td>' + ability + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>地形图鉴</h3><table class="war-help-table"><thead><tr><th>地形</th><th>轻子消耗</th><th>重子消耗</th><th>限制</th></tr></thead><tbody>' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (t) {
        var d = TERRAIN[t], light = '-', heavy = '-', limit = '';
        if (t === 6) { light = '兵/马 3'; heavy = '其他不能进'; limit = '只有兵、马可渡'; }
        else if (t === 7) { light = '不可进入'; heavy = '不可进入'; limit = '危险水域'; }
        else if (d.cost) { light = d.cost.light == null ? '-' : d.cost.light; heavy = d.cost.heavy == null ? '-' : d.cost.heavy; }
        if (d.block) limit += (limit ? '；' : '') + d.block.map(function (x) { return UNITS[x].name + '不能进'; }).join('、');
        return '<tr><td>' + d.name + '</td><td>' + light + '</td><td>' + heavy + '</td><td>' + (limit || '无') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="tiny">联机对战支持两台电脑/不同浏览器：房主创建房间后，把服务器地址和房间号发给对方，对方填写服务器地址+房间号加入。服务器由房主游戏自带；同一局域网直接可用，跨网络需要对房主端口做映射或用 VPN。</p>';
    modal(html);
  }
  function bindSandboxUI() {
    var tabs = $('sbLibTabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lib]'); if (!b) return;
      S.sbLibTab = b.getAttribute('data-lib'); renderSbLibrary();
    });
    var lib = $('sbLib');
    if (lib) lib.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mat]'); if (!b) return;
      S.sbBrush = sbDecode(b.getAttribute('data-mat'));
      S.sbTool = 'brush'; S.sbDevMode = false; S.sbDragMaterial = null; S.sbDragActive = false;
      renderSandboxAll(); render();
    });
    var tools = $('sbTools');
    if (tools) tools.addEventListener('click', function (e) {
      if (e.target.closest('[data-undo]')) { sbUndoAction(); return; }
      if (e.target.closest('[data-clear-region]')) { sbClearRegion(); return; }
      if (e.target.closest('[data-cancel-region]')) { S.sbRegion = null; renderSandboxAll(); render(); return; }
      var b = e.target.closest('[data-tool]'); if (!b) return;
      S.sbDragMaterial = null; S.sbDragActive = false;
      S.sbTool = b.getAttribute('data-tool');
      if (S.sbTool !== 'click') S.sbDevMode = false;
      if (S.sbTool === 'brush' && !S.sbBrush) hint('已选择画笔，请先在素材库选择素材');
      renderSandboxAll(); render();
    });
    var dev = $('sbDev');
    if (dev) dev.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sbdev]'); if (!b) return;
      var a = b.getAttribute('data-sbdev');
      if (a === 'toggle') {
        S.sbDragMaterial = null; S.sbDragActive = false;
        S.sbDevMode = !S.sbDevMode;
        if (S.sbDevMode) S.sbTool = 'click';
        hint(S.sbDevMode ? '开发者模式：点击棋子设置定时出现/消失' : '已退出开发者模式');
        renderSandboxAll(); render();
      } else if (a === 'preview') openSbDevPreview();
      else if (a === 'apply') applySbStartConfig();
    });
    if (dev) dev.addEventListener('change', function (e) {
      if (e.target.id === 'sbStoryOn') {
        S.sbStory.enabled = !!e.target.checked;
        var ed = $('sbStoryEditor'); if (ed) ed.hidden = !S.sbStory.enabled;
      } else if (e.target.id === 'sbStoryImage') {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\//i.test(file.type)) { toast('请选择图片文件'); return; }
        if (file.size > 1.5 * 1024 * 1024) { toast('图片不能超过 1.5MB'); e.target.value = ''; return; }
        var fr = new FileReader();
        fr.onload = function () {
          S.sbStory.image = String(fr.result || '');
          var pv = $('sbStoryPreview');
          if (pv) { pv.src = S.sbStory.image; pv.hidden = false; }
          toast('剧情图片已载入，点“应用到当前地图”保存');
        };
        fr.readAsDataURL(file);
      }
    });
    var counts = $('sbCounts');
    if (counts) counts.addEventListener('click', function (e) {
      var dv = e.target.closest('[data-devunit]');
      if (dv) {
        var id = +dv.getAttribute('data-devunit');
        var u = S.units.filter(function (v) { return v.id === id; })[0];
        if (u) { focusCell(u.x, u.y); render(); toast((u.side === 0 ? '红' : '黑') + UNITS[u.type].name + '：' + devLabel(u)); }
        return;
      }
      var c = e.target.closest('[data-count]'); if (!c) return;
      var key = c.getAttribute('data-count');
      S.sbHighlight = S.sbHighlight === key ? null : key;
      renderSbCounts(); render();
    });
    var undo = $('sbTopUndo'); if (undo) undo.addEventListener('click', sbUndoAction);
    var applySize = $('sbApplySize');
    if (applySize) applySize.addEventListener('click', function () {
      resizeSandbox($('sbW') ? $('sbW').value : W, $('sbH') ? $('sbH').value : H);
    });
    var scale = $('sbScale');
    if (scale) scale.addEventListener('change', function () {
      var w = cv ? cv.clientWidth : 800, h = cv ? cv.clientHeight : 600;
      var cx = (S.cam.x + w / 2) / S.cam.tile, cy = (S.cam.y + h / 2) / S.cam.tile;
      S.sbScale = parseFloat(scale.value) || 1;
      S.cam.tile = clamp(TILE * S.sbScale, 28, 96);
      S.cam.x = cx * S.cam.tile - w / 2; S.cam.y = cy * S.cam.tile - h / 2;
      clampCam(); dirty = true; render();
    });
    var save = $('sbSave'); if (save) save.addEventListener('click', saveSandbox);
    var play = $('sbPlay'); if (play) play.addEventListener('click', openSandboxPlay);
    var exit = $('sbExit'); if (exit) exit.addEventListener('click', function () { showMenu(); });
    var sbMini = $('sbMinimap');
    if (sbMini) sbMini.addEventListener('click', function (e) {
      if (!S.map) return;
      var r = sbMini.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      focusCell(x, y); render();
    });
  }
  function goHome() {
    if (S.screen === 'game') showMenu();
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'dfy-war-back' }, '*'); return; } catch (e) { }
    }
    location.href = 'index.html';
  }
  function init() {
    S.aiWeights = loadAIWeights();
    S.aiLessons = loadAILessons();
    S.aiStrategy = loadAIStrategyStats();
    cv = $('warCanvas'); ctx = cv && cv.getContext('2d'); stage = $('warStage');
    mini = $('warMinimap'); mctx = mini && mini.getContext('2d');
    if (mini) { mini.width = 180; mini.height = 180; }
    bindCanvas();
    bindSandboxUI();
    bindOnlineUI();
    var end = $('warEnd'); if (end) end.addEventListener('click', endTurn);
    var help = $('warHelp'); if (help) help.addEventListener('click', helpModal);
    var home = $('warHome'); if (home) home.addEventListener('click', function (e) { e.preventDefault(); goHome(); });
    var gm = $('warGameMenu'); if (gm) gm.addEventListener('click', function () { if (S.screen === 'game') showMenu(); else showMenu(); });
    var mh = $('warMenuHelp'); if (mh) mh.addEventListener('click', helpModal);
    var mb = $('warMenuBack'); if (mb) mb.addEventListener('click', function () { goHome(); });
    window.addEventListener('resize', function () { resizeCanvas(); });
    preload(function () {
      resizeCanvas();
      renderMenu();
      S.screen = 'menu';
      render();
      var inviteRoom = '';
      try { inviteRoom = new URLSearchParams(location.search).get('room') || ''; } catch (e) { }
      if (inviteRoom) setTimeout(function () { joinRoomCode(inviteRoom, location.origin); }, 120);
      if (raf == null) raf = requestAnimationFrame(frame);
    });
  }
  document.addEventListener('DOMContentLoaded', init);

  /* ---------- 测试接口 ---------- */
  window.DFY = window.DFY || {};
  window.DFY.War = {
    state: function () { return S; },
    genMap: genMap,
    mapCounts: mapCounts,
    cost2: cost2,
    newBattle: function (seed) { var m = genMap(seed); placeArmy(m, 0); placeArmy(m, 1); placeDefenseTower(m, 0); placeDefenseTower(m, 1); return m; },
    _test: { UNITS: UNITS, TERRAIN: TERRAIN, W: W, H: H, computeReach: computeReach, pathTo: pathTo, canAttack: canAttack, attackDamage: attackDamage, genMap: genMap, mapCounts: mapCounts, serializeState: serializeState, deserializeState: deserializeState, startGame: startGame, selectUnit: selectUnit, clickCell: clickCell, endTurn: endTurn, moveUnit: moveUnit, cost2: cost2, beginTurn: beginTurn, doAttack: doAttack, doHeal: doHeal, kingGold: kingGold, occupy: occupy, collectBuilding: collectBuilding, produce: produce, checkOver: checkOver, goldSources: goldSources, rawUnitAt: rawUnitAt, unitVisible: unitVisible, createRoom: createRoom, joinRoom: joinRoom, startOnlineGame: startOnlineGame, sandboxPaint: sandboxPaint, startSandbox: startSandbox, saveSandbox: saveSandbox, readLib: readLib, cameraToCell: cameraToCell, focusCell: focusCell, hasAnim: hasAnim }
  };
})();














