/* 与大肥鱼一起下象棋 · 沙盘模式 / 沙盘保存库 */
(function (root) {
  'use strict';
  var XQ = root.XQ;
  var Store = root.DFY.Store;
  var Board = root.DFY.Board;
  var App = null;

  var view = null;
  var st = null;
  var pickPiece = 0;
  var erase = false;
  var editing = null;
  var els = {};
  var inited = false;

  function $(s) { return document.querySelector(s); }
  function app() { return App || (App = root.DFY.App); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function blankState(turn) {
    return {
      board: new Int8Array(90),
      turn: turn ? 1 : 0,
      mode: 'awake',
      kingOut: [false, false],
      rookSpawned: [true, true],
      bonus: null,
      captured: [[], []],
      ply: 0,
      lastMove: null
    };
  }

  function init() {
    if (inited) return;
    inited = true;
    els.svg = $('#sandboxSvg');
    if (!els.svg) return;
    view = Board.create(els.svg);
    st = blankState(0);
    buildPalette();
    els.svg.addEventListener('pointerdown', function (e) {
      var sq = view.pointerToSquare(e);
      if (sq < 0) return;
      e.preventDefault();
      if (e.button === 2) { st.board[sq] = 0; refresh(); return; }
      if (erase) { st.board[sq] = 0; refresh(); return; }
      if (!pickPiece) { app().toast('先在右边选一枚棋子'); return; }
      var cur = st.board[sq];
      if (cur === pickPiece) { st.board[sq] = 0; }
      else { st.board[sq] = pickPiece; }
      refresh();
    });
    els.svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('#btnSbClear').addEventListener('click', function () {
      if (!confirm('清空整个沙盘？')) return;
      st.board.fill(0);
      st.captured = [[], []];
      refresh();
    });
    $('#btnSbTurn').addEventListener('click', function () {
      st.turn = 1 - st.turn;
      refresh();
    });
    $('#btnSbSave').addEventListener('click', function () { save(); });
    $('#btnSbStart').addEventListener('click', function () { openStartChooser(); });
    $('#btnSbLib').addEventListener('click', function () { openLibrary(); });
    $('#btnSbBack').addEventListener('click', function () { app().go('lobby'); });
    document.addEventListener('keydown', function (e) {
      if (app().screen() !== 'sandbox') return;
      if (e.key === 'Escape') { pickPiece = 0; erase = false; syncPalette(); }
    });
  }

  function buildPalette() {
    els.palette = $('#sbPalette');
    var rows = [[0, ['帥', '仕', '相', '傌', '俥', '炮', '兵']], [1, ['將', '士', '象', '馬', '車', '砲', '卒']]];
    var html = rows.map(function (row) {
      var side = row[0];
      return '<div class="sb-row">' + row[1].map(function (ch, i) {
        var t = i + 1;
        return '<button type="button" class="sb-piece ' + (side ? 'black' : 'red') + '" data-side="' + side + '" data-type="' + t + '">' +
          '<img src="' + Board.pieceSrc(side, t) + '" alt="' + ch + '"><span>' + ch + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    html += '<div class="sb-row"><button type="button" class="sb-tool" id="sbErase">橡皮</button>' +
      '<button type="button" class="sb-tool" id="sbHintText">右键也能删子</button></div>';
    els.palette.innerHTML = html;
    els.palette.addEventListener('click', function (e) {
      var b = e.target.closest('.sb-piece');
      if (b) {
        var side = +b.getAttribute('data-side'), t = +b.getAttribute('data-type');
        pickPiece = side * 8 + t;
        erase = false;
        syncPalette();
        return;
      }
      if (e.target.closest('#sbErase')) {
        erase = true; pickPiece = 0; syncPalette();
      }
    });
  }

  function syncPalette() {
    if (!els.palette) return;
    els.palette.querySelectorAll('.sb-piece').forEach(function (b) {
      var side = +b.getAttribute('data-side'), t = +b.getAttribute('data-type');
      b.classList.toggle('sel', !erase && pickPiece === side * 8 + t);
    });
    var er = $('#sbErase');
    if (er) er.classList.toggle('sel', erase);
  }

  function open(rec) {
    init();
    app().go('sandbox');
    editing = rec || null;
    st = blankState(rec ? rec.turn : 0);
    if (rec) {
      st.board = Int8Array.from(rec.board);
      var v = validate(Array.prototype.slice.call(st.board), null);
      st.kingOut = v.kingOut;
    }
    pickPiece = 0;
    erase = false;
    syncPalette();
    view.build();
    refresh();
    app().setBadges('sandbox', null, false);
    $('#sbName').textContent = rec ? rec.name : '新沙盘';
  }

  function refresh() {
    if (!st) return;
    var ui = {
      sel: -1, moves: [], lastMove: null, hint: null, over: false, bonus: null,
      choiceHighlights: [], awakeable: function () { return false; }
    };
    view.render(st, ui);
    var v = validate(Array.prototype.slice.call(st.board), null);
    var count = 0;
    for (var i = 0; i < 90; i++) if (st.board[i]) count++;
    $('#sbCount').textContent = count + ' 枚';
    $('#btnSbTurn').textContent = st.turn === 0 ? '红先' : '黑先';
    var errBox = $('#sbErrors');
    if (!count) {
      errBox.innerHTML = '<p class="sb-tip">空棋盘。选一枚棋子，点棋盘落子；右键或“橡皮”删子。</p>';
    } else if (v.ok) {
      errBox.innerHTML = '<p class="sb-ok">✓ 这个棋盘可以保存，也能开经典和觉醒对局。</p>';
    } else {
      var classic = validate(Array.prototype.slice.call(st.board), 'classic');
      errBox.innerHTML = '<p class="sb-bad">还不能开始：</p><ul>' +
        v.errors.slice(0, 5).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
        '</ul>' + (classic.ok ? '' : '<p class="sb-tip">（经典模式另有 ' + classic.errors.length + ' 条限制）</p>');
    }
    $('#btnSbStart').disabled = !v.ok;
    $('#btnSbSave').disabled = !v.ok;
  }

  /* ---------------- 校验 ---------------- */

  function inPalace(side, r, c) {
    return c >= 3 && c <= 5 && (side === 0 ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2));
  }
  function across(side, r) { return side === XQ.RED ? r < 5 : r > 4; }

  function validate(board, mode) {
    var errs = [];
    var n = [{}, {}];
    var kings = [[], []];
    for (var i = 0; i < 90; i++) {
      var p = board[i];
      if (!p) continue;
      var side = p >> 3, t = p & 7, r = XQ.rowOf(i), c = XQ.colOf(i);
      n[side][t] = (n[side][t] || 0) + 1;
      if (t === XQ.K) kings[side].push({ r: r, c: c, sq: i });
      if ((t === XQ.K || t === XQ.A) && across(side, r)) {
        errs.push((side === 0 ? '红方' : '黑方') + XQ.NAMES[side][t] + '不能放在对方半场');
      }
    }
    var limits = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
    [0, 1].forEach(function (side) {
      var name = side === 0 ? '红方' : '黑方';
      for (var t = 1; t <= 7; t++) {
        if ((n[side][t] || 0) > limits[t]) errs.push(name + XQ.NAMES[side][t] + '最多 ' + limits[t] + ' 枚');
      }
      if (kings[side].length !== 1) errs.push(name + '必须恰好有一枚' + XQ.NAMES[side][1]);
    });
    var kingOut = [false, false];
    [0, 1].forEach(function (side) {
      if (kings[side].length !== 1) return;
      var k = kings[side][0];
      var name = side === 0 ? '红方' : '黑方';
      if (!inPalace(side, k.r, k.c)) {
        if ((n[side][XQ.A] || 0) > 1) errs.push(name + '将帅出宫时，士最多 1 枚');
        kingOut[side] = true;
      }
      if (across(side, k.r)) errs.push(name + '将帅不能过河');
      var advisors = 0;
      for (var j = 0; j < 90; j++) {
        var q = board[j];
        if (!q || (q >> 3) !== side || (q & 7) !== XQ.A) continue;
        advisors++;
        var ar = XQ.rowOf(j), ac = XQ.colOf(j);
        if (!inPalace(side, ar, ac)) {
          if (!kingOut[side]) errs.push(name + '士在宫外，但将帅还没出宫');
          if (across(side, ar)) errs.push(name + '士不能过河');
        }
      }
      var pawns = n[side][XQ.P] || 0;
      var std = side === 0
        ? [[9, 2], [9, 6], [7, 0], [7, 4], [7, 8], [5, 2], [5, 6]]
        : [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
      for (var b = 0; b < 90; b++) {
        var qb = board[b];
        if (!qb || (qb >> 3) !== side) continue;
        var bt = qb & 7, br = XQ.rowOf(b), bc = XQ.colOf(b);
        if (bt === XQ.P && ((side === 0 && br > 6) || (side === 1 && br < 3))) {
          errs.push(name + '的兵卒不能摆在出生线后面');
        }
        if (bt !== XQ.B) continue;
        if (across(side, br) && pawns > 0) errs.push(name + '还有兵卒时，相象不能过河');
        else if (pawns > 0 && !std.some(function (x) { return x[0] === br && x[1] === bc; })) {
          errs.push(name + '相象不在合法点位');
        }
      }
    });
    if (kings[0].length === 1 && kings[1].length === 1) {
      var a = kings[0][0], b2 = kings[1][0];
      if (a.c === b2.c) {
        var clear = true, lo = Math.min(a.r, b2.r), hi = Math.max(a.r, b2.r);
        for (var rr = lo + 1; rr < hi; rr++) if (board[rr * 9 + a.c]) { clear = false; break; }
        if (clear) errs.push('将帅不能在同一列直接对面');
      }
    }
    // 开局不允许任何一方被将军
    if (errs.length === 0) {
      var tmp = XQ.newState('awake');
      tmp.board = Int8Array.from(board);
      tmp.kingOut = kingOut.slice();
      tmp.captured = [[], []];
      if (XQ.inCheck(tmp, 0) || XQ.inCheck(tmp, 1)) errs.push('开局时不能让任何一方的将帅处于被将军状态');
    }
    if (mode === 'classic') {
      if (kingOut[0] || kingOut[1]) errs.push('经典模式不允许将帅出宫');
      [0, 1].forEach(function (side) {
        var name = side === 0 ? '红方' : '黑方';
        var std = side === 0
          ? [[9, 2], [9, 6], [7, 0], [7, 4], [7, 8], [5, 2], [5, 6]]
          : [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
        for (var i = 0; i < 90; i++) {
          var p = board[i];
          if (!p || (p >> 3) !== side) continue;
          var t = p & 7, r = XQ.rowOf(i), c = XQ.colOf(i);
          if (t === XQ.A && !inPalace(side, r, c)) errs.push('经典模式的士不能出宫');
          if (t === XQ.B) {
            if (across(side, r)) errs.push('经典模式的相象不能过河');
            else if (!std.some(function (x) { return x[0] === r && x[1] === c; })) {
              errs.push('经典模式的相象不在合法点位');
            }
          }
        }
      });
      if ((n[0][XQ.P] || 0) === 0 || (n[1][XQ.P] || 0) === 0) {
        // 兵全没了也允许，只是提醒
      }
    }
    return { ok: errs.length === 0, errors: errs, kingOut: kingOut };
  }

  /* ---------------- 保存 / 库 ---------------- */

  function save() {
    var v = validate(Array.prototype.slice.call(st.board), null);
    if (!v.ok) { app().toast('这个棋盘还不能保存，先看看右边的提示'); return; }
    var defName = editing ? editing.name : ('沙盘 ' + Store.dateText());
    var name = prompt('给这个棋盘起个名字：', defName);
    if (name === null) return;
    name = String(name).trim() || '未命名沙盘';
    var rec = {
      id: editing ? editing.id : Store.uid(),
      name: name,
      date: Store.dateText(),
      board: Array.prototype.slice.call(st.board),
      turn: st.turn,
      kingOut: v.kingOut
    };
    if (editing) Store.sandbox.update(rec);
    else Store.sandbox.add(rec);
    editing = rec;
    $('#sbName').textContent = rec.name;
    app().toast('已保存到沙盘保存库');
  }

  function buildCustom(st0, v) {
    var rooks = [0, 0];
    for (var i = 0; i < 90; i++) {
      var p = st0.board[i];
      if (p && (p & 7) === XQ.R) rooks[p >> 3]++;
    }
    var cap = [[], []];
    [0, 1].forEach(function (s) {
      for (var k = rooks[s]; k < 2; k++) cap[s].push(XQ.R);
    });
    return {
      board: Array.prototype.slice.call(st0.board),
      turn: st0.turn ? 1 : 0,
      kingOut: v.kingOut,
      captured: cap
    };
  }

  function startWith(rec, mode, level) {
    var v = validate(rec.board, mode);
    if (!v.ok) {
      app().toast('这个棋盘不能开' + (mode === 'classic' ? '经典' : '觉醒') + '：' + v.errors[0]);
      return;
    }
    var st0 = { board: rec.board, turn: rec.turn ? 1 : 0 };
    var custom = buildCustom(st0, v);
    app().go('game');
    root.DFY.Game.start({ mode: mode, level: level || 'medium', custom: custom, sandboxStart: true });
  }

  function openStartChooser(rec) {
    rec = rec || {
      name: editing ? editing.name : '当前沙盘',
      board: Array.prototype.slice.call(st.board),
      turn: st.turn
    };
    var v = validate(rec.board, null);
    if (!v.ok) { app().toast('先把这个棋盘摆完整：' + v.errors[0]); return; }
    var vc = validate(rec.board, 'classic');
    var modal = app().openModal({ id: 'sbStart', title: '用这个棋盘开局', size: 'narrow' });
    modal.body.innerHTML =
      '<p class="tiny">「' + esc(rec.name || '沙盘') + '」 · ' + (rec.turn === 0 ? '红先' : '黑先') + '</p>' +
      '<div class="sb-start">' +
      '<div class="sb-start-col' + (vc.ok ? '' : ' off') + '"><b>经典玩法</b>' +
      (vc.ok ? '' : '<span class="tiny">（这个摆法只符合觉醒规则）</span>') +
      '<div class="lv-row">' +
      '<button class="mini" data-m="classic" data-l="easy"' + (vc.ok ? '' : ' disabled') + '>我只想看你</button>' +
      '<button class="mini" data-m="classic" data-l="medium"' + (vc.ok ? '' : ' disabled') + '>稍微认真</button>' +
      '<button class="mini" data-m="classic" data-l="hard"' + (vc.ok ? '' : ' disabled') + '>真的认真了</button>' +
      '</div></div>' +
      '<div class="sb-start-col"><b>觉醒之战</b><div class="lv-row">' +
      '<button class="mini" data-m="awake" data-l="easy">我只想看你</button>' +
      '<button class="mini" data-m="awake" data-l="medium">稍微认真</button>' +
      '<button class="mini" data-m="awake" data-l="hard">真的认真了</button>' +
      '</div></div>' +
      '</div>' +
      '<div class="row"><button class="mini" id="sbEdit">继续编辑</button></div>';
    modal.body.querySelectorAll('[data-m]').forEach(function (b) {
      b.addEventListener('click', function () {
        modal.close();
        startWith(rec, b.getAttribute('data-m'), b.getAttribute('data-l'));
      });
    });
    var ed = modal.body.querySelector('#sbEdit');
    if (ed) ed.addEventListener('click', function () {
      modal.close();
      open({ id: rec.id, name: rec.name, board: rec.board.slice(), turn: rec.turn });
    });
  }

  function openLibrary() {
    var modal = app().openModal({ id: 'sbLib', title: '沙盘保存库', size: 'wide' });
    function render() {
      var list = Store.sandbox.list();
      modal.body.innerHTML = list.length ? '<div class="rp-list">' + list.map(function (r) {
        var v = validate(r.board, null);
        var vc = validate(r.board, 'classic');
        return '<article class="rp-card" data-id="' + r.id + '">' +
          '<div class="rp-main"><div class="rp-title">' + esc(r.name) + '</div>' +
          '<div class="rp-meta">' + r.date + ' · ' + (r.turn === 0 ? '红先' : '黑先') + ' · ' +
          (v.ok ? '可开局' : '未完成') + (vc.ok ? '' : ' · 仅觉醒可用') + '</div></div>' +
          '<div class="rp-acts">' +
          '<button class="mini" data-a="edit">继续编辑</button>' +
          '<button class="mini" data-a="classic"' + (vc.ok ? '' : ' disabled') + '>经典对局</button>' +
          '<button class="mini" data-a="awake">觉醒对局</button>' +
          '<button class="mini danger" data-a="del">删除</button>' +
          '</div></article>';
      }).join('') + '</div>'
        : '<p class="empty">保存库还是空的。去「沙盘模式」摆一个棋盘吧。</p>';
      modal.body.querySelectorAll('.rp-card').forEach(function (card) {
        var rec = list.filter(function (x) { return x.id === card.getAttribute('data-id'); })[0];
        if (!rec) return;
        card.addEventListener('click', function (e) {
          if (e.target.closest('button')) return;
          openStartChooser(rec);
        });
        card.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            var a = b.getAttribute('data-a');
            if (a === 'edit') { open(rec); }
            else if (a === 'classic' || a === 'awake') { openStartChooser(rec); }
            else if (a === 'del') {
              if (!confirm('删除「' + rec.name + '」？')) return;
              Store.sandbox.remove(rec.id);
              render();
            }
          });
        });
      });
    }
    render();
  }

  root.DFY = root.DFY || {};
  root.DFY.Sandbox = {
    init: init,
    open: open,
    openLibrary: openLibrary,
    validate: validate
  };
})(window);
