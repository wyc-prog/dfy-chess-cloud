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
    if (!role) { reply(res, 403, { ok: false, error: '房间身份校验失败' }); return; }
    const target = role === 'host' ? 'guest' : 'host';
    push(room, target, b.data);
    await setJSON(`room:${c}`, room, TTL);
    return reply(res, 200, { ok: true });
  } catch (e) {
    return reply(res, 500, { ok: false, error: e.message || '云端存储不可用' });
  }
};
