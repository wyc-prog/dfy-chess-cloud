const { getJSON, setJSON } = require('./redis');

const TTL = 2 * 60 * 60;
const MAX_EVENTS = 200;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function reply(res, status, obj) {
  cors(res);
  return res.status(status).json(obj);
}

function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function auth(room, token) {
  if (!room || !token) return null;
  if (String(room.hostToken) === String(token)) return 'host';
  if (room.guestToken && String(room.guestToken) === String(token)) return 'guest';
  return null;
}

function push(room, role, data) {
  room.seq = (room.seq || 0) + 1;
  room.events[role].push({ id: room.seq, data });
  if (room.events[role].length > MAX_EVENTS) {
    room.events[role] = room.events[role].slice(-MAX_EVENTS);
  }
  room.touched = Date.now();
}

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch (e) { return {}; }
}

module.exports = { TTL, getJSON, setJSON, reply, origin, auth, push, code, body };
