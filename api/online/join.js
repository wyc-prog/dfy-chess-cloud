const { TTL, getJSON, setJSON, reply, origin, push, body } = require('../../lib/online');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { reply(res, 204, {}); return; }
  if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'POST only' }); return; }
  try {
    const b = body(req);
    const c = String(b.room || '').trim().toUpperCase();
    const room = await getJSON(`room:${c}`);
    if (!room) { reply(res, 404, { ok: false, error: '房间不存在或已过期' }); return; }
    const now = Date.now();
    if (room.guestToken && now - (room.guestSeen || 0) < 20000) {
      reply(res, 409, { ok: false, error: '房间已有玩家' }); return;
    }
    const token = crypto.randomUUID();
    room.guestToken = token;
    room.guestSeen = now;
    room.guestJoined = true;
    room.closed = false;
    room.touched = now;
    room.guestName = String(b.name || '玩家').slice(0, 24);
    push(room, 'host', { type: 'join' });
    await setJSON(`room:${c}`, room, TTL);
    const url = origin(req);
    return reply(res, 200, {
      ok: true, room: c, token, role: 'guest',
      server: { url, urls: [url], public: true },
      hostPresent: now - (room.hostSeen || 0) < 20000
    });
  } catch (e) {
    return reply(res, 500, { ok: false, error: e.message || '云端存储不可用' });
  }
};
