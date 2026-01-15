# 기술 스택 (Tech Stack)

이 문서는 AI 챗봇 프로젝트에서 사용하는 기술들을 주니어 개발자도 이해할 수 있도록 설명합니다.

---

## 목차

1. [Cloudflare 서비스 소개](#cloudflare-서비스-소개)
2. [RAG란 무엇인가?](#rag란-무엇인가)
3. [사용 기술 상세](#사용-기술-상세)
4. [용어 설명](#용어-설명)

---

## Cloudflare 서비스 소개

Cloudflare는 웹 인프라를 제공하는 회사입니다. 우리는 Cloudflare의 여러 서비스를 사용합니다.

### 사용하는 Cloudflare 서비스

| 서비스 | 역할 | 쉬운 설명 |
|--------|------|----------|
| **Workers** | Backend API 서버 | Node.js 같은 서버인데, 전 세계 어디서나 빠르게 실행됨 |
| **Pages** | Frontend 호스팅 | HTML, CSS, JS 파일을 인터넷에 올려주는 서비스 |
| **Workers AI** | AI 모델 실행 | ChatGPT 같은 AI를 사용할 수 있게 해줌 |
| **Vectorize** | 벡터 데이터베이스 | "비슷한 문장 찾기"를 빠르게 해주는 특별한 DB |
| **D1** | 일반 데이터베이스 | SQLite 기반, 문서 정보 저장 |
| **R2** | 파일 저장소 | 업로드된 파일 원본 저장 |
| **KV** | 캐시 저장소 | 자주 사용하는 데이터 빠르게 저장/조회 |

---

## RAG란 무엇인가?

**RAG (Retrieval-Augmented Generation)** = 검색 증강 생성

쉽게 말해, "내가 가르쳐준 정보만 가지고 대답하는 AI"를 만드는 방법입니다.

### 왜 RAG가 필요한가요?

일반 ChatGPT의 문제점:
- 학습되지 않은 최신 정보는 모름
- 우리 회사/제품에 대한 정보를 모름
- 가끔 틀린 정보를 말함 (할루시네이션)

RAG의 해결책:
- 우리가 원하는 문서를 먼저 "학습"시킴
- 질문이 들어오면 관련 문서를 먼저 검색
- 검색된 문서를 기반으로 AI가 대답

### RAG 작동 원리 (단계별)

#### Step 1: 문서 학습 (준비 단계)

```
1. 문서 업로드 (예: 회사 매뉴얼.pdf)
       ↓
2. 텍스트 추출 (PDF → 텍스트)
       ↓
3. 청크 분할 (긴 글을 500자씩 조각냄)
       ↓
4. 임베딩 생성 (텍스트 → 숫자 배열로 변환)
       ↓
5. 벡터 DB에 저장 (Vectorize)
```

**임베딩(Embedding)이란?**
- 텍스트를 숫자로 바꾸는 것
- 비슷한 의미의 문장은 비슷한 숫자가 됨
- 예시:
  - "강아지는 귀엽다" → [0.1, 0.8, 0.3, ...]
  - "멍멍이가 사랑스럽다" → [0.12, 0.78, 0.31, ...] (비슷!)
  - "주식 시장이 하락했다" → [0.9, 0.1, 0.7, ...] (다름)

#### Step 2: 질문 응답 (실행 단계)

```
1. 사용자 질문: "환불 정책이 어떻게 되나요?"
       ↓
2. 질문을 임베딩으로 변환
       ↓
3. 벡터 DB에서 비슷한 문서 검색
   → "환불 규정: 구매 후 7일 이내..." 찾음
       ↓
4. 찾은 문서 + 질문을 AI에게 전달
   "다음 정보를 바탕으로 질문에 답해주세요:
    [환불 규정: 구매 후 7일 이내...]
    질문: 환불 정책이 어떻게 되나요?"
       ↓
5. AI가 문서 기반으로 응답 생성
   → "환불은 구매 후 7일 이내에 가능합니다..."
```

---

## 사용 기술 상세

### Backend

#### Hono (웹 프레임워크)

Express.js와 비슷하지만 더 가볍고 빠른 웹 프레임워크입니다.

```javascript
import { Hono } from 'hono';

const app = new Hono();

// GET 요청 처리
app.get('/hello', (c) => {
  return c.json({ message: 'Hello!' });
});

// POST 요청 처리
app.post('/chat', async (c) => {
  const body = await c.req.json();
  // 처리 로직
  return c.json({ response: '...' });
});
```

**장점**:
- 매우 빠름 (Cloudflare Workers에 최적화)
- Express.js와 비슷해서 배우기 쉬움
- TypeScript 지원

#### Workers AI

Cloudflare에서 제공하는 AI 서비스입니다.

```javascript
// 텍스트 생성 (LLM)
const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [
    { role: 'system', content: '당신은 친절한 도우미입니다.' },
    { role: 'user', content: '안녕하세요!' }
  ]
});

// 임베딩 생성
const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
  text: '변환할 텍스트'
});
```

**사용하는 모델**:
| 모델 | 용도 |
|------|------|
| `@cf/meta/llama-3.1-8b-instruct` | 텍스트 생성 (대화) |
| `@cf/baai/bge-base-en-v1.5` | 텍스트 → 임베딩 변환 |

#### Vectorize (벡터 데이터베이스)

"비슷한 것 찾기"에 특화된 데이터베이스입니다.

```javascript
// 벡터 저장
await env.VECTORIZE.insert([{
  id: 'doc-1',
  values: [0.1, 0.8, 0.3, ...],  // 임베딩 벡터
  metadata: { title: '환불 정책' }
}]);

// 비슷한 벡터 검색
const results = await env.VECTORIZE.query(queryVector, {
  topK: 5,  // 상위 5개 결과
  returnMetadata: true
});
```

#### D1 (SQLite 데이터베이스)

일반적인 데이터를 저장하는 관계형 데이터베이스입니다.

```javascript
// 데이터 조회
const docs = await env.DB
  .prepare('SELECT * FROM documents')
  .all();

// 데이터 삽입
await env.DB
  .prepare('INSERT INTO documents (title, content) VALUES (?, ?)')
  .bind('제목', '내용')
  .run();
```

### Frontend

#### Vanilla JavaScript

프레임워크 없이 순수 JavaScript만 사용합니다.

**장점**:
- 빌드 과정 없음
- 배우기 쉬움
- 파일 크기가 작음

**단점**:
- 큰 프로젝트에서는 코드 관리가 어려울 수 있음

#### Fetch API

Backend API와 통신할 때 사용합니다.

```javascript
// POST 요청 예시
const response = await fetch('http://localhost:8787/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: '안녕하세요' })
});

const data = await response.json();
console.log(data.response);
```

---

## 용어 설명

| 용어 | 영문 | 설명 |
|------|------|------|
| 임베딩 | Embedding | 텍스트를 숫자 배열로 변환하는 것 |
| 벡터 | Vector | 숫자들의 배열 (예: [0.1, 0.2, 0.3]) |
| 청크 | Chunk | 긴 문서를 작은 조각으로 나눈 것 |
| LLM | Large Language Model | 대규모 언어 모델 (ChatGPT 같은 것) |
| RAG | Retrieval-Augmented Generation | 검색 기반 응답 생성 기법 |
| 토큰 | Token | AI가 처리하는 텍스트 단위 (대략 한 단어) |
| 프롬프트 | Prompt | AI에게 주는 지시문 |
| 컨텍스트 | Context | AI에게 제공하는 배경 정보 |
| API | Application Programming Interface | 프로그램끼리 통신하는 방법 |
| 엔드포인트 | Endpoint | API의 특정 URL 주소 |

---

## 참고 자료

### 공식 문서
- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Hono 공식 문서](https://hono.dev/)

### 학습 추천
1. JavaScript 기초 (MDN Web Docs)
2. REST API 개념
3. 비동기 프로그래밍 (async/await)
4. SQL 기초

---

## 다음 단계

- [API 명세서](./API_SPECIFICATION.md) - API 엔드포인트 상세
- [데이터베이스 스키마](./DATABASE_SCHEMA.md) - DB 구조
