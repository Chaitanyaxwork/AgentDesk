import test from 'node:test';
import assert from 'node:assert/strict';
import { aiModels } from '../src/lib/ai-policy.ts';

test('AI defaults use the selected current generation and 768-dimension embedding IDs', () => {
  const generation = process.env.GEMINI_GENERATION_MODEL;
  const embedding = process.env.GEMINI_EMBEDDING_MODEL;
  const dimensions = process.env.GEMINI_EMBEDDING_DIMENSIONS;
  delete process.env.GEMINI_GENERATION_MODEL;
  delete process.env.GEMINI_EMBEDDING_MODEL;
  delete process.env.GEMINI_EMBEDDING_DIMENSIONS;
  try {
    assert.equal(aiModels().generation, 'gemini-3.8-flash');
    assert.equal(aiModels().embedding, 'gemini-embedding-2');
    assert.equal(aiModels().embeddingDimensions, 768);
  } finally {
    if (generation === undefined) delete process.env.GEMINI_GENERATION_MODEL;
    else process.env.GEMINI_GENERATION_MODEL = generation;
    if (embedding === undefined) delete process.env.GEMINI_EMBEDDING_MODEL;
    else process.env.GEMINI_EMBEDDING_MODEL = embedding;
    if (dimensions === undefined) delete process.env.GEMINI_EMBEDDING_DIMENSIONS;
    else process.env.GEMINI_EMBEDDING_DIMENSIONS = dimensions;
  }
});
