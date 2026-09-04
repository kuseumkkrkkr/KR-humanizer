const HONORIFIC_PROFILES = [
  { max: 19, key: 'hae', label: '평어 · 해체', instruction: '비격식 평어인 해체를 사용합니다. 문맥에 맞는 -해, -야 계열 종결을 쓰되 무례한 표현을 새로 만들지 않습니다.' },
  { max: 39, key: 'haera', label: '서술형 평어 · 해라체', instruction: '설명문에 어울리는 해라체를 사용합니다. 평서문은 -다, -한다 계열로 통일합니다.' },
  { max: 59, key: 'preserve', label: '중립 · 원문 유지', instruction: '원문에서 우세한 상대 높임 등급과 종결 어미를 유지하고 서로 다른 말투를 불필요하게 섞지 않습니다.' },
  { max: 79, key: 'haeyo', label: '부드러운 경어 · 해요체', instruction: '비격식 존대인 해요체를 사용합니다. 문맥에 맞는 -아요, -어요, -예요 계열로 자연스럽게 통일합니다.' },
  { max: 100, key: 'hasipsio', label: '격식 경어 · 하십시오체', instruction: '격식 존대인 하십시오체를 사용합니다. 평서문은 -습니다/-ㅂ니다, 질문은 -습니까 계열을 우선합니다.' }
];

export const EDIT_MODES = Object.freeze({
  fluent: '맞춤법과 어색한 호응을 중심으로 고치고, 불필요한 동의어 치환은 피하는 최소 수정 모드입니다.',
  balanced: '자연스러운 흐름, 명료성, 문장 길이를 균형 있게 다듬되 의미 없는 변형은 피합니다.',
  strict: '문법과 호응뿐 아니라 문체 혼용, 과한 구어체, 반복, 모호한 지시어까지 엄격하게 검토합니다.',
  concise: '중복과 군더더기를 줄여 더 짧게 쓰되 주장, 근거, 조건, 수치와 뉘앙스는 삭제하지 않습니다.'
});

export function normalizeHonorificLevel(value = 50) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('높임 정도는 0~100 사이의 숫자여야 합니다.');
  return Math.round(number);
}

export function getHonorificProfile(value = 50) {
  const level = normalizeHonorificLevel(value);
  const profile = HONORIFIC_PROFILES.find((item) => level <= item.max);
  return { ...profile, level };
}

export function getEditModeInstruction(mode = 'balanced') {
  if (!Object.hasOwn(EDIT_MODES, mode)) throw new Error(`지원하지 않는 윤문 방식: ${mode}`);
  return EDIT_MODES[mode];
}
