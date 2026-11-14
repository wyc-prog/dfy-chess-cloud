const { TTL, getJSON, setJSON, reply, origin, code, body } = require('../../lib/online');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { reply(res, 204, {}); return; }
  if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'POST only' }); return; }
  try {
    const c = code();
    const existing = await getJSON(`room:${c}`);
    if (existing) { reply(res, 409, { ok: false, error: '房间号冲突，请重试' }); return; }
    const now = Date.now();
    const room = {
      code: c,
      hostToken: crypto.randomUUID(),
      guestToken: null,
      guestJoined: false,
      hostSeen: now,
      guestSeen: 0,
      seq: 0,
      events: { host: [], guest: [] },
      touched: now,
      closed: false,
      hostName: String(body(req).name || '房主').slice(0, 24),
      guestName: ''
    };
    await setJSON(`room:${c}`, room, TTL);
    const url = origin(req);
    return reply(res, 200, {
      ok: true, room: c, token: room.hostToken, role: 'host',
      server: { url, urls: [url], public: true }
    });
  } catch (e) {
    return reply(res, 500, { ok: false, error: e.message || '云端存储不可用' });
  }
};
