const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const runPath = resolve(process.argv[2] || 'experiments/latest-run.json');
const outputPath = resolve(process.argv[3] || 'experiments/ab-comparison.md');

function score(judge, label, blind) {
  const side = blind.A === label ? 'A' : 'B';
  return `자연스러움 ${judge[`naturalness${side}`]}/5 · 가독성 ${judge[`readability${side}`]}/5 · 응집성 ${judge[`coherence${side}`]}/5`;
}

async function main() {
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const sections = run.pairs.map((pair, index) => {
    const judgeWinner = pair.judge.winner === 'TIE' ? '동률' : pair.blind[pair.judge.winner] === 'humanized' ? 'B · EXEC 윤문' : 'A · 최소 프롬프트 원문';
    const blindMap = `평가 A=${pair.blind.A === 'humanized' ? 'EXEC 윤문' : '최소 원문'}, 평가 B=${pair.blind.B === 'humanized' ? 'EXEC 윤문' : '최소 원문'}`;
    const baselineAttempts = pair.baselineAttempts.map(({ attempt, validation }) => `${attempt}차 ${validation.valid ? '통과' : `제외(${validation.reasons.join(', ')})`}`).join(', ');
    const rewriteAttempts = pair.rewriteAttempts.map(({ attempt, validation }) => `${attempt}차 ${validation.valid ? `통과(길이비 ${validation.lengthRatio})` : `제외(${validation.reasons.join(', ')})`}`).join(', ');
    const delta = pair.metrics.humanized.readabilityProxy - pair.metrics.baseline.readabilityProxy;
    const changedUnits = pair.proposal.units.filter((unit) => unit.kind !== 'equal').length;
    return `## ${index + 1}. ${pair.id} · ${pair.topicLabel}

- A 생성 입력: \`${pair.minimalPrompt}\`
- A 생성 과정: 독립 Codex 세션, ${baselineAttempts}
- B 생성 입력: 아래 공통 윤문 프롬프트 + A 원문 전체
- B 실행 과정: KR-humanizer → Codex CLI EXEC, ${rewriteAttempts}
- 변경 제안: ${changedUnits}건
- 가독성 대리 지표 변화: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}
- 블라인드 승자: ${judgeWinner}
- A 점수: ${score(pair.judge, 'baseline', pair.blind)}
- B 점수: ${score(pair.judge, 'humanized', pair.blind)}
- 평가 의견(당시 블라인드 표기: ${blindMap}): ${pair.judge.reason}

### A · 최소 프롬프트 원문

${pair.baseline}

### B · KR-humanizer EXEC 윤문

${pair.humanized}`;
  }).join('\n\n---\n\n');

  const report = `# KR-humanizer A/B 글 비교

실행: ${run.createdAt}  
구성: 정치·경제·사회 각 3쌍, 총 A 9개 + B 9개

## 프롬프트 유무의 정확한 의미

- A(최소 프롬프트): 프롬프트가 완전히 없는 생성은 실행할 수 없어, 주제 한 줄만 전달했습니다. 문체·분량·구조 지시는 없습니다.
- B(윤문 프롬프트): A 원문 전체를 KR-humanizer의 구조화된 윤문 지침과 함께 Codex CLI EXEC에 전달했습니다.
- 외부 LLM API는 사용하지 않았습니다.
- 생성·윤문·평가가 같은 Codex 계열이므로 이 결과는 합성 비교이며 실제 사람 선호도는 아닙니다.

## A에 사용한 최소 프롬프트

- 정치: \`한국 정치에 관한 글을 작성하세요.\`
- 경제: \`한국 경제에 관한 글을 작성하세요.\`
- 사회: \`한국 사회에 관한 글을 작성하세요.\`

## B에 공통 적용한 윤문 프롬프트

\`\`\`text
당신은 한국어 윤문 편집자입니다. 아래 원문의 사실, 고유명사, 수치, 주장, 글쓴이의 관점을 바꾸지 마세요.
목표 문체: 편안하고 자연스러운 중립적 설명체
규칙:
1. AI 판별기 회피나 출처 위장을 시도하지 않습니다.
2. 과장된 접속어, 추상적 평가, 상투 표현을 줄이고 구체적인 동사와 짧은 문장을 우선합니다.
3. 확실하지 않은 맞춤법이나 사실은 임의로 고치지 않습니다.
4. 문단 구조를 유지하되 흐름상 꼭 필요할 때만 어순을 바꿉니다.
5. rewrittenText에는 윤문 결과만 넣습니다.
6. flow에는 의미 흐름을 문단 단위로 요약하고 edges로 관계를 표시합니다.

이전 수락 성향:
- 없음

원문:
---
{각 A 원문 전체}
---
\`\`\`

${sections}
`;
  await writeFile(outputPath, report, 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
