# AI 챗봇 프로젝트 진행 현황

## 프로젝트 개요

- **목표**: 특정 정보를 학습하고 해당 정보에 대한 내용만 답변하는 AI 챗봇
- **아키텍처**: RAG (Retrieval Augmented Generation) 패턴
- **배포 URL**: https://malgn-chatbot-api.dotype.workers.dev

---

## 기술 스택

| 구분 | 기술 | 설명 |
|------|------|------|
| Backend | Cloudflare Workers + Hono | 서버리스 API |
| Frontend | Cloudflare Pages + Vanilla JS | 프레임워크 없음 |
| LLM | OpenAI GPT-4o-mini | 응답 생성 |
| Embedding | OpenAI text-embedding-3-small | 1536차원 벡터 |
| Vector DB | Cloudflare Vectorize | 유사도 검색 |
| Database | Cloudflare D1 (SQLite) | 메타데이터 저장 |
| Storage | Cloudflare R2 | 원본 파일 저장 |
| Cache | Cloudflare KV | 세션 캐시 |

---

## 완료된 작업

### 1. OpenAI API 마이그레이션

**이전**: Cloudflare Workers AI
- 임베딩: `@cf/baai/bge-base-en-v1.5` (768차원)
- LLM: `@cf/meta/llama-3.1-8b-instruct`

**이후**: OpenAI API
- 임베딩: `text-embedding-3-small` (1536차원)
- LLM: `gpt-4o-mini`

**변경 파일**:
- `src/services/embeddingService.js` - OpenAI Embeddings API 사용
- `src/services/chatService.js` - OpenAI Chat Completions API 사용

**Vectorize 인덱스 재생성**:
```bash
wrangler vectorize delete malgn-chatbot-vectors
wrangler vectorize create malgn-chatbot-vectors --dimensions=1536 --metric=cosine
```

---

### 2. 데이터베이스 스키마 업데이트

#### TB_SESSION 컬럼 추가
```sql
ALTER TABLE TB_SESSION ADD COLUMN learning_goal TEXT;
ALTER TABLE TB_SESSION ADD COLUMN learning_summary TEXT;
ALTER TABLE TB_SESSION ADD COLUMN recommended_questions TEXT;
```

#### TB_QUIZ 테이블 생성
```sql
CREATE TABLE IF NOT EXISTS TB_QUIZ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('choice', 'ox')),
  question TEXT NOT NULL,
  options TEXT,
  answer TEXT NOT NULL,
  explanation TEXT,
  position INTEGER NOT NULL,
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES TB_SESSION(id) ON DELETE CASCADE
);
```

---

### 3. 퀴즈 기능 구현

**새 파일**: `src/services/quizService.js`

**기능**:
- 4지선다 퀴즈 생성 (`choice`)
- OX 퀴즈 생성 (`ox`)
- 세션별 퀴즈 조회

**API 엔드포인트**:
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/sessions/:id/quizzes` | 퀴즈 조회 |
| POST | `/sessions/:id/quizzes` | 퀴즈 생성 |

---

### 4. 세션 생성 시 학습 자료 필수화

**변경 사항**: 세션 생성 시 최소 1개 이상의 콘텐츠 선택 필수

```javascript
// POST /sessions
if (contentIds.length === 0) {
  return c.json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: '최소 하나 이상의 학습 자료를 선택해 주세요.'
    }
  }, 400);
}
```

---

### 5. 학습 메타데이터 생성 및 Vectorize 저장

**새 파일**: `src/services/learningService.js`

**기능**:
1. 세션 생성 시 콘텐츠 기반으로 학습 목표, 요약, 추천 질문 자동 생성
2. 학습 목표/요약을 임베딩하여 Vectorize에 저장
3. 세션 삭제 시 Vectorize에서 임베딩 삭제

**Vectorize 저장 형식**:
```javascript
{
  id: `session-${sessionId}-goal`,
  values: embedding,
  metadata: {
    type: 'learning_goal',  // 또는 'learning_summary'
    sessionId: sessionId,
    contentIds: contentIds,
    text: learningGoal
  }
}
```

---

### 6. 질의응답 시 학습 메타데이터 참조

**변경 파일**: `src/services/chatService.js`

**수정 내용**:

#### searchSimilarDocuments()
- `sessionId` 파라미터 추가
- 학습 목표/요약과 청크 분리 필터링
- 학습 결과 우선 반환

```javascript
async searchSimilarDocuments(queryEmbedding, topK = 5, allowedContentIds = [], sessionId = null) {
  // 학습 목표/요약은 해당 세션의 것만
  if (type === 'learning_goal' || type === 'learning_summary') {
    if (sessionId && match.metadata?.sessionId === sessionId) {
      learningResults.push(match);
    }
  }
  // 학습 목표/요약 우선 + 청크 결합
  return [...learningResults, ...chunkResults.slice(0, topK)];
}
```

#### buildContext()
- 학습 목표/요약은 `metadata.text`에서 직접 추출
- 청크는 기존처럼 D1에서 조회

```javascript
async buildContext(searchResults) {
  if (type === 'learning_goal') {
    contextParts.unshift(`[학습 목표]\n${goalText}`);
  } else if (type === 'learning_summary') {
    contextParts.push(`[학습 요약]\n${summaryText}`);
  }
  // 청크는 DB에서 조회...
}
```

---

## 전체 데이터 흐름

### 세션 생성 시
```
1. POST /sessions { content_ids: [1, 2, 3] }
2. TB_SESSION 레코드 생성
3. TB_SESSION_CONTENT 연결 생성
4. LearningService.generateAndStoreLearningData()
   ├─ 콘텐츠 청크 조회 (최대 30개)
   ├─ OpenAI로 학습 목표/요약/추천 질문 생성
   ├─ TB_SESSION에 저장
   └─ Vectorize에 임베딩 저장
5. 응답 반환 (learning 데이터 포함)
```

### 질의응답 시
```
1. POST /chat { message: "질문", sessionId: 1 }
2. 질문 임베딩 생성
3. searchSimilarDocuments()
   ├─ Vectorize에서 유사도 검색
   ├─ 학습 목표/요약 (현재 세션) 필터링
   └─ 콘텐츠 청크 필터링
4. buildContext()
   ├─ [학습 목표] + [학습 요약] + 청크 결합
5. generateResponse()
   └─ OpenAI로 응답 생성
6. 응답 반환 (sources 포함)
```

### 세션 삭제 시
```
1. DELETE /sessions/:id
2. TB_MESSAGE soft delete
3. TB_SESSION_CONTENT soft delete
4. TB_QUIZ soft delete
5. LearningService.deleteLearningEmbeddings()
   └─ Vectorize에서 임베딩 삭제
6. TB_SESSION soft delete
```

---

## 파일 구조

```
malgn-chatbot-api/
├── src/
│   ├── index.js                 # 메인 엔트리
│   ├── routes/
│   │   ├── chat.js              # 채팅 API
│   │   ├── contents.js          # 콘텐츠 API
│   │   └── sessions.js          # 세션 API (퀴즈 포함)
│   └── services/
│       ├── chatService.js       # RAG 채팅 서비스
│       ├── documentService.js   # 문서 처리 서비스
│       ├── embeddingService.js  # OpenAI 임베딩 서비스
│       ├── learningService.js   # 학습 메타데이터 서비스
│       └── quizService.js       # 퀴즈 생성 서비스
├── schema.sql                   # D1 스키마
├── wrangler.toml                # Cloudflare 설정
└── docs/
    └── PROGRESS.md              # 이 문서
```

---

## API 엔드포인트 요약

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스체크 |
| POST | `/chat` | 채팅 메시지 전송 |
| GET | `/contents` | 콘텐츠 목록 조회 |
| POST | `/contents` | 콘텐츠 업로드 |
| DELETE | `/contents/:id` | 콘텐츠 삭제 |
| GET | `/sessions` | 세션 목록 조회 |
| POST | `/sessions` | 세션 생성 |
| GET | `/sessions/:id` | 세션 상세 조회 |
| PUT | `/sessions/:id` | 세션 설정 수정 |
| DELETE | `/sessions/:id` | 세션 삭제 |
| GET | `/sessions/:id/quizzes` | 퀴즈 조회 |
| POST | `/sessions/:id/quizzes` | 퀴즈 생성 |

---

## 환경 변수

### 로컬 개발 (.dev.vars)
```
ENVIRONMENT=development
OPENAI_API_KEY=sk-xxx
```

### 프로덕션 (Wrangler Secrets)
```bash
wrangler secret put OPENAI_API_KEY
```

---

### 7. 세션 제목 자동 생성

**변경 사항**: 세션 생성 시 학습 자료 기반으로 AI가 제목을 자동 생성

**DB 스키마 업데이트**:
```sql
ALTER TABLE TB_SESSION ADD COLUMN session_nm TEXT;
```

**LearningService 업데이트**:
- `generateLearningData()`: 제목(sessionNm) 필드 추가
- 프롬프트에 "학습 세션의 간결한 제목 (15자 이내)" 생성 요청
- 제목 생성 실패 시 콘텐츠 제목 조합으로 대체

**API 응답**:
- `POST /sessions`: AI 생성 제목 반환 (title 필드)
- `GET /sessions`: DB의 session_nm 반환 (없으면 첫 메시지 기반)
- `GET /sessions/:id`: DB의 session_nm 반환

---

### 8. 프론트엔드 학습 데이터 표시

**변경 파일**: `js/chat.js`

**기능**:
- `loadSession()`: 세션 로드 시 학습 데이터 표시
- `renderLearningData()`: 학습목표, 요약, 추천질문 렌더링
- 추천 질문 클릭 시 입력창에 자동 입력

---

### 9. 청크 시스템 제거 및 전체 콘텐츠 임베딩

**변경 사항**: 청크 분할 방식에서 전체 콘텐츠 임베딩 방식으로 변경

**이전 구조**:
- TB_CONTENT: 메타데이터 저장
- TB_CHUNK: 청크(500자 단위)로 분할하여 저장
- Vectorize: 각 청크별 임베딩 저장

**새 구조**:
- TB_CONTENT: 메타데이터 + 전체 content 저장
- TB_CHUNK: 제거 (미사용)
- Vectorize: 콘텐츠 전체 임베딩 저장

**DB 스키마 변경**:
```sql
ALTER TABLE TB_CONTENT ADD COLUMN content TEXT;
-- TB_CHUNK 테이블은 더 이상 사용하지 않음
```

**변경 파일**:
- `schema.sql` - TB_CHUNK 제거, TB_CONTENT에 content 컬럼 추가
- `contentService.js` - 전체 콘텐츠 저장 및 임베딩
- `chatService.js` - 콘텐츠 기반 검색
- `learningService.js` - 콘텐츠에서 직접 텍스트 조회
- `embeddingService.js` - 청크 분할 메서드 제거

**Vectorize 저장 형식**:
```javascript
{
  id: `content-${contentId}`,
  values: embedding,
  metadata: {
    type: 'content',
    contentId: contentId,
    contentTitle: contentTitle
  }
}
```

---

### 10. PDF 텍스트 추출 개선

**이전 방식**: 정규식 기반 텍스트 추출
- BT...ET 블록에서 Tj 연산자 파싱
- 복잡한 PDF나 최신 PDF에서 텍스트 추출 실패

**새 방식**: unpdf 라이브러리 사용
- PDF.js 기반의 정확한 텍스트 추출
- 다양한 인코딩 및 폰트 지원

**변경 파일**: `src/services/contentService.js`
```javascript
import { extractText as extractPdfTextFromBuffer } from 'unpdf';

async extractPdfText(buffer) {
  const { text } = await extractPdfTextFromBuffer(new Uint8Array(buffer));
  return text;
}
```

**의존성 추가**:
```bash
npm install unpdf
```

---

## 다음 단계 (예정)

- [x] 프론트엔드 학습 메타데이터 표시
- [x] 청크 시스템 제거 및 전체 콘텐츠 임베딩
- [x] PDF 텍스트 추출 개선 (unpdf 라이브러리)
- [ ] 퀴즈 UI 구현
- [ ] 대화 히스토리 기반 응답 개선
- [ ] 사용자 인증 추가 (선택)
