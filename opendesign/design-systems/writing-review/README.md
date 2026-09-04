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
- `brand/identity.md`: 로고, 슬로건과 외부 노출 원칙
- `assets/mark.svg`: 교정 전후를 나타내는 브랜드 마크
- `ui-kit-gui/index.html`: 검토 컨트롤 미리보기

이 시스템은 현재 제품의 어휘를 바탕으로 GUI와 공개 웹사이트가 같은 인상을 주도록 확장한 브랜드 체계입니다.
