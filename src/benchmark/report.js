function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

export function summarizeRun(run) {
  const deltas = run.pairs.map((pair) => pair.metrics.humanized.readabilityProxy - pair.metrics.baseline.readabilityProxy);
  const judgeWins = { baseline: 0, humanized: 0, tie: 0 };
  let meaningChanged = 0;
  for (const pair of run.pairs) {
    const judge = pair.judge;
    if (!judge) continue;
    const winner = judge.winner === 'TIE' ? 'tie' : pair.blind[judge.winner];
    judgeWins[winner] += 1;
    const humanizedLabel = pair.blind.A === 'humanized' ? 'A' : 'B';
    if (judge[`meaningChanged${humanizedLabel}`]) meaningChanged += 1;
  }
  return {
    pairCount: run.pairs.length,
    readabilityProxyDelta: Number(average(deltas).toFixed(3)),
    judgeWins,
    meaningChanged,
    numericMismatch: run.pairs.filter((pair) => pair.preservation && !pair.preservation.numericTokensPreserved).length,
    classifierMeanAccuracy: Number(run.classifier.meanAccuracy.toFixed(4))
  };
}

export function markdownReport(run) {
  const summary = run.summary;
  const rows = run.pairs.map((pair) => {
    const winner = pair.judge?.winner === 'TIE' ? '동률' : pair.judge ? pair.blind[pair.judge.winner] : '미평가';
    const delta = pair.metrics.humanized.readabilityProxy - pair.metrics.baseline.readabilityProxy;
    return `| ${pair.id} | ${pair.topicLabel} | ${pair.fold + 1} | ${delta.toFixed(1)} | ${winner} |`;
  }).join('\n');
  const opinions = run.pairs.map((pair) => {
    const judge = pair.judge;
    if (!judge) return `### ${pair.id}\n\n평가 없음`;
    const winner = judge.winner === 'TIE' ? '동률' : pair.blind[judge.winner];
    return `### ${pair.id}\n\n- 승자: ${winner}\n- A 점수: 자연스러움 ${judge.naturalnessA}/5, 가독성 ${judge.readabilityA}/5, 응집성 ${judge.coherenceA}/5\n- B 점수: 자연스러움 ${judge.naturalnessB}/5, 가독성 ${judge.readabilityB}/5, 응집성 ${judge.coherenceB}/5\n- 의견: ${judge.reason}`;
  }).join('\n\n');
  return `# KR-humanizer 합성 CV 보고서

실행 시각: ${run.createdAt}

> 이 실험은 AI 생성 원문과 AI 윤문문을 비교한 합성 평가입니다. 실제 사람이 쓴 글이나 실제 독자 평가가 없으므로 "사람다움 정확도"를 뜻하지 않습니다.

## 요약

- 평가 쌍: ${summary.pairCount}
- 가독성 대리 지표 평균 변화: ${summary.readabilityProxyDelta >= 0 ? '+' : ''}${summary.readabilityProxyDelta}
- 블라인드 평가 승리: 원문 ${summary.judgeWins.baseline}, 윤문 ${summary.judgeWins.humanized}, 동률 ${summary.judgeWins.tie}
- 의미 변경 판정: ${summary.meaningChanged}/${summary.pairCount}
- 기준문 유효성 gate 통과: ${summary.pairCount}/${summary.pairCount}
- 숫자 토큰 보존: ${summary.pairCount - summary.numericMismatch}/${summary.pairCount}
- 3-fold 문체 구분 정확도: ${(summary.classifierMeanAccuracy * 100).toFixed(1)}%

구분 정확도가 높으면 윤문 전후의 문체 차이가 일관되다는 뜻일 뿐, 어느 쪽이 더 사람답다는 뜻은 아닙니다.

## 쌍별 결과

| ID | 주제 | Fold | 가독성 변화 | 블라인드 승자 |
|---|---|---:|---:|---|
${rows}

## 평가 의견

${opinions}

## 방법

- 기준군 프롬프트는 주제명만 포함한 최소 문장입니다.
- 정치·경제·사회 각 3개 샘플을 독립 Codex 세션에서 생성했습니다.
- 같은 원문과 윤문 결과는 반드시 같은 fold에 배치해 pair 누수를 막았습니다.
- 평가는 A/B 위치를 숨긴 상태로 자연스러움·가독성·응집성·의미 보존을 확인했습니다.
- 생성·윤문·평가에 같은 Codex 계열을 사용했으므로 평가 선호가 부풀려질 수 있습니다.
- 최신 사실 정확도나 정치적 편향은 이 실험의 평가 범위가 아닙니다.
`;
}
