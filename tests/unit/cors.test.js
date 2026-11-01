import test from 'node:test';
import assert from 'node:assert/strict';
import { cors } from '../../backend/src/cors.js';

function run(method, origin, allowed = ['http://localhost:5000']) {
  const headers = {};
  let status = null; let nexted = false;
  const res = { setHeader: (k, v) => { headers[k] = v; }, status(c) { status = c; return this; }, end() { return this; } };
  cors(allowed)({ method, headers: origin ? { origin } : {} }, res, () => { nexted = true; });
  return { headers, status, nexted };
}

test('asal yang diizinkan mendapat header CORS', () => {
  const r = run('POST', 'http://localhost:5000');
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'http://localhost:5000');
  assert.equal(r.nexted, true);
});
test('asal lain tidak mendapat header CORS', () => {
  const r = run('POST', 'https://jahat.example');
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});
test('preflight dijawab 204 tanpa meneruskan permintaan', () => {
  const r = run('OPTIONS', 'http://localhost:5000');
  assert.equal(r.status, 204);
  assert.equal(r.nexted, false);
  assert.ok(r.headers['Access-Control-Allow-Headers'].includes('Authorization'));
});
test('tanpa asal (curl/server) tetap diteruskan', () => {
  assert.equal(run('POST', undefined).nexted, true);
});
