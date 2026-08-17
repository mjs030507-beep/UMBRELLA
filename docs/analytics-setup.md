# 행동 분석 배포 설정

## Netlify 환경변수

Netlify 사이트의 **Project configuration > Environment variables**에 다음 값을 등록합니다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `NETLIFY_DATABASE_URL` | 필수 | Netlify DB 연결 시 자동 생성되는 Postgres 연결 문자열 |
| `ADMIN_SECRET` | 필수 | 관리자 화면 비밀번호. 16자 이상의 무작위 문자열 사용 |
| `GA_MEASUREMENT_ID` | 선택 | GA4 웹 데이터 스트림 측정 ID (`G-...`) |
| `APP_VERSION` | 필수 | 수정 전은 `v1`, 수정 후는 `v2` |

변경 후 사이트를 다시 배포합니다. Secret은 `.env`나 프런트엔드 파일에 기록하지 않습니다.

## DB

Functions가 최초 호출될 때 `sessions`, `weather_queries`, `events` 테이블과 인덱스를 자동 생성합니다. 수동 생성이 필요하면 `netlify/db/schema.sql`을 Netlify DB SQL 편집기에서 실행할 수 있습니다.

## GA4

`GA_MEASUREMENT_ID`를 설정하면 주요 이벤트가 자동 전송됩니다. GA4 관리의 **맞춤 정의**에서 다음 이벤트 범위 측정기준을 등록하면 보고서에서 파라미터를 사용할 수 있습니다.

- `app_version`
- `target_date`
- `error_type`
- `previous_date`
- `selected_date`

다음 항목은 이벤트 범위 맞춤 측정항목으로 등록합니다.

- `region_count`
- `api_elapsed_ms`

GA4에는 지역명 목록, 피드백 원문, 익명 사용자 ID를 보내지 않습니다.

## 관리자 화면

`https://배포주소/admin.html`에서 `ADMIN_SECRET`을 입력합니다. Secret은 현재 탭의 `sessionStorage`에만 보관되며 서버 Function에서 환경변수와 비교합니다.

## 버전 전환

Netlify 환경변수 `APP_VERSION`을 `v1` 또는 `v2`로 바꾸고 재배포합니다. 이미 저장된 데이터는 변경되지 않으며 이후 생성되는 데이터부터 새 버전으로 기록됩니다.

## CSV

관리자 화면의 **CSV** 메뉴에서 다음 파일을 다운로드합니다.

- `sessions.csv`
- `weather_queries.csv`
- `events.csv`
- `kpi_summary.csv`

다운로드 파일에는 화면에서 선택한 날짜 범위가 적용됩니다. KPI 요약은 같은 날짜 범위의 v1과 v2를 함께 포함합니다.
