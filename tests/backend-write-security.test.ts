import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { isSameOriginWrite } from '../src/lib/request-security.ts';

test('dashboard mutations reject foreign origins while preserving same-origin and non-browser requests', () => {
  const request = (origin?: string) => ({
    headers: new Headers(origin ? { origin } : {}),
    nextUrl: new URL('https://app.agentdesk.example/api/sources'),
  }) as unknown as NextRequest;
  const foreign = request('https://attacker.example');
  const sameOrigin = request('https://app.agentdesk.example');
  const noOrigin = request();

  assert.equal(isSameOriginWrite(foreign), false);
  assert.equal(isSameOriginWrite(sameOrigin), true);
  assert.equal(isSameOriginWrite(noOrigin), true);
});

test('source creation, deletion and re-index routes enforce the shared origin guard', () => {
  const routes = [
    readFileSync(new URL('../src/app/api/sources/route.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/app/api/sources/[id]/rescrape/route.ts', import.meta.url), 'utf8'),
  ];
  assert.match(routes[0], /export async function POST\(req: NextRequest\) \{\s*if \(!isSameOriginWrite\(req\)\)/);
  assert.match(routes[0], /export async function DELETE\(req: NextRequest\) \{\s*if \(!isSameOriginWrite\(req\)\)/);
  assert.match(routes[1], /export async function POST\([\s\S]*?if \(!isSameOriginWrite\(req\)\)/);
});
