#!/usr/bin/env node
// 百炼（DashScope）原生接口的本地转发服务。
// 浏览器无法直连百炼（鉴权头 + 原生协议 + CORS），因此由本地进程转发：
//   qwen-image-2.0 系列 -> 同步 multimodal-generation
//   qwen-image / wanx 系列 -> 异步 text2image + 任务轮询
// 对外暴露 OpenAI 兼容的 /images/generations 形状，前端无需改协议。

const SYNC_PREFIX = /^qwen-image-2\./;
export const SYNC_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
export const ASYNC_PATH = '/api/v1/services/aigc/text2image/image-synthesis';
export const TASK_PATH = '/api/v1/tasks/';
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com';
export const POLL_INTERVAL_MS = 5000;

export function isSyncModel(model) {
  return SYNC_PREFIX.test(String(model || '').trim());
}

export function normalizeSize(size) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(size || '').trim());
  return m ? m[1] + '*' + m[2] : '';
}

export function buildDashScopeSubmit({model, prompt, size = ''}, {baseUrl = DEFAULT_BASE_URL} = {}) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const headers = {'Content-Type': 'application/json'};
  const dashSize = normalizeSize(size);
  if (isSyncModel(model)) {
    const parameters = {};
    if (dashSize) parameters.size = dashSize;
    return {
      mode: 'sync',
      url: base + SYNC_PATH,
      init: {
        method: 'POST',
        headers,
        body: {model, input: {messages: [{role: 'user', content: [{text: prompt}]}]}, parameters}
      }
    };
  }
  const parameters = dashSize ? {n: 1, size: dashSize} : {n: 1};
  headers['X-DashScope-Async'] = 'enable';
  return {
    mode: 'async',
    url: base + ASYNC_PATH,
    init: {method: 'POST', headers, body: {model, input: {prompt}, parameters}}
  };
}

export function readSyncImage(json) {
  if (json?.code && !json?.output) throw new Error(String(json.message || json.code));
  const image = json?.output?.choices?.[0]?.message?.content?.[0]?.image;
  if (typeof image === 'string' && image) return image;
  throw new Error('模型没有返回图片：' + (json?.message || '请稍后重试或更换模型。'));
}

export function readTaskState(json) {
  const out = json?.output || {};
  const status = String(out.task_status || '').toUpperCase();
  if (status === 'SUCCEEDED') {
    const image = out.choices?.[0]?.message?.content?.[0]?.image;
    if (typeof image === 'string' && image) return {status: 'done', image};
    return {status: 'failed', message: '任务已完成但没有返回图片。'};
  }
  if (status === 'FAILED') return {status: 'failed', message: String(json?.message || out.message || '任务执行失败。')};
  if (status === 'CANCELED') return {status: 'failed', message: '任务已取消'};
  if (status === 'UNKNOWN') return {status: 'failed', message: '任务 ID 不存在或已过期。'};
  return {status: 'pending'};
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (status, body) => ({status, headers: {...CORS, 'Content-Type': 'application/json'}, json: body});
const fail = (status, message, type = 'invalid_request_error') => json(status, {error: {message, type}});

function bearer(headers) {
  const raw = headers?.authorization || headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1].trim() : '';
}

function upstreamMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return String(body.message || body.error?.message || body.code || '');
}

async function readUpstream(response) {
  try { return await response.json(); } catch { return null; }
}

export async function handleRequest({method, path, headers = {}, body = null}, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const baseUrl = deps.baseUrl || DEFAULT_BASE_URL;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  if (method === 'OPTIONS') return {status: 204, headers: {...CORS}, json: null};
  if (path === '/models' || path === '/v1/models') {
    if (!bearer(headers)) return fail(401, '缺少 API Key：请在设置页填写百炼 API Key。', 'authentication_error');
    return json(200, {data: [{id: 'qwen-image-2.0-pro', object: 'model'}, {id: 'qwen-image', object: 'model'}]});
  }
  if (method !== 'POST' || path !== '/api/generate') return fail(404, '未知接口：请使用 POST /api/generate。');
  const apiKey = bearer(headers);
  if (!apiKey) return fail(401, '缺少 API Key：请在设置页填写百炼 API Key。', 'authentication_error');
  const model = String(body?.model || '').trim();
  const prompt = String(body?.prompt || '').trim();
  if (!model) return fail(400, '缺少 model 参数。');
  if (!prompt) return fail(400, '缺少 prompt 参数。');
  const submit = buildDashScopeSubmit({model, prompt, size: body?.size}, {baseUrl});
  let response;
  try {
    response = await fetchImpl(submit.url, {
      method: submit.init.method,
      headers: {...submit.init.headers, Authorization: 'Bearer ' + apiKey},
      body: JSON.stringify(submit.init.body)
    });
  } catch (err) {
    return fail(502, '无法连接百炼服务（网络不可达或超时）：' + String(err?.message || err), 'upstream_error');
  }
  const first = await readUpstream(response);
  if (!response.ok) return fail(response.status === 401 || response.status === 403 ? 401 : 502, upstreamMessage(first) || ('百炼返回 HTTP ' + response.status), 'upstream_error');
  if (submit.mode === 'sync') {
    try {
      return json(200, {created: Math.floor(Date.now() / 1000), data: [{url: readSyncImage(first), mime_type: 'image/png'}]});
    } catch (err) {
      return fail(502, String(err.message || err), 'upstream_error');
    }
  }
  const taskId = first?.output?.task_id;
  if (!taskId) return fail(502, upstreamMessage(first) || '百炼未返回任务 ID。', 'upstream_error');
  const maxPolls = deps.maxPolls || 120;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(deps.pollIntervalMs || POLL_INTERVAL_MS);
    let polled;
    try {
      polled = await fetchImpl(baseUrl.replace(/\/+$/, '') + TASK_PATH + encodeURIComponent(taskId), {method: 'GET', headers: {Authorization: 'Bearer ' + apiKey}});
    } catch (err) {
      return fail(502, '轮询百炼任务失败（网络中断）：' + String(err?.message || err), 'upstream_error');
    }
    const payload = await readUpstream(polled);
    if (!polled.ok) return fail(502, upstreamMessage(payload) || ('轮询任务返回 HTTP ' + polled.status), 'upstream_error');
    const state = readTaskState(payload);
    if (state.status === 'done') return json(200, {created: Math.floor(Date.now() / 1000), data: [{url: state.image, mime_type: 'image/png'}]});
    if (state.status === 'failed') return fail(502, state.message, 'upstream_error');
  }
  return fail(504, '任务在等待时间内仍未完成，请稍后在百炼控制台查看任务结果，勿重复提交以免重复扣费。', 'timeout_error');
}
