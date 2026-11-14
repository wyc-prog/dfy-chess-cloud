/* 与大肥鱼一起下象棋 · 本地存档（好感度 / 复盘 / 沙盘 / 设置） */
(function (root) {
  'use strict';

  var PREFIX = 'dfy.v1.';
  var memory = {};          // localStorage 不可用时的内存兜底
  var LS_OK = (function () {
    try {
      var k = PREFIX + '__t';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var KEY = {
    aff: 'affinity',
    replays: 'replays',
    favs: 'favs',
    sandbox: 'sandbox',
    stats: 'stats',
    settings: 'settings',
    memory: 'memory'
  };

  function read(key, def) {
    var k = PREFIX + key;
    if (LS_OK) {
      try {
        var raw = localStorage.getItem(k);
        if (raw === null) return clone(def);
        return JSON.parse(raw);
      } catch (e) { /* fallthrough */ }
    }
    return memory[key] !== undefined ? clone(memory[key]) : clone(def);
  }

  function write(key, val) {
    var k = PREFIX + key;
    memory[key] = clone(val);
    if (!LS_OK) return true;
    try {
      localStorage.setItem(k, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateText(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------------- 好感度 ---------------- */

  function blankAffinity() {
    return {
      level: 1,
      exp: 0,
      totalExp: 0,
      chats: 0,
      pats: 0,
      intimacies: 0,
      requests: 0,
      consecutiveIntimate: 0,
      intimacyBonus: 0,
      sick: false,
      sickFrom: null,
      sickChats: 0,
      sickCount: 0,
      since: Date.now(),
      lastAt: Date.now()
    };
  }

  var AFF = read(KEY.aff, null);
  if (!AFF || !AFF.level) AFF = blankAffinity();
  ['chats', 'pats', 'intimacies', 'requests', 'consecutiveIntimate', 'intimacyBonus', 'sickChats', 'sickCount', 'exp', 'totalExp'].forEach(function (k) {
    if (typeof AFF[k] !== 'number') AFF[k] = 0;
  });
  if (typeof AFF.level !== 'number' || AFF.level < 1) AFF.level = 1;
  if (AFF.level > 10) AFF.level = 10;

  function saveAff() { AFF.lastAt = Date.now(); write(KEY.aff, AFF); }

  function addExp(n) {
    var ups = 0;
    AFF.exp += n;
    AFF.totalExp += n;
    while (AFF.level < 10 && AFF.exp >= 100) {
      AFF.exp -= 100;
      AFF.level++;
      ups++;
    }
    if (AFF.level >= 10) AFF.exp = Math.min(AFF.exp, 99);
    return ups;
  }

  function becomeSick() {
    AFF.sick = true;
    AFF.sickFrom = { level: AFF.level, exp: AFF.exp };
    AFF.sickChats = 0;
    AFF.sickCount++;
    AFF.consecutiveIntimate = 0;
    saveAff();
  }

  function cureSick() {
    if (!AFF.sick) return null;
    var from = AFF.sickFrom || { level: AFF.level, exp: AFF.exp };
    AFF.sick = false;
    AFF.sickChats = 0;
    AFF.level = Math.max(1, Math.min(10, from.level));
    AFF.exp = Math.max(0, Math.min(99, from.exp || 0));
    AFF.consecutiveIntimate = 0;
    saveAff();
    return from;
  }

  var Affinity = {
    /** 当前有效等级：病娇按 100 处理（对话长度上限用） */
    value: function () { return AFF.sick ? 100 : AFF.level; },
    get: function () { return clone(AFF); },
    isSick: function () { return !!AFF.sick; },
    canChess: function () { return !AFF.sick; },

    /** 一次普通聊天：默认 +2；4 级以上亲密话题额外 +20；病娇只用正常话题解锁 */
    chat: function (intimate) {
      var res = { exp: 0, levelUp: 0, sick: false, cured: false, intimacy: false };
      if (AFF.sick) {
        if (intimate) {
          res.exp = 0;
        } else {
          AFF.sickChats++;
          if (AFF.sickChats >= 4) {
            cureSick();
            res.cured = true;
            res.levelUp = 0;
          }
        }
        saveAff();
        res.sick = AFF.sick;
        return res;
      }
      if (intimate) {
        if (AFF.level < 4) {
          res.exp = 2;
          res.tooEarly = true;
          res.levelUp = addExp(2);
        } else {
          var gain = 20 + (AFF.level >= 8 ? AFF.intimacyBonus : 0);
          res.intimacy = gain;
          res.exp = 2 + gain;                 // 聊天 +2，亲密行为再 +20（8 级后每次 +1）
          res.levelUp = addExp(2 + gain);
          AFF.intimacies++;
          AFF.consecutiveIntimate++;
          if (AFF.level >= 8) AFF.intimacyBonus++;
          if (AFF.level >= 9 && AFF.consecutiveIntimate >= 10) {
            becomeSick();
            res.sick = true;
          }
        }
      } else {
        res.exp = 2;
        res.levelUp = addExp(2);
        AFF.consecutiveIntimate = 0;
      }
      AFF.chats++;
      saveAff();
      return res;
    },

    /** 摸摸头 +10 */
    pat: function () {
      AFF.pats++;
      AFF.consecutiveIntimate = 0;
      var ups = addExp(10);
      saveAff();
      return { exp: 10, levelUp: ups, sick: AFF.sick };
    },

    /** 抱抱/亲亲：4 级起 +20（8 级后每次永久 +1） */
    hug: function () {
      var res = { exp: 0, levelUp: 0, tooEarly: false, sick: false };
      if (AFF.sick) { res.sick = true; return res; }
      if (AFF.level < 4) {
        res.tooEarly = true;
        saveAff();
        return res;
      }
      var gain = 20 + (AFF.level >= 8 ? AFF.intimacyBonus : 0);
      res.exp = gain;
      res.levelUp = addExp(gain);
      AFF.intimacies++;
      AFF.consecutiveIntimate++;
      if (AFF.level >= 8) AFF.intimacyBonus++;
      if (AFF.level >= 9 && AFF.consecutiveIntimate >= 10) {
        becomeSick();
        res.sick = true;
      }
      saveAff();
      return res;
    },

    /** 完成大肥鱼的请求：7 级起 +20 */
    requestDone: function () {
      AFF.requests++;
      var res = { exp: 0, levelUp: 0 };
      if (AFF.level >= 7) {
        res.exp = 20;
        res.levelUp = addExp(20);
      }
      saveAff();
      return res;
    },

    cure: function () { return cureSick(); },
    reset: function () { AFF = blankAffinity(); saveAff(); return clone(AFF); },
    levelInfo: function (lv) {
      var l = Math.max(1, Math.min(10, lv || AFF.level));
      return AFF_LEVELS[l - 1];
    }
  };

  var AFF_LEVELS = [
    { n: 1, name: '初识', tag: '一点点好感', desc: '对你有一定好感，能接受一些请求。' },
    { n: 2, name: '赞许', tag: '会夸夸你', desc: '对你有一定的赞赏，能接受正当的请求。' },
    { n: 3, name: '害羞', tag: '时不时脸红', desc: '好感进一步加深，偶尔会害羞。' },
    { n: 4, name: '心动', tag: '可以抱抱', desc: '能接受一部分不过分的请求，更容易害羞。' },
    { n: 5, name: '暧昧', tag: '会接你的玩笑', desc: '能接受一些荤段子，并且会害羞。' },
    { n: 6, name: '主人', tag: '改口叫主人', desc: '开始叫你主人，喜欢被摸摸，也会主动索取。' },
    { n: 7, name: '依赖', tag: '只黏你', desc: '接受主人的摸摸，只是有些地方还会害羞。' },
    { n: 8, name: '恋人', tag: '不会回避', desc: '不会回避主人的部分请求，欣然接受所有的摸摸，喜欢得不得了。' },
    { n: 9, name: '情深', tag: '像真情侣', desc: '像真实情侣一样，会做情侣之间才会做的事情，与主人暧昧有加。' },
    { n: 10, name: '唯一', tag: '不回避请求', desc: '不会回避主人的所有请求，有些时候会主动向主人撒娇、索取亲密。' }
  ];

  /** 好感度文本用的等级名（病娇单独处理） */
  Affinity.levelName = function (a) {
    if (a && a.sick) return '病娇';
    var lv = (a ? a.level : AFF.level) || 1;
    return (AFF_LEVELS[Math.max(1, Math.min(10, lv)) - 1] || AFF_LEVELS[0]).name;
  };
  Affinity.levelTable = AFF_LEVELS;

  /* ---------------- 战绩 ---------------- */

  var STATS = read(KEY.stats, { games: 0, wins: 0, losses: 0, draws: 0, chessWinStreak: 0 });
  function recordResult(winner) {
    // winner: 0 玩家（红）胜, 1 大肥鱼（黑）胜, -1 和棋
    STATS.games++;
    if (winner === 0) { STATS.wins++; STATS.chessWinStreak = 0; }
    else if (winner === 1) { STATS.losses++; STATS.chessWinStreak = 0; }
    else { STATS.draws++; STATS.chessWinStreak = 0; }
    write(KEY.stats, STATS);
    return clone(STATS);
  }

  /* ---------------- 复盘 ---------------- */
  var MAX_REPLAYS = 20;
  var MAX_FAVS = 100;

  function packState(st) {
    return {
      board: Array.prototype.slice.call(st.board),
      turn: st.turn,
      mode: st.mode,
      kingOut: (st.kingOut || [false, false]).slice(),
      rookSpawned: (st.rookSpawned || [true, true]).slice(),
      bonus: st.bonus ? { side: st.bonus.side, sq: st.bonus.sq, kind: st.bonus.kind } : null,
      captured: [(st.captured && st.captured[0] ? st.captured[0] : []).slice(),
        (st.captured && st.captured[1] ? st.captured[1] : []).slice()],
      ply: st.ply || 0,
      lastMove: st.lastMove || null
    };
  }

  var Replays = {
    MAX: MAX_REPLAYS,
    list: function () { return read(KEY.replays, []); },
    add: function (rec) {
      var list = read(KEY.replays, []);
      rec.id = rec.id || uid();
      list.unshift(rec);
      if (list.length > MAX_REPLAYS) list = list.slice(0, MAX_REPLAYS);
      write(KEY.replays, list);
      return rec;
    },
    remove: function (id) {
      write(KEY.replays, read(KEY.replays, []).filter(function (r) { return r.id !== id; }));
    },
    clear: function () { write(KEY.replays, []); },

    favList: function () { return read(KEY.favs, []); },
    isFav: function (id) { return read(KEY.favs, []).some(function (r) { return r.id === id; }); },
    toggleFav: function (rec) {
      var favs = read(KEY.favs, []);
      var i = -1;
      for (var k = 0; k < favs.length; k++) if (favs[k].id === rec.id) { i = k; break; }
      if (i >= 0) {
        favs.splice(i, 1);
        write(KEY.favs, favs);
        return { fav: false, full: false };
      }
      if (favs.length >= MAX_FAVS) return { fav: false, full: true };
      favs.unshift(rec);
      write(KEY.favs, favs);
      return { fav: true, full: false };
    },
    removeFav: function (id) {
      write(KEY.favs, read(KEY.favs, []).filter(function (r) { return r.id !== id; }));
    },
    packState: packState
  };

  /* ---------------- 沙盘 ---------------- */
  var Sandbox = {
    MAX: 100,
    list: function () { return read(KEY.sandbox, []); },
    add: function (rec) {
      var list = read(KEY.sandbox, []);
      rec.id = rec.id || uid();
      list.unshift(rec);
      if (list.length > 100) list = list.slice(0, 100);
      write(KEY.sandbox, list);
      return rec;
    },
    update: function (rec) {
      var list = read(KEY.sandbox, []);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === rec.id) { list[i] = rec; break; }
      }
      write(KEY.sandbox, list);
    },
    remove: function (id) {
      write(KEY.sandbox, read(KEY.sandbox, []).filter(function (r) { return r.id !== id; }));
    }
  };

  /* ---------------- 设置 ---------------- */
  var DEFAULT_SETTINGS = {
    sound: true,
    volume: 80,
    anim: true,
    deep: true,
    persona: '',
    // 默认就是文档按 1 级写的范围：下棋 30-50，聊天 60-80；perLevel 时随好感度成长
    length: {
      gameMin: 30,
      gameMax: 50,
      chatMin: 60,
      chatMax: 80,
      perLevel: true
    },
    llm: {
      mode: 'off',              // off | ollama | openai
      url: 'http://127.0.0.1:11434',
      model: '',
      key: '',
      temperature: 0.85,
      maxTokens: 700
    }
  };
  var SETTINGS = read(KEY.settings, null) || clone(DEFAULT_SETTINGS);
  SETTINGS = Object.assign({}, DEFAULT_SETTINGS, SETTINGS);
  SETTINGS.llm = Object.assign({}, DEFAULT_SETTINGS.llm, SETTINGS.llm || {});
  SETTINGS.length = Object.assign({}, DEFAULT_SETTINGS.length, SETTINGS.length || {});
  function saveSettings(next) {
    if (next && typeof next === 'object') {
      SETTINGS = Object.assign({}, DEFAULT_SETTINGS, next);
      SETTINGS.llm = Object.assign({}, DEFAULT_SETTINGS.llm, next.llm || {});
      SETTINGS.length = Object.assign({}, DEFAULT_SETTINGS.length, next.length || {});
    }
    write(KEY.settings, SETTINGS);
    return clone(SETTINGS);
  }

  /* ---------------- 对话记忆 ---------------- */
  var MEMO = read(KEY.memory, { name: '', history: [] });
  function remember(role, text) {
    if (!text) return;
    MEMO.history.push({ role: role, text: String(text).slice(0, 600), at: Date.now() });
    // 按文档要求尽量保留所有记忆；只在极端情况下限制，避免撑爆浏览器存储
    while (MEMO.history.length > 2000) MEMO.history.shift();
    write(KEY.memory, MEMO);
  }
  function history(n) {
    var arr = MEMO.history || [];
    return arr.slice(Math.max(0, arr.length - (n || 12)));
  }
  function memoryCount() { return (MEMO.history || []).length; }
  function clearMemory() {
    MEMO = { name: MEMO.name || '', history: [] };
    write(KEY.memory, MEMO);
  }
  /** 卸载/清理：可选择只清记忆与好感度，或清全部本地存档 */
  function wipe(options) {
    options = options || {};
    if (options.all) {
      [KEY.aff, KEY.replays, KEY.favs, KEY.sandbox, KEY.stats, KEY.settings, KEY.memory].forEach(function (k) {
        var key = PREFIX + k;
        memory[k] = undefined;
        if (LS_OK) { try { localStorage.removeItem(key); } catch (e) { } }
      });
      AFF = blankAffinity();
      MEMO = { name: '', history: [] };
      return true;
    }
    AFF = blankAffinity();
    saveAff();
    if (options.memory !== false) clearMemory();
    return true;
  }

  /** 打包记忆、好感度、设置等；不导出 API Key */
  function exportData() {
    var s = clone(SETTINGS);
    if (s.llm) delete s.llm.key;
    return {
      format: 'dfy-backup',
      version: 1,
      at: new Date().toISOString(),
      affinity: clone(AFF),
      memory: clone(MEMO),
      replays: read(KEY.replays, []),
      favs: read(KEY.favs, []),
      sandbox: read(KEY.sandbox, []),
      stats: clone(STATS),
      soul: root.DFY.Soul ? root.DFY.Soul.export() : null,
      settings: s
    };
  }

  function importData(data) {
    if (!data || data.format !== 'dfy-backup') throw new Error('不是大肥鱼的存档文件');
    if (data.affinity && typeof data.affinity.level === 'number') {
      AFF = data.affinity;
      ['chats', 'pats', 'intimacies', 'requests', 'consecutiveIntimate', 'intimacyBonus', 'sickChats', 'sickCount', 'exp', 'totalExp'].forEach(function (k) {
        if (typeof AFF[k] !== 'number') AFF[k] = 0;
      });
      AFF.level = Math.max(1, Math.min(10, AFF.level));
      saveAff();
    }
    if (data.memory && Array.isArray(data.memory.history)) {
      MEMO = { name: String(data.memory.name || '').slice(0, 20), history: data.memory.history.slice(-2000) };
      write(KEY.memory, MEMO);
    }
    if (data.soul && root.DFY.Soul) root.DFY.Soul.import(data.soul);
    if (Array.isArray(data.replays)) write(KEY.replays, data.replays.slice(0, 20));
    if (Array.isArray(data.favs)) write(KEY.favs, data.favs.slice(0, 100));
    if (Array.isArray(data.sandbox)) write(KEY.sandbox, data.sandbox.slice(0, 100));
    if (data.stats && typeof data.stats === 'object') {
      STATS = Object.assign({ games: 0, wins: 0, losses: 0, draws: 0, chessWinStreak: 0 }, data.stats);
      write(KEY.stats, STATS);
    }
    if (data.settings && typeof data.settings === 'object') {
      var next = Object.assign({}, clone(SETTINGS), data.settings);
      next.llm = Object.assign({}, clone(SETTINGS.llm), data.settings.llm || {}, { key: SETTINGS.llm.key });
      next.length = Object.assign({}, DEFAULT_SETTINGS.length, data.settings.length || {});
      saveSettings(next);
    }
    return { chats: (AFF.chats || 0), level: AFF.level, memories: (MEMO.history || []).length };
  }

  root.DFY = root.DFY || {};
  root.DFY.Store = {
    uid: uid,
    dateText: dateText,
    available: LS_OK,
    affinity: Affinity,
    stats: function () { return clone(STATS); },
    recordResult: recordResult,
    replays: Replays,
    sandbox: Sandbox,
    settings: function () { return clone(SETTINGS); },
    saveSettings: saveSettings,
    remember: remember,
    history: history,
    memoryCount: memoryCount,
    clearMemory: clearMemory,
    wipe: wipe,
    exportData: exportData,
    importData: importData,
    name: function () { return MEMO.name || ''; },
    setName: function (n) { MEMO.name = String(n || '').slice(0, 20); write(KEY.memory, MEMO); },
    packState: packState
  };

  if (typeof location !== 'undefined' && /[?&]test=1/.test(location.search)) {
    root.DFY.Store.affinity.__testSetLevel = function (lv) {
      AFF.level = Math.max(1, Math.min(10, Number(lv) || 1));
      AFF.sick = false;
      saveAff();
      return clone(AFF);
    };
    root.DFY.Store.affinity.__testSetSick = function (on) {
      AFF.sick = !!on;
      saveAff();
      return clone(AFF);
    };
  }
})(window);
