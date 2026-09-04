import { analyzeText, splitSentences } from '../core/analyze.js';

const connectors = /(?:또한|따라서|그러나|결론적으로|한편|이러한)/gu;
const abstractPhrases = /(?:중요합니다|필요합니다|기여합니다|역할을 합니다|것입니다|수 있습니다)/gu;

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function deviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function textMetrics(text) {
  const analysis = analyzeText(text);
  const sentences = splitSentences(text);
  const lengths = sentences.map((sentence) => sentence.length);
  const words = text.match(/[가-힣A-Za-z0-9]+/gu) ?? [];
  const perThousand = (count) => text.length ? count * 1000 / text.length : 0;
  const connectorCount = (text.match(connectors) ?? []).length;
  const abstractCount = (text.match(abstractPhrases) ?? []).length;
  const longCount = lengths.filter((length) => length > 80).length;
  const avgSentenceLength = mean(lengths);
  const readabilityProxy = Math.max(0, Math.min(100,
    100 - Math.abs(avgSentenceLength - 36) * 0.7 - perThousand(connectorCount) * 1.4 - perThousand(abstractCount) * 1.1 - (sentences.length ? longCount / sentences.length : 0) * 25
  ));
  return {
    characters: text.length,
    paragraphs: analysis.stats.paragraphs,
    sentences: sentences.length,
    avgSentenceLength: Number(avgSentenceLength.toFixed(3)),
    sentenceLengthStd: Number(deviation(lengths).toFixed(3)),
    lexicalDiversity: words.length ? Number((new Set(words).size / words.length).toFixed(4)) : 0,
    findingsPerThousand: Number(perThousand(analysis.findings.length).toFixed(3)),
    connectorsPerThousand: Number(perThousand(connectorCount).toFixed(3)),
    abstractPhrasesPerThousand: Number(perThousand(abstractCount).toFixed(3)),
    longSentenceRatio: sentences.length ? Number((longCount / sentences.length).toFixed(4)) : 0,
    readabilityProxy: Number(readabilityProxy.toFixed(3))
  };
}

export const featureNames = ['avgSentenceLength', 'sentenceLengthStd', 'lexicalDiversity', 'findingsPerThousand', 'connectorsPerThousand', 'abstractPhrasesPerThousand', 'longSentenceRatio'];
export function featureVector(metrics) { return featureNames.map((name) => metrics[name]); }

export function preservationAudit(before, after) {
  const extract = (text) => [...new Set(text.match(/\d+(?:[.,]\d+)*%?/gu) ?? [])].sort();
  const baselineNumbers = extract(before);
  const humanizedNumbers = extract(after);
  return {
    baselineNumbers,
    humanizedNumbers,
    missingNumbers: baselineNumbers.filter((item) => !humanizedNumbers.includes(item)),
    addedNumbers: humanizedNumbers.filter((item) => !baselineNumbers.includes(item)),
    numericTokensPreserved: baselineNumbers.every((item) => humanizedNumbers.includes(item)) && humanizedNumbers.every((item) => baselineNumbers.includes(item))
  };
}
