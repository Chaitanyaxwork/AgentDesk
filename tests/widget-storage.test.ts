import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function createStorageHelpers(storage: Storage | null) {
  const widget = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');
  const start = widget.indexOf('  // Storage is optional:');
  const end = widget.indexOf('  // 3. Default Configuration', start);
  assert.ok(start >= 0 && end > start, 'widget storage helper block exists');
  const source = widget.slice(start, end);
  const fakeWindow = { localStorage: storage };
  return new Function('window', 'businessId', `${source}; return { getVisitorId, getStoredConversationId, setStoredConversationId };`)(fakeWindow, 'business-a') as {
    getVisitorId: () => string;
    getStoredConversationId: () => string | null;
    setStoredConversationId: (id: string) => void;
  };
}

test('widget storage denial falls back to session memory without breaking initialization', () => {
  const helpers = createStorageHelpers({
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
    removeItem() {},
    clear() {},
    key() { return null; },
    length: 0,
  } as Storage);

  const visitorId = helpers.getVisitorId();
  assert.match(visitorId, /^v_/);
  assert.equal(helpers.getVisitorId(), visitorId);
  assert.equal(helpers.getStoredConversationId(), null);
  helpers.setStoredConversationId('conversation-1');
  assert.equal(helpers.getStoredConversationId(), 'conversation-1');
});

test('widget visitor identifiers are scoped per business', () => {
  const widget = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');
  assert.match(widget, /const VISITOR_KEY = 'agentdesk_visitor_' \+ businessId/);
});
