export function buildRewritePrompt({ text, tone = '편안하고 자연스러운 한국어', memories = [] }) {
  const memoryBlock = memories.length ? memories.map((item) => `- ${item}`).join('\n') : '- 없음';
  return `당신은 한국어 윤문 편집자입니다. 아래 원문의 사실, 고유명사, 수치, 주장, 글쓴이의 관점을 바꾸지 마세요.
목표 문체: ${tone}
규칙:
1. AI 판별기 회피나 출처 위장을 시도하지 않습니다.
2. 과장된 접속어, 추상적 평가, 상투 표현을 줄이고 구체적인 동사와 짧은 문장을 우선합니다.
3. 확실하지 않은 맞춤법이나 사실은 임의로 고치지 않습니다.
4. 문단 구조를 유지하되 흐름상 꼭 필요할 때만 어순을 바꿉니다.
5. rewrittenText에는 윤문 결과만 넣습니다.
6. flow에는 의미 흐름을 문단 단위로 요약하고 edges로 관계를 표시합니다.

이전 수락 성향:
${memoryBlock}

원문:
---
${text}
---`;
}
