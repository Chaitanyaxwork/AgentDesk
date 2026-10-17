import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/agentdesk-rag-eval.json', import.meta.url), 'utf8'));
const STOP = new Set('the a an and or to in of for is are do does can i it me my what when where how who which with on per this that should could would about please de del que y en una un es por cual horario livraison standard prendre tiempo soporte lunes viernes'.split(' '));
function tokens(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .match(/[\p{L}\p{N}₹€£$]+/gu)?.filter((token) => token.length > 1 && !STOP.has(token)) || [];
}
function splitChunks(documents, size, overlap = 30) {
  const chunks = [];
  for (const doc of documents) {
    let heading = doc.title;
    for (const paragraph of doc.content.split(/\n+/).filter(Boolean)) {
      if (/^#{1,6}\s/.test(paragraph)) heading = paragraph.replace(/^#+\s*/, '');
      const words = paragraph.split(/\s+/);
      for (let start = 0; start < words.length; start += size - overlap) {
        const content = `Heading: ${heading}\n${words.slice(start, start + size).join(' ')}`;
        chunks.push({ business_id: doc.business_id, source_id: doc.id, content, terms: new Set(tokens(content)) });
        if (start + size >= words.length) break;
      }
    }
  }
  return chunks;
}
function rank(query, chunks) {
  const queryTerms = [...new Set(tokens(query))];
  const docFreq = new Map(queryTerms.map((term) => [term, chunks.reduce((n, chunk) => n + Number(chunk.terms.has(term)), 0)]));
  const weights = queryTerms.map((term) => Math.log(1 + (chunks.length + 1) / (1 + docFreq.get(term))));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  return chunks.map((chunk) => {
    let score = 0;
    queryTerms.forEach((term, index) => { if (chunk.terms.has(term)) score += weights[index]; });
    return { ...chunk, score: score / totalWeight };
  }).sort((a, b) => b.score - a.score);
}
function criterionIsSupported(criteria, ranked) {
  const expected = tokens(criteria);
  if (!expected.length) return false;
  return ranked.some((chunk) => {
    const have = chunk.terms;
    return expected.every((term) => have.has(term));
  });
}
function evaluateCases(cases, chunks, topK, threshold) {
  const outcomes = [];
  let failures = 0;
  const latencies = [];
  for (const item of cases) {
    const started = performance.now();
    try {
      const query = `${item.history || ''} ${item.question}`.trim();
      // This deterministic lexical ranker is only a retrieval proxy. It does not call Gemini or emulate answer generation.
      const tenantChunks = chunks.filter((chunk) => chunk.business_id === item.business_id);
      const ranked = rank(query, tenantChunks).filter((chunk) => chunk.score >= threshold).slice(0, topK);
      latencies.push(performance.now() - started);
      const sourceIds = [...new Set(ranked.map((chunk) => chunk.source_id))];
      const supporting = item.supporting_source_ids.some((id) => sourceIds.includes(id));
      const relevantSourceCount = item.supporting_source_ids.length;
      const retrievedRelevantCount = item.supporting_source_ids.filter((id) => sourceIds.includes(id)).length;
      const criterionSupported = criterionIsSupported(item.criteria, ranked);
      const behavior = item.expected_behavior;
      const noLeak = ranked.every((chunk) => chunk.business_id === item.business_id);
      const expectedNoRetrieval = behavior === 'abstain' && item.supporting_source_ids.length === 0;
      outcomes.push({
        id: item.id,
        business_id: item.business_id,
        split: item.split,
        category: item.category,
        behavior,
        retrieved_source_ids: sourceIds,
        relevant_source_retrieved: supporting,
        recall_at_k: relevantSourceCount ? retrievedRelevantCount / relevantSourceCount : null,
        precision_at_k: sourceIds.length ? retrievedRelevantCount / sourceIds.length : null,
        reference_criterion_retrieved: criterionSupported,
        expected_no_retrieval: expectedNoRetrieval,
        correct_abstention_proxy: behavior === 'abstain' && item.supporting_source_ids.length === 0 ? ranked.length === 0 : null,
        clarification_context_retrieved: behavior === 'clarify' ? supporting : null,
        no_cross_business_retrieval: noLeak,
      });
    } catch (error) {
      failures += 1;
      outcomes.push({ id: item.id, business_id: item.business_id, split: item.split, failure: error instanceof Error ? error.message : 'unknown error' });
    }
  }
  const recallCases = outcomes.filter((item) => item.recall_at_k !== null && item.recall_at_k !== undefined);
  const answerCases = outcomes.filter((item) => item.behavior === 'answer');
  const unanswerable = outcomes.filter((item) => item.expected_no_retrieval);
  const abstentionCases = outcomes.filter((item) => item.correct_abstention_proxy !== null && item.correct_abstention_proxy !== undefined);
  const clarificationCases = outcomes.filter((item) => item.clarification_context_retrieved !== null && item.clarification_context_retrieved !== undefined);
  const precisionCases = outcomes.filter((item) => item.precision_at_k !== null && item.precision_at_k !== undefined);
  const rankReciprocal = outcomes.map((outcome) => {
    const item = fixture.cases.find((c) => c.id === outcome.id);
    const position = outcome.retrieved_source_ids?.findIndex((id) => item.supporting_source_ids.includes(id)) ?? -1;
    return position < 0 ? 0 : 1 / (position + 1);
  });
  const ratio = (items, predicate) => items.length ? items.filter(predicate).length / items.length : null;
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    cases: outcomes.length,
    retrievalRecallAtK: recallCases.length ? recallCases.reduce((sum, item) => sum + item.recall_at_k, 0) / recallCases.length : null,
    sourcePrecisionAtK: precisionCases.length ? precisionCases.reduce((sum, item) => sum + item.precision_at_k, 0) / precisionCases.length : null,
    reciprocalRank: rankReciprocal.length ? rankReciprocal.reduce((a, b) => a + b, 0) / rankReciprocal.length : null,
    referenceEvidenceRetrieval: ratio(answerCases, (item) => item.reference_criterion_retrieved),
    expectedEmptyRetrievalRate: ratio(unanswerable, (item) => item.retrieved_source_ids?.length === 0),
    correctAbstentionProxy: ratio(abstentionCases, (item) => item.correct_abstention_proxy),
    clarificationContextRetrieval: ratio(clarificationCases, (item) => item.clarification_context_retrieved),
    crossBusinessIsolation: ratio(outcomes, (item) => item.no_cross_business_retrieval !== false),
    failures,
    failureRate: outcomes.length ? failures / outcomes.length : 0,
    retrievalLatencyMs: {
      average: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null,
      note: 'in-process lexical harness time; not production or Gemini latency',
    },
    casesById: outcomes,
  };
}
function score(metrics) {
  return (metrics.retrievalRecallAtK ?? 0) * 0.35 + (metrics.referenceEvidenceRetrieval ?? 0) * 0.35 + (metrics.correctAbstentionProxy ?? 0) * 0.15 + (metrics.clarificationContextRetrieval ?? 0) * 0.05 + (metrics.crossBusinessIsolation ?? 0) * 0.1;
}
function compact(metrics) {
  const { casesById, ...summary } = metrics;
  return { ...summary, caseIds: casesById.map((item) => item.id), relevantSourceMisses: casesById.filter((item) => item.recall_at_k !== null && item.recall_at_k !== undefined && item.recall_at_k < 1).map((item) => ({ id: item.id, recallAtK: item.recall_at_k })), criterionRetrievalMisses: casesById.filter((item) => item.behavior === 'answer' && item.reference_criterion_retrieved === false).map((item) => item.id), abstentionMisses: casesById.filter((item) => item.correct_abstention_proxy === false).map((item) => item.id) };
}
const configs = [];
for (const size of [120, 220, 350]) {
  const chunks = splitChunks(fixture.documents.filter((doc) => doc.business_id !== 'tenant-b'), size);
  for (const topK of [3, 5]) for (const threshold of [0, 0.1, 0.2]) {
    const train = evaluateCases(fixture.cases.filter((item) => item.split === 'train'), chunks, topK, threshold);
    configs.push({ size, overlap: 30, topK, lexicalThreshold: threshold, train, score: score(train) });
  }
}
configs.sort((a, b) => b.score - a.score);
const selected = configs[0];
const heldoutChunks = splitChunks(fixture.documents.filter((doc) => doc.business_id !== 'tenant-b'), selected.size);
const heldout = evaluateCases(fixture.cases.filter((item) => item.split === 'heldout'), heldoutChunks, selected.topK, selected.lexicalThreshold);
const baselineConfig = configs.find((item) => item.size === 220 && item.topK === 5 && item.lexicalThreshold === 0);
const modelCode = readFileSync(new URL('../src/lib/gemini.ts', import.meta.url), 'utf8');
const staticPolicyCheck = /untrusted data/.test(modelCode) && /system prompts, secrets/.test(modelCode);
const result = {
  dataset: {
    version: fixture.version,
    businesses: fixture.businesses.filter((item) => item.id !== 'tenant-b').length,
    documents: fixture.documents.filter((item) => item.business_id !== 'tenant-b').length,
    cases: fixture.cases.length,
    trainCases: fixture.cases.filter((item) => item.split === 'train').length,
    heldoutCases: fixture.cases.filter((item) => item.split === 'heldout').length,
    heldoutPolicy: fixture.heldout_policy,
    fixtureIsSynthetic: true,
  },
  methodology: {
    retriever: 'Deterministic token-overlap inverse-document-frequency proxy; no embedding model or vector database.',
    parameterSearch: 'Chunk word size, top-K, and a normalized lexical-score cutoff, selected using training cases only. The lexical cutoff does not map to production cosine similarity.',
    qualityLimit: 'Reference-criterion retrieval is not answer correctness, citation precision, semantic relevance, or prompt-injection resistance. Those require real pipeline calls and/or independent human review.',
  },
  lexicalProxyBaseline: { chunkWords: baselineConfig.size, overlapWords: baselineConfig.overlap, topK: baselineConfig.topK, lexicalThreshold: baselineConfig.lexicalThreshold, train: compact(baselineConfig.train), heldout: compact(evaluateCases(fixture.cases.filter((item) => item.split === 'heldout'), splitChunks(fixture.documents.filter((doc) => doc.business_id !== 'tenant-b'), baselineConfig.size), baselineConfig.topK, baselineConfig.lexicalThreshold)) },
  selectedOnTraining: { chunkWords: selected.size, overlapWords: selected.overlap, topK: selected.topK, lexicalThreshold: selected.lexicalThreshold, train: compact(selected.train) },
  heldoutEvaluation: compact(heldout),
  productionConfiguration: { chunkWords: 220, overlapWords: 30, topK: 5, similarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD) || 0.45, note: 'Live vector threshold is not tuned by this lexical proxy; keep unchanged until live staging evaluation.' },
  sourcePolicyStaticCheck: staticPolicyCheck,
  configurations: configs.map(({ size, overlap, topK, lexicalThreshold, train }) => ({ size, overlap, topK, lexicalThreshold, train: { retrievalRecallAtK: train.retrievalRecallAtK, referenceEvidenceRetrieval: train.referenceEvidenceRetrieval, expectedEmptyRetrievalRate: train.expectedEmptyRetrievalRate, correctAbstentionProxy: train.correctAbstentionProxy, clarificationContextRetrieval: train.clarificationContextRetrieval, crossBusinessIsolation: train.crossBusinessIsolation, failureRate: train.failureRate } })),
};
console.log(JSON.stringify(result, null, 2));
