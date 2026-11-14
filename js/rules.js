/*!
 * 中国觉醒象棋 — 规则引擎
 * 纯逻辑，无 DOM 依赖；浏览器挂到 window.XQ，Node 下 module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.XQ = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
  var RED = 0, BLACK = 1;

  var NAMES = [
    { 1: '帥', 2: '仕', 3: '相', 4: '傌', 5: '俥', 6: '炮', 7: '兵' },
    { 1: '將', 2: '士', 3: '象', 4: '馬', 5: '車', 6: '砲', 7: '卒' }
  ];
  var VALUE = { 1: 10000, 2: 200, 3: 200, 4: 400, 5: 900, 6: 450, 7: 100 };

  var INIT = [
    13, 12, 11, 10, 9, 10, 11, 12, 13,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 14, 0, 0, 0, 0, 0, 14, 0,
    15, 0, 15, 0, 15, 0, 15, 0, 15,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    7, 0, 7, 0, 7, 0, 7, 0, 7,
    0, 6, 0, 0, 0, 0, 0, 6, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    5, 4, 3, 2, 1, 2, 3, 4, 5
  ];

  function rowOf(i) { return (i / 9) | 0; }
  function colOf(i) { return i % 9; }
  function sq(r, c) { return r * 9 + c; }
  function onBoard(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function typeOf(p) { return p & 7; }
  function sideOf(p) { return p ? (p >> 3) : -1; }
  function pieceName(side, t) { return NAMES[side][t] || ''; }

  function newState(mode) {
    return {
      board: Int8Array.from(INIT),
      turn: RED,
      mode: mode === 'awake' ? 'awake' : 'classic',
      kingOut: [false, false],
      rookSpawned: [false, false],
      // 额外回合：{ side, sq, kind:'rook'|'horse' }
      // rook  = 俥·残魂：该俥再走一步
      // horse = 傌·易位：换位后选中的己方棋子再走一步（不触发俥/马觉醒）
      bonus: null,
      captured: [[], []],
      ply: 0,
      retreatGuard: 0,
      lastMove: null
    };
  }

  function snapshot(st) {
    return {
      board: st.board.slice(),
      turn: st.turn,
      kingOut: st.kingOut.slice(),
      rookSpawned: st.rookSpawned.slice(),
      bonus: st.bonus ? { side: st.bonus.side, sq: st.bonus.sq, kind: st.bonus.kind } : null,
      captured: [st.captured[0].slice(), st.captured[1].slice()],
      ply: st.ply,
      retreatGuard: st.retreatGuard || 0,
      lastMove: st.lastMove
    };
  }

  function restore(st, u) {
    st.board.set(u.board);
    st.turn = u.turn;
    st.kingOut = u.kingOut.slice();
    st.rookSpawned = u.rookSpawned.slice();
    st.bonus = u.bonus ? { side: u.bonus.side, sq: u.bonus.sq, kind: u.bonus.kind } : null;
    st.captured = [u.captured[0].slice(), u.captured[1].slice()];
    st.ply = u.ply;
    st.retreatGuard = u.retreatGuard;
    st.lastMove = u.lastMove;
  }

  function countType(st, side, t) {
    var b = st.board, n = 0;
    for (var i = 0; i < 90; i++) {
      var p = b[i];
      if (p && (p >> 3) === side && (p & 7) === t) n++;
    }
    return n;
  }

  function findKing(st, side) {
    var b = st.board;
    for (var i = 0; i < 90; i++) {
      var p = b[i];
      if (p && (p >> 3) === side && (p & 7) === K) return i;
    }
    return -1;
  }

  function crossedRiver(side, r) { return side === RED ? r <= 4 : r >= 5; }
  function inPalace(side, r, c) {
    if (c < 3 || c > 5) return false;
    return side === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  }

  /* ---------------- 走法生成 ---------------- */

  var DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var HORSE = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]];

  function genMoves(st) {
    var b = st.board, side = st.turn, moves = [], awake = (st.mode === 'awake');
    var i, p;

    // 额外回合：只允许指定棋子行动；傌的额外回合不能再次易位
    if (st.bonus) {
      var bs = st.bonus.sq;
      var bp = b[bs];
      if (bp && (bp >> 3) === side) {
        var first = moves.length;
        genPiece(st, side, bs, moves, awake, true);
        // 俥·残魂的额外回合不能吃子
        if (st.bonus.kind === 'rook') {
          for (i = moves.length - 1; i >= first; i--) {
            var qb = b[moves[i].t];
            if (qb && (qb >> 3) !== side) moves.splice(i, 1);
          }
        }
      }
      return moves;
    }

    for (i = 0; i < 90; i++) {
      p = b[i];
      if (!p || (p >> 3) !== side) continue;
      genPiece(st, side, i, moves, awake, false);
    }
    return moves;
  }

  function genPiece(st, side, from, moves, awake, bonusTurn) {
    switch (st.board[from] & 7) {
      case K: genKing(st, side, from, moves, awake); break;
      case A: genAdvisor(st, side, from, moves, awake); break;
      case B: genElephant(st, side, from, moves, awake); break;
      case N: genHorse(st, side, from, moves, awake, bonusTurn); break;
      case R: genRook(st.board, side, from, moves); break;
      case C: genCannon(st.board, side, from, moves, awake); break;
      case P: genPawn(st, side, from, moves, awake); break;
    }
  }

  function landable(b, side, to) {
    var q = b[to];
    return !q || (q >> 3) !== side;
  }

  function genKing(st, side, from, moves, awake) {
    var b = st.board, r = rowOf(from), c = colOf(from);
    var canLeave = awake && countType(st, side, A) <= 1;
    for (var d = 0; d < 4; d++) {
      var nr = r + DIR4[d][0], nc = c + DIR4[d][1];
      if (!onBoard(nr, nc)) continue;
      var to = sq(nr, nc);
      if (inPalace(side, nr, nc)) {
        if (st.kingOut[side]) continue;
      } else {
        if (!canLeave) continue;
        if (side === RED ? nr < 5 : nr > 4) continue;
      }
      if (!landable(b, side, to)) continue;
      moves.push({ f: from, t: to });
    }
    // 飞将
    var ek = findKing(st, 1 - side);
    if (ek >= 0 && colOf(ek) === c) {
      var clear = true;
      var lo = Math.min(r, rowOf(ek)), hi = Math.max(r, rowOf(ek));
      for (var rr = lo + 1; rr < hi; rr++) {
        if (b[sq(rr, c)]) { clear = false; break; }
      }
      if (clear) moves.push({ f: from, t: ek });
    }
  }

  function genAdvisor(st, side, from, moves, awake) {
    var b = st.board, r = rowOf(from), c = colOf(from);
    var d, nr, nc, to;

    if (!awake) {
      for (d = 0; d < 4; d++) {
        nr = r + DIAG4[d][0]; nc = c + DIAG4[d][1];
        if (!onBoard(nr, nc) || !inPalace(side, nr, nc)) continue;
        to = sq(nr, nc);
        if (landable(b, side, to)) moves.push({ f: from, t: to });
      }
      return;
    }

    // 觉醒：可横、竖、斜走一格，并可走出九宫
    var outside = !inPalace(side, r, c);
    // 士在宫外而将帅仍在宫内 → 士无法在宫外行动
    if (outside && !st.kingOut[side]) return;
    // 宫外只能斜走，且只能在本方棋盘
    var dirs = outside ? DIAG4 : DIR4.concat(DIAG4);
    for (d = 0; d < dirs.length; d++) {
      nr = r + dirs[d][0]; nc = c + dirs[d][1];
      if (!onBoard(nr, nc)) continue;
      if (outside && (side === RED ? nr < 5 : nr > 4)) continue;
      to = sq(nr, nc);
      if (landable(b, side, to)) moves.push({ f: from, t: to });
    }
  }

  function genElephant(st, side, from, moves, awake) {
    var b = st.board, r = rowOf(from), c = colOf(from);
    var free = awake && countType(st, side, P) === 0;
    var steps = free ? [[1, 1], [1, -1], [-1, 1], [-1, -1], [2, 2], [2, -2], [-2, 2], [-2, -2]]
                     : [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    for (var d = 0; d < steps.length; d++) {
      var dr = steps[d][0], dc = steps[d][1];
      var nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      if (!free && crossedRiver(side, nr)) continue;
      if (Math.abs(dr) === 2 && b[sq(r + dr / 2, c + dc / 2)]) continue;
      var to = sq(nr, nc);
      if (landable(b, side, to)) moves.push({ f: from, t: to });
    }
  }

  function genHorse(st, side, from, moves, awake, bonusTurn) {
    var b = st.board, r = rowOf(from), c = colOf(from);
    for (var d = 0; d < 8; d++) {
      var dr = HORSE[d][0], dc = HORSE[d][1];
      var nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      var lr = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
      var lc = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
      if (b[sq(lr, lc)]) continue;
      var to = sq(nr, nc), q = b[to];
      if (!q) { moves.push({ f: from, t: to }); continue; }
      if ((q >> 3) !== side) { moves.push({ f: from, t: to }); continue; }
      if (!awake || bonusTurn) continue;

      // 傌·易位：车/马/炮；兵须已过河；相须已解除过河限制（己方无兵）；
      // 士、将、帅不可换位。
      var qt = q & 7, can = false;
      if (qt === R || qt === N || qt === C) can = true;
      else if (qt === P) can = crossedRiver(side, rowOf(to));
      else if (qt === B) can = countType(st, side, P) === 0;
      if (!can) continue;

      // 换位后可在两枚棋子中选一枚获得额外回合：
      // bonusSq 为该棋子换位后的落脚点（傌落在 to，另一枚落在 from）。
      moves.push({ f: from, t: to, kind: 'swap', bonusSq: to });
      moves.push({ f: from, t: to, kind: 'swap', bonusSq: from });
    }
  }

  function genRook(b, side, from, moves) {
    var r = rowOf(from), c = colOf(from);
    for (var d = 0; d < 4; d++) {
      var nr = r + DIR4[d][0], nc = c + DIR4[d][1];
      while (onBoard(nr, nc)) {
        var to = sq(nr, nc), q = b[to];
        if (!q) { moves.push({ f: from, t: to }); }
        else { if ((q >> 3) !== side) moves.push({ f: from, t: to }); break; }
        nr += DIR4[d][0]; nc += DIR4[d][1];
      }
    }
  }

  function genCannon(b, side, from, moves, awake) {
    var r = rowOf(from), c = colOf(from);
    var maxStep = awake ? 4 : 9;
    for (var d = 0; d < 4; d++) {
      var nr = r + DIR4[d][0], nc = c + DIR4[d][1], step = 1;
      // 移动
      while (step <= maxStep && onBoard(nr, nc)) {
        var to = sq(nr, nc), q = b[to];
        if (!q) { moves.push({ f: from, t: to }); }
        else if ((q >> 3) === side) { if (!awake) break; }
        else break;
        nr += DIR4[d][0]; nc += DIR4[d][1]; step++;
      }
      // 吃子：隔一子
      nr = r + DIR4[d][0]; nc = c + DIR4[d][1];
      var screen = 0;
      while (onBoard(nr, nc)) {
        var to2 = sq(nr, nc), q2 = b[to2];
        if (q2) {
          if (screen === 0) { screen = 1; }
          else {
            if ((q2 >> 3) !== side) moves.push({ f: from, t: to2 });
            break;
          }
        }
        nr += DIR4[d][0]; nc += DIR4[d][1];
      }
    }
  }

  function genPawn(st, side, from, moves, awake) {
    var b = st.board, r = rowOf(from), c = colOf(from);
    var fwd = side === RED ? -1 : 1;
    var crossed = crossedRiver(side, r);
    var dirs = [[fwd, 0]];
    if (crossed) dirs.push([0, -1], [0, 1]);

    // 并肩：过河后与左右相邻的己方兵结伴。是否带动相邻兵由行棋方选择，
    // 因此同一落点会同时生成「并肩」与「独行（经典走法）」两种着法。
    var mates = [];
    if (awake && crossed) {
      for (var s = -1; s <= 1; s += 2) {
        var mc = c + s;
        if (mc < 0 || mc > 8) continue;
        var mp = b[sq(r, mc)];
        if (mp && (mp >> 3) === side && (mp & 7) === P) mates.push(sq(r, mc));
      }
    }

    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      var to = sq(nr, nc);
      if (!landable(b, side, to)) continue;

      // 带动相邻兵：相邻兵做完全相同的一步；跟不上则没有这一分支
      if (mates.length) {
        var extra = [], ok = true;
        for (var i = 0; i < mates.length; i++) {
          var mr = rowOf(mates[i]) + dr, mcol = colOf(mates[i]) + dc;
          if (!onBoard(mr, mcol)) { ok = false; break; }
          var mt = sq(mr, mcol), q = b[mt];
          // 主兵离开的格子视为空，允许相邻兵跟进
          if (q && (q >> 3) === side && mt !== from) { ok = false; break; }
          extra.push({ f: mates[i], t: mt });
        }
        if (ok) moves.push({ f: from, t: to, extra: extra });
      }

      // 不带动相邻兵，按经典走法单独行动
      moves.push({ f: from, t: to });
    }
  }

  /* ---------------- 局面执行 ---------------- */

  function movePiece(st, from, to, fx) {
    var b = st.board, p = b[from];
    b[from] = 0;
    if (b[to]) capturePiece(st, to, fx);
    b[to] = p;
  }

  function capturePiece(st, idx, fx) {
    var b = st.board, p = b[idx];
    if (!p) return;
    var owner = p >> 3;
    st.captured[owner].push(p & 7);
    b[idx] = 0;
    if ((p & 7) === P && st.mode === 'awake') pawnRetreat(st, idx, owner, fx);
  }

  function pawnRetreat(st, idx, owner, fx) {
    if (st.retreatGuard > 12) return;
    var b = st.board, r = rowOf(idx), c = colOf(idx);
    for (var s = -1; s <= 1; s += 2) {
      var nc = c + s;
      if (nc < 0 || nc > 8) continue;
      var j = sq(r, nc), q = b[j];
      if (!q || (q >> 3) !== owner || (q & 7) !== P) continue;
      var nr = owner === RED ? r + 1 : r - 1;
      if (nr < 0 || nr > 9) continue;
      st.retreatGuard++;
      var dst = sq(nr, nc);
      if (b[dst]) capturePiece(st, dst, fx);
      b[dst] = b[j];
      b[j] = 0;
      // 把“后撤轨迹”交给界面播动画；AI/搜索不传 fx，不产生额外开销
      if (fx && fx.retreats) fx.retreats.push({ f: j, t: dst, owner: owner });
    }
  }

  function maybeSpawn(st) {
    if (st.mode !== 'awake') return;
    var side = st.turn;
    if (st.rookSpawned[side]) return;
    if (countType(st, side, P) > 0) return;
    if (countType(st, side, R) >= 2) return;
    var cands = side === RED ? [sq(9, 0), sq(9, 8)] : [sq(0, 0), sq(0, 8)];
    for (var i = 0; i < cands.length; i++) {
      if (!st.board[cands[i]]) {
        st.board[cands[i]] = side === RED ? R : (R | 8);
        st.rookSpawned[side] = true;
        return;
      }
    }
  }

  function doMove(st, mv, fx) {
    var u = snapshot(st);
    var b = st.board, side = st.turn;
    var wasBonus = !!st.bonus;
    var capturedBefore = st.captured[1 - side].length;
    st.bonus = null;
    st.retreatGuard = 0;

    if (mv.kind === 'swap') {
      var p1 = b[mv.f], p2 = b[mv.t];
      b[mv.f] = p2; b[mv.t] = p1;
      st.lastMove = mv;
      // 易位后：若换位造成将军，则不再获得额外回合，直接换手
      var swapCheck = inCheck(st, 1 - side);
      if (st.mode === 'awake' && !wasBonus && !swapCheck &&
          mv.bonusSq !== undefined && mv.bonusSq !== null) {
        st.bonus = { side: side, sq: mv.bonusSq, kind: 'horse' };
        return u;
      }
      st.turn = 1 - side;
      st.ply++;
      maybeSpawn(st);
      return u;
    }

    if (mv.extra && mv.extra.length) {
      movePiece(st, mv.f, mv.t, fx);
      for (var e = 0; e < mv.extra.length; e++) {
        var ex = mv.extra[e], eq = b[ex.t];
        if (!eq || (eq >> 3) !== side) movePiece(st, ex.f, ex.t, fx);
      }
    } else {
      movePiece(st, mv.f, mv.t, fx);
    }

    var moved = b[mv.t];
    if (moved && (moved & 7) === K) {
      var rr = rowOf(mv.t), cc = colOf(mv.t);
      if (!inPalace(side, rr, cc)) st.kingOut[side] = true;
    }

    var grant = false;
    if (st.mode === 'awake' && !wasBonus && moved && (moved & 7) === R) {
      var lost = 0, arr = st.captured[side];
      for (var i = 0; i < arr.length; i++) if (arr[i] === R) lost++;
      var capturedNow = st.captured[1 - side].length > capturedBefore;
      // 残魂：损失过俥、场上仍有俥、这一步未吃子，且没有将军，才能再走一步
      if (lost >= 1 && countType(st, side, R) >= 1 && !capturedNow && !inCheck(st, 1 - side)) grant = true;
    }

    st.lastMove = mv;
    if (grant) {
      st.bonus = { side: side, sq: mv.t, kind: 'rook' };
    } else {
      st.turn = 1 - side;
      st.ply++;
      maybeSpawn(st);
    }
    return u;
  }

  function undoMove(st, u) { restore(st, u); }

  function skipBonus(st) {
    if (!st.bonus) return null;
    var u = snapshot(st);
    st.bonus = null;
    st.turn = 1 - st.turn;
    st.ply++;
    maybeSpawn(st);
    return u;
  }

  /* ---------------- 将军判定 ---------------- */

  function isAttacked(st, target, by) {
    var b = st.board, r = rowOf(target), c = colOf(target);
    var p, d, nr, nc, q;

    var fwd = by === RED ? -1 : 1;
    var pr = r - fwd;
    if (pr >= 0 && pr < 10) {
      p = b[sq(pr, c)];
      if (p && (p >> 3) === by && (p & 7) === P) return true;
    }
    for (d = -1; d <= 1; d += 2) {
      nc = c + d;
      if (nc < 0 || nc > 8) continue;
      p = b[sq(r, nc)];
      if (p && (p >> 3) === by && (p & 7) === P && crossedRiver(by, r)) return true;
    }

    for (d = 0; d < 4; d++) {
      nr = r + DIR4[d][0]; nc = c + DIR4[d][1];
      if (!onBoard(nr, nc)) continue;
      q = b[sq(nr, nc)];
      if (q && (q >> 3) === by && (q & 7) === K) return true;
    }

    for (d = 0; d < 4; d++) {
      nr = r + DIAG4[d][0]; nc = c + DIAG4[d][1];
      if (!onBoard(nr, nc)) continue;
      q = b[sq(nr, nc)];
      if (q && (q >> 3) === by && (q & 7) === A && inPalace(by, nr, nc)) return true;
    }
    if (st.mode === 'awake') {
      for (d = 0; d < 4; d++) {
        nr = r + DIR4[d][0]; nc = c + DIR4[d][1];
        if (!onBoard(nr, nc)) continue;
        q = b[sq(nr, nc)];
        if (q && (q >> 3) === by && (q & 7) === A && inPalace(by, nr, nc)) return true;
      }
    }

    for (d = 0; d < 4; d++) {
      nr = r + DIAG4[d][0] * 2; nc = c + DIAG4[d][1] * 2;
      if (!onBoard(nr, nc)) continue;
      if (b[sq(r + DIAG4[d][0], c + DIAG4[d][1])]) continue;
      q = b[sq(nr, nc)];
      if (q && (q >> 3) === by && (q & 7) === B) {
        if (!crossedRiver(by, nr) || (st.mode === 'awake' && countType(st, by, P) === 0)) return true;
      }
    }
    if (st.mode === 'awake' && countType(st, by, P) === 0) {
      for (d = 0; d < 4; d++) {
        nr = r + DIAG4[d][0]; nc = c + DIAG4[d][1];
        if (!onBoard(nr, nc)) continue;
        q = b[sq(nr, nc)];
        if (q && (q >> 3) === by && (q & 7) === B) return true;
      }
    }

    for (d = 0; d < 4; d++) {
      var dr = DIR4[d][0], dc = DIR4[d][1];
      nr = r + dr; nc = c + dc;
      var first = -1;
      while (onBoard(nr, nc)) {
        if (b[sq(nr, nc)]) { first = sq(nr, nc); break; }
        nr += dr; nc += dc;
      }
      if (first < 0) continue;
      q = b[first];
      if ((q >> 3) === by && (q & 7) === R) return true;
      if ((q >> 3) === by && (q & 7) === K) return true;
      nr += dr; nc += dc;
      while (onBoard(nr, nc)) {
        var q2 = b[sq(nr, nc)];
        if (q2) {
          if ((q2 >> 3) === by && (q2 & 7) === C) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }

    for (d = 0; d < 8; d++) {
      var hr = r + HORSE[d][0], hc = c + HORSE[d][1];
      if (!onBoard(hr, hc)) continue;
      q = b[sq(hr, hc)];
      if (!q || (q >> 3) !== by || (q & 7) !== N) continue;
      var vr = -HORSE[d][0], vc = -HORSE[d][1];
      var lr = hr + (Math.abs(vr) === 2 ? vr / 2 : 0);
      var lc = hc + (Math.abs(vc) === 2 ? vc / 2 : 0);
      if (!b[sq(lr, lc)]) return true;
    }
    return false;
  }

  function kingsFacing(st) {
    var rk = findKing(st, RED), bk = findKing(st, BLACK);
    if (rk < 0 || bk < 0) return false;
    if (colOf(rk) !== colOf(bk)) return false;
    var c = colOf(rk);
    var lo = Math.min(rowOf(rk), rowOf(bk)), hi = Math.max(rowOf(rk), rowOf(bk));
    for (var r = lo + 1; r < hi; r++) if (st.board[sq(r, c)]) return false;
    return true;
  }

  function inCheck(st, side) {
    var k = findKing(st, side);
    if (k < 0) return true;
    if (isAttacked(st, k, 1 - side)) return true;
    return kingsFacing(st);
  }

  function legalMoves(st, capturesOnly) {
    var side = st.turn, out = [], raw = genMoves(st);
    for (var i = 0; i < raw.length; i++) {
      var mv = raw[i];
      if (capturesOnly) {
        var q = st.board[mv.t];
        var cap = q && (q >> 3) !== side;
        if (!cap && mv.extra) {
          for (var e2 = 0; e2 < mv.extra.length; e2++) {
            var q2 = st.board[mv.extra[e2].t];
            if (q2 && (q2 >> 3) !== side) { cap = true; break; }
          }
        }
        if (!cap) continue;
      }
      var u = doMove(st, mv);
      if (!inCheck(st, side)) out.push(mv);
      undoMove(st, u);
    }
    return out;
  }

  function status(st) {
    var moves = legalMoves(st);
    if (moves.length === 0) {
      return {
        over: true,
        winner: 1 - st.turn,
        reason: inCheck(st, st.turn) ? 'checkmate' : 'stalemate',
        moves: moves
      };
    }
    return { over: false, moves: moves, check: inCheck(st, st.turn) };
  }

  /* ---------------- 中文记谱 ---------------- */

  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function fileNo(side, c) { return side === RED ? 9 - c : c + 1; }
  function numTxt(side, n) { return side === RED ? CN[n] : String(n); }

  function notation(st, mv) {
    var b = st.board, side = st.turn;
    var p = b[mv.f];
    if (!p) return '';
    var t = p & 7;
    var r0 = rowOf(mv.f), c0 = colOf(mv.f);
    var r1 = rowOf(mv.t), c1 = colOf(mv.t);

    if (mv.kind === 'swap') {
      var other = b[mv.t];
      return NAMES[side][t] + numTxt(side, fileNo(side, c0)) + '换' +
        NAMES[side][other & 7] + numTxt(side, fileNo(side, c1));
    }

    var same = [];
    for (var i = 0; i < 90; i++) {
      var q = b[i];
      if (q && (q >> 3) === side && (q & 7) === t && colOf(i) === c0) same.push(i);
    }
    var prefix = '';
    if (same.length > 1) {
      same.sort(function (a, b2) { return side === RED ? rowOf(a) - rowOf(b2) : rowOf(b2) - rowOf(a); });
      var k = same.indexOf(mv.f);
      if (same.length === 2) prefix = (k === 0 ? '前' : '后');
      else prefix = (k === 0 ? '前' : (k === same.length - 1 ? '后' : '中'));
    }

    var dr = r1 - r0;
    var word = dr === 0 ? '平' : ((side === RED ? dr < 0 : dr > 0) ? '进' : '退');
    var tail;
    if (word === '平') tail = numTxt(side, fileNo(side, c1));
    else if (t === N || t === B || t === A) tail = numTxt(side, fileNo(side, c1));
    else tail = numTxt(side, Math.abs(dr));
    var s = prefix + NAMES[side][t] + numTxt(side, fileNo(side, c0)) + word + tail;
    if (mv.extra && mv.extra.length) s += '（并）';
    return s;
  }

  /* ---------------- 觉醒状态 ---------------- */

  function awakenState(st, side) {
    var awake = st.mode === 'awake';
    var lostR = 0, arr = st.captured[side];
    for (var i = 0; i < arr.length; i++) if (arr[i] === R) lostR++;
    var pawns = countType(st, side, P);
    var advisors = countType(st, side, A);
    var paired = false;
    for (var j = 0; j < 90 && !paired; j++) {
      var pj = st.board[j];
      if (!pj || (pj >> 3) !== side || (pj & 7) !== P) continue;
      var rj = rowOf(j);
      if (!crossedRiver(side, rj)) continue;
      for (var s = -1; s <= 1 && !paired; s += 2) {
        var cj = colOf(j) + s;
        if (cj < 0 || cj > 8) continue;
        var qj = st.board[sq(rj, cj)];
        if (qj && (qj >> 3) === side && (qj & 7) === P) paired = true;
      }
    }
    return {
      on: awake,
      rook: awake && lostR >= 1 && countType(st, side, R) >= 1,
      horse: awake,
      elephant: awake && pawns === 0,
      advisor: awake,
      king: awake && advisors <= 1,
      kingOut: st.kingOut[side],
      pawnPair: awake && paired,
      pawnSpawn: awake && pawns === 0 && countType(st, side, R) < 2 && !st.rookSpawned[side],
      cannon: awake
    };
  }

  return {
    K: K, A: A, B: B, N: N, R: R, C: C, P: P,
    RED: RED, BLACK: BLACK,
    NAMES: NAMES, VALUE: VALUE,
    newState: newState,
    cloneState: function (st) {
      var s = newState(st.mode);
      restore(s, snapshot(st));
      return s;
    },
    genMoves: genMoves,
    legalMoves: legalMoves,
    doMove: doMove,
    undoMove: undoMove,
    skipBonus: skipBonus,
    inCheck: inCheck,
    isAttacked: isAttacked,
    kingsFacing: kingsFacing,
    findKing: findKing,
    countType: countType,
    status: status,
    notation: notation,
    awakenState: awakenState,
    snapshot: snapshot,
    restore: restore,
    rowOf: rowOf, colOf: colOf, sq: sq,
    pieceName: pieceName
  };
});
