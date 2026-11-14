/* 与大肥鱼一起下象棋 · 复盘 */
(function (root) {
  'use strict';
  var XQ = root.XQ;
  var Store = root.DFY.Store;
  var Board = root.DFY.Board;
  var App = null;

  var autoTimer = null;
  var viewer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function app() { return App || (App = root.DFY.App); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var LEVEL_LABEL = { easy: '我只想看你', medium: '我稍微认真一点', hard: '我真的认真了' };

  function resultText(r) {
    if (r.reason === 'draw' || r.winner === -1) return '和棋';
    var who = r.winner === 0 ? '红方胜' : '黑方胜';
    var why = r.reason === 'checkmate' ? ' · 将死' : r.reason === 'stalemate' ? ' · 困毙' : r.reason === 'resign' ? ' · 认输' : '';
    return who + why;
  }

  function buildStates(rec) {
    var st = XQ.newState(rec.mode === 'classic' ? 'classic' : 'awake');
    try {
      if (rec.start) XQ.restore(st, rec.start);
    } catch (e) { }
    var states = [{ state: Store.packState(st), moveIndex: -1 }];
    (rec.moves || []).forEach(function (m, i) {
      if (!m.mv) {
        try { XQ.skipBonus(st); } catch (e) { }
        return;
      }
      try { XQ.doMove(st, m.mv); } catch (e) { return; }
      states.push({ state: Store.packState(st), moveIndex: i });
    });
    return states;
  }

  function openLibrary() {
    var modal = app().openModal({ id: 'replayLib', title: '复盘模式', size: 'wide' });
    var body = modal.body;
    var tab = 'recent';
    function render() {
      var list = tab === 'recent' ? Store.replays.list() : Store.replays.favList();
      body.innerHTML =
        '<div class="seg">' +
        '<button class="seg-btn' + (tab === 'recent' ? ' on' : '') + '" data-tab="recent">最近 ' + Store.replays.list().length + ' / ' + Store.replays.MAX + ' 盘</button>' +
        '<button class="seg-btn' + (tab === 'fav' ? ' on' : '') + '" data-tab="fav">收藏栏 ' + Store.replays.favList().length + ' / 100</button>' +
        '</div>' +
        (list.length ? '<div class="rp-list">' + list.map(function (r) {
          var d = r.dateText || Store.dateText(r.date);
          var fav = Store.replays.isFav(r.id);
          return '<article class="rp-card" data-id="' + r.id + '">' +
            '<div class="rp-main">' +
            '<div class="rp-title">' + (r.mode === 'classic' ? '经典玩法' : '觉醒之战') +
            ' <span class="rp-lv">' + (LEVEL_LABEL[r.level] || '人机') + '</span>' +
            (r.sandbox ? ' <span class="rp-tag">沙盘开局</span>' : '') + '</div>' +
            '<div class="rp-meta">' + d + ' · ' + resultText(r) + ' · ' + (r.moves ? r.moves.filter(function (m) { return m.mv; }).length : 0) + ' 手' +
            (r.chats && r.chats.length ? ' · 对话 ' + r.chats.length + ' 句' : '') + '</div>' +
            '</div>' +
            '<div class="rp-acts">' +
            '<button class="mini" data-a="open">复盘</button>' +
            '<button class="mini' + (fav ? ' on' : '') + '" data-a="fav">' + (fav ? '已收藏' : '收藏') + '</button>' +
            '<button class="mini danger" data-a="del">删除</button>' +
            '</div></article>';
        }).join('') + '</div>'
          : '<p class="empty">' + (tab === 'recent' ? '还没有完成的对局。下一盘棋，我等你。' : '收藏栏还是空的。点「收藏」把喜欢的对局留在这里。') + '</p>') +
        '<p class="tiny">最近对局最多保留 20 盘，新的对局会自动挤掉最旧的一盘；收藏栏最多 100 条。</p>';

      body.querySelectorAll('[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); });
      });
      body.querySelectorAll('.rp-card').forEach(function (card) {
        var rec = list.filter(function (x) { return x.id === card.getAttribute('data-id'); })[0];
        if (!rec) return;
        card.addEventListener('click', function (e) {
          if (e.target.closest('button')) return;
          modal.close();
          openViewer(rec);
        });
        card.querySelectorAll('button').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var a = btn.getAttribute('data-a');
            if (a === 'open') { modal.close(); openViewer(rec); }
            else if (a === 'fav') {
              var res = Store.replays.toggleFav(rec);
              if (res.full) { app().toast('收藏栏最多 100 条，先删掉一些吧'); return; }
              app().toast(res.fav ? '已收藏，可在收藏栏查看' : '已取消收藏');
              render();
            } else if (a === 'del') {
              if (!confirm('删除这条复盘记录？')) return;
              if (tab === 'fav') Store.replays.removeFav(rec.id);
              else Store.replays.remove(rec.id);
              render();
            }
          });
        });
      });
    }
    render();
  }

  function openViewer(rec) {
    stopAuto();
    var modal = app().openModal({ id: 'replayView', title: '复盘 · ' + (rec.dateText || Store.dateText(rec.date)), size: 'wide' });
    var body = modal.body;
    body.innerHTML =
      '<div class="rv-grid">' +
      '<div class="rv-board-wrap"><div class="rv-board" id="rvBoard"></div></div>' +
      '<aside class="rv-side">' +
      '<div class="rv-info" id="rvInfo"></div>' +
      '<div class="rv-controls">' +
      '<button class="mini" data-c="first">开局</button>' +
      '<button class="mini" data-c="prev">上一步</button>' +
      '<button class="mini" data-c="next">下一步</button>' +
      '<button class="mini" data-c="last">结尾</button>' +
      '<button class="mini" data-c="auto">自动播放</button>' +
      '<button class="mini" data-c="stop">结束播放</button>' +
      '</div>' +
      '<div class="rv-moves" id="rvMoves"></div>' +
      '<div class="rv-chats" id="rvChats"></div>' +
      '</aside></div>';

    var states = buildStates(rec);
    var moves = (rec.moves || []).filter(function (m) { return m.mv; });
    var idx = 0, prev = 0;
    viewer = { rec: rec, states: states, idx: 0 };

    function show() {
      var snap = states[idx] ? states[idx].state : states[0].state;
      var anim = null;
      if (idx === prev + 1) {
        var mv = moves[idx - 1];
        var raw = mv && mv.mv;
        if (raw) anim = { from: raw.f, to: raw.t, kind: raw.kind, extra: raw.extra };
      } else if (idx === prev - 1) {
        var mv2 = moves[idx];
        var raw2 = mv2 && mv2.mv;
        if (raw2) anim = { from: raw2.t, to: raw2.f, kind: raw2.kind };
      }
      prev = idx;
      Board.renderStatic($('#rvBoard'), snap, rec.mode, anim);
      $('#rvInfo').innerHTML =
        '<div class="rv-step">第 <b>' + idx + '</b> / ' + (states.length - 1) + ' 手</div>' +
        '<div class="rv-meta">' + (rec.mode === 'classic' ? '经典玩法' : '觉醒之战') + ' · ' +
        (LEVEL_LABEL[rec.level] || '人机') + ' · ' + resultText(rec) + '</div>' +
        '<div class="rv-turn">' + (snap.turn === 0 ? '红方行棋' : '黑方行棋') + '</div>';
      var box = $('#rvMoves');
      box.innerHTML = '<div class="rv-h">棋谱</div>' + moves.map(function (m, i) {
        return '<button type="button" class="rv-mv' + (i === idx - 1 ? ' cur' : '') + '" data-i="' + (i + 1) + '">' +
          '<i>' + (m.side === 0 ? '红' : '黑') + '</i>' + esc(m.text || '') + '</button>';
      }).join('');
      box.querySelectorAll('.rv-mv').forEach(function (b) {
        b.addEventListener('click', function () {
          stopAuto();
          idx = +b.getAttribute('data-i');
          show();
        });
      });
      var chats = $('#rvChats');
      var list = (rec.chats || []).slice().sort(function (a, b) { return a.move - b.move; });
      chats.innerHTML = '<div class="rv-h">对话记录 <span class="tiny">（点击查看）</span></div>' +
        (list.length ? list.map(function (c, i) {
          return '<button type="button" class="rv-chat" data-i="' + i + '">第 ' + c.move + ' 手 · ' + esc(String(c.q).slice(0, 14)) + '</button>';
        }).join('') : '<p class="tiny">这局没有对话</p>');
      chats.querySelectorAll('.rv-chat').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = list[+b.getAttribute('data-i')];
          var m2 = app().openModal({ id: 'replayChat', title: '第 ' + c.move + ' 手的对话', size: 'narrow' });
          m2.body.innerHTML = '<div class="chat-quote"><p><b>你：</b>' + esc(c.q) + '</p><p><b>大肥鱼：</b>' + esc(c.a || '（没有回答）') + '</p></div>';
        });
      });
    }

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      var b = $('#replayView [data-c="stop"]');
      if (b) b.classList.remove('on');
    }
    function next() { if (idx < states.length - 1) { idx++; show(); } }
    function prevStep() { if (idx > 0) { idx--; show(); } }

    body.querySelectorAll('[data-c]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-c');
        if (c === 'first') { stopAuto(); idx = 0; show(); }
        else if (c === 'prev') { stopAuto(); prevStep(); }
        else if (c === 'next') { stopAuto(); next(); }
        else if (c === 'last') { stopAuto(); idx = states.length - 1; show(); }
        else if (c === 'auto') {
          stopAuto();
          if (idx >= states.length - 1) { idx = 0; show(); }
          b.classList.add('on');
          autoTimer = setInterval(function () {
            if (idx >= states.length - 1) { stopAuto(); return; }
            next();
          }, 900);
        } else if (c === 'stop') { stopAuto(); }
      });
    });

    show();
  }

  root.DFY = root.DFY || {};
  root.DFY.Replay = {
    openLibrary: openLibrary,
    openViewer: openViewer
  };
})(window);
