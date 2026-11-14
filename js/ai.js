/*!
 * 中国觉醒象棋 — 电脑棋手
 * 负极大值搜索 + Alpha-Beta + 静态搜索 + 迭代加深
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./rules.js')); }
  else { root.XQAI = factory(root.XQ); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (XQ) {
  'use strict';

  var K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
  var RED = 0, BLACK = 1;
  var MATE = 900000;

  function T(rows) { return rows; }

  var PST = {
    P: [
      10, 10, 10, 10, 10, 10, 10, 10, 10,
      30, 35, 40, 45, 50, 45, 40, 35, 30,
      25, 30, 35, 40, 45, 40, 35, 30, 25,
      20, 25, 30, 35, 40, 35, 30, 25, 20,
      18, 22, 26, 30, 34, 30, 26, 22, 18,
      12, 14, 16, 18, 20, 18, 16, 14, 12,
      6, 8, 10, 12, 14, 12, 10, 8, 6,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0
    ],
    N: [
      2, 2, 2, 2, 2, 2, 2, 2, 2,
      2, 4, 8, 8, 8, 8, 8, 4, 2,
      4, 8, 14, 16, 16, 16, 14, 8, 4,
      6, 10, 16, 20, 22, 20, 16, 10, 6,
      6, 12, 18, 22, 24, 22, 18, 12, 6,
      6, 12, 18, 22, 24, 22, 18, 12, 6,
      4, 10, 16, 20, 22, 20, 16, 10, 4,
      2, 6, 12, 14, 16, 14, 12, 6, 2,
      2, 4, 6, 8, 8, 8, 6, 4, 2,
      0, 2, 2, 2, 2, 2, 2, 2, 0
    ],
    R: [
      14, 16, 14, 18, 20, 18, 14, 16, 14,
      16, 20, 18, 22, 24, 22, 18, 20, 16,
      14, 18, 16, 20, 22, 20, 16, 18, 14,
      12, 16, 14, 18, 20, 18, 14, 16, 12,
      12, 14, 14, 18, 20, 18, 14, 14, 12,
      10, 12, 12, 16, 18, 16, 12, 12, 10,
      8, 10, 10, 14, 16, 14, 10, 10, 8,
      6, 8, 8, 12, 14, 12, 8, 8, 6,
      4, 6, 6, 10, 12, 10, 6, 6, 4,
      2, 4, 4, 8, 10, 8, 4, 4, 2
    ],
    C: [
      6, 6, 8, 10, 12, 10, 8, 6, 6,
      6, 8, 10, 12, 14, 12, 10, 8, 6,
      6, 8, 10, 14, 16, 14, 10, 8, 6,
      8, 10, 12, 16, 18, 16, 12, 10, 8,
      8, 10, 12, 16, 18, 16, 12, 10, 8,
      6, 8, 10, 14, 16, 14, 10, 8, 6,
      6, 8, 10, 12, 14, 12, 10, 8, 6,
      8, 10, 12, 14, 16, 14, 12, 10, 8,
      4, 6, 8, 10, 12, 10, 8, 6, 4,
      2, 4, 6, 8, 10, 8, 6, 4, 2
    ],
    A: [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 6, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 8, 0, 0, 0, 0,
      0, 0, 0, 6, 0, 0, 0, 0, 0
    ],
    B: [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 4, 0, 0, 0, 4, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 6, 0, 0, 0, 6, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 4, 0, 0, 0, 4, 0, 0
    ],
    K: [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, -6, -8, -6, 0, 0, 0,
      0, 0, 0, -4, -6, -4, 0, 0, 0,
      0, 0, 0, 2, 4, 2, 0, 0, 0
    ]
  };

  var KEY = { 1: 'K', 2: 'A', 3: 'B', 4: 'N', 5: 'R', 6: 'C', 7: 'P' };
  var PST_BLACK = {};
  for (var key in PST) {
    var arr = new Array(90);
    for (var i = 0; i < 90; i++) {
      var r = (i / 9) | 0, c = i % 9;
      arr[i] = PST[key][(9 - r) * 9 + c];
    }
    PST_BLACK[key] = arr;
  }

  var nodes = 0, abort = false, deadline = 0;
  var killers = [];

  function evaluate(st) {
    var b = st.board, score = 0;
    for (var i = 0; i < 90; i++) {
      var p = b[i];
      if (!p) continue;
      var t = p & 7, sd = p >> 3;
      var kk = KEY[t];
      var v = XQ.VALUE[t] + (sd === RED ? PST[kk][i] : PST_BLACK[kk][i]);
      if (t === 2) {
        var rr = (i / 9) | 0, cc = i % 9;
        var inPal = cc >= 3 && cc <= 5 && (sd === RED ? rr >= 7 : rr <= 2);
        if (!inPal && !st.kingOut[sd]) v -= 150;
      }
      score += sd === RED ? v : -v;
    }
    return st.turn === RED ? score : -score;
  }

  function capValue(b, mv) {
    var q = b[mv.t];
    if (!q) return 0;
    var v = XQ.VALUE[q & 7];
    var att = b[mv.f];
    if (att) v = v * 16 - XQ.VALUE[att & 7];
    return v + 1000;
  }

  function orderMoves(st, moves, ply) {
    var b = st.board;
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var s = 0;
      if (b[mv.t] && mv.kind !== 'swap') s = capValue(b, mv);
      else {
        var ks = killers[ply];
        if (ks) for (var k = 0; k < ks.length; k++) {
          if (ks[k] && ks[k].f === mv.f && ks[k].t === mv.t) { s = 900; break; }
        }
      }
      mv._s = s;
    }
    moves.sort(function (a, b2) { return (b2._s || 0) - (a._s || 0); });
  }

  function quiesce(st, alpha, beta, ply, qd) {
    if (abort) return 0;
    nodes++;
    if ((nodes & 255) === 0 && Date.now() > deadline) { abort = true; return 0; }
    var stand = evaluate(st);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return alpha;
    var caps = XQ.legalMoves(st, true);
    // 额外回合无子可吃（也不想再吃）时按“跳过”处理，交给对方
    if (st.bonus && !caps.length) {
      var ub = XQ.skipBonus(st);
      var vb = -quiesce(st, -beta, -alpha, ply + 1, qd);
      XQ.undoMove(st, ub);
      return vb;
    }
    if (!caps.length) return alpha;
    orderMoves(st, caps, ply);
    for (var i = 0; i < caps.length; i++) {
      var u = XQ.doMove(st, caps[i]);
      var sc = -quiesce(st, -beta, -alpha, ply + 1, qd - 1);
      XQ.undoMove(st, u);
      if (abort) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(st, depth, alpha, beta, ply) {
    if (abort) return 0;
    nodes++;
    if ((nodes & 255) === 0 && Date.now() > deadline) { abort = true; return 0; }
    if (depth <= 0) return quiesce(st, alpha, beta, ply, 4);

    var moves = XQ.legalMoves(st);
    if (!moves.length) {
      // 额外回合但该子无路可走：自动跳过，不算将死
      if (st.bonus) {
        var ub = XQ.skipBonus(st);
        var sb = -negamax(st, depth, -beta, -alpha, ply + 1);
        XQ.undoMove(st, ub);
        return sb;
      }
      return -MATE + ply;
    }
    orderMoves(st, moves, ply);

    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var u = XQ.doMove(st, moves[i]);
      var same = !!st.bonus;
      // 额外回合不换行棋方：子节点价值不取反
      var sc = same ? negamax(st, depth - 1, alpha, beta, ply + 1)
                    : -negamax(st, depth - 1, -beta, -alpha, ply + 1);
      XQ.undoMove(st, u);
      if (abort) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!st.board[moves[i].t]) {
          killers[ply] = killers[ply] || [];
          killers[ply].unshift(moves[i]);
          if (killers[ply].length > 2) killers[ply].pop();
        }
        break;
      }
    }
    return best;
  }

  var LEVELS = {
    easy:   { depth: 2, time: 300,  noise: 160, blunder: 0.10 },
    medium: { depth: 3, time: 1200, noise: 30,  blunder: 0.02 },
    hard:   { depth: 4, time: 3200, noise: 0,   blunder: 0 }
  };

  function think(st, level) {
    var cfg = LEVELS[level] || LEVELS.medium;
    nodes = 0; abort = false; killers = [];
    deadline = Date.now() + cfg.time;

    var moves = XQ.legalMoves(st);
    if (!moves.length) return null;
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };

    var best = moves[0], bestScore = 0, doneDepth = 0, lastScores = null;

    for (var d = 1; d <= cfg.depth; d++) {
      var alpha = -Infinity, localBest = null, localScore = -Infinity;
      var scores = [];
      orderMoves(st, moves, 0);
      if (best) {
        var bi = moves.indexOf(best);
        if (bi > 0) { moves.splice(bi, 1); moves.unshift(best); }
      }
      for (var i = 0; i < moves.length; i++) {
        var u = XQ.doMove(st, moves[i]);
        var same = !!st.bonus;
        // 额外回合不换行棋方，价值不取反
        var sc = same ? negamax(st, d - 1, alpha, Infinity, 1)
                      : -negamax(st, d - 1, -Infinity, -alpha, 1);
        XQ.undoMove(st, u);
        if (abort) break;
        scores.push({ mv: moves[i], sc: sc });
        if (sc > localScore) { localScore = sc; localBest = moves[i]; }
        if (sc > alpha) alpha = sc;
      }
      if (abort) break;
      best = localBest; bestScore = localScore; doneDepth = d; lastScores = scores;
      if (bestScore > MATE - 1000) break;
    }

    if (!best) best = moves[0];

    if (cfg.noise > 0 && lastScores && lastScores.length > 1) {
      var pool = lastScores.filter(function (s) { return s.sc >= bestScore - cfg.noise; });
      if (pool.length > 1) best = pool[(Math.random() * pool.length) | 0].mv;
    }
    if (cfg.blunder > 0 && Math.random() < cfg.blunder) {
      best = moves[(Math.random() * moves.length) | 0];
    }

    return { move: best, score: bestScore, depth: doneDepth, nodes: nodes };
  }

  return { think: think, evaluate: evaluate, LEVELS: LEVELS };
});
