# Malgn Chatbot API

LMS(학습관리시스템)용 AI 튜터 챗봇 백엔드 API.
RAG(Retrieval-Augmented Generation) 파이프라인을 통해 학습 자료 기반 질의응답, 학습 메타데이터 자동 생성, 퀴즈 자동 생성을 제공합니다.

> **개발 시작 전 반드시 [DEVLOPMENT_GUIDE.md](DEVLOPMENT_GUIDE.md)를 읽어주세요.**

## 기술 스택

| 구분 | 기술 |
|------|------|
| **런타임** | Cloudflare Workers |
| **프레임워크** | Hono |
| **데이터베이스** | Cloudflare D1 (SQLite) |
| **벡터 DB** | Cloudflare Vectorize (768차원, 코사인 유사도) |
| **KV 캐시** | Cloudflare KV (세션 캐시 24시간 TTL) |
| **오브젝트 스토리지** | Cloudflare R2 |
| **AI 모델 (채팅)** | `@cf/meta/llama-3.1-8b-instruct` |
| **AI 모델 (학습/퀴즈)** | `@cf/meta/llama-3.1-70b-instruct` |
| **임베딩 모델** | `@cf/baai/bge-base-en-v1.5` (768차원) |
| **AI Gateway** | Cloudflare AI Gateway (`malgn-chatbot`, cache 3600s) |
| **인증** | Bearer 토큰 (API Key) |
| **API 문서** | Swagger UI (`@hono/swagger-ui`) |

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

- API: http://localhost:8787
- Swagger 문서: http://localhost:8787/docs
- OpenAPI 스펙: http://localhost:8787/openapi.json

### 3. 배포 (테넌트별)

```bash
# API Key 설정 (최초 1회, 테넌트별)
wrangler secret put API_KEY --env user1
wrangler secret put API_KEY --env user2

# 배포
wrangler deploy --env user1
wrangler deploy --env user2
```

## 주요 엔드포인트

### 공개 (인증 불필요)
- `GET /health` - 헬스체크
- `GET /docs` - Swagger UI 문서
- `GET /openapi.json` - OpenAPI 스펙

### 인증 필요 (`Authorization: Bearer {API_KEY}`)

**채팅**
- `POST /chat` - 동기 채팅 (RAG 파이프라인)
- `POST /chat/stream` - SSE 스트리밍 채팅

**세션 관리**
- `GET /sessions` - 세션 목록 (부모만)
- `POST /sessions` - 세션 생성 (부모 또는 자식)
- `GET /sessions/:id` - 세션 상세 (메시지 + 학습데이터)
- `PUT /sessions/:id` - 세션 AI 설정 업데이트
- `DELETE /sessions/:id` - 세션 삭제 (자식 연쇄 삭제)
- `GET /sessions/:id/quizzes` - 세션 퀴즈 조회
- `POST /sessions/:id/quizzes` - 세션 퀴즈 재생성

**콘텐츠 관리**
- `GET /contents` - 콘텐츠 목록
- `POST /contents` - 콘텐츠 등록 (text/file/link)
- `GET /contents/:id` - 콘텐츠 상세
- `PUT /contents/:id` - 콘텐츠 수정
- `DELETE /contents/:id` - 콘텐츠 삭제
- `GET /contents/:id/quizzes` - 콘텐츠 퀴즈 조회
- `POST /contents/:id/quizzes` - 콘텐츠 퀴즈 재생성
- `POST /contents/regenerate-all-quizzes` - 전체 퀴즈 재생성
- `POST /contents/reembed` - 전체 콘텐츠 재임베딩

> 상세 API 명세는 [API_SPECIFICATION.md](API_SPECIFICATION.md)를 참조하세요.

## 프로젝트 구조

```
src/
├── index.js                # 엔트리 포인트 + 라우팅 + Swagger UI
├── openapi.js              # OpenAPI 3.0 스펙
├── middleware/
│   ├── auth.js             # Bearer 토큰 인증
│   └── errorHandler.js     # 글로벌 에러 핸들러
├── routes/
│   ├── chat.js             # POST /chat, /chat/stream
│   ├── sessions.js         # GET/POST/PUT/DELETE /sessions
│   └── contents.js         # GET/POST/PUT/DELETE /contents
├── services/
│   ├── chatService.js      # RAG 파이프라인 + LLM 응답 생성
│   ├── contentService.js   # 콘텐츠 업로드, 텍스트 추출, 임베딩
│   ├── embeddingService.js # 텍스트→벡터 변환 (768차원)
│   ├── learningService.js  # 학습 메타데이터 생성 (목표/요약/추천질문)
│   ├── quizService.js      # 퀴즈 생성 (4지선다 + OX)
│   └── openaiService.js    # OpenAI 연동 (선택)
└── utils/
    └── utils.js            # 유틸리티 함수
```

## 멀티테넌트 구조

| 테넌트 | 환경 | DB | 비고 |
|--------|------|-----|------|
| dev | 로컬 개발 | `malgn-chatbot-db` | `wrangler dev` |
| user1 | 프로덕션 | `malgn-chatbot-db` (dev와 공유) | `wrangler deploy --env user1` |
| user2 | 프로덕션 | `malgn-chatbot-db-user2` (독립) | `wrangler deploy --env user2` |

각 테넌트별로 D1, KV, R2, Vectorize 리소스가 분리됩니다.

### 새 테넌트 추가

```bash
# 1. 리소스 생성
wrangler d1 create malgn-chatbot-db-<tenant_id>
wrangler kv namespace create malgn-chatbot-kv-<tenant_id>
wrangler r2 bucket create malgn-chatbot-files-<tenant_id>
wrangler vectorize create malgn-chatbot-vectors-<tenant_id> --dimensions=768 --metric=cosine

# 2. wrangler.toml에 [env.<tenant_id>] 섹션 추가

# 3. 스키마 적용
wrangler d1 execute malgn-chatbot-db-<tenant_id> --file=./schema.sql

# 4. 시크릿 설정
wrangler secret put API_KEY --env <tenant_id>

# 5. 배포
wrangler deploy --env <tenant_id>
```

## D1 마이그레이션

```bash
# 전체 스키마 적용 (신규 DB)
wrangler d1 execute <db-name> --file=./schema.sql

# 개별 마이그레이션
wrangler d1 execute <db-name> --file=./migrations/001_quiz_content_based.sql
wrangler d1 execute <db-name> --file=./migrations/002_session_course_fields.sql
wrangler d1 execute <db-name> --file=./migrations/003_session_parent_id.sql
```

## 환경 변수

### 로컬 개발 (`.dev.vars`)

```
API_KEY=your-api-key-here
```

### Production (Wrangler Secrets)

```bash
wrangler secret put API_KEY --env <tenant_id>
```

## 관련 문서

- [API 명세서](API_SPECIFICATION.md) - 전체 엔드포인트 상세
- [개발 가이드](DEVLOPMENT_GUIDE.md) - 코딩 컨벤션 및 아키텍처 패턴
