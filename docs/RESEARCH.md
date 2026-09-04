# 조사 근거와 설계 반영

조사일: 2026-09-04

| 근거 | 확인 내용 | 설계 반영 |
|---|---|---|
| OpenAI Plugins | 플러그인은 skills, MCP servers, optional UI로 확장 가능 | 기본 배포는 가벼운 skill + npm CLI, GUI는 localhost로 제공 |
| Claude Code Plugins | `.claude-plugin/plugin.json`, skills, bin, marketplace 및 로컬 검증 지원 | 동일 plugin 폴더에 Claude manifest와 실행 wrapper 포함 |
| Codex/Claude CLI | 비대화형 실행과 구조화 출력 지원 | `codex exec` / `claude -p`를 인자 배열로 실행하고 JSON Schema 적용 |
| 국립국어원 한국어 어문 규범 | 맞춤법·띄어쓰기·문장 부호를 구분하며 문장 부호는 구조와 의도 전달 수단 | 진단 유형과 설명을 분리하고 확정적이지 않은 항목은 제안으로 표시 |
| 국립국어원 글쓰기 첨삭 연구 | 오탈자, 띄어쓰기, 문장 부호, 호응 등을 근거 단위로 점검 | 규칙 데이터에 근거 URL과 설명 포함 |
| Mem0 OSS | 로컬 운영이 가능하지만 기본 LLM/임베딩은 외부 OpenAI 설정 | 기본은 로컬 JSON, mem0는 localhost + 자체 로컬 provider 구성일 때만 선택 |
| Unicode Standard / UTR #36 | zero-width 및 bidi 제어문자는 실제 의미가 있을 수 있고 보안 문제도 가능 | 무조건 삭제하지 않고 코드포인트·위치를 먼저 표시, 명시적 sanitize에서만 제거 |
| C2PA | 출처/편집 이력은 검증 가능한 provenance 문제 | 출처 흔적을 속이는 기능으로 표현하지 않고 텍스트 위생 기능으로 제한 |

원문 URL과 사용 범위는 [data/sources.json](../data/sources.json)에 기록했습니다.
