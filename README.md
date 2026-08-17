# 우산 챙길까?

저장한 생활지역의 우산 필요 여부를 자동으로 보여주는 정적 웹앱입니다. Netlify Functions와 Netlify DB(Postgres)를 사용해 익명 행동 로그와 KPI를 수집합니다.

## Netlify 설정

1. Netlify에서 이 저장소를 연결하고 Netlify DB를 생성합니다.
2. 환경변수 `ADMIN_SECRET`, `GA_MEASUREMENT_ID`, `APP_VERSION`을 설정합니다.
3. DB 연결 변수 `NETLIFY_DATABASE_URL`은 Netlify DB 연결 시 자동 생성됩니다.
4. 다시 배포하면 Functions가 최초 요청 시 필요한 테이블과 인덱스를 생성합니다.

`.env.example`에는 필요한 변수 이름만 있으며 실제 Secret은 커밋하지 않습니다.

## 버전 구분

Netlify의 `APP_VERSION`을 `v1` 또는 `v2`로 변경한 뒤 재배포합니다. 모든 신규 세션, 조회, 이벤트에 해당 버전이 기록됩니다.

## 관리자

배포 주소의 `/admin.html`에서 `ADMIN_SECRET`으로 로그인합니다. KPI 필터, v1/v2 비교, 세션 타임라인과 CSV 다운로드를 제공합니다.

## 로컬 테스트

```bash
npm install
npm test
```

Functions까지 로컬에서 확인하려면 Netlify CLI와 로컬 환경변수가 필요합니다.
