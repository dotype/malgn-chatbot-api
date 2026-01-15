# 프로젝트 구조 (Project Structure)

이 문서는 AI 챗봇 프로젝트의 전체 구조를 설명합니다.

---

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                           │
│                    (malgn-chatbot Frontend)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP 요청
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                             │
│                   (정적 파일 호스팅)                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ API 호출
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers                             │
│               (malgn-chatbot-api Backend)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Hono Framework                         │  │
│  │  ┌─────────┐  ┌───────────┐  ┌────────────┐             │  │
│  │  │ Routes  │→ │ Services  │→ │ Cloudflare │             │  │
│  │  │         │  │           │  │ Bindings   │             │  │
│  │  └─────────┘  └───────────┘  └────────────┘             │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Workers AI  │  │  Vectorize   │  │     D1       │
│   (LLM +     │  │ (벡터 검색)   │  │  (SQLite)   │
│  임베딩)      │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 프로젝트 폴더 구조

### 전체 구조

```
Projects/
├── malgn-chatbot/          # Frontend (Cloudflare Pages)
│   ├── index.html          # 메인 HTML
│   ├── css/
│   │   └── style.css       # 스타일시트
│   ├── js/
│   │   ├── app.js          # 메인 앱 로직
│   │   ├── api.js          # API 통신 모듈
│   │   ├── chat.js         # 채팅 기능
│   │   ├── documents.js    # 문서 관리
│   │   └── settings.js     # 설정 관리
│   └── docs/               # 프론트엔드 문서
│
└── malgn-chatbot-api/      # Backend (Cloudflare Workers)
    ├── src/
    │   ├── index.js        # 앱 엔트리 포인트
    │   ├── routes/         # API 라우트
    │   │   ├── chat.js     # 채팅 API
    │   │   └── documents.js# 문서 관리 API
    │   ├── services/       # 비즈니스 로직
    │   │   ├── chatService.js
    │   │   ├── documentService.js
    │   │   └── embeddingService.js
    │   ├── middleware/     # 미들웨어
    │   └── utils/          # 유틸리티
    ├── docs/               # API 문서
    ├── wrangler.toml       # Cloudflare 설정
    └── schema.sql          # DB 스키마
```

---

## Backend 폴더 상세 설명

### `src/routes/` - API 라우트

API 엔드포인트를 정의하는 폴더입니다.

| 파일 | 역할 | 주요 엔드포인트 |
|------|------|----------------|
| `chat.js` | 채팅 기능 | `POST /chat` |
| `documents.js` | 문서 관리 | `GET/POST/DELETE /documents` |

**규칙**:
- 비즈니스 로직은 포함하지 않음
- Service 레이어에 로직을 위임

### `src/services/` - 서비스 레이어

비즈니스 로직을 처리하는 폴더입니다.

| 파일 | 역할 |
|------|------|
| `chatService.js` | RAG 기반 채팅 응답 생성 |
| `documentService.js` | 문서 업로드, 삭제, 목록 조회 |
| `embeddingService.js` | 텍스트 → 벡터 변환 |

**규칙**:
- 모든 서비스는 **클래스** 형태
- 생성자에서 `env` 객체를 받음

```javascript
// 서비스 클래스 예시
export class ChatService {
  constructor(env) {
    this.env = env;  // Cloudflare 바인딩 접근
  }

  async chat(message) {
    // 비즈니스 로직
  }
}
```

### `src/middleware/` - 미들웨어

요청/응답을 중간에서 처리합니다.

| 파일 | 역할 |
|------|------|
| `errorHandler.js` | 전역 에러 처리 |
| `auth.js` | JWT 인증 (현재 비활성화) |

### `src/utils/` - 유틸리티

재사용 가능한 헬퍼 함수들입니다.

---

## Frontend 폴더 상세 설명

### `js/` - JavaScript 모듈

| 파일 | 역할 |
|------|------|
| `app.js` | 앱 초기화, 이벤트 리스너 |
| `api.js` | Backend API 호출 |
| `chat.js` | 채팅 UI 및 메시지 처리 |
| `documents.js` | 문서 업로드/목록 UI |
| `settings.js` | AI 설정 UI |

### `css/` - 스타일시트

| 파일 | 역할 |
|------|------|
| `style.css` | 전체 레이아웃 및 스타일 |

---

## 데이터 흐름

### 1. 문서 업로드 흐름

```
사용자 → 파일 선택 → Frontend (documents.js)
                         ↓ POST /documents
                    Backend (routes/documents.js)
                         ↓
                    DocumentService
                         ↓
                    EmbeddingService (텍스트→벡터)
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
           D1 (메타데이터)      Vectorize (벡터)
```

### 2. 채팅 흐름

```
사용자 → 질문 입력 → Frontend (chat.js)
                         ↓ POST /chat
                    Backend (routes/chat.js)
                         ↓
                    ChatService
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
    EmbeddingService          Vectorize (검색)
    (질문→벡터)                     ↓
              └─────────┬──────────┘
                        ↓
                   Workers AI (LLM)
                        ↓
                   응답 생성
```

---

## 환경별 설정

| 환경 | Frontend URL | Backend URL |
|------|-------------|-------------|
| 개발 | `localhost:8788` | `localhost:8787` |
| 운영 | `your-domain.pages.dev` | `your-api.workers.dev` |

---

## 다음 단계

- [기술 스택 설명](./TECH_STACK.md) - 사용된 기술 상세 설명
- [API 명세서](./API_SPECIFICATION.md) - API 엔드포인트 상세
- [데이터베이스 스키마](./DATABASE_SCHEMA.md) - DB 구조
- [환경 설정 가이드](./SETUP_GUIDE.md) - 개발 환경 설정
