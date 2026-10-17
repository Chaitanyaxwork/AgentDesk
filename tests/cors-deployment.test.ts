import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { corsHeaders } from '../src/lib/cors-policy.ts';

test('global deployment headers do not conflict with per-business widget CORS', async () => {
  const configUrl = pathToFileURL(`${process.cwd()}/next.config.mjs`).href;
  const { default: config } = await import(configUrl);
  const routes = await config.headers();
  const values = routes.flatMap((route: { headers: Array<{ key: string; value: string }> }) => route.headers);
  assert.ok(values.some((header: { key: string }) => header.key === 'X-Content-Type-Options'));
  assert.ok(!values.some((header: { key: string }) => header.key.toLowerCase().startsWith('access-control-')));
});

test('widget preflight permits only non-credentialed public widget methods', () => {
  assert.equal(corsHeaders['Access-Control-Allow-Origin'], '*');
  assert.equal(corsHeaders['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
  assert.equal(corsHeaders['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal('Access-Control-Allow-Credentials' in corsHeaders, false);
  assert.equal(corsHeaders.Vary, 'Origin');
  const implementation = readFileSync(new URL('../src/lib/cors.ts', import.meta.url), 'utf8');
  assert.match(implementation, /status: 204/);
  assert.match(implementation, /headers: corsHeaders/);
});

test('human escalation supports the same browser preflight as chat', () => {
  const source = readFileSync(new URL('../src/app/api/widget/escalate/route.ts', import.meta.url), 'utf8');
  assert.match(source, /export async function OPTIONS\(\)\s*\{\s*return handleOptions\(\);\s*\}/);
});
