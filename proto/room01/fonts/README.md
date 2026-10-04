# fonts — 손글씨 글꼴(동봉 · SIL Open Font License 1.1)

2026-10-03 S1 — 사용자 승인으로 구글 폰트에서 받지 않고 Pages 안에 같이 둔다(망이 없어도 손글씨가 뜬다).

| 폴더 | 글꼴 | 만든 곳 | 쓰는 곳 | 예약 이름(RFN) |
|---|---|---|---|---|
| `nanumpenscript/` | Nanum Pen Script(나눔손글씨 펜) | NHN · 산돌 | 파란 펜 · UI 펜 글씨 | Nanum · NanumPen 등(OFL.txt 첫 줄) |
| `nanumbrushscript/` | Nanum Brush Script(나눔손글씨 붓) | NHN · 산돌 | 1장 일지 넷째 손(끼워 넣은 줄 · 벽 「있다」) | Nanum · NanumBrush 등 |
| `gaegu/` | Gaegu(개구, 400 · 700) | JIKJI SOFT | 연필 | 없음 |
| `himelody/` | Hi Melody(하이멜로디) | YoonDesign | 검은 펜 · 다른 손 | 없음 |
| `poorstory/` | Poor Story | YoonDesign | 쪽지 글씨 | 없음 |

- **파일 = 구글 폰트 css2 가 내주는 woff2 그대로**(fonts.gstatic.com — 고치지 않음 · 549개 · 약 8.75MB). `fonts.css` 는 구글 css2 의 @font-face 와 같은 차례 · 같은 `unicode-range` 이고 url 만 이 폴더의 파일로 바꿨다 — 글자 묶음별 파일은 그 글자를 쓸 때만 받는다. 글꼴 데이터가 같으므로 화면(굽기 · 수첩)이 구글에서 받을 때와 같다.
- 라이선스 = 각 폴더 `OFL.txt`(github.com/google/fonts `ofl/<폴더>/OFL.txt` 원문). 글꼴을 고치거나(서브셋 · 병합) 다시 만들면 예약 이름이 있는 나눔 둘은 이름을 바꿔야 한다 — 지금은 받은 그대로라 이름도 그대로.
- 부르는 곳: `src/ink.js` 가 시작할 때 `<link rel="stylesheet" href="fonts/fonts.css">` 를 붙인다(`Ink.fonts()` — 폰 쪽지 · 샛길도 이것을 부른다). 배포 = `tools/deploy_list.js` 가 이 폴더 전부를 싣는다(S7).
- 받은 도구(중간물): `D:\_tmp\S1_표현\nb13\getfonts.js`.
