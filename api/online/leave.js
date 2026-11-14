const { TTL, getJSON, setJSON, reply, auth, push, body } = require('../../lib/online');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { reply(res, 204, {}); return; }
  if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'POST only' }); return; }
  try {
    const b = body(req);
    const c = String(b.room || '').trim().toUpperCase();
    const token = String(b.token || '');
    const room = await getJSON(`room:${c}`);
    const role = auth(room, token);
    if (!room || !role) { reply(res, 200, { ok: true }); return; }
    push(room, role === 'host' ? 'guest' : 'host', { type: 'leave', role });
    if (role === 'host') room.closed = true;
    else { room.guestJoined = false; room.guestSeen = 0; room.guestToken = null; }
    await setJSON(`room:${c}`, room, TTL);
    return reply(res, 200, { ok: true });
  } catch (e) {
    return reply(res, 500, { ok: false, error: e.message || '云端存储不可用' });
  }
};
