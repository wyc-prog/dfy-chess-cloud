const BASE = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function cmd(...parts) {
  if (!BASE || !TOKEN) throw new Error('缺少 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const path = parts.map((p) => encodeURIComponent(String(p))).join('/');
  const r = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store'
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

async function getJSON(key) {
  const raw = await cmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function setJSON(key, value, ttl) {
  return cmd('SET', key, JSON.stringify(value), 'EX', String(ttl || 7200));
}

module.exports = { cmd, getJSON, setJSON };
