import { featureNames, featureVector } from './metrics.js';

const sigmoid = (value) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

function fitScaler(rows) {
  const means = rows[0].map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
  const scales = means.map((mean, index) => Math.sqrt(rows.reduce((sum, row) => sum + (row[index] - mean) ** 2, 0) / rows.length) || 1);
  return { means, scales };
}

function scale(row, scaler) { return row.map((value, index) => (value - scaler.means[index]) / scaler.scales[index]); }

function train(rows, labels) {
  const weights = new Array(rows[0].length).fill(0);
  let bias = 0;
  const rate = 0.08;
  for (let step = 0; step < 700; step += 1) {
    const gradient = new Array(weights.length).fill(0);
    let biasGradient = 0;
    rows.forEach((row, index) => {
      const error = sigmoid(dot(weights, row) + bias) - labels[index];
      row.forEach((value, feature) => { gradient[feature] += error * value; });
      biasGradient += error;
    });
    weights.forEach((weight, index) => { weights[index] -= rate * (gradient[index] / rows.length + 0.02 * weight); });
    bias -= rate * biasGradient / rows.length;
  }
  return { weights, bias };
}

export function groupedCrossValidation(pairs, foldCount) {
  const documents = pairs.flatMap((pair) => [
    { pairId: pair.id, fold: pair.fold, label: 0, metrics: pair.metrics.baseline },
    { pairId: pair.id, fold: pair.fold, label: 1, metrics: pair.metrics.humanized }
  ]);
  const folds = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const trainDocs = documents.filter((item) => item.fold !== fold);
    const testDocs = documents.filter((item) => item.fold === fold);
    const trainRows = trainDocs.map((item) => featureVector(item.metrics));
    const scaler = fitScaler(trainRows);
    const model = train(trainRows.map((row) => scale(row, scaler)), trainDocs.map((item) => item.label));
    const predictions = testDocs.map((item) => {
      const probability = sigmoid(dot(model.weights, scale(featureVector(item.metrics), scaler)) + model.bias);
      return { pairId: item.pairId, actual: item.label, predicted: probability >= 0.5 ? 1 : 0, probability: Number(probability.toFixed(4)) };
    });
    folds.push({ fold, accuracy: predictions.filter((item) => item.actual === item.predicted).length / predictions.length, predictions });
  }
  return {
    purpose: '원문과 윤문 결과의 문체 구분 가능성 측정이며 사람다움 정확도가 아님',
    featureNames,
    folds,
    meanAccuracy: folds.reduce((sum, fold) => sum + fold.accuracy, 0) / folds.length
  };
}
