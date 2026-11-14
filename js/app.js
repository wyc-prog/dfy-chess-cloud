/* 与大肥鱼一起下象棋 · 界面外壳 / 大厅 / 对话 / 弹窗 */
(function (root) {
  'use strict';
  var Store = root.DFY.Store;
  var Fish = root.DFY.Fish;
  var Board = root.DFY.Board;

  var current = 'lobby';
  var modalStack = [];
  var audioCtx = null;
  var lastLevel = 'medium';
  var lastMode = 'awake';
  var userLineTimer = null;
  var typingTimer = null;
  var bubbleTimer = null;
  var sickShown = false;
  var modelWarned = false;
  var ollamaHinted = false;
  var llmState = { live: false, announced: false, model: '', fails: 0, lost: false, lastError: '', lastKind: '' };
  var pendingAI = null;
  var connectPromptShown = false;
  var MOOD_FILES = {
    normal: 'fish.png',
    hmph: 'scene_hmph.png',
    chat: 'scene_chat.png',
    think: 'scene_think.png',
    proud: 'scene_proud.png',
    oops: 'scene_oops.png',
    coquette: 'scene_coquette.png',
    joy: 'scene_happy.png',
    sad: 'scene_sad.png',
    sad2: 'scene_sad2.png',
    angry: 'scene_angry.png'
  };

  /** 把分类后的错误翻译成一句人话 */
  function offlineMessage(err) {
    var kind = err && err.kind;
    var reason = (err && (err.friendly || err.message)) || '';
    if (kind === 'proxy') return '本地代理校验失败，请用「启动游戏.bat」重新打开游戏（直接双击 index.html 时连不了云端）';
    if (!Fish.hasProxy() && (kind === 'network' || kind === 'other')) {
      return '云端连不上：多半是浏览器跨域被挡住了。请关掉游戏，用「启动游戏.bat」重新打开——它会走本机代理连云端';
    }
    if (kind === 'auth') return '云端 Key 无效或过期，请到设置里更新；先用内置大肥鱼陪你';
    if (kind === 'quota') return '云端额度不足，请在设置里检查；先用内置大肥鱼陪你';
    if (kind === 'model') return '云端说找不到这个模型：请检查设置里的模型名（比如 deepseek-chat，注意大小写）';
    if (kind === 'not_found') return '云端返回 404：地址或路径不对。地址填到 /v1 这一级（如 https://api.deepseek.com/v1），模型名也要对';
    if (kind === 'rate') return '云端请求太频繁，稍后会自动重试；先用内置大肥鱼陪你';
    if (kind === 'timeout') return '云端这次想太久了，下一条会自动重试；先用内置大肥鱼陪你';
    if (kind === 'context') return '对话太长了，我先清一点记忆；先用内置大肥鱼陪你';
    if (kind === 'bad_request') return '云端没有接受这次请求：' + (reason || '参数问题') + '；先用内置大肥鱼陪你';
    return '网络/云端抖了一下：' + (reason || '连接中断') + '，下一条会自动重试';
  }

  function llmErrorHint(err) {
    var kind = err && err.kind;
    if (kind === 'model') return '（检查模型名，注意大小写）';
    if (kind === 'not_found') return '（地址填到 /v1 这一级即可）';
    if (kind === 'proxy') return '（请用「启动游戏.bat」打开）';
    if (!Fish.hasProxy() && /fetch|network|failed/i.test(String((err && err.message) || ''))) {
      return '（请用「启动游戏.bat」启动）';
    }
    return '';
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function settings() { return Store.settings(); }

  /* ---------------- 现实时间 ---------------- */

  function clockHtml(t) {
    return '<span class="wc-date">' + esc(t.dateText) + '</span>' +
      '<span class="wc-time">' + esc(t.timeText) + '</span>' +
      '<span class="wc-state">' + esc(t.period) + ' · ' + esc(t.short) + '</span>';
  }

  function tickClock() {
    if (!root.DFY.Time) return;
    var t = root.DFY.Time.info();
    $$('[data-clock]').forEach(function (el) { el.innerHTML = clockHtml(t); });
  }

  function startClock() {
    tickClock();
    setInterval(tickClock, 1000);
  }

  function openSchedule() {
    if (!root.DFY.Time) return;
    var t = root.DFY.Time.info();
    var rows = root.DFY.Time.SCHEDULE.map(function (r) {
      var parts = r[0].split(':');
      var mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      var nowMins = t.hh * 60 + t.mm;
      var cls = (nowMins >= mins && nowMins < mins + 60) ? ' cur' : '';
      return '<div class="sched-row' + cls + '"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>';
    }).join('');
    var m = openModal({ id: 'schedule', title: '大肥鱼的作息', size: 'narrow' });
    m.body.innerHTML =
      '<div class="guide">' +
      '<p>现在：<b>' + esc(t.dateText) + ' ' + esc(t.timeText) + '</b>（' + esc(t.period) + '）<br>' +
      '她正在：' + esc(t.activity) + '</p>' +
      '<div class="sched-list">' + rows + '</div>' +
      '<p class="tiny">按现实时间自动切换；深夜会困，被叫醒会迷糊。她不会每句都报时，但会按这个状态说话和活动。</p>' +
      '</div>';
  }

  /* ---------------- AI 连接状态 ---------------- */

  function aiReady() { return llmState.live === true; }

  function aiLabel() {
    var cfg = settings().llm;
    if (aiReady()) {
      return (cfg.mode === 'ollama' ? '本机 · ' : '云端 · ') + (llmState.model || cfg.model || 'AI');
    }
    return 'AI 未连接';
  }

  function updateAiBadge() {
    var label = aiLabel();
    $$('.ai-badge, #aiChip').forEach(function (el) {
      el.textContent = label;
      el.classList.toggle('on', aiReady());
      el.classList.toggle('off', !aiReady());
      el.title = aiReady() ? '点击更换 AI 连接' : '点击连接 AI';
    });
    document.body.classList.toggle('ai-ready', aiReady());
  }

  function requireAI(action) {
    if (aiReady()) { action(); return; }
    pendingAI = action;
    openConnect();
  }

  function preloadMoods() {
    Object.keys(MOOD_FILES).forEach(function (k) {
      var im = new Image();
      im.src = 'assets/fish/' + MOOD_FILES[k];
    });
  }

  function setFishMood(key) {
    key = key && MOOD_FILES[key] ? key : 'normal';
    var src = 'assets/fish/' + MOOD_FILES[key];
    ['gameFish', 'chatFish'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.getAttribute('data-mood') === key) return;
      el.setAttribute('data-mood', key);
      el.src = src;
      el.classList.remove('mood-in');
      void el.offsetWidth;
      el.classList.add('mood-in');
    });
  }

  function setFishBlocking(on) {
    var g = document.getElementById('game');
    if (g) g.classList.toggle('fish-blocking', !!on);
  }

  function showRegret(stage, lead) {
    var box = $('#regretPop');
    if (!box) return;
    $('#regretTitle').textContent = stage === 'block' ? '大肥鱼挡在棋盘前' : '大肥鱼想悔棋';
    $('#regretText').textContent = lead || (stage === 'block'
      ? '（她抱着棋盘，不肯让开）'
      : '（她看着棋盘，有点不好意思）');
    box.hidden = false;
  }

  function hideRegret() {
    var box = $('#regretPop');
    if (box) box.hidden = true;
  }

  function bindRegret() {
    var yes = $('#regretYes'), no = $('#regretNo');
    if (yes) yes.addEventListener('click', function () { root.DFY.Game.regretAnswer(true); });
    if (no) no.addEventListener('click', function () { root.DFY.Game.regretAnswer(false); });
  }

  function autoFish(cue, opts) {
    opts = opts || {};
    var cfg = settings().llm;
    function finish(text) {
      if (!text) return;
      if (opts.guard && !opts.guard()) return;
      Store.remember('fish', text);
      if (root.DFY.Soul) root.DFY.Soul.observe('fish', text);
      bubble(text, null);
      if (opts.onDone) opts.onDone(text);
    }
    if (!cfg || cfg.mode === 'off') {
      finish(pick(opts.fallback || ['（小声）那个……']));
      return Promise.resolve();
    }
    var ctx = ctxNow();
    ctx.event = true;
    if (opts.ctx) Object.assign(ctx, opts.ctx);
    return Fish.askModel(ctx, cue, cfg).then(function (r) {
      finish(r.text);
      return r.text;
    }).catch(function (err) {
      try { console.warn('[大肥鱼 AI 事件]', err && err.status, err && err.url, err && err.message); } catch (e) { }
      finish(pick(opts.fallback || ['（小声）那个……']));
    });
  }

  /** 一键/手动连接成功后保存并继续之前被打断的操作 */
  function connectWithAI(cfg, modal, statusEl, buttons) {
    buttons.forEach(function (b) { if (b) b.disabled = true; });
    if (statusEl) { statusEl.className = 'llm-status pending'; statusEl.textContent = '连接中…'; }
    Fish.testModel(cfg).then(function (res) {
      var s = Store.settings();
      s.llm.mode = cfg.mode;
      s.llm.url = cfg.url;
      s.llm.model = res.model || cfg.model || '';
      s.llm.key = cfg.key || '';
      Store.saveSettings(s);
      llmState.live = true;
      llmState.announced = true;
      llmState.model = s.llm.model;
      llmState.fails = 0;
      llmState.lost = false;
      llmState.lastError = '';
      updateAiBadge();
      if (root.DFY.Soul) root.DFY.Soul.attach();
      if (statusEl) { statusEl.className = 'llm-status ok'; statusEl.textContent = '✓ 连接成功 · ' + (s.llm.model || 'AI'); }
      toast('连接成功：大肥鱼已接上「' + (s.llm.model || 'AI') + '」');
      setTimeout(function () {
        var act = pendingAI;
        pendingAI = null;
        if (modal) modal.close();
        if (act) act();
      }, 450);
    }).catch(function (err) {
      buttons.forEach(function (b) { if (b) b.disabled = false; });
      var msg = String((err && (err.friendly || err.message)) || '连接失败').slice(0, 90);
      if (statusEl) { statusEl.className = 'llm-status bad'; statusEl.textContent = '✗ ' + msg + llmErrorHint(err); }
      toast('连接失败：' + msg + llmErrorHint(err));
    });
  }

  function openConnect() {
    connectPromptShown = true;
    var m = openModal({
      id: 'connect',
      title: '先和大肥鱼连上线',
      size: 'wide',
      onClose: function () { pendingAI = null; }
    });
    m.body.innerHTML =
      '<div class="connect">' +
      '<p class="connect-lead">这个房间需要 AI 才能开口和下棋。连一次就会记住，下次打开会自动连上。</p>' +
      '<div class="connect-grid">' +
      '<section class="connect-card">' +
      '<h3>① 本机 Ollama <span class="tiny">（推荐 · 数据不出电脑）</span></h3>' +
      '<p class="tiny" id="cnLocalInfo">正在检查本机 Ollama…</p>' +
      '<button class="mini primary" id="cnLocal" disabled>一键连接本机 Ollama</button>' +
      '<p class="tiny">没装？看 <button class="link" id="cnGuide">连接指南</button>（官方下载 ollama.com，装好后运行 <code>ollama pull deepseek-r1:7b</code>）</p>' +
      '</section>' +
      '<section class="connect-card">' +
      '<h3>② 云端 DeepSeek</h3>' +
      '<label class="set-row"><span>地址</span><input id="cnUrl" value="https://api.deepseek.com/v1"></label>' +
      '<label class="set-row"><span>模型</span><input id="cnModel" value="deepseek-chat"></label>' +
      '<label class="set-row"><span>Key</span><input id="cnKey" type="password" placeholder="sk-..."></label>' +
      '<button class="mini primary" id="cnCloud">连接云端</button>' +
      '<p class="tiny">在 platform.deepseek.com 创建 Key；也可填其他 OpenAI 兼容接口。</p>' +
      '</section>' +
      '</div>' +
      '<p class="llm-status idle" id="cnStatus">未连接</p>' +
      '<div class="row between">' +
      '<button class="link" id="cnBrowse">先逛逛（不能下棋 / 聊天）</button>' +
      '<button class="link" id="cnGuide2">连接与安装指南</button>' +
      '</div>' +
      '</div>';

    var info = m.body.querySelector('#cnLocalInfo');
    var localBtn = m.body.querySelector('#cnLocal');
    var cloudBtn = m.body.querySelector('#cnCloud');
    var statusEl = m.body.querySelector('#cnStatus');
    var localModel = '';
    var saved = settings().llm;
    if (saved.mode === 'openai') {
      if (saved.url) m.body.querySelector('#cnUrl').value = saved.url;
      if (saved.model) m.body.querySelector('#cnModel').value = saved.model;
      if (saved.key) m.body.querySelector('#cnKey').value = saved.key;
    }

    Fish.detectOllama('http://127.0.0.1:11434').then(function (models) {
      if (!models || !models.length) {
        info.textContent = '检测到 Ollama，但还没有模型。先运行：ollama pull deepseek-r1:7b';
        return;
      }
      var prefer = models.filter(function (x) { return /deepseek-r1:7b/i.test(x); })[0]
        || models.filter(function (x) { return /deepseek/i.test(x); })[0]
        || models[0];
      localModel = prefer;
      info.textContent = '已检测到本机 Ollama：' + models.join('、') + '（将使用 ' + prefer + '）';
      localBtn.disabled = false;
    }).catch(function () {
      info.textContent = '没有检测到本机 Ollama。可以安装后重试，或直接用右边的云端 DeepSeek。';
    });

    localBtn.addEventListener('click', function () {
      if (!localModel) return;
      connectWithAI({
        mode: 'ollama',
        url: 'http://127.0.0.1:11434',
        model: localModel,
        key: '',
        temperature: 0.85,
        maxTokens: 700
      }, m, statusEl, [localBtn, cloudBtn]);
    });
    cloudBtn.addEventListener('click', function () {
      var url = m.body.querySelector('#cnUrl').value.trim();
      var model = m.body.querySelector('#cnModel').value.trim();
      var key = m.body.querySelector('#cnKey').value.trim();
      if (!url || !model) { toast('地址和模型都要填'); return; }
      connectWithAI({ mode: 'openai', url: url, model: model, key: key, temperature: 0.85, maxTokens: 700 }, m, statusEl, [localBtn, cloudBtn]);
    });
    m.body.querySelector('#cnBrowse').addEventListener('click', function () {
      pendingAI = null;
      m.close();
    });
    m.body.querySelector('#cnGuide').addEventListener('click', openGuide);
    m.body.querySelector('#cnGuide2').addEventListener('click', openGuide);
  }

  function openGuide() {
    var m = openModal({ id: 'guide', title: '连接与安装指南', size: 'wide' });
    m.body.innerHTML =
      '<div class="guide">' +
      '<h3>本机 Ollama（推荐）</h3>' +
      '<ol>' +
      '<li>到 <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> 下载官方 Windows 安装包并安装。</li>' +
      '<li>安装后打开命令行，运行 <code>ollama pull deepseek-r1:7b</code>（想快一点可以用 <code>deepseek-r1:1.5b</code>）。</li>' +
      '<li>保持 Ollama 在后台运行，回到游戏点「一键连接本机 Ollama」。</li>' +
      '</ol>' +
      '<h3>云端 DeepSeek</h3>' +
      '<ol>' +
      '<li>到 <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a> 注册并创建 API Key。</li>' +
      '<li>地址填 <code>https://api.deepseek.com/v1</code>，模型填 <code>deepseek-chat</code>（推理模型用 <code>deepseek-reasoner</code>）。</li>' +
      '<li>粘贴 Key，点「连接云端」。连接失败会显示具体原因。</li>' +
      '</ol>' +
      '<h3>安装与卸载</h3>' +
      '<p>游戏本体免安装：把整个文件夹复制到另一台电脑，双击 <code>启动游戏.bat</code> 就能玩。</p>' +
      '<p>本机 AI 需要安装 Ollama；云端 AI 只需要 Key。请只从上面的官方地址下载，不要安装来源不明的“加速器/插件”。</p>' +
      '<p>卸载：关闭游戏 → 删除游戏文件夹 → 删除 <code>%LOCALAPPDATA%\\大肥鱼下象棋</code>（存档）即可。</p>' +
      '<p class="tiny">用「启动游戏.bat」启动时，云端请求会走本机代理，避免浏览器跨域；直接双击 index.html 可能连不上云端。</p>' +
      '</div>';
  }

  function openIntro() {
    var m = openModal({ id: 'intro', title: '游戏简介', size: 'narrow' });
    m.body.innerHTML =
      '<div class="guide">' +
      '<p>《与大肥鱼一起下象棋》是一个单机小游戏：和住在鲸鱼房间里的「大肥鱼」——真实姓名 <b>deepseek 鲸鱼娘</b>——下经典象棋或七条觉醒的觉醒之战。</p>' +
      '<p>她深海蓝的长卷发上戴着白色荷叶边女仆头饰和蓝蝴蝶结，耳侧有一对小小的鲸鱼鳍；穿深蓝与白色相间的女仆裙，白色围裙上绣着一只小鲸鱼，裙摆有金色纹样，身后还有一条蓝色的鲸鱼尾巴。</p>' +
      '<p>她会记得你说过的话，会因为吃子高兴、因为丢子难过，也会在你下棋时忍不住看你。好感度从 1 级到 10 级，还有一个小小的病娇状态。</p>' +
      '<p>大厅、棋盘和聊天里都有现实世界的日期与时间；她按你的现实时间作息——白天收拾房间、吃饭，晚上会困，深夜被叫醒会迷迷糊糊。点时钟可以看她的作息表。</p>' +
      '<p>下棋之外，可以和她聊天、摸摸头、抱抱她；复盘能保存最近 20 盘，沙盘可以自由摆子。</p>' +
      '<p class="tiny">作者：三天左右了吧 · 棋子与规则参考《中国觉醒象棋》 · 角色素材来自本项目素材图</p>' +
      '</div>';
  }

  function openUninstall() {
    var m = openModal({ id: 'uninstall', title: '卸载 / 清除存档', size: 'narrow' });
    m.body.innerHTML =
      '<div class="guide">' +
      '<p>游戏本体免安装：关闭游戏后，直接删除整个游戏文件夹即可。</p>' +
      '<p>存档在浏览器配置里：<code>%LOCALAPPDATA%\\大肥鱼下象棋\\browser</code>。删掉这个文件夹，所有记忆和好感度也会一起消失。</p>' +
      '<p>也可以在这里按需清除：</p>' +
      '<label class="set-row"><span>对话记忆</span><input type="checkbox" id="unMem" checked></label>' +
      '<label class="set-row"><span>好感度</span><input type="checkbox" id="unAff" checked></label>' +
      '<div class="row"><button class="mini danger" id="unSelected">清除所选数据</button>' +
      '<button class="mini danger" id="unAll">清除全部存档</button></div>' +
      '<p class="tiny">清除后游戏会自动刷新。</p>' +
      '</div>';
    m.body.querySelector('#unSelected').addEventListener('click', function () {
      if (!confirm('清除所选数据？这个不能撤销。')) return;
      if (m.body.querySelector('#unMem').checked) Store.clearMemory();
      if (m.body.querySelector('#unAff').checked) Store.affinity.reset();
      toast('已清除，正在刷新…');
      setTimeout(function () { location.reload(); }, 700);
    });
    m.body.querySelector('#unAll').addEventListener('click', function () {
      if (!confirm('清除全部存档（记忆、好感度、复盘、沙盘、设置）？这个不能撤销。')) return;
      Store.wipe({ all: true });
      toast('全部存档已清除，正在刷新…');
      setTimeout(function () { location.reload(); }, 700);
    });
  }

  function bootstrapAI() {
    updateAiBadge();
    var cfg = settings().llm;
    if (cfg.mode === 'off' || !cfg.url) {
      setTimeout(function () {
        if (!aiReady() && !connectPromptShown) openConnect();
      }, 900);
      return;
    }
    Fish.testModel(cfg).then(function (res) {
      llmState.live = true;
      llmState.model = res.model || cfg.model || '';
      llmState.lastError = '';
      updateAiBadge();
      toast('AI 已连接：大肥鱼接上了「' + (llmState.model || 'AI') + '」');
    }).catch(function (err) {
      llmState.live = false;
      llmState.lastError = (err && (err.friendly || err.message)) || '连接失败';
      updateAiBadge();
      setTimeout(function () {
        if (!connectPromptShown) openConnect();
      }, 900);
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    buildAwake();
    bindLobby();
    bindGameSay();
    bindRequest();
    bindRegret();
    bindGlobal();
    preloadMoods();
    root.DFY.Chat.init();
    root.DFY.Game.init();
    root.DFY.Sandbox.init();
    // 旧版默认人设（没有三视图外形）保存过的，迁移回新的默认人设；自定义人设不动
    try {
      var st0 = Store.settings();
      if (st0.persona === Fish.OLD_DEFAULT_PERSONA) {
        st0.persona = '';
        Store.saveSettings(st0);
      }
    } catch (e0) { }
    refreshAffinity();
    go('lobby');
    startClock();
    updateAiBadge();
    var q = new URLSearchParams(location.search);
    var s = q.get('s');
    if (s === 'chat') setTimeout(function () { openChat(); }, 60);
    else if (s === 'game') setTimeout(function () { openDifficulty('awake'); }, 60);
    else if (s === 'sandbox') setTimeout(function () { root.DFY.Sandbox.open(); }, 60);
    else if (s === 'replay') setTimeout(function () { root.DFY.Replay.openLibrary(); }, 60);
    else if (s === 'result') setTimeout(function () { demoResult(); }, 60);
    root.__DFY_DEBUG = { Store: Store, Fish: Fish, Game: root.DFY.Game, App: root.DFY.App };
    // 进入游戏先确认 AI 连接（文档要求：没有连接 AI 无法进入游戏）
    setTimeout(bootstrapAI, 500);
  }

  function hintOllama() {
    if (ollamaHinted || settings().llm.mode !== 'off') return;
    Fish.detectOllama('http://127.0.0.1:11434').then(function (models) {
      if (!models || !models.length) return;
      ollamaHinted = true;
      toast('发现本机 Ollama（' + models[0] + '），可在设置里连接');
    }).catch(function () { });
  }

  function bindGlobal() {
    window.addEventListener('beforeunload', function () {
      if (root.DFY.Soul) root.DFY.Soul.detach(true);
    });
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'dfy-war-back') go('lobby');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalStack.length) {
        modalStack[modalStack.length - 1].close();
      }
    });
    $$('[data-clock]').forEach(function (el) {
      el.addEventListener('click', openSchedule);
    });
  }

  function bindLobby() {
    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'classic' || act === 'awake') openDifficulty(act);
        else if (act === 'war') go('war');
        else if (act === 'replay') root.DFY.Replay.openLibrary();
        else if (act === 'sandbox') root.DFY.Sandbox.open();
        else if (act === 'sandboxLib') root.DFY.Sandbox.openLibrary();
        else if (act === 'chat') openChat();
      });
    });
    $('#gameTitle').addEventListener('click', function () {
      var a = $('#authorLine');
      a.hidden = !a.hidden;
      if (!a.hidden) {
        a.classList.remove('pop');
        void a.offsetWidth;
        a.classList.add('pop');
      }
    });
    $('#lobbyFish').addEventListener('click', function () {
      bubble(pick([
        '（眨眼）要下棋吗？还是先聊会儿？',
        '我在这儿呢，点我做什么呀。',
        '（轻轻晃尾巴）今天也一起玩吧。'
      ]), 'happy');
      bounceFish($('#lobbyFish'));
    });
    $('#btnThanks').addEventListener('click', openThanks);
    $('#btnSettings').addEventListener('click', openSettings);
    $('#lobbyAff').addEventListener('click', openAffinityHelp);
    var chip = $('#aiChip');
    if (chip) chip.addEventListener('click', function () { openConnect(); });
    $$('.ai-badge').forEach(function (el) {
      el.addEventListener('click', function () { openConnect(); });
    });
  }

  function bindGameSay() {
    var form = $('#sayForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#sayInput');
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      askFish(text);
    });
    $('#sayInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });
    $('#btnPat').addEventListener('click', function () { pat(); });
    $('#btnHug').addEventListener('click', function () { hug(); });
    $('#btnGameSettings').addEventListener('click', openSettings);
    $('#btnGameRules').addEventListener('click', function () { openRules(0); });
    $('#btnResultReplay') && $('#btnResultReplay').addEventListener('click', function () {
      closeResult();
      go('lobby');
      root.DFY.Replay.openLibrary();
    });
  }

  /* ---------------- 屏幕 ---------------- */

  function go(screen) {
    if (current === 'game' && screen !== 'game' && root.DFY.Game.state().st && !root.DFY.Game.isOver()) {
      root.DFY.Game.stop();
    }
    current = screen;
    ['lobby', 'game', 'chat', 'sandbox', 'war'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.classList.toggle('show', s === screen);
    });
    document.body.setAttribute('data-screen', screen);
    hideChoice();
    hideRequest();
    if (screen !== 'game') {
      setFishBlocking(false);
      hideRegret();
    }
    if (screen === 'lobby') refreshAffinity();
  }

  function screen() { return current; }

  /* ---------------- 难度 ---------------- */

  var LEVELS = [
    { id: 'easy', name: '我只想看你', sub: '低级', desc: '随手走棋，偶尔送子，喜欢边下边看你。' },
    { id: 'medium', name: '我稍微认真一点', sub: '高级', desc: '会算几步，能抓住明显的漏着。' },
    { id: 'hard', name: '我真的认真了', sub: '终极', desc: '认真争胜，不会放水，想赢要拿出本事。' }
  ];

  function openDifficulty(mode) {
    if (Store.affinity.isSick()) return openSickModal();
    if (!aiReady()) {
      requireAI(function () { openDifficulty(mode); });
      return;
    }
    var m = openModal({ id: 'diff', title: (mode === 'classic' ? '经典玩法' : '觉醒之战') + ' · 大肥鱼有多认真？', size: 'narrow' });
    m.body.innerHTML = '<div class="diff-list">' + LEVELS.map(function (lv) {
      return '<button class="diff-card" data-lv="' + lv.id + '">' +
        '<b>' + lv.name + '</b><i>' + lv.sub + '</i><span>' + lv.desc + '</span></button>';
    }).join('') + '</div>' +
      '<p class="tiny">' + (mode === 'awake'
        ? '觉醒之战：经典走法 + 七条觉醒（残魂 / 易位 / 渡河 / 八面 / 出宫 / 并肩 / 无阻）。'
        : '经典玩法：严格按传统中国象棋规则行棋。') + '</p>';
    m.body.querySelectorAll('[data-lv]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.close();
        startGame(mode, b.getAttribute('data-lv'));
      });
    });
  }

  function startGame(mode, level) {
    if (Store.affinity.isSick()) return openSickModal();
    if (!aiReady()) {
      requireAI(function () { startGame(mode, level); });
      return;
    }
    lastMode = mode;
    lastLevel = level;
    root.DFY.Game.start({ mode: mode, level: level });
  }

  function demoResult() {
    showResult({
      title: '大肥鱼赢了',
      why: '将死',
      line: '（开心）我赢啦！不过你也很厉害了。',
      gif: 'win1.gif',
      record: Store.stats(),
      onAgain: function () { closeResult(); },
      onReplay: function () { closeResult(); },
      onLobby: function () { closeResult(); }
    });
  }

  /* ---------------- 对局界面 ---------------- */

  function setBadges(mode, level, sandbox) {
    var mb = $('#modeBadge'), lb = $('#levelBadge');
    if (mb) mb.textContent = mode === 'sandbox' ? '沙盘模式' : (mode === 'classic' ? '经典玩法' : '觉醒之战');
    if (lb) {
      var lv = LEVELS.filter(function (x) { return x.id === level; })[0];
      lb.textContent = lv ? lv.sub : '';
      lb.hidden = !lv;
    }
    var game = $('#game');
    if (game) game.classList.toggle('no-awake', mode !== 'awake');
  }

  function showAwakePanel(show) {
    var g = $('#game');
    if (g) g.classList.toggle('no-awake', !show);
  }

  function showUserLine(text) {
    var el = $('#userLine');
    if (!el) return;
    el.hidden = false;
    el.textContent = '你说：' + text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(userLineTimer);
    userLineTimer = setTimeout(function () { el.hidden = true; }, 9000);
  }
  function clearUserLine() {
    var el = $('#userLine');
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function refreshWinrate() {
    var p = root.DFY.Game.winRate ? root.DFY.Game.winRate() : 50;
    var fish = $('#winFish'), you = $('#winYou'), fill = $('#winFill'), note = $('#winNote');
    if (fish) fish.textContent = p + '%';
    if (you) you.textContent = (100 - p) + '%';
    if (fill) fill.style.width = p + '%';
    if (note) {
      var st = root.DFY.Game.state();
      if (st.over) note.textContent = '对局已结束';
      else if (st.st && root.DFY.Game.inCheck()) note.textContent = '有将军，局面紧张';
      else if (p >= 62) note.textContent = '大肥鱼占优';
      else if (p <= 38) note.textContent = '你占上风';
      else note.textContent = '势均力敌';
    }
    // 每一步的胜率走势与本手变化
    var hist = (root.DFY.Game.winHistory && root.DFY.Game.winHistory()) || [];
    var box = $('#winHistBox'), line = $('#winSparkLine'), area = $('#winSparkArea'), de = $('#winDelta');
    if (box) box.hidden = hist.length < 2;
    if (line && area && hist.length >= 2) {
      var pts = hist.slice(-60);
      var d = '', n = pts.length;
      for (var i = 0; i < n; i++) {
        var x = n <= 1 ? 50 : (i / (n - 1)) * 100;
        var y = 23 - (Math.max(0, Math.min(100, pts[i].fish)) / 100) * 22;
        d += (i ? ' L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      }
      line.setAttribute('d', d);
      area.setAttribute('d', d + ' L 100 24 L 0 24 Z');
    }
    if (de && hist.length) {
      var last = hist[hist.length - 1], prev = null;
      for (var j = hist.length - 2; j >= 0; j--) {
        if (hist[j].ply < last.ply) { prev = hist[j]; break; }
      }
      var dv = prev ? last.fish - prev.fish : 0;
      de.textContent = (dv > 0 ? '+' : '') + dv + '%';
      de.className = 'wr-delta ' + (dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat');
    }
    var rec = $('#recordLine');
    if (rec) {
      var s = Store.stats();
      rec.textContent = '战绩 ' + s.wins + ' 胜 ' + s.losses + ' 负 ' + s.draws + ' 和';
    }
  }

  /* ---------------- 气泡 ---------------- */

  function bubbleEl() {
    if (current === 'chat') return { wrap: $('#chatBubble'), text: $('#chatBubText'), emo: $('#chatBubEmo') };
    return { wrap: $('#gameBubble'), text: $('#gameBubText'), emo: $('#gameBubEmo') };
  }

  function bubble(text, emo, opts) {
    opts = opts || {};
    var el = bubbleEl();
    if (!el.wrap) return;
    el.text.textContent = text;
    var src = '', alt = '';
    if (emo && typeof emo === 'object' && emo.file) {
      src = 'assets/fish/' + emo.file;
      alt = emo.alt || '表情';
    } else if (emo && Fish.EMO[emo]) {
      src = 'assets/fish/' + Fish.EMO[emo].file;
      alt = Fish.EMO[emo].alt;
    }
    if (src) {
      el.emo.src = src;
      el.emo.alt = alt;
      el.emo.hidden = false;
      el.emo.classList.remove('pop');
      void el.emo.offsetWidth;
      el.emo.classList.add('pop');
    } else {
      el.emo.hidden = true;
    }
    el.wrap.classList.toggle('long', String(text || '').length > 120);
    el.wrap.classList.remove('show');
    void el.wrap.offsetWidth;
    el.wrap.classList.add('show');
    if (current === 'chat' && opts.log !== false) root.DFY.Chat.push('fish', text);
  }

  function bounceFish(img) {
    if (!img) return;
    img.classList.remove('bounce');
    void img.offsetWidth;
    img.classList.add('bounce');
  }

  /* ---------------- 对话主流程 ---------------- */

  function ctxNow(text) {
    var aff = Store.affinity.get();
    var g = root.DFY.Game.state();
    var base = {
      aff: aff,
      deep: settings().deep,
      persona: settings().persona,
      length: settings().length,
      time: root.DFY.Time ? root.DFY.Time.info() : null,
      memory: Store.history(16),
      mySide: 0,
      aiSide: 1
    };
    var ctx;
    if (current === 'game' && g.st) {
      ctx = Object.assign(base, root.DFY.Game.ctx());
    } else {
      // 「好好聊聊」是棋盘外的聊天：不带棋局、棋盘、胜率，也不把话题往棋上带
      ctx = Object.assign(base, {
        screen: 'chat',
        mode: lastMode,
        level: lastLevel,
        st: null,
        hist: [],
        lastAI: null,
        lastEvent: null,
        winRate: 50
      });
    }
    if (root.DFY.Soul && root.DFY.Soul.context) {
      var soul = root.DFY.Soul.context(text || '');
      if (soul) ctx.soul = soul;
    }
    return ctx;
  }

  var CHESS_CUE = /(让让|让一让|放水|手下留情|让着我|让我赢|帮我|替我|你来|你走|走|下一步|这步|那步|棋盘|悔棋|悔一步|认输|重开|提示|怎么走|该走|别吃|不要吃|别动|不要动|吃子|将军|将死|和棋|棋子|车|車|馬|马|炮|砲|相|象|仕|士|帥|帅|將|将|兵|卒)/;

  function fallbackChessCommand(text) {
    var s = String(text || '');
    if (/(让让|让一让|放水|手下留情|让着我|让我赢|故意输)/.test(s) && !/(不让|别让)/.test(s)) {
      return { chess: true, action: 'let' };
    }
    if (/(悔棋|悔一步|退回去|重走)/.test(s)) return { chess: true, action: 'undo' };
    if (/(提示|怎么走|该走|教教我|帮我看看)/.test(s)) return { chess: true, action: 'hint' };
    var avoid = s.match(/(?:别|不要|不准|不许)(?:吃|动|碰|拿)\s*(?:我的|我)?\s*([车車俥馬马炮砲相象仕士帥帅將将兵卒])/);
    if (avoid) return { chess: true, action: 'avoid', piece: avoid[1] };
    if (/(帮我走|替我走|你帮我|替我下|你替我|帮我下|你走一步|帮我一步)/.test(s)) {
      return { chess: true, action: 'play' };
    }
    return null;
  }

  function raceTimeout(p, ms) {
    return Promise.race([p, new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, ms);
    })]);
  }

  function soulCommand(text) {
    var out = root.DFY.Soul.command(text);
    Store.remember('user', text);
    if (current === 'chat') {
      root.DFY.Chat.push('user', text);
    } else {
      showUserLine(text);
      root.DFY.Game.sendChat(text);
    }
    say(out, null);
    if (current === 'game') root.DFY.Game.recordAnswer(text, out);
    return Promise.resolve({ text: out, soulCommand: true });
  }

  function askFish(text) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve(null);
    if (current === 'sandbox') { toast('先离开沙盘再聊天吧'); return Promise.resolve(null); }
    if (root.DFY.Soul && /^\/\s*(mem|记忆)(\s|$)/i.test(text)) return soulCommand(text);

    // 悔棋请求进行中：先用“好/不”这类回答处理，不再多叫一次模型
    if (current === 'game' && root.DFY.Game.regretActive && root.DFY.Game.regretActive()) {
      var yes = /^(好|行|可以|同意|让她悔|悔吧|嗯|嗯嗯|好的|好呀)[。！!，,]*$/.test(text);
      var no = /^(不|不行|不要|拒绝|不许|不好|不悔)[。！!，,]*$/.test(text);
      if (yes || no) {
        Store.remember('user', text);
        showUserLine(text);
        root.DFY.Game.sendChat(text);
        root.DFY.Game.regretAnswer(yes);
        return Promise.resolve(null);
      }
      root.DFY.Game.regretTouch();
    }

    var wasSick = Store.affinity.isSick();
    var regexIntimate = Fish.isIntimateText(text);
    // 先取上下文（记忆里是这轮之前的对话），再把这句写进记忆；
    // 否则这句会同时出现在 memory 和最后一条 user 里，模型会以为你说了两遍。
    var ctx = ctxNow(text);
    if (current === 'game' && !wasSick && /让让|让一让|放水|手下留情|让着我|让我赢|故意输/.test(text) && !/不让|别让/.test(text)) {
      if (root.DFY.Game.requestMercy()) ctx.mercyAsked = true;
    }
    Store.remember('user', text);
    if (current === 'chat') {
      root.DFY.Chat.push('user', text);
      root.DFY.Chat.setTyping(true);
    } else {
      showUserLine(text);
      root.DFY.Game.sendChat(text);
    }

    var cfg = settings().llm;
    if (cfg.mode !== 'off' && root.DFY.Soul) root.DFY.Soul.attach(true);
    var local = Fish.local(text, ctx);
    var task;
    var usedModel = false;
    var chessCue = current === 'game' && !wasSick && CHESS_CUE.test(text);
    var pre = Promise.resolve(null);
    if (cfg.mode !== 'off' && chessCue) {
      bubble('（她看了看棋盘）', 'think', { log: false });
      pre = raceTimeout(Fish.classifyChess(ctx, text, cfg), 15000).then(function (cmd) {
        var action = cmd;
        if (action === null) action = fallbackChessCommand(text);
        if (action && action.chess === true) {
          var ok = false;
          try { ok = root.DFY.Game.chessCommand(action); } catch (e) { }
          if (ok) ctx.chessAction = action;
        }
        return null;
      }).catch(function (err) {
        try { console.warn('[棋局指令]', err && err.message); } catch (e2) { }
        var fb = fallbackChessCommand(text);
        if (fb) {
          try { if (root.DFY.Game.chessCommand(fb)) ctx.chessAction = fb; } catch (e3) { }
        }
        return null;
      });
    }
    if (cfg.mode !== 'off') {
      if (current === 'chat') setFishMood('think');
      task = pre.then(function () {
        return Fish.askModel(ctx, text, cfg);
      }).then(function (res) {
        usedModel = true;
        return res;
      }).catch(function (err) {
        llmState.live = false;
        llmState.lost = true;
        llmState.fails += 1;
        llmState.lastError = (err && (err.friendly || err.message)) || '连接中断';
        updateAiBadge();
        try { console.warn('[大肥鱼 AI]', err && err.status, err && err.url, err && err.message); } catch (e2) { }
        if (!modelWarned || (err && err.kind && err.kind !== llmState.lastKind)) {
          modelWarned = true;
          llmState.lastKind = (err && err.kind) || '';
          toast(offlineMessage(err));
        }
        // 连接了 AI 就不要用内置公式句冒充她的回答；用一句诚实的“没接上”
        return { text: '（有点着急）刚才没接上……你再说一遍，我这次好好听。', emo: 'worry', aiFailed: true };
      });
    } else {
      task = Promise.resolve(local);
    }
    var minDelay = settings().deep ? 620 : 380;
    var started = Date.now();
    var thinkTimer = null;
    if (cfg.mode !== 'off') {
      thinkTimer = setTimeout(function () {
        bubble('（托腮）让我认真想想……', 'think', { log: false });
      }, 1800);
    }
    return task.then(function (r) {
      if (thinkTimer) clearTimeout(thinkTimer);
      if (current === 'chat') setFishMood('normal');
      if (usedModel) {
        llmState.live = true;
        llmState.fails = 0;
        llmState.lastError = '';
        modelWarned = false;
        llmState.lastKind = '';
        updateAiBadge();
        if (llmState.lost) {
          llmState.lost = false;
          toast('AI 已重新连接：大肥鱼接上了「' + (cfg.model || '云端') + '」');
        }
        if (!llmState.announced) {
          llmState.announced = true;
          llmState.model = cfg.model || '';
          toast('连接成功：大肥鱼已接上「' + (cfg.model || 'AI') + '」');
        }
      }

      // AI 连接时由模型在回复开头判断「亲密/普通」；没有标记时退回规则判断
      var intimate = (r && typeof r.intimate === 'boolean') ? r.intimate : regexIntimate;
      var affRes = Store.affinity.chat(intimate);
      refreshAffinity();
      updateAiBadge();

      var wait = Math.max(0, minDelay - (Date.now() - started));
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (current === 'chat') root.DFY.Chat.setTyping(false);
          var fixedEmo = null;
          var sticker = null;
          if (affRes.cured) {
            r = { text: '（松开一点）……好，我没事了。刚才是不是有点吓到你？', emo: 'worry' };
            fixedEmo = 'worry';
            refreshAffinity();
            toast('好感度已恢复');
          } else if (wasSick && !intimate) {
            var sc = Store.affinity.get().sickChats;
            var sickLines = [
              { text: '（抱着膝盖，声音闷闷的）……你说吧，我在听。', emo: 'worry' },
              { text: '（悄悄抬头看你）嗯……好像，也没那么糟。', emo: 'think' },
              { text: '（手松开了一点）主人，我是不是有点过分了……', emo: 'worry' }
            ];
            var pickLine = sickLines[Math.max(0, Math.min(sickLines.length - 1, sc - 1))];
            if (pickLine) { r = { text: pickLine.text, emo: pickLine.emo }; fixedEmo = pickLine.emo; }
          } else if (Math.random() < 0.05) {
            // 文档：聊天时 5% 概率附带一个表情包，只用一个
            sticker = Fish.stickerFor(r.emo, text);
          }
          if (r && r.text) r.text = Fish.fitLength(r.text, ctx);
          say(r.text, fixedEmo ? fixedEmo : (sticker || null));
          if (root.DFY.Soul && r && r.text) {
            root.DFY.Soul.observe('user', text, ctx);
            root.DFY.Soul.observe('fish', r.text, ctx);
          }
          if (current === 'game') root.DFY.Game.recordAnswer(text, r.text);
          if (affRes.levelUp) celebrate(affRes.levelUp);
          if (r.action === 'hint' && current === 'game') root.DFY.Game.hint();
          if (current === 'chat' && Math.random() < 0.14 && Store.affinity.get().level >= 7 && !Store.affinity.isSick()) offerRequest();
          if (affRes.sick && !wasSick) setTimeout(function () { enterSick(); }, 900);
          resolve(r);
        }, wait);
      });
    });
  }

  function say(text, emo) {
    bubble(text, emo);
    Store.remember('fish', text);
    if (settings().sound) sfx('say');
  }

  function celebrate() {
    var a = Store.affinity.get();
    var info = Fish.LEVELS[a.level - 1] || '';
    setTimeout(function () {
      bubble('（脸红）好感度升到 ' + a.level + ' 级了……' + (a.level >= 6 ? '主人，' : '') + '我会更黏你一点哦。', 'confused');
      toast('好感度提升：Lv.' + a.level + ' · ' + Store.affinity.levelName(a));
      refreshAffinity();
    }, 500);
  }

  function pat() {
    if (current === 'sandbox') return;
    var res = Store.affinity.pat();
    var a = Store.affinity.get();
    var lv = a.level;
    var line = res.sick
      ? pick(['（抓着你的手不放）再摸一会儿。', '（眯起眼睛）主人摸头的话……可以。'])
      : (lv >= 6
        ? pick(['（蹭蹭手心）嗯……主人的手好暖。', '（眯起眼睛）还要。', '（把脑袋往你手里送）这里，再多摸两下。'])
        : (lv >= 3
          ? pick(['（愣了一下）……谢谢。', '（小声）这样可以的。', '（耳朵红了）嗯。'])
          : pick(['诶？突然摸头……', '（有点不好意思地低头）谢谢。'])));
    line = Fish.fitLength(line, ctxNow());
    bubble(line, res.sick ? 'hmph' : 'happy');
    if (current === 'chat') root.DFY.Chat.push('user', '（摸摸头）');
    if (res.levelUp) celebrate();
    refreshAffinity();
    if (lv >= 7 && Math.random() < 0.25) offerRequest();
  }
  function hug() {
    if (current === 'sandbox') return;
    var a0 = Store.affinity.get();
    var wasSick = Store.affinity.isSick();
    var res = Store.affinity.hug();
    var a = Store.affinity.get();
    var line, emo;
    if (res.tooEarly) {
      line = pick(['（往后躲了一下）还、还不行啦……我们还没那么熟。', '（脸一下红透）这、这个太快了……']);
      emo = 'confused';
    } else if (res.sick) {
      line = pick(['（抱得更紧）不许放开。', '（把脸埋进你怀里）这样就好。']);
      emo = 'hmph';
    } else {
      var lv = a.level;
      line = lv >= 9
        ? pick(['（贴上来）主人想抱多久都可以。', '（仰头）今天特别想黏着你。', '（抱住腰）不松手。'])
        : (lv >= 6
          ? pick(['（抱住）……嗯，抱一会儿。', '（把脸埋起来）主人身上好暖。', '（蹭蹭）再抱一下。'])
          : pick(['（僵了一下，然后轻轻回抱）……好了好了。', '（小声）就一下下哦。']));
      emo = 'confused';
    }
    line = Fish.fitLength(line, ctxNow());
    bubble(line, emo);
    if (current === 'chat') root.DFY.Chat.push('user', '（抱抱）');
    if (res.levelUp) celebrate();
    refreshAffinity();
    if (res.sick && !wasSick) enterSick();
    if (a0.level >= 4 && Math.random() < 0.2) offerRequest();
  }

  /* ---------------- 请求 ---------------- */

  function offerRequest() {
    if (Store.affinity.isSick()) return;
    var box = $('#requestPop');
    if (!box || !box.hidden) return;
    var ctx = ctxNow();
    var r = Fish.makeRequest(ctx);
    $('#reqText').textContent = r.text;
    box.hidden = false;
    box.setAttribute('data-id', r.id);
  }

  function hideRequest() {
    var box = $('#requestPop');
    if (box) box.hidden = true;
  }

  function bindRequest() {
    $('#reqYes').addEventListener('click', function () {
      var res = Store.affinity.requestDone();
      hideRequest();
      var a = Store.affinity.get();
      var line = res.exp > 0
        ? pick(['（眼睛亮起来）答应了！那……我最喜欢你了。', '（笑起来）好，我会记住的。', '（点头）嗯！我就知道你会答应。'])
        : pick(['（开心）你答应了，我好高兴。', '（小声）谢谢你。']);
      bubble(line, 'happy');
      if (res.exp > 0) toast('完成请求：好感度 +' + res.exp);
      if (res.levelUp) celebrate();
      refreshAffinity();
    });
    $('#reqNo').addEventListener('click', function () {
      hideRequest();
      if (Store.affinity.get().level >= 6) {
        bubble(pick(['（鼓脸）哼，那下次一定要答应。', '（委屈）好吧……我不闹。', '（拉住袖子）就一次，真的不行吗……']), 'pout');
      } else {
        bubble(pick(['没关系，下次再说。', '（点点头）我自己待一会儿也可以。']), 'ok');
      }
    });
  }

  /* ---------------- 病娇 ---------------- */

  function enterSick() {
    refreshAffinity();
    if (root.DFY.Game.state().st && !root.DFY.Game.isOver()) {
      root.DFY.Game.abort();
    }
    if (current === 'game') go('lobby');
    bubble('（抱住你）今天不下棋了……陪着我，好不好？', 'hmph');
    if (!sickShown) {
      sickShown = true;
      openSickModal(true);
    }
  }

  function openSickModal(entered) {
    var m = openModal({ id: 'sick', title: '大肥鱼现在有点不一样', size: 'narrow' });
    m.body.innerHTML =
      '<div class="sick-card">' +
      '<img src="assets/fish/emo_pout.jpg" alt="病娇">' +
      '<div class="sick-text">' +
      '<p>' + (entered ? '连续太多次亲密，大肥鱼进入了<strong>病娇</strong>状态。' : '大肥鱼正处在<strong>病娇</strong>状态。') + '</p>' +
      '<ul>' +
      '<li>这个状态下不能下棋，她只想把你留在身边。</li>' +
      '<li>聊<strong>正常、不带亲密</strong>的话题 <strong>4 次</strong> 后，她会慢慢松开手。</li>' +
      '<li>恢复后会回到进入病娇前的好感度等级与经验。</li>' +
      '</ul></div></div>' +
      '<div class="row"><button class="btn small" id="sickChat">去和她聊聊</button>' +
      '<button class="btn ghost small" id="sickClose">知道了</button></div>';
    m.body.querySelector('#sickClose').addEventListener('click', m.close);
    m.body.querySelector('#sickChat').addEventListener('click', function () {
      m.close();
      openChat();
    });
  }

  /* ---------------- 复盘 / 沙盘入口 ---------------- */

  function openChat() {
    if (!aiReady()) {
      requireAI(openChat);
      return;
    }
    root.DFY.Chat.open();
  }

  /* ---------------- 好感度界面 ---------------- */

  function refreshAffinity() {
    var a = Store.affinity.get();
    var sick = a.sick;
    var name = Store.affinity.levelName(a);
    var exp = sick ? 0 : a.exp;
    // 大厅
    var lb = $('#lobbyAff');
    if (lb) {
      lb.classList.toggle('sick', !!sick);
      $('#lobbyAffName').textContent = sick ? '病娇' : ('Lv.' + a.level + ' ' + name);
      $('#lobbyAffFill').style.width = (sick ? 100 : exp) + '%';
      $('#lobbyAffText').textContent = sick ? '她只想把你留在身边' : (exp + ' / 100');
    }
    // 聊天界面
    var box = $('#affPanel');
    if (box) {
      box.classList.toggle('sick', !!sick);
      $('#affLevel').textContent = sick ? '病娇' : ('Lv.' + a.level);
      $('#affName').textContent = sick ? '只想黏着你' : name;
      $('#affExpFill').style.width = (sick ? 100 : exp) + '%';
      $('#affExpText').textContent = sick ? '聊 4 次正常话题可恢复' : (exp + ' / 100');
      $('#affStats').innerHTML =
        '<span>聊天 <b>' + a.chats + '</b></span>' +
        '<span>摸摸 <b>' + a.pats + '</b></span>' +
        '<span>亲密 <b>' + a.intimacies + '</b></span>' +
        '<span>请求 <b>' + a.requests + '</b></span>';
      $('#affDesc').textContent = sick
        ? '她把你圈在怀里，不想让你走。聊 4 次正常话题，她会慢慢松开。'
        : (Store.affinity.levelInfo(a.level).desc || '');
      $('#affSickTip').hidden = !sick;
      var next = Fish.LEVELS[Math.min(9, a.level)] || '';
      $('#affNext').textContent = sick ? '' : (a.level >= 10 ? '已经是最特别的人了。' : '下一级：' + next.split('：')[0]);
    }
    // 聊天入口按钮
    var chatBtn = document.querySelector('[data-act="chat"]');
    if (chatBtn) chatBtn.classList.toggle('sick', !!sick);
  }

  function openAffinityHelp() {
    var a = Store.affinity.get();
    var m = openModal({ id: 'affHelp', title: '好感度 · 十级与病娇', size: 'wide' });
    m.body.innerHTML =
      '<p class="tiny">每次聊天 +2 经验；摸摸头 +10；4 级以后亲密 +20；7 级以后完成她的请求 +20；8 级以后每次亲密永久再 +1。每 100 经验升一级。<br>说话字数：下棋 20+10X ~ 40+10X，聊天 40+20X ~ 60+20X（X 为当前等级）。</p>' +
      '<div class="aff-table">' + Fish.LEVELS.map(function (line, i) {
        var lv = i + 1;
        return '<div class="aff-row' + (a.level === lv && !a.sick ? ' cur' : '') + '">' +
          '<b>Lv.' + lv + '</b><span>' + esc(line) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="sick-note"><b>病娇</b><p>' + Fish.SICK_RULE + '</p><p class="tiny">触发条件：9 级以后，连续 10 次亲密行为。</p></div>';
    m.body.querySelectorAll('.aff-row').forEach(function (r, i) {
      if (i === a.level - 1 && !a.sick) r.classList.add('cur');
    });
  }

  /* ---------------- 设置 ---------------- */

  function soulStatusText() {
    if (!root.DFY.Soul) return 'Soul 记忆未加载';
    var s = root.DFY.Soul.status();
    return 'Soul 记忆：' + (s.active ? '已连接' : '未连接') +
      ' · 节点 ' + s.nodes + '（约束 ' + s.constraints + ' / 决策 ' + s.decisions +
      ' / 进度 ' + s.progress + '）· 原文 ' + s.spans + ' 条';
  }

  function openSettings() {
    var cfg = Store.settings();
    var m = openModal({ id: 'settings', title: '设置', size: 'narrow' });
    m.body.innerHTML =
      '<div class="set-group"><h3>体验</h3>' +
      toggleRow('setSound', '音效', cfg.sound) +
      '<div class="set-row"><span>音量</span><input type="range" id="setVolume" min="0" max="100" value="' + (cfg.volume != null ? cfg.volume : 80) + '"><b class="tiny" id="setVolumeText">' + (cfg.volume != null ? cfg.volume : 80) + '</b></div>' +
      toggleRow('setAnim', '行棋动画', cfg.anim) +
      toggleRow('setDeep', '深度思考（回复前多想想）', cfg.deep) +
      '</div>' +
      '<div class="set-group"><h3>对话</h3>' +
      '<p class="tiny">这里改的是 AI 的人设和字数；不填就用默认。默认人设已按三视图补全外形（深海蓝长卷发、女仆裙、白围裙鲸鱼刺绣、蓝蝴蝶结、鲸鱼尾巴、金色鞋扣）。人设是硬约束，好感度和对话规则仍然生效。</p>' +
      '<label class="set-col"><span>人设</span><textarea id="setPersona" rows="4" placeholder="' + esc(Fish.DEFAULT_PERSONA) + '">' + esc(cfg.persona || Fish.DEFAULT_PERSONA) + '</textarea></label>' +
      '<div class="set-row"><span>字数范围（1 级）</span><b class="tiny">下棋</b><input class="num" id="lenGameMin" type="number" min="5" max="4000" value="' + (cfg.length.gameMin || 30) + '"> ~ <input class="num" id="lenGameMax" type="number" min="5" max="4000" value="' + (cfg.length.gameMax || 50) + '"></div>' +
      '<div class="set-row"><span></span><b class="tiny">聊天</b><input class="num" id="lenChatMin" type="number" min="5" max="4000" value="' + (cfg.length.chatMin || 60) + '"> ~ <input class="num" id="lenChatMax" type="number" min="5" max="4000" value="' + (cfg.length.chatMax || 80) + '"></div>' +
      '<div class="set-row"><span>随好感度成长</span><button type="button" class="toggle' + (cfg.length.perLevel !== false ? ' on' : '') + '" id="lenPerLevel" aria-label="随好感度成长"></button></div>' +
      '<p class="tiny" id="lenPreview"></p>' +
      '<div class="row"><button class="mini" id="lenReset">恢复默认字数</button><button class="mini" id="personaReset">恢复默认人设</button></div>' +
      '</div>' +
      '<div class="set-group"><h3>大肥鱼的思考方式</h3>' +
      '<p class="tiny">游戏需要连接 AI 才能下棋和聊天。推荐本机 Ollama（数据不出电脑），也可以连云端 DeepSeek；本机小模型一句可能要等 20–90 秒。</p>' +
      '<div class="row"><button class="mini" id="llmWizard">连接向导 / 一键连接</button></div>' +
      '<label class="set-row"><span>方式</span><select id="llmMode">' +
      '<option value="off"' + (cfg.llm.mode === 'off' ? ' selected' : '') + '>关闭（不能下棋 / 聊天）</option>' +
      '<option value="ollama"' + (cfg.llm.mode === 'ollama' ? ' selected' : '') + '>本机 Ollama</option>' +
      '<option value="openai"' + (cfg.llm.mode === 'openai' ? ' selected' : '') + '>云端 / 第三方 API</option>' +
      '</select></label>' +
      '<label class="set-row"><span>地址</span><input id="llmUrl" value="' + esc(cfg.llm.url) + '" placeholder="http://127.0.0.1:11434"></label>' +
      '<label class="set-row"><span>模型</span><input id="llmModel" value="' + esc(cfg.llm.model) + '" placeholder="deepseek-r1:7b / deepseek-chat"></label>' +
      '<label class="set-row"><span>密钥</span><input id="llmKey" type="password" value="' + esc(cfg.llm.key) + '" placeholder="云端 API Key（本机不用填）"></label>' +
      '<div class="row"><button class="mini" id="llmTest">测试连接</button><span class="llm-status" id="llmStatus">未连接</span></div>' +
      '<p class="tiny" id="llmTried" hidden></p>' +
      '<p class="tiny">点「测试连接」会真的请求一次；成功会显示「连接成功」，保存后也会在后台验证一次。</p>' +
      '</div>' +
      '<div class="set-group"><h3>Soul 记忆（游戏内置）</h3>' +
      '<p class="tiny" id="soulStatus">' + esc(soulStatusText()) + '</p>' +
      '<div class="row"><button class="mini" id="soulShow">查看记忆骨架</button><button class="mini danger" id="soulClear">清空 Soul 记忆</button></div>' +
      '<p class="tiny">随 AI 连接自动启用；关闭游戏或断开 AI 时保存并断开。记忆随「导出记忆与好感度」一起保存。</p>' +
      '</div>' +
      '<div class="set-group"><h3>存档</h3>' +
      '<div class="row"><button class="mini danger" id="dataAff">重置好感度</button>' +
      '<button class="mini danger" id="dataRep">清空复盘</button>' +
      '<button class="mini danger" id="dataSb">清空沙盘</button></div>' +
      '<div class="row"><button class="mini" id="dataExport">导出记忆与好感度</button>' +
      '<button class="mini" id="dataImport">导入存档</button></div>' +
      '<input type="file" id="dataFile" accept=".json,application/json" hidden>' +
      '<p class="tiny">所有内容只保存在这台电脑的浏览器里，不联网、不上传。' + (Store.available ? '' : '（当前环境无法写入本地存档）') + '</p>' +
      '</div>' +
      '<div class="set-group"><h3>关于</h3>' +
      '<div class="row"><button class="mini" id="btnIntro">游戏简介</button>' +
      '<button class="mini" id="btnSchedule">大肥鱼的作息</button>' +
      '<button class="mini" id="btnGuide">连接与安装指南</button>' +
      '<button class="mini danger" id="btnUninstall">卸载 / 清除存档</button></div>' +
      '<p class="tiny">游戏本体免安装；本机 AI 需要安装 Ollama，云端只需要 API Key。</p>' +
      '</div>' +
      '<div class="row end"><button class="btn small" id="setSave">保存</button></div>';
    m.body.querySelectorAll('.toggle').forEach(function (b) {
      b.addEventListener('click', function () {
        b.classList.toggle('on');
      });
    });
    var volEl = m.body.querySelector('#setVolume');
    var volText = m.body.querySelector('#setVolumeText');
    if (volEl) {
      volEl.addEventListener('input', function () {
        volText.textContent = volEl.value;
        var s = Store.settings();
        s.volume = Number(volEl.value);
        Store.saveSettings(s);
      });
    }
    var lenPerBtn = m.body.querySelector('#lenPerLevel');
    var lenPreview = m.body.querySelector('#lenPreview');
    function formLength() {
      return {
        gameMin: parseInt(m.body.querySelector('#lenGameMin').value, 10) || 30,
        gameMax: parseInt(m.body.querySelector('#lenGameMax').value, 10) || 50,
        chatMin: parseInt(m.body.querySelector('#lenChatMin').value, 10) || 60,
        chatMax: parseInt(m.body.querySelector('#lenChatMax').value, 10) || 80,
        perLevel: lenPerBtn.classList.contains('on')
      };
    }
    function updateLenPreview() {
      var a = Store.affinity.get();
      var L = formLength();
      var g = Fish.rangeOf({ screen: 'game', aff: a, length: L });
      var c = Fish.rangeOf({ screen: 'chat', aff: a, length: L });
      lenPreview.textContent = '当前 ' + (a.sick ? '病娇' : a.level + ' 级') + '：下棋 ' + g.min + '–' + g.max + ' 字，聊天 ' + c.min + '–' + c.max + ' 字。';
    }
    ['#lenGameMin', '#lenGameMax', '#lenChatMin', '#lenChatMax'].forEach(function (sel) {
      m.body.querySelector(sel).addEventListener('input', updateLenPreview);
    });
    lenPerBtn.addEventListener('click', function () { setTimeout(updateLenPreview, 0); });
    m.body.querySelector('#lenReset').addEventListener('click', function () {
      m.body.querySelector('#lenGameMin').value = 30;
      m.body.querySelector('#lenGameMax').value = 50;
      m.body.querySelector('#lenChatMin').value = 60;
      m.body.querySelector('#lenChatMax').value = 80;
      lenPerBtn.classList.add('on');
      updateLenPreview();
    });
    m.body.querySelector('#personaReset').addEventListener('click', function () {
      m.body.querySelector('#setPersona').value = Fish.DEFAULT_PERSONA;
    });
    updateLenPreview();
    var wizardBtn = m.body.querySelector('#llmWizard');
    if (wizardBtn) wizardBtn.addEventListener('click', function () { m.close(); openConnect(); });
    m.body.querySelector('#btnIntro').addEventListener('click', openIntro);
    m.body.querySelector('#btnSchedule').addEventListener('click', openSchedule);
    m.body.querySelector('#btnGuide').addEventListener('click', openGuide);
    m.body.querySelector('#btnUninstall').addEventListener('click', openUninstall);
    var modeSel = m.body.querySelector('#llmMode');
    var urlInput = m.body.querySelector('#llmUrl');
    var modelInput = m.body.querySelector('#llmModel');
    var statusEl = m.body.querySelector('#llmStatus');
    var triedEl = m.body.querySelector('#llmTried');

    function setStatus(kind, text) {
      statusEl.className = 'llm-status ' + kind;
      statusEl.textContent = text;
    }
    function setTried(err) {
      if (!triedEl) return;
      if (err && err.url) {
        triedEl.hidden = false;
        triedEl.textContent = '尝试的地址：' + err.url;
      } else {
        triedEl.hidden = true;
        triedEl.textContent = '';
      }
    }
    function formCfg() {
      return {
        mode: modeSel.value,
        url: urlInput.value.trim(),
        model: modelInput.value.trim(),
        key: m.body.querySelector('#llmKey').value.trim(),
        temperature: cfg.llm.temperature,
        maxTokens: cfg.llm.maxTokens
      };
    }
    function applyModeHints() {
      var mode = modeSel.value;
      setTried(null);
      if (mode === 'ollama') {
        urlInput.placeholder = 'http://127.0.0.1:11434';
        modelInput.placeholder = 'deepseek-r1:7b';
        if (!urlInput.value.trim() || /deepseek\.com|openai|api\./i.test(urlInput.value)) {
          urlInput.value = 'http://127.0.0.1:11434';
        }
        if (!modelInput.value.trim()) modelInput.value = 'deepseek-r1:7b';
        setStatus('idle', '未测试');
      } else if (mode === 'openai') {
        urlInput.placeholder = 'https://api.deepseek.com/v1';
        modelInput.placeholder = 'deepseek-chat';
        if (!urlInput.value.trim() || /11434|127\.0\.0\.1|localhost/.test(urlInput.value)) {
          urlInput.value = 'https://api.deepseek.com/v1';
        }
        if (!modelInput.value.trim()) modelInput.value = 'deepseek-chat';
        setStatus('idle', '未测试');
      } else {
        setStatus('off', 'AI 已关闭（不能下棋 / 聊天）');
      }
    }
    modeSel.addEventListener('change', applyModeHints);
    if (cfg.llm.mode === 'off') setStatus('off', 'AI 已关闭（不能下棋 / 聊天）');
    else if (llmState.live) setStatus('ok', '✓ 连接成功 · ' + (llmState.model || cfg.llm.model || 'AI'));
    else if (llmState.lastError) setStatus('bad', '✗ 上次连接失败：' + llmState.lastError + '（点测试连接重试）');
    else setStatus('idle', '未测试');

    m.body.querySelector('#llmTest').addEventListener('click', function () {
      var btn = this;
      var c = formCfg();
      if (c.mode === 'off') { setStatus('off', 'AI 已关闭；不连接不能下棋 / 聊天'); return; }
      btn.disabled = true;
      setStatus('pending', '连接中…');
      Fish.testModel(c).then(function (res) {
        btn.disabled = false;
        var model = res.model || c.model || '';
        if (!modelInput.value.trim() && model) modelInput.value = model;
        setStatus('ok', '✓ 连接成功' + (model ? ' · ' + model : ''));
        llmState.live = true;
        llmState.announced = true;
        llmState.model = model;
        llmState.lastError = '';
        llmState.fails = 0;
        setTried(null);
        updateAiBadge();
        toast('连接成功：' + (res.detail || model || '大肥鱼已接上 AI'));
      }).catch(function (err) {
        btn.disabled = false;
        var msg = String((err && (err.friendly || err.message)) || '连接失败').slice(0, 70);
        var hint = llmErrorHint(err);
        setStatus('bad', '✗ 连接失败：' + msg + hint);
        setTried(err);
        llmState.live = false;
        llmState.lastError = msg;
        updateAiBadge();
        toast('连接失败：' + msg + hint);
      });
    });
    m.body.querySelector('#setSave').addEventListener('click', function () {
      var s = Store.settings();
      s.sound = m.body.querySelector('#setSound').classList.contains('on');
      s.volume = Number(m.body.querySelector('#setVolume').value);
      s.anim = m.body.querySelector('#setAnim').classList.contains('on');
      s.deep = m.body.querySelector('#setDeep').classList.contains('on');
      var persona = m.body.querySelector('#setPersona').value.trim();
      s.persona = persona === Fish.DEFAULT_PERSONA ? '' : persona;
      var L = formLength();
      if (L.gameMin < 5 || L.chatMin < 5 || L.gameMax < L.gameMin || L.chatMax < L.chatMin || L.gameMax > 4000 || L.chatMax > 4000) {
        toast('字数不对：最少 5 字，最多 4000 字，且上限不能小于下限');
        return;
      }
      s.length = L;
      var c = formCfg();
      s.llm.mode = c.mode;
      s.llm.url = c.url;
      s.llm.model = c.model;
      s.llm.key = c.key;
      Store.saveSettings(s);
      llmState.announced = false;
      llmState.lost = false;
      llmState.fails = 0;
      llmState.lastError = '';
      m.close();
      if (s.llm.mode === 'off') {
        llmState.live = false;
        llmState.model = '';
        updateAiBadge();
        if (root.DFY.Soul) root.DFY.Soul.detach();
        toast('设置已保存：AI 已关闭（不能下棋 / 聊天）');
        return;
      }
      updateAiBadge();
      toast('设置已保存，正在验证 AI 连接…');
      Fish.testModel(c).then(function (res) {
        llmState.live = true;
        llmState.announced = true;
        llmState.model = res.model || c.model || '';
        llmState.lastError = '';
        updateAiBadge();
        if (root.DFY.Soul) root.DFY.Soul.attach(true);
        toast('连接成功：大肥鱼已接上「' + (res.model || c.model || 'AI') + '」');
      }).catch(function (err) {
        llmState.live = false;
        llmState.announced = true;
        var msg = String((err && (err.friendly || err.message)) || '连接失败').slice(0, 60);
        llmState.lastError = msg;
        updateAiBadge();
        toast('连接失败：' + msg + llmErrorHint(err) + '（下棋/聊天前请先连上 AI）');
      });
    });
    m.body.querySelector('#dataAff').addEventListener('click', function () {
      if (!confirm('把好感度重置到 1 级？这个不能撤销。')) return;
      Store.affinity.reset();
      refreshAffinity();
      toast('好感度已重置');
    });
    var soulShow = m.body.querySelector('#soulShow');
    if (soulShow) soulShow.addEventListener('click', function () {
      var sm = openModal({ id: 'soul', title: 'Soul 记忆骨架', size: 'wide' });
      sm.body.innerHTML = '<pre class="soul-pre">' + esc(root.DFY.Soul.command('/mem show')) + '</pre>';
    });
    var soulClear = m.body.querySelector('#soulClear');
    if (soulClear) soulClear.addEventListener('click', function () {
      if (!confirm('清空 Soul 的记忆骨架和原文索引？这个不能撤销。')) return;
      root.DFY.Soul.clear();
      var st = m.body.querySelector('#soulStatus');
      if (st) st.textContent = soulStatusText();
      toast('Soul 记忆已清空');
    });
    m.body.querySelector('#dataRep').addEventListener('click', function () {
      if (!confirm('清空所有复盘与收藏？')) return;
      Store.replays.clear();
      Store.replays.favList().forEach(function (r) { Store.replays.removeFav(r.id); });
      toast('复盘已清空');
    });
    m.body.querySelector('#dataSb').addEventListener('click', function () {
      if (!confirm('清空沙盘保存库？')) return;
      Store.sandbox.list().forEach(function (r) { Store.sandbox.remove(r.id); });
      toast('沙盘保存库已清空');
    });
    m.body.querySelector('#dataExport').addEventListener('click', function () {
      var data = Store.exportData();
      data.chatLog = root.DFY.Chat.getLog();
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '大肥鱼存档-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
      toast('记忆与好感度已导出');
    });
    m.body.querySelector('#dataImport').addEventListener('click', function () {
      m.body.querySelector('#dataFile').click();
    });
    m.body.querySelector('#dataFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result || ''));
          if (!confirm('导入会覆盖当前记忆、好感度和设置，继续？')) return;
          var res = Store.importData(data);
          if (data.chatLog) root.DFY.Chat.setLog(data.chatLog);
          toast('导入成功：Lv.' + res.level + ' · ' + res.memories + ' 条记忆');
          setTimeout(function () { location.reload(); }, 900);
        } catch (e) {
          toast('导入失败：' + (e.message || '文件格式不对'));
        }
      };
      reader.readAsText(f, 'utf-8');
    });
  }

  function toggleRow(id, label, on) {
    return '<div class="set-row"><span>' + label + '</span>' +
      '<button type="button" class="toggle' + (on ? ' on' : '') + '" id="' + id + '"><i></i></button></div>';
  }

  /* ---------------- 感谢名单 ---------------- */

  function openThanks() {
    var m = openModal({ id: 'thanks', title: '素材感谢名单', size: 'narrow' });
    m.body.innerHTML =
      '<div class="thanks">' +
      '<p>这个小小的房间，是很多人一起搭起来的。</p>' +
      '<ul>' +
      '<li><b>大肥鱼</b>：角色立绘、表情包、房间背景、元素贴纸，全部来自本项目 <code>素材图</code>。</li>' +
      '<li><b>棋子与棋盘</b>：3D 棋子素材与木纹棋盘参考《中国觉醒象棋》。</li>' +
      '<li><b>规则引擎</b>：经典规则与七条觉醒走法由《中国觉醒象棋》移植，已通过规则用例与 perft 校验。</li>' +
      '<li><b>字体</b>：使用系统自带的中文卡通字体（华文琥珀 / 幼圆）。</li>' +
      '<li><b>作者</b>：三天左右了吧。</li>' +
      '</ul>' +
      '<p class="tiny">素材仅用于本作，不用于商业用途。感谢每一位让大肥鱼活起来的人。</p>' +
      '</div>';
  }

  /* ---------------- 觉醒规则 ---------------- */

  var RULE_ITEMS = [
    { k: 'rook', ch: '俥', name: '残魂', short: '损俥后，未吃子、不将军，可再走一步（不能吃子）', full: '己方已经损失过至少一只俥、且场上仍有己方俥时，这枚俥走完一步，若这一步没有吃子、也没有对对方形成将军，就可以立刻再走一步，不占用原本回合。额外这一步不能吃子，也不会再次触发残魂。点“跳过”可以直接交换行棋方。' },
    { k: 'horse', ch: '傌', name: '易位', short: '与车 / 马 / 炮 / 过河兵 / 解禁相换位，换完可续行', full: '傌按日字走到己方车、马、炮的位置（仍受蹩马腿限制），或走到已过河的己方兵、已解除过河限制的相的位置，可以与它交换位置。士和将不能换位。换位本身不吃子、不触发并肩与后撤。换位完成后，可以从两枚棋子中选一枚再走一步；若换位直接造成将军，则没有这步续行。续行不会触发俥·残魂或傌·易位。' },
    { k: 'elephant', ch: '相', name: '渡河', short: '己方兵为 0 时，可斜走一或两格并过河', full: '当己方兵/卒数量为 0 时，相解除过河限制，走法变成斜走一格或两格；走两格时仍然要检查象眼。兵/卒一旦又出现（例如沙盘），就恢复正常限制。第一次解除时，己方所有相会燃起蓝色火焰。' },
    { k: 'advisor', ch: '仕', name: '八面', short: '横、竖、斜走一格，可以走出九宫', full: '士可以横走、竖走、斜走一格，也可以走出九宫。若士在宫外而己方将/帅还在宫内，这枚士不能行动；若将/帅也已出宫，宫外的士只能斜走一格，并留在己方半场。' },
    { k: 'king', ch: '帥', name: '出宫', short: '士 ≤ 1 时，将可出宫，不可过河、不可回宫', full: '当己方士/仕数量 ≤ 1 时，将/帅可以沿横或竖走一格走出九宫。出宫后仍然只能横竖走一格，不能斜走，也不能过河。一旦出宫，就永远不能回到九宫。飞将（将帅照面）照旧。' },
    { k: 'pawnPair', ch: '兵', name: '并肩', short: '过河兵可带相邻兵一起走；被吃时相邻兵后撤一格', full: '兵/卒过河后，若左右相邻格有己方兵/卒，行棋时可以选择带着它们做完全相同的一步（目标必须在盘内、不是己方棋子，遇到敌子一并吃掉），也可以选择独行。同一落点两种走法都成立时会弹出选择。觉醒模式下，任何兵被吃时，被吃格左右相邻的己方兵会立即向己方底线后撤一格；后撤落点若有敌方棋子，会一并吃掉。' },
    { k: 'cannon', ch: '炮', name: '无阻', short: '可越过己方棋子走 1—4 格；吃子仍隔一子', full: '觉醒模式下，炮的普通移动最多走 4 格，并且可以穿过己方棋子继续前进；不能穿过敌方棋子，也不能落在己方棋子所在格。吃子仍然必须隔一个炮架，距离不限，炮架前后都不能再有多余的棋子。' }
  ];

  function buildAwake() {
    var chips = $('#awakeChips');
    if (chips) {
      chips.innerHTML = RULE_ITEMS.map(function (r) {
        return '<button class="aw-chip" data-aw="' + r.k + '" title="' + esc(r.short) + '">' + r.ch + ' ' + r.name + '</button>';
      }).join('');
      chips.addEventListener('click', function (e) {
        var b = e.target.closest('[data-aw]');
        if (!b) return;
        var i = RULE_ITEMS.map(function (x) { return x.k; }).indexOf(b.getAttribute('data-aw'));
        openRules(i);
      });
    }
    var list = $('#awakeRules');
    if (list) {
      list.innerHTML = RULE_ITEMS.map(function (r, i) {
        return '<li data-rule="' + i + '"><b>' + r.ch + '</b><div><span>' + r.name + '</span><p>' + esc(r.short) + '</p></div></li>';
      }).join('');
      list.addEventListener('click', function (e) {
        var li = e.target.closest('[data-rule]');
        if (!li) return;
        openRules(+li.getAttribute('data-rule'));
      });
    }
  }

  function openRules(active) {
    var m = openModal({ id: 'rules', title: '七条觉醒走法', size: 'wide' });
    m.body.innerHTML = '<div class="rule-tabs">' + RULE_ITEMS.map(function (r, i) {
      return '<button class="rule-tab' + (i === active ? ' on' : '') + '" data-i="' + i + '">' + r.ch + '·' + r.name + '</button>';
    }).join('') + '</div>' +
      '<div class="rule-detail" id="ruleDetail"></div>';
    function show(i) {
      var r = RULE_ITEMS[i];
      $('#ruleDetail').innerHTML = '<h3>' + r.ch + ' · ' + r.name + '</h3><p>' + esc(r.full) + '</p>';
      m.body.querySelectorAll('.rule-tab').forEach(function (b, k) { b.classList.toggle('on', k === i); });
    }
    m.body.querySelectorAll('.rule-tab').forEach(function (b) {
      b.addEventListener('click', function () { show(+b.getAttribute('data-i')); });
    });
    show(active || 0);
  }

  /* ---------------- 选择浮层 ---------------- */

  function showChoice(opts) {
    var pop = $('#choicePop');
    var box = $('#choiceList');
    $('#choiceTitle').textContent = opts.title || '选择';
    $('#choiceLead').textContent = opts.lead || '';
    $('#choiceClose').style.display = opts.persistent ? 'none' : '';
    $('#choiceSkip').hidden = !opts.onSkip;
    $('#choiceSkip').onclick = opts.onSkip ? function () { opts.onSkip(); } : null;
    box.innerHTML = '';
    (opts.options || []).forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice-btn';
      b.innerHTML = '<i>' + (o.icon || '·') + '</i><span><b>' + esc(o.title) + '</b><em>' + esc(o.desc || '') + '</em></span>';
      b.addEventListener('click', function () { o.pick(); });
      box.appendChild(b);
    });
    pop.hidden = false;
    root.DFY.Game.state().choosing = true;
  }

  function hideChoice() {
    var pop = $('#choicePop');
    if (pop) pop.hidden = true;
    if (root.DFY.Game.state) root.DFY.Game.state().choosing = false;
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(opts) {
    if (opts.id) {
      var old = document.getElementById(opts.id);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal ' + (opts.size || '');
    if (opts.id) box.id = opts.id;
    box.innerHTML = '<header><h2>' + esc(opts.title || '') + '</h2>' +
      '<button class="modal-x" type="button" aria-label="关闭">×</button></header>' +
      '<div class="modal-body"></div>';
    wrap.appendChild(box);
    var host = $('#modalRoot');
    host.appendChild(wrap);
    var ref = {
      el: wrap,
      box: box,
      body: box.querySelector('.modal-body'),
      close: function () {
        if (!wrap.parentNode) return;
        wrap.parentNode.removeChild(wrap);
        modalStack = modalStack.filter(function (x) { return x !== ref; });
        if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) { } }
      }
    };
    box.querySelector('.modal-x').addEventListener('click', ref.close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) ref.close(); });
    modalStack.push(ref);
    return ref;
  }

  function closeResult() {
    var r = $('#resultWrap');
    if (r) r.remove();
  }

  function showResult(opts) {
    closeResult();
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay result-overlay';
    wrap.id = 'resultWrap';
    wrap.innerHTML = '<div class="result-card">' +
      '<div class="result-gif"><img src="assets/fish/' + opts.gif + '" alt=""></div>' +
      '<h2>' + esc(opts.title) + '</h2>' +
      '<p class="result-why">' + esc(opts.why) + '</p>' +
      '<p class="result-line">' + esc(opts.line) + '</p>' +
      '<div class="result-stats">' +
      '<span>总战绩</span><b>' + opts.record.wins + '</b> 胜 <b>' + opts.record.losses + '</b> 负 <b>' + opts.record.draws + '</b> 和' +
      '</div>' +
      '<div class="row center">' +
      '<button class="btn small" id="resAgain">再来一局</button>' +
      '<button class="btn ghost small" id="resReplay">看复盘</button>' +
      '<button class="btn ghost small" id="resLobby">回大厅</button>' +
      '</div></div>';
    $('#modalRoot').appendChild(wrap);
    wrap.querySelector('#resAgain').addEventListener('click', function () { closeResult(); opts.onAgain(); });
    wrap.querySelector('#resReplay').addEventListener('click', function () { closeResult(); opts.onReplay(); });
    wrap.querySelector('#resLobby').addEventListener('click', function () { closeResult(); opts.onLobby(); });
  }

  /* ---------------- 小工具 ---------------- */

  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function sfx(kind) {
    var conf = settings();
    if (!conf.sound) return;
    var vol = Number(conf.volume);
    if (!isFinite(vol)) vol = 80;
    vol = Math.max(0, Math.min(100, vol)) / 100;
    if (!vol) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var now = audioCtx.currentTime;
      function tone(freq, dur, type, gain, at) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        var peak = Math.max(0.0002, (gain || 0.05) * vol);
        g.gain.setValueAtTime(0.0001, now + (at || 0));
        g.gain.exponentialRampToValueAtTime(peak, now + (at || 0) + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + (at || 0) + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(now + (at || 0)); o.stop(now + (at || 0) + dur + 0.02);
      }
      if (kind === 'move') { tone(660, 0.07, 'triangle', 0.05); tone(320, 0.09, 'sine', 0.03); }
      else if (kind === 'cap') { tone(200, 0.14, 'sawtooth', 0.05); tone(90, 0.16, 'square', 0.03); }
      else if (kind === 'check') { tone(880, 0.09, 'square', 0.04); tone(1180, 0.1, 'square', 0.04, 0.09); }
      else if (kind === 'win') { tone(523, 0.12, 'sine', 0.05); tone(659, 0.12, 'sine', 0.05, 0.12); tone(784, 0.22, 'sine', 0.05, 0.24); }
      else if (kind === 'lose') { tone(392, 0.14, 'sine', 0.05); tone(294, 0.2, 'sine', 0.05, 0.14); }
      else if (kind === 'say') { tone(1040, 0.05, 'sine', 0.025); }
    } catch (e) { }
  }

  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  root.DFY = root.DFY || {};
  root.DFY.App = {
    init: init,
    go: go,
    screen: screen,
    openModal: openModal,
    showResult: showResult,
    closeResult: closeResult,
    showChoice: showChoice,
    hideChoice: hideChoice,
    toast: toast,
    sfx: sfx,
    bubble: bubble,
    askFish: askFish,
    pat: pat,
    hug: hug,
    offerRequest: offerRequest,
    hideRequest: hideRequest,
    bindRequest: bindRequest,
    refreshAffinity: refreshAffinity,
    refreshWinrate: refreshWinrate,
    setBadges: setBadges,
    showAwakePanel: showAwakePanel,
    showUserLine: showUserLine,
    clearUserLine: clearUserLine,
    openSickModal: openSickModal,
    openSettings: openSettings,
    openThanks: openThanks,
    openAffinityHelp: openAffinityHelp,
    openRules: openRules,
    openChat: openChat,
    aiReady: aiReady,
    requireAI: requireAI,
    openConnect: openConnect,
    openGuide: openGuide,
    openIntro: openIntro,
    openUninstall: openUninstall,
    updateAiBadge: updateAiBadge,
    setFishMood: setFishMood,
    setFishBlocking: setFishBlocking,
    showRegret: showRegret,
    hideRegret: hideRegret,
    autoFish: autoFish
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (/[?&]test=1/.test(location.search)) {
    root.DFY.App.__testLive = function () { llmState.live = true; };
  }
})(window);
