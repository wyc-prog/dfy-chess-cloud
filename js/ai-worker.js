/* 与大肥鱼一起下象棋 · 电脑棋手线程 */
importScripts('rules.js', 'ai.js');
self.onmessage = function (e) {
  var d = e.data || {};
  try {
    var st = XQ.newState(d.mode === 'classic' ? 'classic' : 'awake');
    XQ.restore(st, d.snap);
    var res = XQAI.think(st, d.level || 'medium');
    self.postMessage({
      id: d.id,
      move: res ? res.move : null,
      score: res ? res.score : 0,
      depth: res ? res.depth : 0
    });
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err && err.message || err) });
  }
};
