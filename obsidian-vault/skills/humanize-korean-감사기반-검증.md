---
id: skill-humanize-korean-audit
title: humanize-korean의 감사 기반 검증
kind: skill-observation
authority: community-skill
source_url: https://github.com/hashgraph-online/awesome-codex-plugins/blob/486ac208b3f40929c62a6954b5f58147b483a2f7/plugins/beefiker/superloopy/skills/humanize-korean/SKILL.md
source_section: plugins/beefiker/superloopy/skills/humanize-korean/SKILL.md @ 486ac208
license: Apache-2.0
tags: [공개스킬, 감사, 보호토큰, 변경률, 근거기록]
retrieval_terms: [감사, 변경률, 보호 토큰, 날짜, 단위, 약어, 근거, 검증]
retrieval: true
reviewed: 2026-09-04
---

# humanize-korean의 감사 기반 검증

## 관찰 요지

Apache-2.0 저장소의 공개 Skill은 보호 토큰, 문체 보존, 변경량과 결과 감사 기록을 결합한다. KR-humanizer는 코드나 규칙을 가져오지 않고 검증 관점만 참고한다.

## 프롬프트 지침

윤문 전 보호 대상인 숫자·날짜·단위·URL·코드·제품명·약어·인용을 식별한다. 결과에서 보호 대상이 모두 유지되는지 확인하고, 변경이 넓으면 문장별 의미 대조를 강화한다. 검증되지 않은 품질 등급이나 탐지기 통과율을 만들지 않는다.

## 경계

변경률은 경고 신호일 뿐 품질 점수가 아니다. 짧은 글과 필수 구조 변경에는 비율만으로 합격·불합격을 정하지 않는다.
