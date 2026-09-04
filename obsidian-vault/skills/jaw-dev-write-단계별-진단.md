---
id: skill-jaw-dev-write-staged-diagnosis
title: jaw-dev-write의 단계별 진단 구조
kind: skill-observation
authority: community-skill
source_url: https://github.com/lidge-jun/cli-jaw-skills/blob/1b8be996f952a2691d41932e0fcb163e47148647/jaw-dev-write/SKILL.md
source_section: jaw-dev-write/SKILL.md @ 1b8be996
license: NOASSERTION
tags: [공개스킬, 윤문, 단계별검토, 번역투, 리듬]
retrieval_terms: [번역투, 접속사, 병렬, 리듬, 종결, 단계별]
retrieval: true
reviewed: 2026-09-04
---

# jaw-dev-write의 단계별 진단 구조

## 관찰 요지

공개 Skill은 문체 일관성, 번역투, 기계적 구조, 리듬을 서로 다른 패스로 나누고 검출된 구간만 고치는 방식을 취한다. 저장소에 명시적 라이선스가 확인되지 않아 원문 규칙은 복제하지 않았다.

## 프롬프트 지침

윤문을 한 번에 전면 재작성하지 말고 문체 일관성 → 번역투 → 구조 반복 → 문말 리듬 순으로 진단한다. 실제 결함이 발견된 문장만 제안하고 이미 자연스러운 문장은 유지한다.

## 경계

이 카드는 워크플로 관찰이며 어문 규범이 아니다. 세부 패턴은 국립국어원 카드와 원문 문맥으로 다시 판단한다.
