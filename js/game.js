/* 与大肥鱼一起下象棋 · 对局流程 */
(function (root) {
  'use strict';
  var XQ = root.XQ, AI = root.XQAI;
  var Store = root.DFY.Store;
  var Fish = root.DFY.Fish;
  var App = null;   // 延迟取，避免加载顺序问题

  var G = {
    st: null,
    mode: 'awake',
    level: 'medium',
    mySide: 0,
    aiSide: 1,
    sel: -1,
    moves: [],
    hist: [],
    log: [],
    over: false,
    thinking: false,
    animating: false,
    choosing: false,
    bonusSelecting: false,
    choiceHighlights: [],
    swapChoice: null,
    lastMove: null,
    hint: null,
    rep: {},
    noCap: 0,
    fx: { elephantFlame: [false, false] },
    gen: 0,
    startSnap: null,
    startedAt: 0,
    chats: [],
    lastAI: null,
    lastEvent: null,
    fishLost: false,
    pendingRequest: null,
    result: null,
    winHist: [],
    regretLastPly: null,
    regretChecks: 0,
    regretRolls: 0,
    regretSuppressed: 0,
    regretTriggers: 0,
    mercyPending: false,
    mercyThisTurn: false,
    regret: null,
    regretTimer: null,
    blocked: false,
    holdMoodUntilPlayerEnd: false,
    holdMoodUntilAIEnd: false,
    aiTurnStartWin: null,
    regretAvoid: null,
    noRegret: false,
    takeover: null,
    commandAIMove: null,
    avoidType: 0,
    view: null,
    timers: [],
    aiWorker: null,
    sandboxStart: false
  };

  function $(s) { return document.querySelector(s); }
  function app() { return App || (App = root.DFY.App); }

  function awakeable() {
    var st = G.st;
    return function (sq, p) { return root.DFY.Board.awakeable(st, p, sq); };
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    var svg = $('#boardSvg');
    if (!svg) return;
    G.view = root.DFY.Board.create(svg);
    svg.addEventListener('pointerdown', onPointer);
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('#btnUndo').addEventListener('click', undo);
    $('#btnHint').addEventListener('click', hint);
    $('#btnRestart').addEventListener('click', function () {
      if (!G.st) return;
      if (!confirm('重新开始这一局？')) return;
      start({ mode: G.mode, level: G.level, sandboxStart: G.sandboxStart });
    });
    $('#btnResign').addEventListener('click', resign);
    $('#btnSkipBonus').addEventListener('click', function () { skipBonus(true); });
    $('#btnGameBack').addEventListener('click', function () {
      if (!G.over && G.hist.length) {
        if (!confirm('这局还没结束，确定离开吗？')) return;
      }
      app().go('lobby');
    });
  }

  /* ---------------- 开局 ---------------- */

  function clearTimers() {
    G.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    G.timers = [];
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); G.timers.push(t); return t; }

  function start(opts) {
    opts = opts || {};
    if (Store.affinity.isSick()) {
      app().toast('大肥鱼现在只想黏着你，先陪她聊聊天吧');
      app().openSickModal();
      return;
    }
    if (app().aiReady && !app().aiReady()) {
      app().requireAI(function () { start(opts); });
      return;
    }
    clearTimers();
    G.gen++;
    if (G.aiWorker) { try { G.aiWorker.terminate(); } catch (e) { } G.aiWorker = null; }
    G.mode = opts.mode === 'classic' ? 'classic' : 'awake';
    G.level = opts.level || 'medium';
    G.mySide = 0;
    G.aiSide = 1;
    G.sandboxStart = !!opts.sandboxStart;
    G.st = XQ.newState(G.mode);
    G.st.rel = null;
    if (opts.custom) {
      G.st.board = Int8Array.from(opts.custom.board);
      G.st.turn = opts.custom.turn ? 1 : 0;
      G.st.kingOut = (opts.custom.kingOut || [false, false]).slice();
      G.st.rookSpawned = [true, true];
      G.st.bonus = null;
      G.st.captured = [(opts.custom.captured && opts.custom.captured[0] ? opts.custom.captured[0].slice() : []),
        (opts.custom.captured && opts.custom.captured[1] ? opts.custom.captured[1].slice() : [])];
      G.st.ply = 0;
      G.st.lastMove = null;
    }
    G.sel = -1;
    G.moves = [];
    G.hist = [];
    G.log = [];
    G.over = false;
    G.thinking = false;
    G.animating = false;
    G.choosing = false;
    G.bonusSelecting = false;
    G.choiceHighlights = [];
    G.swapChoice = null;
    G.lastMove = null;
    G.hint = null;
    G.rep = {};
    G.noCap = 0;
    G.fx = { elephantFlame: [false, false] };
    G.chats = [];
    G.lastAI = null;
    G.lastEvent = null;
    G.fishLost = false;
    G.pendingRequest = null;
    G.result = null;
    G.winHist = [];
    G.regretLastPly = null;
    G.regretChecks = 0;
    G.regretRolls = 0;
    G.regretSuppressed = 0;
    G.regretTriggers = 0;
    G.mercyPending = false;
    G.mercyThisTurn = false;
    G.regret = null;
    if (G.regretTimer) { clearTimeout(G.regretTimer); G.regretTimer = null; }
    G.blocked = false;
    G.holdMoodUntilPlayerEnd = false;
    G.holdMoodUntilAIEnd = false;
    G.aiTurnStartWin = null;
    G.regretAvoid = null;
    G.noRegret = false;
    G.takeover = null;
    G.commandAIMove = null;
    G.avoidType = 0;
    app().setFishBlocking(false);
    app().hideRegret();
    G.startSnap = Store.packState(G.st);
    G.startedAt = Date.now();
    G.view.clearFx();
    if (root.DFY.Soul) {
      if (Store.settings().llm.mode !== 'off') root.DFY.Soul.attach(true);
    }
    recordWinRate();
    $('#gameResult') && ($('#gameResult').hidden = true);
    app().go('game');
    app().hideChoice();
    app().clearUserLine();
    app().setBadges(G.mode, G.level, G.sandboxStart);
    app().showAwakePanel(G.mode === 'awake');
    app().setFishMood('normal');
    G.moves = XQ.legalMoves(G.st);
    render();
    app().bubble(pickOpener(), null);
    startProactive();
    if (G.st.turn === G.aiSide) aiTurn();
    app().refreshWinrate();
  }

  function pickOpener() {
    var lv = Store.affinity.get().level;
    var mode = G.mode === 'classic' ? '经典' : '觉醒';
    var t = window.DFY.Time ? window.DFY.Time.info() : null;
    if (t) {
      if (t.asleep) return '（揉眼睛）这么晚……我陪你下完这盘就去睡。';
      if (t.period === '清晨' || t.period === '早上') {
        return '（刚睡醒）早呀……我刚吃过早饭，棋子都摆好了。下' + mode + '吧。';
      }
      if (t.period === '中午') return '午饭吃了吗？我边吃大白饭边等你。这局下' + mode + '。';
      if (t.period === '下午') return '下午有点困……下' + mode + '的话，你要让着我一点。';
      if (t.period === '傍晚' || t.period === '晚上') return '天黑了，下完这盘陪我说会儿话好不好？这局' + mode + '。';
      if (t.period === '深夜') return '这么晚还不睡？我陪你下完这盘' + mode + '，就去睡。';
    }
    var lines = [
      (lv >= 6 ? '主人' : '你') + '先请，我执黑。今天下' + mode + '，我会认真看的。',
      '棋盘摆好啦，这局' + mode + '。你先走，我偷偷看你。',
      (lv >= 6 ? '主人，' : '') + '我们下' + mode + '吧。我会忍不住看你的，别介意。'
    ];
    return lines[(Math.random() * lines.length) | 0];
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    if (!G.st) return;
    G.view.render(G.st, {
      sel: G.sel,
      moves: G.moves,
      lastMove: G.lastMove,
      hint: G.hint,
      over: G.over,
      bonus: G.st.bonus,
      choiceHighlights: G.choiceHighlights,
      animating: G.animating,
      awakeable: awakeable()
    });
    renderPanel();
  }

  function renderPanel() {
    var st = G.st;
    if (!st) return;
    var you = G.mySide, fish = G.aiSide;
    var turnEl = $('#turnText');
    if (turnEl) turnEl.textContent = st.turn === you ? '轮到你走' : '大肥鱼正在想';
    var check = $('#checkFlag');
    if (check) {
      var inChk = XQ.inCheck(st, st.turn);
      check.hidden = !inChk || G.over;
      check.textContent = inChk ? (st.turn === you ? '你被将军' : '将军！') : '';
    }
    var think = $('#thinkFlag');
    if (think) think.hidden = !G.thinking;
    var bonusBar = $('#bonusBar');
    if (bonusBar) {
      bonusBar.hidden = !st.bonus || G.animating || G.bonusSelecting;
      if (st.bonus) {
        $('#bonusText').textContent = st.bonus.kind === 'rook'
          ? '俥·残魂：这枚俥还能再走一步（不能吃子）'
          : '傌·易位：选中的棋子还能再走一步';
      }
    }
    // 胜率
    app().refreshWinrate();
    // 棋谱
    var list = $('#moveList');
    if (list) {
      list.innerHTML = '';
      var pairs = Math.ceil(G.hist.length / 2);
      for (var i = 0; i < pairs; i++) {
        var a = G.hist[i * 2], b = G.hist[i * 2 + 1];
        var li = document.createElement('li');
        li.className = 'mv-row' + (G.hist.length - 1 === i * 2 || G.hist.length - 1 === i * 2 + 1 ? ' cur' : '');
        li.innerHTML = '<span class="mv-no">' + (i + 1) + '.</span>' +
          '<span class="mv-r">' + (a ? esc(a.text) : '') + '</span>' +
          '<span class="mv-b">' + (b ? esc(b.text) : '') + '</span>';
        list.appendChild(li);
      }
      if (!G.hist.length) {
        var ph = document.createElement('li');
        ph.className = 'mv-empty';
        ph.textContent = '还没有落子';
        list.appendChild(ph);
      }
      list.scrollTop = list.scrollHeight;
    }
    // 觉醒状态
    if (st.mode === 'awake') {
      var aw = XQ.awakenState(st, st.turn);
      var chips = $('#awakeChips');
      if (chips) {
        chips.querySelectorAll('[data-aw]').forEach(function (el) {
          var k = el.getAttribute('data-aw');
          el.classList.toggle('on', !!aw[k]);
        });
      }
      var kingOut = $('#kingOutNote');
      if (kingOut) {
        kingOut.textContent = aw.kingOut ? '已出宫' : '';
        kingOut.hidden = !aw.kingOut;
      }
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 走子 ---------------- */

  function onPointer(e) {
    if (!G.st || G.over || G.thinking || G.animating || G.choosing || G.bonusSelecting) return;
    if (G.st.turn !== G.mySide) return;
    var sq = G.view.pointerToSquare(e);
    if (sq < 0) return;
    if (G.st.bonus) {
      var bsq = G.st.bonus.sq;
      var bm = G.moves.filter(function (m) { return m.f === bsq && m.t === sq; });
      if (bm.length === 1) return applyMove(bm[0]);
      if (bm.length > 1) return openPawnChoice(bm);
      if (sq === bsq) { G.sel = bsq; render(); return; }
      app().toast('这一手只能动选中的棋子，或点“跳过”');
      return;
    }
    var cands = G.moves.filter(function (m) { return m.f === G.sel && m.t === sq; });
    if (cands.length === 1) return applyMove(cands[0]);
    if (cands.length > 1) {
      var allSwap = cands.every(function (m) { return m.kind === 'swap'; });
      if (allSwap) return startSwap(cands);
      return openPawnChoice(cands);
    }
    var p = G.st.board[sq];
    if (p && (p >> 3) === G.st.turn) {
      G.sel = sq;
      G.hint = null;
      render();
    } else if (G.sel >= 0) {
      G.sel = -1;
      render();
    }
  }

  function startSwap(cands) {
    var mv = cands.filter(function (m) { return m.kind === 'swap' && m.bonusSq === m.t; })[0] || cands[0];
    G.swapChoice = {
      side: G.st.turn,
      mv: mv,
      horseSq: mv.t,
      otherSq: mv.f
    };
    applyMove(mv, { defer: true });
  }

  function openPawnChoice(cands) {
    var linked = cands.filter(function (m) { return m.extra && m.extra.length; })[0];
    var plain = cands.filter(function (m) { return !m.extra || !m.extra.length; })[0] || cands[0];
    G.choiceHighlights = [cands[0].f];
    if (linked) linked.extra.forEach(function (ex) { G.choiceHighlights.push(ex.f); });
    render();
    var opts = [];
    if (linked) {
      opts.push({
        icon: '并', title: '并肩', desc: '带着相邻的兵一起走',
        pick: function () { app().hideChoice(); applyMove(linked); }
      });
    }
    opts.push({
      icon: '单', title: '独行', desc: '只走这一枚兵',
      pick: function () { app().hideChoice(); applyMove(plain); }
    });
    app().showChoice({
      title: '这一手怎么走？',
      lead: '同一个落点，可以并肩，也可以独行。',
      options: opts
    });
  }

  function applyMove(mv, opts) {
    opts = opts || {};
    if (G.over || G.thinking || G.animating || G.choosing) return;
    if (G.blocked && !opts.ai) { app().toast('先回答大肥鱼嘛'); return; }
    if (G.st.turn === G.mySide && G.regret) finishRegret();
    var before = XQ.snapshot(G.st);
    // 上一回合的反应表情，到下一回合（玩家落子）就恢复
    if (G.st.turn === G.mySide && !G.holdMoodUntilPlayerEnd && !G.holdMoodUntilAIEnd) app().setFishMood('normal');
    var preBoard = G.st.board.slice();
    var preSpawn = G.st.rookSpawned.slice();
    var isBonusMove = !!before.bonus;
    var text = XQ.notation(G.st, mv);
    var capsBefore = G.st.captured[0].length + G.st.captured[1].length;
    var fx = { retreats: [] };
    XQ.doMove(G.st, mv, fx);
    var capsAfter = G.st.captured[0].length + G.st.captured[1].length;
    var captured = capsAfter > capsBefore;

    // 棋谱：额外回合并入同一行
    if (isBonusMove && G.hist.length) {
      G.hist[G.hist.length - 1].text += '，' + text;
      G.hist[G.hist.length - 1].raws.push(mv);
      G.hist[G.hist.length - 1].texts.push(text);
    } else {
      G.hist.push({ snap: before, text: text, texts: [text], side: before.turn, raws: [mv] });
    }
    G.log.push(mv);
    G.lastMove = mv;
    G.hint = null;
    G.noCap = captured ? 0 : G.noCap + 1;
    app().sfx(captured ? 'cap' : 'move');
    if (captured && before.turn === G.mySide) G.fishLost = true;
    G.lastEvent = { side: before.turn, capture: captured, spawn: false };

    var spawnSq = findSpawnSq(preBoard, preSpawn);
    if (spawnSq >= 0) G.lastEvent.spawn = true;
    recordWinRate();

    var animDur = 0;
    G.animating = true;
    render();
    animDur = playMoveFx(before, mv, preBoard, spawnSq, fx.retreats);
    later(function () {
      G.animating = false;
      if (opts.defer && G.st.bonus) {
        G.bonusSelecting = true;
        G.sel = -1;
        G.choiceHighlights = [mv.f, mv.t];
        render();
        openBonusChoice();
        return;
      }
      G.choiceHighlights = [];
      postMove();
    }, Math.max(60, animDur));
  }

  function openBonusChoice() {
    var c = G.swapChoice;
    if (!c) { postMove(); return; }
    var side = c.side;
    var otherType = G.st.board[c.otherSq] & 7;
    var nm = XQ.NAMES[side];
    app().showChoice({
      title: '选一枚棋子续行',
      lead: '换位完成。由谁再走一步？（这次续行不会触发俥·残魂或傌·易位）',
      persistent: true,
      onSkip: function () {
        app().hideChoice();
        G.swapChoice = null;
        skipBonusDirect();
      },
      options: [
        {
          icon: nm[4], title: nm[4] + '（' + fileNo(side, c.horseSq) + '路）', desc: '由这枚傌再走一步',
          pick: function () { chooseBonus(c.horseSq); }
        },
        {
          icon: nm[otherType], title: nm[otherType] + '（' + fileNo(side, c.otherSq) + '路）', desc: '由这枚棋子再走一步',
          pick: function () { chooseBonus(c.otherSq); }
        }
      ]
    });
  }

  function fileNo(side, sq) {
    var c = XQ.colOf(sq);
    return side === 0 ? 9 - c : c + 1;
  }

  function chooseBonus(sq) {
    var c = G.swapChoice;
    if (!c) return;
    G.st.bonus = { side: c.side, sq: sq, kind: 'horse' };
    G.swapChoice = null;
    G.bonusSelecting = false;
    app().hideChoice();
    postMove();
  }

  function skipBonus(byUser) {
    if (!G.st || !G.st.bonus || G.thinking || G.animating) return;
    skipBonusDirect();
    if (byUser) app().bubble('那我就不追啦，到你了。', 'ok');
  }

  function skipBonusDirect() {
    G.bonusSelecting = false;
    G.choiceHighlights = [];
    G.swapChoice = null;
    if (!G.st.bonus) { postMove(); return; }
    XQ.skipBonus(G.st);
    G.log.push({ skip: true });
    if (G.hist.length) {
      G.hist[G.hist.length - 1].raws.push({ skip: true });
      G.hist[G.hist.length - 1].texts.push('');
    }
    postMove();
  }

  function findSpawnSq(preBoard, preSpawn) {
    for (var i = 0; i < 90; i++) {
      var p = G.st.board[i];
      if (!p || (p & 7) !== 5) continue;
      var sd = p >> 3;
      if (!preSpawn[sd] && G.st.rookSpawned[sd] && !preBoard[i]) return i;
    }
    return -1;
  }

  function cannonPassesOwn(board, from, to, side) {
    var r0 = XQ.rowOf(from), c0 = XQ.colOf(from);
    var r1 = XQ.rowOf(to), c1 = XQ.colOf(to);
    if (r0 !== r1 && c0 !== c1) return false;
    var dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
    var r = r0 + dr, c = c0 + dc, guard = 0;
    while ((r !== r1 || c !== c1) && guard++ < 10) {
      var q = board[r * 9 + c];
      if (q && (q >> 3) === side) return true;
      r += dr; c += dc;
    }
    return false;
  }

  function playMoveFx(before, mv, preBoard, spawnSq, retreats) {
    if (!Store.settings().anim) return 0;
    var side = before.turn;
    var view = G.view;
    var dur = mv.kind === 'swap' ? 360 : 300;
    var list = [];
    if (mv.kind === 'swap') {
      list.push({ f: mv.f, t: mv.t });
      list.push({ f: mv.t, t: mv.f });
    } else {
      list.push({ f: mv.f, t: mv.t });
      (mv.extra || []).forEach(function (ex) { list.push({ f: ex.f, t: ex.t }); });
    }
    list.forEach(function (m, idx) {
      var p = preBoard[m.f];
      var isCannon = p && (p & 7) === 6;
      var passOwn = mv.kind !== 'swap' && isCannon && cannonPassesOwn(preBoard, m.f, m.t, side);
      view.animateMove(m.f, m.t, {
        dur: mv.kind === 'swap' ? 320 : 260,
        arc: idx ? 5 : -5,
        transparent: passOwn
      });
      if (mv.kind === 'swap') view.fxTrail(m.f, m.t, side, idx * 45);
    });

    if (before.bonus && before.bonus.kind === 'horse') {
      view.fxHorseGhostTrail(mv.f, mv.t, side);
    }
    if (before.bonus && before.bonus.kind === 'rook') {
      later(function () { view.fxRookShards(mv.t, side, 0); }, 160);
    }
    if (spawnSq >= 0) {
      var sp = G.st.board[spawnSq];
      view.fxSpawnRook(spawnSq, sp >> 3);
      dur = Math.max(dur, 900);
      later(function () { app().bubble('我的俥生出来了，这局要认真了。', 'proud'); }, 700);
    }
    if (retreats && retreats.length) {
      var start = 180;
      retreats.forEach(function (r, i) {
        view.animateMove(r.f, r.t, { dur: 240, delay: start + i * 70, arc: -2, expectType: 7 });
      });
      dur = Math.max(dur, start + (retreats.length - 1) * 70 + 260);
    }
    // 相渡河蓝焰（每方每局一次）
    if (G.st.mode === 'awake') {
      for (var s = 0; s < 2; s++) {
        if (G.fx.elephantFlame[s]) continue;
        if (XQ.countType(G.st, s, 7) !== 0) continue;
        G.fx.elephantFlame[s] = true;
        for (var i = 0; i < 90; i++) {
          var q = G.st.board[i];
          if (q && (q >> 3) === s && (q & 7) === 3) {
            (function (sq) {
              later(function () { view.fxElephantFlame(sq); }, 60);
            })(i);
          }
        }
      }
    }
    return dur;
  }

  /* ---------------- 回合结束 ---------------- */

  function postMove() {
    var st = G.st;
    if (!st) return;
    recordWinRate();
    if (G.takeover) {
      var tk = G.takeover;
      G.takeover = null;
      app().toast(tk === 'player' ? '她替你走完了这步' : '她把棋盘还给你了');
    }
    if (st.bonus && XQ.legalMoves(st).length === 0) {
      XQ.skipBonus(st);
      G.log.push({ skip: true });
      if (G.hist.length) {
        G.hist[G.hist.length - 1].raws.push({ skip: true });
        G.hist[G.hist.length - 1].texts.push('');
      }
    }
    var stt = XQ.status(st);
    G.moves = stt.moves;

    if (!st.bonus) {
      var key = Array.prototype.join.call(st.board, ',') + '|' + st.turn;
      G.rep[key] = (G.rep[key] || 0) + 1;
      if (G.rep[key] >= 3) { render(); return endGame({ winner: -1, reason: 'draw' }); }
      if (G.noCap >= 120) { render(); return endGame({ winner: -1, reason: 'draw' }); }
    }
    if (stt.over) { render(); return endGame(stt); }

    if (st.bonus) {
      G.sel = st.bonus.sq;
      render();
      if (st.turn === G.aiSide) return aiTurn();
      app().toast(st.bonus.kind === 'rook' ? '残魂：这枚俥还能走一步，或点“跳过”' : '易位：选中的棋子还能走一步，或点“跳过”');
      return;
    }

    G.sel = -1;
    render();
    if (XQ.inCheck(st, st.turn)) app().sfx('check');
    app().refreshWinrate();

    if (st.turn === G.mySide) {
      if (G.holdMoodUntilAIEnd) {
        app().setFishMood('normal');
        G.holdMoodUntilAIEnd = false;
      }
      var wasMercy = G.mercyThisTurn;
      if (wasMercy) app().bubble('（小声）这步我让你。', null);
      else if (G.lastEvent && G.lastEvent.side === G.aiSide) fishReact();
      maybeRegret();
      G.mercyThisTurn = false;
    } else {
      if (G.holdMoodUntilPlayerEnd) {
        app().setFishMood('normal');
        G.holdMoodUntilPlayerEnd = false;
      }
      aiTurn();
    }
  }

  /* ---------------- 让棋 / 悔棋 / 撒娇挡棋盘 ---------------- */

  function fishEvalOf(st) {
    try {
      var score = AI.evaluate(st);
      var red = st.turn === 0 ? score : -score;
      return -red;
    } catch (e) { return 0; }
  }

  function sameMove(a, b) {
    if (!a || !b) return false;
    return a.f === b.f && a.t === b.t && (a.kind || '') === (b.kind || '');
  }

  function moveFishScore(mv) {
    var u = XQ.snapshot(G.st);
    try {
      XQ.doMove(G.st, mv);
      var sc = fishEvalOf(G.st);
      XQ.restore(G.st, u);
      return sc;
    } catch (e) {
      try { XQ.restore(G.st, u); } catch (e2) { }
      return null;
    }
  }

  function chooseMercyMove() {
    var ms = XQ.legalMoves(G.st);
    if (!ms.length) return null;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < ms.length; i++) {
      var sc = moveFishScore(ms[i]);
      if (sc != null && sc < bestScore) { bestScore = sc; best = ms[i]; }
    }
    return best || ms[(Math.random() * ms.length) | 0];
  }

  function chooseBestMove(avoid) {
    var ms = XQ.legalMoves(G.st);
    if (!ms.length) return null;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < ms.length; i++) {
      if (sameMove(ms[i], avoid)) continue;
      var sc = moveFishScore(ms[i]);
      if (sc != null && sc > bestScore) { bestScore = sc; best = ms[i]; }
    }
    return best;
  }

  function pieceTypeOfName(name) {
    name = String(name || '');
    var ch = (name.match(/[车車俥馬马炮砲相象仕士帥帅將将兵卒]/) || [''])[0];
    var MAP = {
      '帥': 1, '帅': 1, '將': 1, '将': 1,
      '仕': 2, '士': 2,
      '相': 3, '象': 3,
      '傌': 4, '馬': 4, '马': 4,
      '俥': 5, '車': 5, '车': 5,
      '炮': 6, '砲': 6,
      '兵': 7, '卒': 7
    };
    return MAP[ch] || 0;
  }

  function chooseBestAvoiding(type) {
    var ms = XQ.legalMoves(G.st);
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < ms.length; i++) {
      var target = G.st.board[ms[i].t] & 7;
      if (target === type) continue;
      var sc = moveFishScore(ms[i]);
      if (sc != null && sc > bestScore) { bestScore = sc; best = ms[i]; }
    }
    return best;
  }

  /**
   * 执行本地/云端模型识别出来的棋局指令。
   * 只在真正“接手”棋盘时短暂接管，动作做完立即把控制权还给正常流程。
   */
  function chessCommand(cmd) {
    if (!G.st || G.over || !cmd || cmd.chess !== true) return false;
    var act = cmd.action;
    if (act === 'let') return requestMercy();
    if (act === 'hint') { hint(); return true; }
    if (act === 'undo') { undo(); return true; }
    if (act === 'play') {
      if (G.st.turn !== G.mySide || G.thinking || G.animating || G.choosing ||
        G.blocked || G.regret) return false;
      var res = null;
      try { res = AI.think(G.st, 'medium'); } catch (e) { }
      if (!res || !res.move) return false;
      G.takeover = 'player';
      app().bubble('（看着棋盘）我替你走这步……', 'think');
      app().toast('大肥鱼接手棋盘，替你走一步');
      applyMove(res.move, {});
      return true;
    }
    if (act === 'move') {
      var ms = XQ.legalMoves(G.st);
      var idx = Number(cmd.index);
      if (!isFinite(idx) || idx < 0 || idx >= ms.length) return false;
      var mv = ms[idx];
      if (G.st.turn === G.mySide) {
        if (G.thinking || G.animating || G.choosing || G.blocked || G.regret) return false;
        G.takeover = 'player';
        app().toast('大肥鱼接手棋盘，按你说的走');
        applyMove(mv, {});
        return true;
      }
      G.commandAIMove = mv;
      if (!G.thinking && !G.animating) aiTurn();
      return true;
    }
    if (act === 'avoid') {
      var t = pieceTypeOfName(cmd.piece);
      G.avoidType = t;
      app().toast(t ? '大肥鱼记住啦：这手不吃' + XQ.NAMES[G.mySide][t] : '大肥鱼记住啦，这手不吃那个子');
      return true;
    }
    return false;
  }

  function requestMercy() {
    if (!G.st || G.over || G.blocked) return false;
    if (!G.mercyPending) {
      G.mercyPending = true;
      app().toast('大肥鱼：好，我让你一步……');
    }
    return true;
  }

  function regretActive() { return !!G.regret; }

  function finishRegret() {
    if (G.regretTimer) { clearTimeout(G.regretTimer); G.regretTimer = null; }
    G.regret = null;
    G.blocked = false;
    app().hideRegret();
    app().setFishBlocking(false);
  }

  function scheduleRegretRepeat() {
    if (!G.regret) return;
    if (G.regretTimer) clearTimeout(G.regretTimer);
    G.regretTimer = setTimeout(function () {
      if (!G.regret || G.regret.tries >= 2) return;
      G.regret.tries++;
      var token = G.regret.token;
      var stage = G.regret.stage;
      var cue = stage === 'block'
        ? '（棋局事件）对方还没回答。你挡在棋盘前，再撒娇请求一次，换个说法，不要重复上一句。'
        : '（棋局事件）对方还没回答。你再请求悔棋一次，换个说法，不要重复上一句。';
      app().autoFish(cue, {
        guard: function () { return !!G.regret && G.regret.token === token; },
        fallback: stage === 'block'
          ? ['（抱着棋盘）就一次嘛……', '（鼓脸）你不答应我就不让开。']
          : ['（拉袖子）真的不行吗……', '（低头）就悔一步，我保证好好下。'],
        onDone: function () { if (G.regret && G.regret.token === token) scheduleRegretRepeat(); }
      });
    }, 10000);
  }

  function regretTouch() {
    if (G.regret) scheduleRegretRepeat();
  }

  function startRegret(before, after) {
    if (!G.st || G.over || G.regret || G.blocked) return;
    G.regretLastPly = Number(G.st.ply) || 0;
    G.regret = {
      stage: 'ask',
      before: before,
      after: after,
      tries: 0,
      timer: null,
      token: Date.now() + '_' + Math.random()
    };
    var token = G.regret.token;
    app().showRegret('ask');
    var cue = '（棋局事件，不是用户发言）你刚下完一步，发现自己的胜率从 ' + before +
      '% 掉到 ' + after + '%。你想请对方允许你悔棋。请用一句自然、符合当前人设和好感度的话请求；可以害羞/撒娇，但不要命令；不要提系统或提示。';
    app().autoFish(cue, {
      guard: function () { return !!G.regret && G.regret.token === token; },
      fallback: [
        '（揪着裙角）那个……刚才那步，能让我悔吗？',
        '（小声）我好像走错了……就悔一步，好不好？',
        '（看你）刚才那步不算，我想重走。'
      ],
      onDone: function () { if (G.regret && G.regret.token === token) scheduleRegretRepeat(); }
    });
  }

  function undoAIMove() {
    if (!G.hist.length) return null;
    var h = G.hist[G.hist.length - 1];
    if (!h || h.side !== G.aiSide) return null;
    var mv = lastMoveOf(h);
    G.hist.pop();
    XQ.restore(G.st, h.snap);
    G.log = [];
    G.hist.forEach(function (hh) {
      (hh.raws || []).forEach(function (r) { G.log.push(r); });
    });
    G.over = false;
    G.lastMove = G.hist.length ? lastMoveOf(G.hist[G.hist.length - 1]) : null;
    G.lastAI = null;
    G.lastEvent = null;
    G.sel = -1;
    G.hint = null;
    G.moves = XQ.legalMoves(G.st);
    G.view.clearFx();
    G.regretAvoid = mv;
    trimWinHistory(Number(G.st.ply) || 0);
    recordWinRate();
    render();
    app().refreshWinrate();
    return mv;
  }

  function sadEnding(fromBlock) {
    G.regret = null;
    G.blocked = false;
    app().setFishBlocking(false);
    app().hideRegret();
    var moods = ['sad', 'sad2', 'angry'];
    var m = moods[(Math.random() * moods.length) | 0];
    app().setFishMood(m);
    G.holdMoodUntilPlayerEnd = true;
    var kind = m === 'sad' ? '小伤心' : (m === 'sad2' ? '小伤心（2）' : '小生气');
    var lead = fromBlock ? '对方再次拒绝' : '对方拒绝了你悔棋';
    app().autoFish('（棋局事件）' + lead + '。你回到棋盘后面，' + kind +
      '。请说一句符合这个情绪的话；可以委屈/小声生气，但不要真的伤人，符合当前人设和好感度。', {
      fallback: m === 'angry'
        ? ['（鼓脸）小气……不悔就不悔。', '（扭头）哼。']
        : ['（低头）好吧……我不闹。', '（小声）知道了。']
    });
  }

  function regretAnswer(yes) {
    if (!G.regret) return;
    var stage = G.regret.stage;
    var token = G.regret.token;
    if (G.regretTimer) { clearTimeout(G.regretTimer); G.regretTimer = null; }
    app().hideRegret();
    if (yes) {
      G.regret = null;
      var mv = undoAIMove();
      G.blocked = false;
      app().setFishBlocking(false);
      if (!mv) { app().setFishMood('normal'); return; }
      app().setFishMood('joy');
      G.holdMoodUntilAIEnd = true;
      G.noRegret = true;
      app().autoFish('（棋局事件）对方同意你悔棋了。你回到棋盘后，很开心地准备重新走一步。请说一句开心、感谢的话，符合当前人设和好感度。', {
        fallback: ['（眼睛亮起来）谢谢你！我重新走一步。', '（开心）你真好……这次我好好下。']
      });
      G.aiTurnStartWin = currentWinRate();
      aiTurn();
      return;
    }
    if (stage === 'ask') {
      if (Math.random() * 100 < blockChance()) {
        G.regret.stage = 'block';
        G.blocked = true;
        app().setFishBlocking(true);
        app().setFishMood('coquette');
        app().showRegret('block');
        var cue2 = '（棋局事件）对方拒绝了你悔棋。你走到棋盘前，用身体挡住棋盘，撒娇再请求一次。请说一句撒娇、委屈的话，符合当前人设和好感度，不要命令。';
        app().autoFish(cue2, {
          guard: function () { return !!G.regret && G.regret.token === token; },
          fallback: ['（挡在棋盘前）就悔一步嘛……好不好？', '（抱着棋盘）你不答应，我就不让开。'],
          onDone: function () { if (G.regret && G.regret.token === token) scheduleRegretRepeat(); }
        });
        return;
      }
      G.regret = null;
      sadEnding(false);
      return;
    }
    // 挡棋盘后再被拒绝
    sadEnding(true);
  }

  function regretChance() {
    var lv = Store.affinity.get().level || 1;
    return Math.min(95, 15 + lv);
  }

  function blockChance() {
    var lv = Store.affinity.get().level || 1;
    return Math.min(95, 45 + lv);
  }

  /** 悔棋请求触发后，2 个完整回合（4 手）内不再触发 */
  function regretCooldownLeft() {
    if (G.regretLastPly == null || !G.st) return 0;
    var left = 4 - ((Number(G.st.ply) || 0) - G.regretLastPly);
    return Math.max(0, left);
  }

  function maybeRegret() {
    var before = G.aiTurnStartWin;
    G.aiTurnStartWin = null;
    if (!G.st || G.over || G.regret || G.blocked) return;
    if (G.noRegret) { G.noRegret = false; return; }
    if (G.mercyThisTurn) return;
    if (before == null) return;
    var after = currentWinRate();
    if (after >= before) return;
    // 每个完整回合：先检测胜率下降，再按当前 X 掷一次
    G.regretChecks++;
    var p = regretChance();
    G.regretRolls++;
    if (Math.random() * 100 >= p) return;
    // 两回合窗口内已经触发过：这次判定成功也压下，不重复请求
    if (regretCooldownLeft() > 0) {
      G.regretSuppressed++;
      return;
    }
    G.regretTriggers++;
    later(function () {
      if (!G.regret && !G.over && !G.blocked && G.st && G.st.turn === G.mySide) startRegret(before, after);
    }, 700);
  }

  function regretDebug() {
    return {
      checks: G.regretChecks,
      rolls: G.regretRolls,
      suppressed: G.regretSuppressed,
      triggers: G.regretTriggers,
      lastPly: G.regretLastPly,
      left: regretCooldownLeft()
    };
  }

  /* ---------------- 电脑棋手 ---------------- */

  function getWorker() {
    if (G.aiWorker) return G.aiWorker;
    if (!window.Worker) return null;
    try {
      G.aiWorker = new Worker('js/ai-worker.js');
      G.aiWorker.onerror = function () { G.aiWorker = null; };
      return G.aiWorker;
    } catch (e) {
      return null;
    }
  }

  function aiTurn() {
    if (!G.st || G.over || G.thinking || G.animating) return;
    if (G.st.bonus) {
      if (G.st.bonus.side !== G.aiSide) return;
    } else if (G.st.turn !== G.aiSide) return;
    if (!G.st.bonus && G.aiTurnStartWin == null) G.aiTurnStartWin = currentWinRate();
    G.thinking = true;
    renderPanel();
    var gen = G.gen;
    var snapshot = XQ.snapshot(G.st);
    var mode = G.mode, level = G.level;
    var started = Date.now();
    var worker = getWorker();
    var done = false;

    function finish(res, err) {
      if (done) return;
      done = true;
      if (gen !== G.gen || !G.st) return;
      var wait = Math.max(0, 480 - (Date.now() - started));
      later(function () {
        if (gen !== G.gen || !G.st || G.over) return;
        G.thinking = false;
        var move = res && res.move;
        if (!move) {
          var ms = XQ.legalMoves(G.st);
          if (G.st.bonus) { skipBonusDirect(); return; }
          if (!ms.length) { postMove(); return; }
          move = ms[(Math.random() * ms.length) | 0];
        }
        var legal = XQ.legalMoves(G.st).some(function (m) {
          return m.f === move.f && m.t === move.t && (m.kind || '') === (move.kind || '') &&
            (m.bonusSq === move.bonusSq || (m.kind !== 'swap' && move.bonusSq === undefined));
        });
        if (!legal) {
          var pool = XQ.legalMoves(G.st);
          if (!pool.length) { postMove(); return; }
          move = pool[(Math.random() * pool.length) | 0];
        }
        // “让让你”：用一步明显更软的棋，走完就恢复正常
        if (G.mercyPending) {
          var mm = chooseMercyMove();
          if (mm) { move = mm; G.mercyThisTurn = true; G.takeover = 'ai'; }
          G.mercyPending = false;
        }
        // 同意悔棋后重走：避开刚才那步，挑一步更好的
        if (G.regretAvoid) {
          var alt = chooseBestMove(G.regretAvoid);
          if (alt) move = alt;
          G.regretAvoid = null;
        }
        // 玩家明确要求“你走这一步”：按指定着法走
        if (G.commandAIMove) {
          var cmdMv = G.commandAIMove;
          G.commandAIMove = null;
          var cmOk = XQ.legalMoves(G.st).some(function (m) { return sameMove(m, cmdMv); });
          if (cmOk) { move = cmdMv; G.takeover = 'ai'; app().toast('大肥鱼按你说的走'); }
        }
        // “别吃我的车”：这一手避开吃这种子
        if (G.avoidType) {
          var at = G.st.board[move.t] & 7;
          if (at === G.avoidType) {
            var av = chooseBestAvoiding(G.avoidType);
            if (av) move = av;
          }
          G.avoidType = 0;
        }
        try {
          G.lastAI = {
            mv: move,
            score: res && res.score || 0,
            depth: res && res.depth || 0,
            text: G.mercyThisTurn ? '（小声）这步我让你。' : Fish.moveReason(G.st, move, (res && res.score) || 0, G.aiSide)
          };
        } catch (e) { }
        applyMove(move, { ai: true });
      }, wait);
    }

    if (worker) {
      var reqId = Math.random().toString(36).slice(2);
      var onMsg = function (e) {
        if (!e.data || e.data.id !== reqId) return;
        worker.removeEventListener('message', onMsg);
        clearTimeout(guard);
        finish(e.data.error ? null : e.data, e.data.error);
      };
      worker.addEventListener('message', onMsg);
      var guard = setTimeout(function () {
        worker.removeEventListener('message', onMsg);
        finish(syncThink(snapshot, mode, level), 'timeout');
      }, (AI.LEVELS[level] || AI.LEVELS.medium).time + 6000);
      try {
        worker.postMessage({ id: reqId, snap: snapshot, mode: mode, level: level });
      } catch (e) {
        clearTimeout(guard);
        worker.removeEventListener('message', onMsg);
        finish(syncThink(snapshot, mode, level));
      }
    } else {
      later(function () { finish(syncThink(snapshot, mode, level)); }, 40);
    }
  }

  function syncThink(snap, mode, level) {
    try {
      var st = XQ.newState(mode);
      XQ.restore(st, snap);
      return AI.think(st, level);
    } catch (e) {
      return null;
    }
  }

  /* ---------------- 大肥鱼互动 ---------------- */

  function fishCtx() {
    var aff = Store.affinity.get();
    return {
      screen: 'game',
      mode: G.mode,
      level: G.level,
      aff: aff,
      mySide: G.mySide,
      aiSide: G.aiSide,
      st: G.st,
      moves: XQ.legalMoves(G.st),
      hist: G.hist,
      lastMove: G.lastMove,
      lastAI: G.lastAI,
      lastEvent: G.lastEvent,
      winRate: currentWinRate(),
      winTrend: (G.winHist || []).slice(-6).map(function (h) { return h.fish; }),
      deep: Store.settings().deep,
      persona: Store.settings().persona,
      length: Store.settings().length,
      time: window.DFY.Time ? window.DFY.Time.info() : null,
      memory: Store.history(16)
    };
  }

  function fishScoreNow() {
    if (!G.st) return 0;
    try {
      var score = AI.evaluate(G.st);
      var redScore = G.st.turn === 0 ? score : -score;
      return -redScore;   // 大肥鱼执黑，正数表示大肥鱼占优
    } catch (e) { return 0; }
  }

  function currentWinRate() {
    if (!G.st) return 50;
    if (G.over && G.result) {
      if (G.result.winner === G.aiSide) return 100;
      if (G.result.winner === G.mySide) return 0;
      return 50;
    }
    var cp = fishScoreNow();
    var p;
    if (window.DFY && window.DFY.WinRate && window.DFY.WinRate.expected) {
      p = window.DFY.WinRate.expected(cp);
    } else {
      p = 100 / (1 + Math.exp(-cp / 420));
    }
    return Math.max(1, Math.min(99, Math.round(p)));
  }

  function recordWinRate() {
    if (!G.st) return;
    var ply = Number(G.st.ply) || 0;
    var p = currentWinRate();
    var cp = fishScoreNow();
    if (root.DFY.Soul) {
      root.DFY.Soul.setProgress('棋局：' + (G.mode === 'classic' ? '经典' : '觉醒') + ' · ' + G.level +
        ' · 第 ' + ply + ' 手 · 胜率 ' + p + '%');
    }
    while (G.winHist.length && G.winHist[G.winHist.length - 1].ply > ply) G.winHist.pop();
    var last = G.winHist[G.winHist.length - 1];
    if (last && last.ply === ply) {
      last.fish = p;
      last.you = 100 - p;
      last.cp = cp;
    } else {
      G.winHist.push({ ply: ply, fish: p, you: 100 - p, cp: cp });
      if (G.winHist.length > 120) G.winHist.shift();
    }
  }

  function trimWinHistory(ply) {
    while (G.winHist.length && G.winHist[G.winHist.length - 1].ply > ply) G.winHist.pop();
  }

  function fishReact() {
    if (Math.random() > 0.10) return;
    var ev = { side: G.aiSide, capture: false, lost: G.fishLost };
    // 上一步如果是大肥鱼吃子
    var last = G.hist[G.hist.length - 1];
    if (last) {
      var caps = last.raws && last.raws.length ? last.raws : [];
      // 用最近事件判断
    }
    ev.capture = !!(G.lastEvent && G.lastEvent.side === G.aiSide && G.lastEvent.capture);
    G.fishLost = false;
    var r = Fish.trigger(fishCtx());
    // 文档：不同反应切换大肥鱼的图片（哼哼哼 / 大意了 / 聊天 / 得意），下一回合恢复
    if (r.scene) app().setFishMood(r.scene);
    app().bubble(r.text, null);
  }

  function proactivePlan(level) {
    var aff = Store.affinity.get();
    var x = aff.sick ? 100 : (aff.level || 1);
    var chance, every;
    if (level === 'easy') {
      chance = 0.60;
      every = 30;
    } else if (level === 'medium') {
      chance = (20 + 6 * x) / 100;
      every = Math.max(8, 35 - x);
    } else {
      chance = (20 + 7.5 * x) / 100;
      every = Math.max(8, 55 - 3 * x);
    }
    return { x: x, chance: Math.max(0, Math.min(1, chance)), every: every };
  }

  function startProactive() {
    clearTimeout(G.proactiveTimer);
    if (G.over || !G.st) return;
    var tick = function () {
      if (G.over || !G.st || G.thinking || G.animating || G.choosing) return;
      var plan = proactivePlan(G.level);
      if (Math.random() < plan.chance) {
        var r = Fish.proactive(fishCtx());
        if (!r) return;   // 她睡着了 / 没有合适的话
        var st = Math.random() < 0.05 ? Fish.stickerFor(r.emo, r.text) : null;
        app().bubble(r.text, st);
        if (r.request) app().offerRequest();
      }
    };
    var arm = function () {
      if (G.over || !G.st) return;
      var plan = proactivePlan(G.level);
      G.proactiveTimer = setTimeout(function () {
        if (G.over || !G.st) return;
        tick();
        arm();
      }, plan.every * 1000);
      G.timers.push(G.proactiveTimer);
    };
    arm();
  }

  /* ---------------- 悔棋 / 提示 / 认输 ---------------- */

  function undo() {
    if (!G.st || G.over || G.thinking || G.animating || G.choosing) return;
    if (G.blocked) { app().toast('先回答大肥鱼嘛'); return; }
    if (G.regret) finishRegret();
    G.holdMoodUntilPlayerEnd = false;
    G.holdMoodUntilAIEnd = false;
    app().setFishMood('normal');
    app().setFishBlocking(false);
    if (!G.hist.length) { app().toast('还没有走过棋'); return; }
    var guard = 0;
    do {
      var h = G.hist.pop();
      if (!h) break;
      XQ.restore(G.st, h.snap);
      guard++;
    } while (guard < 6 && (G.st.bonus || G.st.turn === G.aiSide));
    G.log = [];
    G.hist.forEach(function (hh) {
      (hh.raws || []).forEach(function (r) { G.log.push(r); });
    });
    G.over = false;
    G.lastMove = G.hist.length ? lastMoveOf(G.hist[G.hist.length - 1]) : null;
    G.sel = -1;
    G.hint = null;
    G.moves = XQ.legalMoves(G.st);
    G.view.clearFx();
    trimWinHistory(Number(G.st.ply) || 0);
    recordWinRate();
    render();
    app().hideChoice();
    app().bubble('好，悔一步。你继续。', 'ok');
    if (G.st.turn === G.aiSide) aiTurn();
  }

  function lastMoveOf(h) {
    var raws = h.raws || [];
    for (var i = raws.length - 1; i >= 0; i--) if (!raws[i].skip) return raws[i];
    return null;
  }

  function hint() {
    if (!G.st || G.over || G.thinking || G.animating) return;
    if (G.st.bonus) {
      var bm = G.moves.filter(function (m) { return m.f === G.st.bonus.sq; });
      if (bm.length) { G.hint = bm[0]; render(); app().bubble('这一手可以这样走。', 'think'); }
      return;
    }
    app().bubble('（认真看棋盘）我帮你看看……', 'think');
    later(function () {
      if (!G.st || G.over) return;
      var res = null;
      try { res = AI.think(G.st, 'medium'); } catch (e) { }
      if (res && res.move) {
        G.hint = res.move;
        G.sel = res.move.f;
        render();
        app().bubble('我觉得这一步不错，你看看。', 'think');
      }
    }, 120);
  }

  function resign() {
    if (!G.st || G.over) return;
    if (!confirm('认输吗？这局会记给大肥鱼。')) return;
    endGame({ winner: G.aiSide, reason: 'resign' });
  }

  /* ---------------- 结束 ---------------- */

  function endGame(stt) {
    if (G.over) return;
    G.over = true;
    G.result = stt;
    recordWinRate();
    clearTimers();
    finishRegret();
    G.mercyPending = false;
    G.mercyThisTurn = false;
    G.holdMoodUntilPlayerEnd = false;
    G.holdMoodUntilAIEnd = false;
    app().setFishBlocking(false);
    app().setFishMood('normal');
    render();
    app().refreshWinrate();
    Store.recordResult(stt.winner === -1 ? -1 : (stt.winner === G.mySide ? 0 : 1));
    var rec = buildReplay(stt);
    if (rec) Store.replays.add(rec);
    var playerWon = stt.winner === G.mySide;
    var draw = stt.winner === -1 || stt.reason === 'draw';
    var why = stt.reason === 'checkmate' ? '将死' : stt.reason === 'stalemate' ? '困毙' :
      stt.reason === 'resign' ? '认输' : '和棋';
    var title = draw ? '和棋' : (playerWon ? '你赢了' : '大肥鱼赢了');
    var line;
    if (draw) line = '和棋呀……那下次再分胜负。';
    else if (playerWon) line = '（鼓脸）这局你赢了……我记住了，下次不会让。';
    else line = '（开心）我赢啦！不过你也很厉害了。';
    var gif = draw ? 'scratch.gif' : (playerWon ? 'emo_pout.jpg' : (Math.random() < 0.5 ? 'win1.gif' : 'win2.gif'));
    app().bubble(line, draw ? 'oops' : (playerWon ? 'pout' : 'happy'));
    app().showResult({
      title: title,
      why: why,
      line: line,
      gif: gif,
      record: Store.stats(),
      onAgain: function () { start({ mode: G.mode, level: G.level }); },
      onReplay: function () { app().go('lobby'); root.DFY.Replay.openLibrary(); },
      onLobby: function () { app().go('lobby'); }
    });
    app().sfx(playerWon ? 'win' : 'lose');
  }

  function buildReplay(stt) {
    if (!G.hist.length) return null;
    var moves = [];
    G.hist.forEach(function (h) {
      var raws = h.raws || [];
      var texts = h.texts || [h.text];
      raws.forEach(function (r, i) {
        moves.push({
          text: texts[i] || '',
          side: h.side,
          mv: r.skip ? null : sanitizeMove(r)
        });
      });
    });
    return {
      date: Date.now(),
      dateText: Store.dateText(),
      mode: G.mode,
      level: G.level,
      mySide: G.mySide,
      winner: stt.winner,
      reason: stt.reason,
      start: G.startSnap,
      moves: moves,
      chats: G.chats.slice(),
      duration: Math.round((Date.now() - G.startedAt) / 1000),
      sandbox: G.sandboxStart
    };
  }

  function sanitizeMove(mv) {
    return {
      f: mv.f, t: mv.t,
      kind: mv.kind,
      bonusSq: mv.bonusSq,
      extra: mv.extra ? mv.extra.map(function (e) { return { f: e.f, t: e.t }; }) : undefined
    };
  }

  /* ---------------- 离开对局 ---------------- */

  function stop() {
    clearTimers();
    clearInterval(G.proactiveTimer);
    G.gen++;
    if (G.aiWorker) { try { G.aiWorker.terminate(); } catch (e) { } G.aiWorker = null; }
    if (G.view) G.view.clearFx();
    G.thinking = false;
    G.animating = false;
    G.choosing = false;
    G.st = null;
    G.over = true;
  }

  function abort() {
    stop();
    app().closeResult();
    app().hideChoice();
  }

  /* ---------------- 对外 ---------------- */

  root.DFY = root.DFY || {};
  root.DFY.Game = {
    init: init,
    start: start,
    stop: stop,
    abort: abort,
    hint: hint,
    undo: undo,
    state: function () { return G; },
    ctx: fishCtx,
    sendChat: function (text) {
      if (!G.st) return;
      G.chats.push({ move: G.hist.length, q: String(text).slice(0, 200) });
    },
    recordAnswer: function (q, a) {
      if (!G.chats.length) return;
      var last = G.chats[G.chats.length - 1];
      if (!last.a) last.a = String(a || '').slice(0, 400);
    },
    winRate: currentWinRate,
    winHistory: function () { return G.winHist; },
    inCheck: function () { return G.st ? XQ.inCheck(G.st, G.st.turn) : false; },
    isOver: function () { return G.over; },
    canPlay: function () { return !!G.st && !G.over; },
    requestMercy: requestMercy,
    chessCommand: chessCommand,
    regretChance: regretChance,
    blockChance: blockChance,
    regretCooldownLeft: regretCooldownLeft,
    regretDebug: regretDebug,
    proactivePlan: proactivePlan,
    regretActive: regretActive,
    regretTouch: regretTouch,
    regretAnswer: regretAnswer,
    refreshWinrate: function () { renderPanel(); }
  };

  if (/[?&]test=1/.test(location.search)) {
    root.DFY.Game.__testMove = function (mv) { applyMove(mv, {}); };
    root.DFY.Game.__testRegret = function (b, a) { startRegret(b || 60, a || 50); };
  }
})(window);
