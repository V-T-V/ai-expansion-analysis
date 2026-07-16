/* ============================================================================
 * HTTP 工具  (sources/_http.js)
 * 带超时的 GET + 内存缓存 + 指数退避重试 + 并发限流
 * Node 18+ 内置 fetch，无需依赖。
 * ============================================================================ */
'use strict';

const DEFAULT_TIMEOUT = 12000;
const DEFAULT_RETRIES = 2;

/* ---- 内存缓存：同一次 run 内 URL 复用，减少对外部 API 的重复请求 ----------- *
 * 仅缓存 GET；带 ttl；进程结束即失效。避免重试/并发命中同一端点。
 */
const _cache = new Map(); // url -> { ts, data }
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function cacheGet(url) {
  const e = _cache.get(url);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(url); return null; }
  return e.data;
}
function cacheSet(url, data) { _cache.set(url, { ts: Date.now(), data }); }
function clearCache() { _cache.clear(); }

/* ---- 并发限流：保证同时活跃的请求数不超过 concurrency -------------------- *
 * 对 GitHub（无 key 配额低）尤其重要，避免一窝蜂触发 429/二次限速。
 * 关键：任务完成时（无论成功/失败）必须 release 槽位并唤醒队列下一个，
 *       否则会在 maxConcurrent 之后永久死锁。
 */
function makeLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  function release() {
    active--;
    const next = queue.shift();
    if (next) { active++; next(); }   // 唤醒下一个，并重新占槽
  }
  // acquire(fn): fn 接收一个 release 回调，任务结束后必须调用它
  return function acquire(fn) {
    const run = () => fn(release);
    if (active < maxConcurrent) { active++; run(); }
    else queue.push(run);
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 核心请求：超时 + 指数退避重试 --------------------------------------- */
async function request(url, { timeout = DEFAULT_TIMEOUT, headers = {}, retries = DEFAULT_RETRIES, cache = true } = {}) {
  if (cache) {
    const hit = cacheGet(url);
    if (hit !== null) return hit;
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ai-expansion-engine/1.0 (+research)', ...headers }
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        // 限速/服务端错误 → 退避重试
        lastErr = new Error('HTTP ' + res.status);
        if (attempt < retries) { await sleep(400 * Math.pow(2, attempt)); continue; }
        return null;
      }
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      let data;
      if (ct.includes('json')) data = await res.json();
      else { const txt = await res.text(); try { data = JSON.parse(txt); } catch { data = txt; } }
      if (cache) cacheSet(url, data);
      return data;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < retries) { await sleep(400 * Math.pow(2, attempt)); continue; }
    }
  }
  return null;
}

async function getJSON(url, opts = {}) {
  const r = await request(url, opts);
  return (r && typeof r === 'object') ? r : null;
}

async function getText(url, opts = {}) {
  // 文本响应不缓存（RSS 等），避免重试时拿到过期内容判断
  const o = Object.assign({ cache: false }, opts);
  for (let attempt = 0; attempt <= (o.retries != null ? o.retries : DEFAULT_RETRIES); attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout || DEFAULT_TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ai-expansion-engine/1.0 (+research)', ...(o.headers || {}) }
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        if (attempt < (o.retries != null ? o.retries : DEFAULT_RETRIES)) { await sleep(400 * Math.pow(2, attempt)); continue; }
        return null;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      clearTimeout(timer);
      if (attempt < (o.retries != null ? o.retries : DEFAULT_RETRIES)) { await sleep(400 * Math.pow(2, attempt)); continue; }
      return null;
    }
  }
  return null;
}

module.exports = {
  getJSON, getText, clearCache,
  makeLimiter, sleep
};
