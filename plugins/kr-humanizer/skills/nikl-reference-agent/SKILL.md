---
name: nikl-reference-agent
description: Refresh or inspect KR-humanizer's National Institute of Korean Language source cache when the user asks for official Korean-language data, NIKL crawling, corpus refresh, or rule-source verification.
---

# 국립국어원 규범 참고 에이전트

윤문에는 승인된 `obsidian-vault/규범` 카드만 자동 사용한다. 내려받은 원문은 근거를 검토하기 위한 로컬 자료이며 곧바로 프롬프트에 넣지 않는다.

## 상태 확인

`npx --yes github:kuseumkkrkkr/KR-humanizer nikl status`를 실행해 승인 카드 수, 최근 검토일, 로컬 원문 스냅숏 상태를 확인한다.

## 공식 자료 갱신

- 기본 갱신: `npx --yes github:kuseumkkrkkr/KR-humanizer nikl sync`
- 전문 로컬 저장: 사용자가 전문 저장을 명시한 경우에만 `nikl sync --raw --acknowledge-license`
- `--store <folder>`로 저장 위치를 바꿀 수 있다.

수집기는 등록된 `korean.go.kr` HTTPS 주소만 최대 3회 이동하며, 일시적인 연결 오류·429·5xx만 최대 3회 재시도한다. 파일별·전체 크기를 제한하고 PDF/HWP 파일 시그니처를 검사한다. 출처 URL, 최종 URL, 조회 시각, 원래 파일명, 바이트 수, SHA-256, 상위 자료실, 공공누리 유형과 근거 URL을 manifest에 기록한다.

기본 목록은 어문 규범 웹 전문, 어문 규범 자료실 3쪽의 첨부 전문, 제1유형 한국 어문 규정집 PDF와 제4유형 공공언어 지침 PDF를 포함한다. 제4유형 자료는 로컬 참고만 허용하고 재배포하거나 변형하지 않는다. 자료실 기본 정책 자료도 개별 표시가 우선이므로 재배포 전에 다시 확인한다.

## 카드 승격

원문을 읽어 새 카드를 만들 때는 조항이나 절 위치, 적용 조건, 예외, 짧게 재서술한 지침을 적는다. 원문 전문이나 긴 인용은 카드에 복제하지 않는다. 개별 자료에 표시된 공공누리 유형을 확인하고, 불명확하면 대기 상태로 둔다. 자동 생성된 자료나 원문 스냅숏을 `retrieval: true`로 자동 승격하지 않는다.

## 경계

- 사이트 전체를 따라가는 범용 크롤러가 아니다. 등록된 자료실 3쪽과 그 첨부만 탐색한다.
- 인증 키를 채팅·로그·저장소에 기록하지 않는다.
- 한국어기초사전 API를 쓰려면 사용자가 직접 발급한 키를 환경 변수로 제공해야 하며, 키 없이 우회 수집하지 않는다.
- 국립국어원의 공식 판정을 대신한다고 표현하지 않는다.
