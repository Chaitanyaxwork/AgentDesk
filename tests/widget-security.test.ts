import test from 'node:test';
import assert from 'node:assert/strict';
import { isWidgetOriginAllowed } from '../src/lib/widget-security.ts';

test('widget origin matching requires the registered host and port', () => {
  assert.equal(isWidgetOriginAllowed('https://www.example.com', 'https://example.com'), true);
  assert.equal(isWidgetOriginAllowed('https://example.com:8443', 'https://example.com'), false);
  assert.equal(isWidgetOriginAllowed('https://example.com:8443', 'https://example.com:8443'), true);
  assert.equal(isWidgetOriginAllowed('https://example.com:9443', 'https://example.com:8443'), false);
  assert.equal(isWidgetOriginAllowed('https://example.com.', 'https://www.example.com'), true);
  assert.equal(isWidgetOriginAllowed('https://example.com.attacker.test', 'https://example.com'), false);
});
