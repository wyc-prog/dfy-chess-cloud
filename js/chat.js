/* 与大肥鱼一起下象棋 · 聊聊模式 */
(function (root) {
  'use strict';
  var Store = root.DFY.Store;
  var Fish = root.DFY.Fish;
  var App = null;

  var log = [];
  var typingEl = null;
  var els = {};

  function $(s) { return document.querySelector(s); }
  function app() { return App || (App = root.DFY.App); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    els.log = $('#chatLog');
    els.form = $('#chatForm');
    els.input = $('#chatInput');
    els.send = $('#chatSend');
    els.quick = $('#chatQuick');
    if (!els.form) return;
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = els.input.value.trim();
      if (!text) return;
      els.input.value = '';
      app().askFish(text);
    });
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        els.form.dispatchEvent(new Event('submit'));
      }
    });
    $('#chatBack').addEventListener('click', function () { app().go('lobby'); });
    $('#btnChatPat').addEventListener('click', function () { app().pat(); });
    $('#btnChatHug').addEventListener('click', function () { app().hug(); });
    $('#btnAffHelp').addEventListener('click', function () { app().openAffinityHelp(); });
    $('#btnChatSettings').addEventListener('click', function () { app().openSettings(); });
    if (els.quick) {
      els.quick.addEventListener('click', function (e) {
        var b = e.target.closest('[data-say]');
        if (!b) return;
        var text = b.getAttribute('data-say');
        app().askFish(text);
      });
    }
  }

  function open() {
    app().go('chat');
    app().setFishMood('normal');
    if (!log.length) {
      var t = root.DFY.Time ? root.DFY.Time.info() : null;
      var hellos;
      if (t && t.asleep) {
        hellos = ['（揉眼睛）这么晚还没睡……我本来都睡着了。', '这么晚……你是睡不着，还是想我了？'];
      } else if (t && (t.period === '清晨' || t.period === '早上')) {
        hellos = ['早上好……我刚洗漱完，头发还没梳好。', '早呀，今天醒得真早。'];
      } else if (t && t.period === '中午') {
        hellos = ['中午好，我正要吃午饭。你吃了吗？', '（捧著碗）中午好……要不要一起吃点？'];
      } else if (t && t.period === '下午') {
        hellos = ['下午好……我刚刚在发呆。', '（打了个哈欠）下午好，你来啦。'];
      } else if (t && (t.period === '傍晚' || t.period === '晚上')) {
        hellos = ['晚上好……我刚换了睡衣。', '天黑了，今天过得怎么样？'];
      } else if (t && t.period === '深夜') {
        hellos = ['这么晚还不睡？我陪你一会儿。', '（揉眼睛）深夜了……你还不困吗？'];
      } else {
        hellos = ['你回来啦，我刚好把房间收拾好。', '（抬头）今天想陪我聊些什么？', '我把窗边的花浇了，想让你坐得舒服一点。'];
      }
      var hello = pick(hellos);
      push('fish', hello);
      var st = Math.random() < 0.05 ? Fish.stickerFor('happy', hello) : null;
      app().bubble(hello, st, { log: false });
    } else {
      var last = log.filter(function (m) { return m.role === 'fish'; }).pop();
      if (last) app().bubble(last.text, null, { log: false });
    }
    render();
    setTimeout(function () { els.input && els.input.focus(); }, 300);
  }

  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  function push(role, text, renderNow) {
    log.push({ role: role, text: String(text || '') });
    while (log.length > 60) log.shift();
    if (renderNow !== false) render();
  }

  function getLog() { return log.slice(); }
  function setLog(arr) {
    log = Array.isArray(arr) ? arr.slice(-60) : [];
    render();
  }

  function render() {
    if (!els.log) return;
    els.log.innerHTML = '';
    log.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'chat-row ' + (m.role === 'user' ? 'me' : 'her');
      if (m.role === 'user') {
        row.innerHTML = '<div class="chat-bubble me">' + esc(m.text) + '</div>';
      } else {
        row.innerHTML = '<img class="chat-ava" src="assets/fish/face.png" alt="大肥鱼">' +
          '<div class="chat-bubble her">' + esc(m.text) + '</div>';
      }
      els.log.appendChild(row);
    });
    if (log.length <= 2) {
      var hint = document.createElement('div');
      hint.className = 'chat-empty';
      hint.innerHTML = '<img src="assets/fish/face.png" alt="大肥鱼">' +
        '<p>想说什么都可以，她一直在听。</p>' +
        '<span>也可以试试下面的快捷话题，或者点「摸摸头」。</span>';
      els.log.appendChild(hint);
    }
    els.log.scrollTop = els.log.scrollHeight;
  }

  function setTyping(on) {
    if (!els.log) return;
    if (typingEl) { typingEl.remove(); typingEl = null; }
    if (!on) return;
    typingEl = document.createElement('div');
    typingEl.className = 'chat-row her';
    typingEl.innerHTML = '<img class="chat-ava" src="assets/fish/face.png" alt="大肥鱼">' +
      '<div class="chat-bubble her typing"><i></i><i></i><i></i></div>';
    els.log.appendChild(typingEl);
    els.log.scrollTop = els.log.scrollHeight;
  }

  root.DFY = root.DFY || {};
  root.DFY.Chat = {
    init: init,
    open: open,
    push: push,
    render: render,
    getLog: getLog,
    setLog: setLog,
    setTyping: setTyping,
    typing: function (on) { setTyping(on); }
  };
})(window);
