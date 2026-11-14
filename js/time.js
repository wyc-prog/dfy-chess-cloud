/* 与大肥鱼一起下象棋 · 现实时间 / 作息 */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // from/to 是小时（含 from，不含 to）；现实时间按本机时区
  var SLOTS = [
    { from: 0, to: 5.5, period: '凌晨', activity: '睡着了，被叫醒会迷迷糊糊', short: '睡着了', greeting: '（揉眼睛）这么晚……', meal: '夜宵', asleep: true, sleepy: true },
    { from: 5.5, to: 7, period: '清晨', activity: '刚醒，还赖在床上', short: '刚醒', greeting: '早呀……', meal: '', sleepy: false },
    { from: 7, to: 9, period: '早上', activity: '在吃早饭（大白饭）', short: '吃早饭', greeting: '早上好', meal: '早饭', sleepy: false },
    { from: 9, to: 11.5, period: '上午', activity: '收拾房间、晒被子', short: '收拾房间', greeting: '上午好', meal: '', sleepy: false },
    { from: 11.5, to: 13.5, period: '中午', activity: '在吃午饭（大白饭）', short: '吃午饭', greeting: '中午好', meal: '午饭', sleepy: false },
    { from: 13.5, to: 15, period: '下午', activity: '午休刚醒，在发呆', short: '午休', greeting: '下午好', meal: '', sleepy: false },
    { from: 15, to: 17.5, period: '下午', activity: '在喝下午茶、看书', short: '下午茶', greeting: '下午好', meal: '下午茶', sleepy: false },
    { from: 17.5, to: 19, period: '傍晚', activity: '在吃晚饭', short: '吃晚饭', greeting: '傍晚好', meal: '晚饭', sleepy: false },
    { from: 19, to: 21, period: '晚上', activity: '洗过澡，换了睡衣', short: '换睡衣', greeting: '晚上好', meal: '', sleepy: false },
    { from: 21, to: 22.5, period: '晚上', activity: '在房间里等你，准备睡觉', short: '准备睡', greeting: '晚上好', meal: '', sleepy: false },
    { from: 22.5, to: 23.5, period: '深夜', activity: '困了，准备睡觉', short: '困了', greeting: '这么晚还不睡？', meal: '夜宵', sleepy: true },
    { from: 23.5, to: 24, period: '深夜', activity: '睡着了，被叫醒会迷迷糊糊', short: '睡着了', greeting: '（揉眼睛）这么晚……', meal: '夜宵', asleep: true, sleepy: true }
  ];

  var SCHEDULE = [
    ['06:30', '起床、洗漱'],
    ['07:00', '早饭（大白饭）'],
    ['09:00', '收拾房间、晒被子'],
    ['11:30', '午饭（大白饭）'],
    ['13:00', '午休 / 发呆'],
    ['15:00', '下午茶、看书、等你'],
    ['17:30', '晚饭'],
    ['19:00', '洗澡、换睡衣'],
    ['20:00', '下棋 / 聊天'],
    ['22:30', '准备睡觉'],
    ['23:30', '睡着了（被叫醒会迷糊）']
  ];

  function slotAt(h) {
    for (var i = 0; i < SLOTS.length; i++) {
      if (h >= SLOTS[i].from && h < SLOTS[i].to) return SLOTS[i];
    }
    return SLOTS[SLOTS.length - 1];
  }

  function info(date) {
    var d = date || new Date();
    var hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
    var h = hh + mm / 60;
    var s = slotAt(h);
    return {
      date: d,
      dateText: d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()],
      weekday: WEEK[d.getDay()],
      timeText: pad(hh) + ':' + pad(mm),
      fullTime: pad(hh) + ':' + pad(mm) + ':' + pad(ss),
      hh: hh,
      mm: mm,
      period: s.period,
      activity: s.activity,
      short: s.short,
      greeting: s.greeting,
      meal: s.meal,
      asleep: !!s.asleep,
      sleepy: !!s.sleepy,
      late: hh >= 23 || hh < 6,
      weekend: d.getDay() === 0 || d.getDay() === 6
    };
  }

  function prompt(t) {
    if (!t) return '';
    return [
      '现实时间：' + t.dateText + ' ' + t.timeText + '（' + t.period + '）。',
      '你现在正在：' + t.activity + '。',
      '你的日常作息：06:30 起床；07:00 早饭（大白饭）；09:00 收拾房间、晒被子；11:30 午饭；13:00 午休；15:00 下午茶、看书；17:30 晚饭；19:00 洗澡、换睡衣；20:00 下棋/聊天；22:30 准备睡觉；23:30 睡着。',
      '按现实时间作息和活动：可以自然带出你正在做什么，但不要每句都报时间；不要编造与当前时间冲突的事；如果用户熬夜，关心他、催他睡；如果半夜被叫醒，会困、声音轻，但仍然温柔。'
    ].join('\n');
  }

  root.DFY = root.DFY || {};
  root.DFY.Time = {
    info: info,
    slotAt: slotAt,
    prompt: prompt,
    SCHEDULE: SCHEDULE,
    SLOTS: SLOTS,
    WEEK: WEEK
  };
})(window);
