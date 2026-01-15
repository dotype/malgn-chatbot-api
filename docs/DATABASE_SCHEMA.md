# 데이터베이스 스키마 (Database Schema)

이 문서는 AI 챗봇 프로젝트의 데이터베이스 구조를 설명합니다.

---

## 개요

| 데이터베이스 | 용도 | 저장 데이터 |
|-------------|------|------------|
| **D1** (SQLite) | 메타데이터 저장 | 문서 정보, 청크 정보 |
| **Vectorize** | 벡터 저장 | 임베딩 벡터, 유사도 검색 |
| **R2** | 파일 저장 | 원본 파일 (선택적) |
| **KV** | 캐시 | 세션 데이터, 임시 저장 |

---

## D1 (SQLite) 스키마

### 테이블 구조

#### 1. `documents` - 문서 테이블

업로드된 문서의 메타데이터를 저장합니다.

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,           -- 문서 고유 ID (UUID)
  title TEXT NOT NULL,           -- 문서 제목
  filename TEXT NOT NULL,        -- 원본 파일명
  file_type TEXT NOT NULL,       -- 파일 유형 (pdf, txt, md)
  file_size INTEGER NOT NULL,    -- 파일 크기 (bytes)
  chunk_count INTEGER DEFAULT 0, -- 청크 개수
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
```

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| id | TEXT | UUID 형식의 고유 ID | `doc-a1b2c3d4` |
| title | TEXT | 문서 제목 | `환불 정책` |
| filename | TEXT | 원본 파일명 | `refund_policy.pdf` |
| file_type | TEXT | 파일 확장자 | `pdf`, `txt`, `md` |
| file_size | INTEGER | 바이트 단위 크기 | `102400` |
| chunk_count | INTEGER | 분할된 청크 수 | `5` |
| created_at | DATETIME | 생성 시간 | `2024-01-15 10:30:00` |
| updated_at | DATETIME | 수정 시간 | `2024-01-15 10:30:00` |

#### 2. `chunks` - 청크 테이블

문서를 분할한 청크 정보를 저장합니다.

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,           -- 청크 고유 ID
  document_id TEXT NOT NULL,     -- 문서 ID (외래키)
  content TEXT NOT NULL,         -- 청크 텍스트 내용
  position INTEGER NOT NULL,     -- 문서 내 순서 (0부터 시작)
  token_count INTEGER,           -- 토큰 수 (선택적)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_position ON chunks(document_id, position);
```

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| id | TEXT | UUID 형식의 고유 ID | `chunk-x1y2z3` |
| document_id | TEXT | 부모 문서 ID | `doc-a1b2c3d4` |
| content | TEXT | 청크 텍스트 | `환불은 구매 후 7일 이내...` |
| position | INTEGER | 순서 번호 | `0`, `1`, `2` |
| token_count | INTEGER | 토큰 수 | `128` |
| created_at | DATETIME | 생성 시간 | `2024-01-15 10:30:00` |

#### 3. `chat_sessions` - 채팅 세션 테이블 (선택적)

대화 기록을 저장합니다.

```sql
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,           -- 세션 ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,           -- 메시지 ID
  session_id TEXT NOT NULL,      -- 세션 ID
  role TEXT NOT NULL,            -- 'user' 또는 'assistant'
  content TEXT NOT NULL,         -- 메시지 내용
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
```

---

## Vectorize 구조

Vectorize는 벡터(숫자 배열)를 저장하고 유사도 검색을 수행합니다.

### 인덱스 설정

```
인덱스 이름: chatbot-docs
차원(Dimension): 768 (bge-base-en-v1.5 모델 기준)
거리 측정: cosine (코사인 유사도)
```

### 저장 데이터 구조

```javascript
{
  id: "chunk-x1y2z3",           // 청크 ID (D1의 chunks.id와 동일)
  values: [0.1, 0.2, ...],      // 768차원 벡터
  metadata: {
    documentId: "doc-a1b2c3d4", // 문서 ID
    documentTitle: "환불 정책",  // 문서 제목
    position: 0                 // 청크 순서
  }
}
```

### 검색 예시

```javascript
// 쿼리 벡터로 상위 5개 유사 청크 검색
const results = await env.VECTORIZE.query(queryVector, {
  topK: 5,
  returnMetadata: true,
  returnValues: false
});

// 결과 구조
// {
//   matches: [
//     { id: "chunk-1", score: 0.92, metadata: {...} },
//     { id: "chunk-2", score: 0.85, metadata: {...} },
//     ...
//   ]
// }
```

---

## KV 구조

KV는 키-값 형태로 데이터를 저장합니다. 주로 캐시 용도로 사용합니다.

### 키 패턴

| 패턴 | 용도 | TTL |
|------|------|-----|
| `session:{sessionId}` | 대화 세션 데이터 | 24시간 |
| `cache:doc:{docId}` | 문서 캐시 | 1시간 |

### 사용 예시

```javascript
// 세션 저장
await env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
  expirationTtl: 86400  // 24시간
});

// 세션 조회
const session = await env.KV.get(`session:${sessionId}`, { type: 'json' });

// 세션 삭제
await env.KV.delete(`session:${sessionId}`);
```

---

## R2 구조 (선택적)

원본 파일을 저장할 때 사용합니다.

### 파일 경로 패턴

```
documents/{documentId}/{filename}

예시:
documents/doc-a1b2c3d4/refund_policy.pdf
```

### 사용 예시

```javascript
// 파일 업로드
await env.BUCKET.put(
  `documents/${docId}/${filename}`,
  fileBuffer,
  {
    httpMetadata: {
      contentType: 'application/pdf'
    },
    customMetadata: {
      documentId: docId,
      originalName: filename
    }
  }
);

// 파일 다운로드
const object = await env.BUCKET.get(`documents/${docId}/${filename}`);
const buffer = await object.arrayBuffer();
```

---

## 데이터 관계도

```
┌─────────────────────────────────────────────────────────┐
│                          D1                             │
│  ┌─────────────┐         ┌─────────────┐               │
│  │  documents  │────────→│   chunks    │               │
│  │  (문서 정보) │  1:N    │ (텍스트 조각) │               │
│  └─────────────┘         └──────┬──────┘               │
│                                 │                       │
└─────────────────────────────────┼───────────────────────┘
                                  │ 같은 ID 사용
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                      Vectorize                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  벡터 데이터 (청크별 임베딩)                       │   │
│  │  id: chunk-xxx                                  │   │
│  │  values: [0.1, 0.2, ...]                       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 마이그레이션

### 초기 스키마 생성

```bash
# D1 데이터베이스 생성
wrangler d1 create chatbot-db

# 스키마 적용
wrangler d1 execute chatbot-db --file=./schema.sql
```

### Vectorize 인덱스 생성

```bash
# 인덱스 생성
wrangler vectorize create chatbot-docs --dimensions=768 --metric=cosine
```

---

## 주의사항

### D1 제한사항
- 단일 쿼리 최대 실행 시간: 30초
- 단일 행 최대 크기: 1MB
- 데이터베이스 최대 크기: 10GB (무료), 무제한 (유료)

### Vectorize 제한사항
- 벡터 차원: 최대 1536
- 단일 쿼리 최대 결과: 20개
- 메타데이터 크기: 최대 10KB

### 최적화 팁
1. **청크 크기**: 300~500 토큰이 적당
2. **인덱스**: 자주 검색하는 컬럼에 인덱스 추가
3. **배치 처리**: 대량 삽입 시 배치로 처리

---

## 다음 단계

- [환경 설정 가이드](./SETUP_GUIDE.md) - Cloudflare 리소스 생성 방법
