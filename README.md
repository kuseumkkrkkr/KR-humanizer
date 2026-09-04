# KR-humanizer

한국어 글을 더 자연스럽고 편하게 읽히도록 점검하고, 모든 변경을 사용자가 확인·수락하게 하는 로컬 우선 윤문 도구입니다.

> 이 도구는 AI 판별기 회피나 출처 위장을 보장하지 않습니다. `sanitize`는 비가시 Unicode, BOM, 제어문자처럼 실제로 확인 가능한 텍스트 이상만 보여 주고 정리합니다.

## 현재 제공 범위

- 문단·문장 길이, 중복 표현, 기본 오탈자, 비가시 문자 진단
- Codex CLI 또는 Claude Code CLI를 통한 API 키 없는 윤문 제안
- 문장/단어 단위 전후 비교, 어순 변경 표식, 선택 수락
- 글의 의미 흐름 그래프
- 로컬 결정 메모리와 선택적 self-hosted mem0 연동
- npm CLI와 로컬 브라우저 GUI
- Codex 및 Claude Code 공용 플러그인

## 설치와 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm test
npm link
kr-humanizer analyze draft.txt
kr-humanizer rewrite draft.txt --engine codex --out proposal.json
kr-humanizer cv --samples 3 --folds 3
kr-humanizer gui
```

공개 저장소에서 바로 설치하려면:

```bash
npm install -g github:kuseumkkrkkr/KR-humanizer
```

GitHub Release의 `kr-humanizer-0.2.0.tgz` 파일도 동일한 npm 설치물입니다. npm registry에는 아직 게시하지 않았습니다.

Claude Code가 설치되어 있으면 `--engine claude`를 사용할 수 있습니다. 외부 모델 API를 직접 호출하지 않으며, 사용자가 로그인한 CLI 프로세스만 실행합니다.

## 플러그인 설치

Codex:

```bash
codex plugin marketplace add kuseumkkrkkr/KR-humanizer
codex plugin add kr-humanizer@kr-humanizer
```

Claude Code:

```bash
claude plugin marketplace add kuseumkkrkkr/KR-humanizer
claude plugin install kr-humanizer@kr-humanizer
```

## 개인정보와 보안

- GUI 서버는 `127.0.0.1`에만 바인딩됩니다.
- 입력은 기본적으로 외부 서버에 저장하거나 전송하지 않습니다.
- CLI 실행은 셸 문자열이 아닌 인자 배열을 사용합니다.
- mem0는 localhost 주소만 허용하며 기본값은 비활성입니다.
- 원문은 200,000자, 요청 본문은 1 MiB로 제한됩니다.

자세한 제품 범위와 근거는 [docs/PLAN.md](docs/PLAN.md), [docs/RESEARCH.md](docs/RESEARCH.md)를 참고하세요.

## 합성 CV

`cv` 명령은 정치·경제·사회 주제별 최소 프롬프트 원문과 윤문문을 pair 단위 3-fold로 나눕니다. 설명 가능한 문체 지표, 블라인드 A/B 평가, 원문/윤문 문체 구분 실험을 함께 저장합니다. 사람이 쓴 기준 글이나 실제 독자 평가는 포함하지 않으므로 사람다움 정확도로 해석하면 안 됩니다.

최종 실행은 `experiments/runs/2026-09-04T06-22-37-885Z/`에 기준문 9개, EXEC 윤문 9개, 평가 의견 9개로 분리 저장했습니다. 실제 GUI 동작 캡처는 `artifacts/screenshots/`에서 확인할 수 있습니다.
