/* 与大肥鱼一起下象棋 · 胜率检测
 *
 * 主曲线参考 Lichess 的 winning chances（期望得分）：
 *   p = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 * 这里 cp 是“大肥鱼视角”的厘兵，p 是大肥鱼的期望得分（0—100）。
 * 参考：https://github.com/lichess-org/lila/pull/11148
 *
 * 另外把 Pikafish（象棋版 Stockfish）的 WDL 模型收在这里备用：
 *   material = 10*车 + 5*马 + 5*炮 + 3*象 + 2*士 + 兵
 *   a/b 为 material 的三次多项式，v = cp * a / 100
 *   W = 1/(1+exp((a-v)/b)), L = 1/(1+exp((a+v)/b)), D = 1-W-L
 * 参考：https://github.com/official-pikafish/Pikafish/blob/master/src/uci.cpp
 * 面板使用 Lichess 期望分；WDL 留给需要“胜/和/负”细分的场景。
 */
(function (root) {
  'use strict';

  var K = 0.00368208;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** 期望得分（0—100），cp 为正表示大肥鱼占优。 */
  function expected(cp) {
    cp = Number(cp);
    if (!isFinite(cp)) cp = 0;
    cp = clamp(cp, -2500, 2500);
    var e = 1 / (1 + Math.exp(-K * cp));
    var p = 50 + 50 * (2 * e - 1);
    return clamp(p, 1, 99);
  }

  /** Pikafish 的象棋物质分（不含将/帅）。 */
  function materialOf(st) {
    if (!st || !st.board) return 55;
    var w = { 5: 10, 4: 5, 6: 5, 3: 3, 2: 2, 7: 1 };
    var sum = 0;
    for (var i = 0; i < 90; i++) {
      var p = st.board[i];
      if (!p) continue;
      var t = p & 7;
      sum += w[t] || 0;
    }
    return sum;
  }

  /** Pikafish 象棋 WDL（百分比），cp 为大肥鱼视角。 */
  function wdl(cp, st) {
    cp = Number(cp) || 0;
    var material = materialOf(st);
    var m = clamp(material, 17, 110) / 65;
    var as = [220.59891365, -810.35730430, 928.68185198, 79.83955423];
    var bs = [61.99287416, -233.72674182, 325.85508322, -68.72720854];
    var a = (((as[0] * m + as[1]) * m + as[2]) * m) + as[3];
    var b = (((bs[0] * m + bs[1]) * m + bs[2]) * m) + bs[3];
    var v = cp * a / 100;
    var w = 1 / (1 + Math.exp((a - v) / b));
    var l = 1 / (1 + Math.exp((a + v) / b));
    var d = Math.max(0, 1 - w - l);
    return { win: w * 100, draw: d * 100, loss: l * 100 };
  }

  root.DFY = root.DFY || {};
  root.DFY.WinRate = {
    K: K,
    expected: expected,
    wdl: wdl,
    material: materialOf
  };
})(window);
