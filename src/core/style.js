const HONORIFIC_PROFILES = [
  { max: 19, key: 'hae', label: '평어 · 해체', instruction: '비격식 평어인 해체를 사용합니다. 문맥에 맞는 -해, -야 계열 종결을 쓰되 무례한 표현을 새로 만들지 않습니다.' },
  { max: 39, key: 'haera', label: '서술형 평어 · 해라체', instruction: '설명문에 어울리는 해라체를 사용합니다. 평서문은 -다, -한다 계열로 통일합니다.' },
  { max: 59, key: 'preserve', label: '중립 · 원문 유지', instruction: '원문에서 우세한 상대 높임 등급과 종결 어미를 유지하고 서로 다른 말투를 불필요하게 섞지 않습니다.' },
  { max: 79, key: 'haeyo', label: '부드러운 경어 · 해요체', instruction: '비격식 존대인 해요체를 사용합니다. 문맥에 맞는 -아요, -어요, -예요 계열로 자연스럽게 통일합니다.' },
  { max: 100, key: 'hasipsio', label: '격식 경어 · 하십시오체', instruction: '격식 존대인 하십시오체를 사용합니다. 평서문은 -습니다/-ㅂ니다, 질문은 -습니까 계열을 우선합니다.' }
];

export const EDIT_MODES = Object.freeze({
  weak: Object.freeze({
    label: '약함',
    instruction: '뜻, 정보, 문장 수, 문장 순서와 문단 구조를 그대로 두고 어투와 종결 표현만 자연스럽게 바꿉니다. 맞춤법·문법·논리·중복은 이 모드에서 교정하지 않습니다.'
  }),
  medium: Object.freeze({
    label: '중간',
    instruction: '어투를 다듬고 의미 흐름 그래프로 논리 연결을 점검합니다. AI 특유의 상투적 전개, 같은 뜻의 재설명, 반복과 과잉 설명만 줄이되 맞춤법·문법을 상세 추론해 고치지는 않습니다.'
  }),
  strict: Object.freeze({
    label: '엄격',
    instruction: '중간 모드의 점검에 국립국어원 어문 규범을 더합니다. 맞춤법, 띄어쓰기, 문장 부호, 조사·어미, 주어와 서술어의 호응, 수식 범위와 중의성을 문맥과 검색 근거로 상세히 검토합니다.'
  })
});

const LEGACY_EDIT_MODE_ALIASES = Object.freeze({ fluent: 'weak', balanced: 'medium' });

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

export function normalizeEditMode(mode = 'medium') {
  const normalized = LEGACY_EDIT_MODE_ALIASES[mode] ?? mode;
  if (!Object.hasOwn(EDIT_MODES, normalized)) throw new Error(`지원하지 않는 윤문 방식: ${mode}`);
  return normalized;
}

export function getEditModeProfile(mode = 'medium') {
  return EDIT_MODES[normalizeEditMode(mode)];
}

export function getEditModeInstruction(mode = 'medium') {
  return getEditModeProfile(mode).instruction;
}
