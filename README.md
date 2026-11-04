# 함평군 농촌지도 통합대시보드

Cloudflare Pages(`_worker.js`)로 배포하는 정적 화면 + 서버 프록시입니다. API 키는 서버(Worker)에서만 사용하며 화면·로그에 나오지 않습니다.

## 1. 배포 (CLI·Wrangler 불필요)
1. https://dash.cloudflare.com 에서 무료 가입·로그인
2. 왼쪽 **Workers & Pages** → **Create** → **Pages** → **Upload assets (Direct Upload)**
3. 프로젝트 이름 입력(예: `hampyeong-dashboard`) → 이 ZIP(또는 압축을 푼 폴더)을 올리고 **Deploy**
4. 프로젝트 → **Settings → Variables and Secrets → Add** (Production) 에 아래 값을 **Secret**으로 입력
   - `DATA_GO_KR_SERVICE_KEY` : 공공데이터포털 인증키 (Encoding/Decoding 키 모두 가능)
   - `NCPMS_API_KEY` : NCPMS Open API 키
5. 값 저장 후 **같은 ZIP을 다시 업로드(새 배포)** 해야 적용됩니다.
6. 사이트 주소 접속 → **자료실·출처 → API 연결상태**에서 3개 항목이 `정상`인지 확인
> Direct Upload 프로젝트에서 Secret 메뉴가 보이지 않으면 Cloudflare 정책이 바뀐 것입니다. 이 경우 GitHub 연결 배포가 가장 쉬운 대체 방법입니다.

공공데이터포털에서 **활용신청(승인)** 이 필요한 API: 기상청 `단기예보 조회서비스`, 농진청 `농업기상 기본(또는 상세) 관측데이터 조회`.

## 2. 환경변수
| 이름 | 용도 | 필수 |
|---|---|---|
| DATA_GO_KR_SERVICE_KEY | 기상청·농업기상 | 필수 |
| NCPMS_API_KEY | NCPMS | 필수 |
| NCPMS_LIST_SICK_CODE / NCPMS_LIST_PEST_CODE | 양파 병/해충 **목록** 서비스코드 | 목록 표시에 필요 |
| AGRI_WEATHER_URL | 학교면 농업기상을 '상세 관측데이터' 주소로 교체 | 선택 |

## 3. API endpoint 정리
| 우리 서버 | 외부 API | 확인 상태 |
|---|---|---|
| /api/weather | 기상청 `VilageFcstInfoService_2.0/getUltraSrtNcst` (serviceKey, base_date, base_time, nx, ny, dataType=JSON) | 확인됨 |
| /api/agri-weather | 농진청 `AgriWeather/WeatherObsrInfo/V3/GnrlWeather/getWeatherTenMinList3` (Page_No, Page_Size, date, obsr_Spot_Cd=525811A001) | **기본 관측데이터** 명세 확인. '상세' 명세는 미확인 |
| /api/ncpms/detail | NCPMS `npmsAPI/service` (apiKey, serviceCode=SVC05, sickKey) | 확인됨 |
| /api/ncpms/onion | NCPMS 병·해충 검색 | **서비스코드·파라미터 미확인** → 환경변수로 지정 |
| 금주 농사정보 | 공식 사이트 링크(자동 연동 없음) | API 명세 미확인 |

## 4. 9개 읍·면 격자 (임시값 — 반드시 확인)
함평읍 52,72 · 손불면 50,71 · 신광면 51,74 · 학교면 53,72 · 엄다면 54,72 · 대동면 52,71 · 나산면 54,73 · 해보면 52,73 · 월야면 53,74
공식 값은 기상자료개방포털 → 소통과 참여 → 자료실 → `동네예보 지점 좌표(위도, 경도) 정보`에서 확인 후 `_worker.js` 맨 위 `GRID` 를 고치고 `GRID_VERIFIED = true` 로 바꾸세요.

## 5. 오류 처리 기준
| 화면 | 조건 |
|---|---|
| 인증 오류 | 키 없음·오류·미승인·만료, HTTP 401/403 |
| 조회 오류 | 잘못된 파라미터·주소, HTTP 400/404, 호출 한도 초과 |
| 자료 없음 | 정상 응답이나 0건, 결측(null·빈값·`-`) |
| 연결 오류 | fetch 실패·타임아웃(8초)·HTTP 5xx |
숫자 `0`은 정상 값이며 결측과 구분합니다.

## 6. 품목 추가
`config.js` 의 `categories` 에 `{ id, name, type }` 한 줄을 추가하면 카드가 생깁니다. 새 품목 화면이 필요하면 `app.js` 의 `onion()`/`hanwoo()` 와 같은 함수를 복제해 `route()` 에 연결하세요.

## 7. 기타
모바일 대응(3열→2열), 체크박스는 저장되지 않음, '최근 정상 수집시각'은 각 브라우저에 기록됩니다.
