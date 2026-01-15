# API 명세서 (API Specification)

이 문서는 AI 챗봇 Backend API의 모든 엔드포인트를 설명합니다.

---

## 기본 정보

| 항목 | 값 |
|------|-----|
| Base URL (개발) | `http://localhost:8787` |
| Base URL (운영) | `https://your-api.workers.dev` |
| 응답 형식 | JSON |
| 인증 | 필요 없음 |

---

## 목차

1. [채팅 API](#1-채팅-api)
2. [문서 관리 API](#2-문서-관리-api)
3. [상태 확인 API](#3-상태-확인-api)
4. [에러 코드](#4-에러-코드)

---

## 1. 채팅 API

### POST /chat

사용자 메시지를 받아 AI 응답을 생성합니다.

#### 요청 (Request)

```http
POST /chat
Content-Type: application/json
```

**Body:**
```json
{
  "message": "환불 정책이 어떻게 되나요?",
  "sessionId": "optional-session-id",
  "settings": {
    "persona": "당신은 친절한 AI 튜터입니다.",
    "temperature": 0.7,
    "topP": 0.9,
    "maxTokens": 1024
  }
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| message | string | O | 사용자 질문 |
| sessionId | string | X | 대화 세션 ID (대화 기록 유지용) |
| settings | object | X | AI 설정 (선택적) |
| settings.persona | string | X | AI 페르소나 (시스템 프롬프트) |
| settings.temperature | number | X | 창의성 (0~1, 기본값: 0.7) |
| settings.topP | number | X | 다양성 (0.1~1, 기본값: 0.9) |
| settings.maxTokens | number | X | 최대 응답 길이 (256~4096, 기본값: 1024) |

#### 응답 (Response)

**성공 (200 OK):**
```json
{
  "success": true,
  "data": {
    "response": "환불은 구매 후 7일 이내에 가능합니다. 단, 사용 흔적이 있는 상품은 환불이 불가합니다.",
    "sources": [
      {
        "documentId": "doc-123",
        "title": "환불 및 교환 정책",
        "score": 0.92
      }
    ],
    "sessionId": "sess-abc123"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| response | string | AI 응답 텍스트 |
| sources | array | 참조된 문서 목록 |
| sources[].documentId | string | 문서 ID |
| sources[].title | string | 문서 제목 |
| sources[].score | number | 유사도 점수 (0~1) |
| sessionId | string | 대화 세션 ID |

**학습된 정보가 없는 경우 (200 OK):**
```json
{
  "success": true,
  "data": {
    "response": "죄송합니다. 해당 질문에 대한 학습된 정보가 없습니다. 다른 질문을 해주시거나, 관련 문서를 업로드해 주세요.",
    "sources": [],
    "sessionId": "sess-abc123"
  }
}
```

#### 예제 (curl)

**기본 요청:**
```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "환불 정책이 어떻게 되나요?"}'
```

**AI 설정 포함:**
```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "환불 정책이 어떻게 되나요?",
    "settings": {
      "persona": "당신은 친절한 고객 상담원입니다.",
      "temperature": 0.5,
      "maxTokens": 512
    }
  }'
```

---

## 2. 문서 관리 API

### GET /documents

업로드된 문서 목록을 조회합니다.

#### 요청 (Request)

```http
GET /documents
```

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| page | number | X | 페이지 번호 (기본값: 1) |
| limit | number | X | 페이지당 개수 (기본값: 20, 최대: 100) |

#### 응답 (Response)

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-123",
        "title": "환불 및 교환 정책",
        "filename": "refund_policy.pdf",
        "fileType": "pdf",
        "fileSize": 102400,
        "chunkCount": 5,
        "createdAt": "2024-01-15T10:30:00Z"
      },
      {
        "id": "doc-456",
        "title": "제품 사용 설명서",
        "filename": "manual.txt",
        "fileType": "txt",
        "fileSize": 51200,
        "chunkCount": 3,
        "createdAt": "2024-01-14T09:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

#### 예제 (curl)

```bash
curl http://localhost:8787/documents?page=1&limit=10
```

---

### POST /documents

새 문서를 업로드합니다.

#### 요청 (Request)

```http
POST /documents
Content-Type: multipart/form-data
```

**Form Data:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| file | file | O | 업로드할 파일 (PDF, TXT, MD) |
| title | string | X | 문서 제목 (미입력 시 파일명 사용) |

**지원 파일 형식:**
| 형식 | 확장자 | 최대 크기 |
|------|--------|----------|
| PDF | .pdf | 10MB |
| 텍스트 | .txt | 5MB |
| 마크다운 | .md | 5MB |

#### 응답 (Response)

**성공 (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "doc-789",
    "title": "새 문서",
    "filename": "new_document.pdf",
    "fileType": "pdf",
    "fileSize": 204800,
    "chunkCount": 8,
    "createdAt": "2024-01-15T14:00:00Z"
  },
  "message": "문서가 성공적으로 업로드되었습니다."
}
```

#### 예제 (curl)

```bash
curl -X POST http://localhost:8787/documents \
  -F "file=@./my_document.pdf" \
  -F "title=내 문서"
```

---

### GET /documents/:id

특정 문서의 상세 정보를 조회합니다.

#### 요청 (Request)

```http
GET /documents/:id
```

#### 응답 (Response)

```json
{
  "success": true,
  "data": {
    "id": "doc-123",
    "title": "환불 및 교환 정책",
    "filename": "refund_policy.pdf",
    "fileType": "pdf",
    "fileSize": 102400,
    "chunkCount": 5,
    "chunks": [
      {
        "id": "chunk-1",
        "content": "환불 정책: 구매 후 7일 이내...",
        "position": 0
      },
      {
        "id": "chunk-2",
        "content": "교환 정책: 동일 상품으로...",
        "position": 1
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 예제 (curl)

```bash
curl http://localhost:8787/documents/doc-123
```

---

### DELETE /documents/:id

문서를 삭제합니다.

#### 요청 (Request)

```http
DELETE /documents/:id
```

#### 응답 (Response)

**성공 (200 OK):**
```json
{
  "success": true,
  "message": "문서가 성공적으로 삭제되었습니다."
}
```

#### 예제 (curl)

```bash
curl -X DELETE http://localhost:8787/documents/doc-123
```

---

## 3. 상태 확인 API

### GET /health

서버 상태를 확인합니다.

#### 요청 (Request)

```http
GET /health
```

#### 응답 (Response)

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

---

## 4. 에러 코드

### HTTP 상태 코드

| 코드 | 의미 | 설명 |
|------|------|------|
| 200 | OK | 요청 성공 |
| 201 | Created | 리소스 생성 성공 |
| 400 | Bad Request | 잘못된 요청 (파라미터 오류 등) |
| 404 | Not Found | 리소스를 찾을 수 없음 |
| 413 | Payload Too Large | 파일 크기 초과 |
| 415 | Unsupported Media Type | 지원하지 않는 파일 형식 |
| 500 | Internal Server Error | 서버 내부 오류 |

### 에러 응답 형식

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "message 필드는 필수입니다."
  }
}
```

### 에러 코드 목록

| 코드 | 설명 |
|------|------|
| VALIDATION_ERROR | 입력값 검증 실패 |
| NOT_FOUND | 리소스 없음 |
| FILE_TOO_LARGE | 파일 크기 초과 |
| UNSUPPORTED_FILE_TYPE | 지원하지 않는 파일 형식 |
| EMBEDDING_ERROR | 임베딩 생성 실패 |
| AI_ERROR | AI 응답 생성 실패 |
| INTERNAL_ERROR | 내부 서버 오류 |

---

## CORS 설정

모든 API는 CORS가 활성화되어 있습니다.

**허용된 헤더:**
- Content-Type
- Authorization (향후 사용)

**허용된 메서드:**
- GET
- POST
- DELETE
- OPTIONS

---

## 다음 단계

- [데이터베이스 스키마](./DATABASE_SCHEMA.md) - DB 구조
- [환경 설정 가이드](./SETUP_GUIDE.md) - 개발 환경 설정
