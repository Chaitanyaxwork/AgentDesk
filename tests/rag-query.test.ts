import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRetrievalQuery } from '../src/lib/rag-query.ts';

test('retrieval query preserves the current question and adds recent history for follow-ups', () => {
  const query = buildRetrievalQuery('And what about renewals?', [
    { role: 'user', content: 'Where do I find an invoice?' },
    { role: 'assistant', content: 'Invoices are available in Billing.' },
  ]);
  assert.ok(query.startsWith('Latest user question: And what about renewals?'));
  assert.match(query, /USER: Where do I find an invoice\?/);
  assert.match(query, /ASSISTANT: Invoices are available in Billing\./);
});

test('retrieval history is bounded and the most recent context is retained', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({ role: 'user', content: `turn-${index} ${'context '.repeat(100)}` }));
  const query = buildRetrievalQuery('latest question', history);
  const context = query.split('\nRecent conversation: ')[1];
  assert.ok(context.length <= 1_200);
  assert.match(context, /turn-9/);
  assert.doesNotMatch(context, /turn-0/);
  assert.ok(query.startsWith('Latest user question: latest question'));
});

test('retrieval query stays unchanged when no usable history exists', () => {
  assert.equal(buildRetrievalQuery('  shipping cost?  ', []), 'shipping cost?');
  assert.equal(buildRetrievalQuery('shipping cost?', [{ role: 'assistant', content: '  ' }]), 'shipping cost?');
});
