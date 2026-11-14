const { TTL, getJSON, setJSON, reply, auth } = require('../../lib/online');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { reply(res, 204, {}); return; }
  if (req.method !== 'GET') { reply(res, 405, { ok: false, error: 'GET only' }); return; }
  try {
    const q = req.query || {};
    const c = String(q.room || '').trim().toUpperCase();
    const token = String(q.token || '');
    const since = Number(q.since || 0) || 0;
    const room = await getJSON(`room:${c}`);
    const role = auth(room, token);
    if (!role) { reply(res, 404, { ok: false, error: '房间不存在或身份失效' }); return; }
    const now = Date.now();
    if (role === 'host') room.hostSeen = now;
    else room.guestSeen = now;
    const events = (room.events[role] || []).filter((ev) => ev && ev.id > since);
    await setJSON(`room:${c}`, room, TTL);
    return reply(res, 200, {
      ok: true,
      events,
      guestJoined: !!room.guestJoined,
      hostPresent: now - (room.hostSeen || 0) < 20000,
      guestPresent: now - (room.guestSeen || 0) < 20000,
      closed: !!room.closed
    });
  } catch (e) {
    return reply(res, 500, { ok: false, error: e.message || '云端存储不可用' });
  }
};
