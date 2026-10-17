import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCitedSources, NO_GROUNDED_ANSWER } from '../src/lib/rag-citations.ts';

const chunk = {
  id: 'chunk-1',
  source_id: 'source-1',
  business_id: 'business-1',
  content: 'Returns are accepted within thirty days for unused items.',
  metadata: { title: 'Returns', url: 'https://shop.example/returns' },
  similarity: 0.9,
};

test('only explicit in-range citations become public sources', () => {
  const result = attachCitedSources('Unused items may be returned within thirty days. [S1]', [chunk]);
  assert.equal(result.answer, 'Unused items may be returned within thirty days.');
  assert.deepEqual(result.sources, [{ title: 'Returns', url: 'https://shop.example/returns' }]);
});

test('answer without a valid supporting citation fails closed', () => {
  for (const answer of [
    'Unused items may be returned within thirty days.',
    'The policy allows returns within thirty days. [S2]',
    'The policy guarantees free refunds tomorrow. [S1]',
  ]) {
    assert.deepEqual(attachCitedSources(answer, [chunk]), { answer: NO_GROUNDED_ANSWER, sources: [] });
  }
});

test('citations require a safe HTTP(S) source URL', () => {
  const unsafeChunk = { ...chunk, metadata: { title: 'Returns', url: 'javascript:alert(1)' } };
  assert.deepEqual(attachCitedSources('Unused items are eligible for returns. [S1]', [unsafeChunk]), {
    answer: NO_GROUNDED_ANSWER,
    sources: [],
  });
});
