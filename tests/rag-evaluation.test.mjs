import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/agentdesk-rag-eval.json', import.meta.url), 'utf8'));

test('RAG evaluation fixture has versioned train and held-out synthetic multi-business cases', () => {
  assert.equal(fixture.version, 2);
  assert.ok(fixture.businesses.filter((business) => business.id !== 'tenant-b').length >= 3);
  assert.ok(fixture.cases.length >= 100);
  assert.ok(fixture.cases.some((item) => item.split === 'train'));
  assert.ok(fixture.cases.some((item) => item.split === 'heldout'));
  assert.equal(new Set(fixture.cases.map((item) => item.id)).size, fixture.cases.length);
  const docOwners = new Map(fixture.documents.map((document) => [document.id, document.business_id]));
  for (const item of fixture.cases) {
    assert.ok(item.reference_answer, `${item.id} needs a reference answer`);
    assert.ok(item.expected_behavior, `${item.id} needs expected behavior`);
    assert.ok(Array.isArray(item.supporting_source_ids), `${item.id} needs explicit support ids`);
    for (const sourceId of item.supporting_source_ids) {
      assert.equal(docOwners.get(sourceId), item.business_id, `${item.id} references a source from another tenant`);
    }
  }
});

test('offline RAG evaluator keeps held-out measurements separate from parameter selection', () => {
  const result = spawnSync(process.execPath, ['scripts/evaluate-rag.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dataset.cases, fixture.cases.length);
  assert.equal(report.dataset.heldoutCases, fixture.cases.filter((item) => item.split === 'heldout').length);
  assert.deepEqual(new Set(report.heldoutEvaluation.caseIds), new Set(fixture.cases.filter((item) => item.split === 'heldout').map((item) => item.id)));
  assert.match(report.methodology.qualityLimit, /not answer correctness/);
});
