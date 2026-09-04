---
id: skill-text-humanize-korean-protected-scope
title: text-humanize-korean의 보존 범위
kind: skill-observation
authority: community-skill
source_url: https://github.com/mols3131d/mols-agent-assets/blob/cae542f1dd4b80faa7ad9db164c7a5847e76b6b1/src/rulesync/.rulesync/skills/text-humanize-korean/SKILL.md
source_section: text-humanize-korean/SKILL.md @ cae542f1
license: NOASSERTION
tags: [공개스킬, 의미보존, 보호구간, 서법, 문서구조]
retrieval_terms: [숫자, 고유명사, 인용, 코드, URL, 확실성, 의무, 조건, 예외]
retrieval: true
always: true
reviewed: 2026-09-04
---

# text-humanize-korean의 보존 범위

## 관찰 요지

공개 Skill은 표면 문구뿐 아니라 문장의 논리 강도와 문서의 기능적 요소도 변경 금지 대상으로 분리한다. 명시적 라이선스가 확인되지 않아 세부 목록과 원문 지침은 가져오지 않고 검증 관점만 추상화했다.

## 프롬프트 지침

윤문 전에 바뀌면 안 되는 데이터값, 고유 식별자, 문자 그대로 유지해야 할 구간을 체크리스트로 만든다. 결과에서는 누락뿐 아니라 부정 여부, 주장 강도, 의무 수준, 조건 범위, 인과 방향이 달라졌는지 대조하고 하나라도 표류한 제안은 폐기한다.

## 경계

공개 Skill에서 관찰한 보존 계약이며 개별 문법 판단의 근거로 사용하지 않는다.
