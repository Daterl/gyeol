# #34 정적 시안

담당 diego.yoon · 협업 enzo.cho. 화면 방향 비교용이며 실제 제품 기능이 아니다. 기준·상태 명세·검증 한계는 [ui-review.md](../ui-review.md)를 읽는다.

## 열기

저장소 루트에서 `python3 -m http.server 8340 --bind 127.0.0.1` 실행 후 아래를 연다. 새 의존성이 필요하지 않다.

- [A 입력](http://127.0.0.1:8340/docs/design/mockups/index.html?view=input)
- [A 결과](http://127.0.0.1:8340/docs/design/mockups/index.html?view=result)
- [B 입력](http://127.0.0.1:8340/docs/design/mockups/index.html?view=input&direction=play)
- [B 결과](http://127.0.0.1:8340/docs/design/mockups/index.html?view=result&direction=play)

근거 펼치기와 선택 입력 펼치기만 네이티브 HTML로 동작한다. 업로드·분석·채우기·내보내기·재정렬은 구현하지 않았고 API/외부 사진 요청도 없다. 선택 입력 내용은 전송하지 않는다. 화면의 사진·문구는 예시이며 제품 fixture나 실모델 평가 데이터가 아니다.

## 캡처

| 방향·화면 | 1440px viewport | 390px viewport |
|---|---|---|
| A 입력 | [PNG](a-input-1440.png) | [PNG](a-input-390.png) |
| A 결과 | [PNG](a-result-1440.png) | [PNG](a-result-390.png) |
| B 입력 | [PNG](b-input-1440.png) | [PNG](b-input-390.png) |
| B 결과 | [PNG](b-result-1440.png) | [PNG](b-result-390.png) |

CUA Chrome full-page screenshot, 2026-09-17. 세로 스크롤바를 제외한 이미지 폭은 1425/375px이다. [viewport-check.json](viewport-check.json)은 320px을 포함한 12조합의 실제 DOM 측정값이다. 이미지 편집이나 가상 렌더링으로 만든 화면 증거가 아니다.

## 이미지 제작·출처

- 캐릭터: PR #39에서 만든 [원본 비교 보드](../concepts/gyeol-character-directions-v1.png)를 배치 참고로만 사용. PNG 파일 변경 없음. 정식 투명 캐릭터는 #35에서 별도 제작한다.
- 사진: 내장 **imagegen**으로 새로 만든 `sample-photos.png`, 2172×724 PNG, 2,648,453 bytes. 세 장을 담은 한 장의 컨택트 시트이며 CSS 미리보기 영역으로 각 패널을 보여준다. 원본을 프로그램으로 편집하지 않았다.
- 사진 SHA-256: `44f108eeee68a3716a149cfd597f7ffb7c46a6706dbf31960a3cd0a4a93f1073`.
- 사용자 사진을 제공받거나 외부 사진을 수집하지 않았다. 저장소의 제품 `fixtures/`·골든 세트와 혼용하지 않는다. 이 PNG를 실제 앱의 무거운 런타임 자산으로 적용하지 않는다.

최종 프롬프트 (내장 도구 모드, 신규 생성, 참조 이미지 없음):

```text
Use case: photorealistic-natural. Asset type: one contact sheet of three fictional sample photographs for a photo sequencing design mockup, not user photographs. Create a perfectly rectangular 3:1 landscape image with exactly THREE equal square photographs edge-to-edge, no gutters, no borders. Left third: candid sunlit cafe table, white ceramic espresso cup on a warm wooden tabletop, gentle diagonal light, natural photographic texture. Middle third: quiet green leaves and dappled shadow against an off-white stucco wall, editorial street photography. Right third: calm deep blue sea with a small rocky shoreline, bright sky, late afternoon natural light. Premium understated film-like photography, true photographic detail and restrained saturation. No people, no text, no logos, no illustrations, no frame, no shadows outside photographs. The three panels must be exact equal widths, each independent composition. This contact sheet will be shown as three separately framed samples in a Korean photo curation web UI.
```

## 검증 재현

브라우저 viewport를 1440×1000, 390×844, 320×844로 바꾸며 상단 네 링크를 각각 연다. `document.documentElement.scrollWidth`와 `clientWidth`가 같고, 주요 버튼/summary 높이가 44px 이상이며, 모든 `img`가 로드됐는지 확인한다. 320px에서는 캐릭터가 숨겨져야 한다. 결과 두 번째 근거에 Tab으로 접근해 Enter로 열고 닫으며 포커스 링을 확인한다. 보안 보호 설정이나 브라우저 확장 권한 변경은 필요 없다.
