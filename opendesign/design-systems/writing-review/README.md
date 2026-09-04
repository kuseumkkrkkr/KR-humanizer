# Writing review design system

KR-humanizer의 기존 GUI에서 추출한 제품 디자인 시스템입니다.

## 근거 파일

- `src/gui/index.html`: 화면 단계와 실제 컨트롤
- `src/gui/styles.css`: 색상, 서체, 간격, 상태 표현
- `src/gui/app.js`: 분석 → 제안 → 선택 → 수락 흐름
- `artifacts/screenshots/`: 실제 실행 화면

## 구성

- `tokens/colors_and_type.css`: 원시·의미 토큰
- `brand/voice-and-tone.md`: 문구 원칙
- `brand/style-notes.md`: 시각·상호작용 원칙
- `ui-kit-gui/index.html`: 검토 컨트롤 미리보기

이 시스템은 새 브랜드를 만든 것이 아니라 현재 제품에 이미 쓰인 어휘를 정리한 것입니다.
