# 환경 설정 가이드 (Setup Guide)

이 문서는 AI 챗봇 프로젝트의 개발 환경을 설정하는 방법을 단계별로 설명합니다.

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [Cloudflare 계정 설정](#2-cloudflare-계정-설정)
3. [프로젝트 클론](#3-프로젝트-클론)
4. [Backend 설정](#4-backend-설정)
5. [Frontend 설정](#5-frontend-설정)
6. [로컬 개발 실행](#6-로컬-개발-실행)
7. [배포 방법](#7-배포-방법)
8. [문제 해결](#8-문제-해결)

---

## 1. 사전 준비

### 필수 설치 항목

| 도구 | 최소 버전 | 설치 확인 명령어 |
|------|----------|-----------------|
| Node.js | 18.0.0 | `node --version` |
| npm | 9.0.0 | `npm --version` |
| Git | 2.0.0 | `git --version` |

### Node.js 설치 (macOS)

```bash
# Homebrew로 설치
brew install node

# 또는 nvm으로 설치 (권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### Node.js 설치 (Windows)

[Node.js 공식 사이트](https://nodejs.org/)에서 LTS 버전 다운로드

---

## 2. Cloudflare 계정 설정

### 2.1 Cloudflare 가입

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) 접속
2. 회원가입 (무료)
3. 이메일 인증

### 2.2 Wrangler CLI 설치 및 로그인

```bash
# Wrangler 전역 설치
npm install -g wrangler

# Cloudflare 로그인 (브라우저가 열림)
wrangler login
```

### 2.3 Cloudflare 리소스 생성

아래 명령어를 순서대로 실행합니다.

#### D1 데이터베이스 생성

```bash
# 데이터베이스 생성
wrangler d1 create chatbot-db

# 출력 예시:
# ✅ Successfully created DB 'chatbot-db'
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**중요**: 출력된 `database_id`를 메모해 두세요!

#### Vectorize 인덱스 생성

```bash
# 벡터 인덱스 생성
wrangler vectorize create chatbot-docs --dimensions=768 --metric=cosine

# 출력 예시:
# ✅ Successfully created Vectorize index 'chatbot-docs'
```

#### KV 네임스페이스 생성

```bash
# KV 생성
wrangler kv:namespace create "KV"

# 출력 예시:
# ✅ Successfully created KV namespace
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**중요**: 출력된 `id`를 메모해 두세요!

#### R2 버킷 생성 (선택적)

```bash
# R2 버킷 생성
wrangler r2 bucket create chatbot-files
```

---

## 3. 프로젝트 클론

```bash
# 프로젝트 폴더로 이동
cd ~/Projects

# Backend 클론 (이미 있다면 생략)
git clone <your-repo-url> malgn-chatbot-api

# Frontend 폴더 생성 (이미 있다면 생략)
mkdir malgn-chatbot
```

---

## 4. Backend 설정

### 4.1 의존성 설치

```bash
cd malgn-chatbot-api
npm install
```

### 4.2 wrangler.toml 설정

`wrangler.toml` 파일을 열고 메모해둔 ID들을 입력합니다.

```toml
name = "malgn-chatbot-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "development"

# Workers AI (자동 활성화)
[ai]
binding = "AI"

# Vectorize
[[vectorize]]
binding = "VECTORIZE"
index_name = "chatbot-docs"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "chatbot-db"
database_id = "여기에-database_id-입력"  # 메모한 값 입력

# KV Namespace
[[kv_namespaces]]
binding = "KV"
id = "여기에-kv-id-입력"  # 메모한 값 입력

# R2 Bucket (선택적)
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "chatbot-files"
```

### 4.3 D1 스키마 적용

```bash
# 로컬 개발용 스키마 적용
wrangler d1 execute chatbot-db --local --file=./schema.sql

# 원격 DB에도 적용 (배포 시)
wrangler d1 execute chatbot-db --file=./schema.sql
```

### 4.4 환경 변수 설정

`.dev.vars` 파일을 생성합니다 (git에 커밋하지 마세요!):

```bash
# .dev.vars 생성
cat > .dev.vars << 'EOF'
ENVIRONMENT=development
EOF
```

---

## 5. Frontend 설정

### 5.1 기본 파일 생성

Frontend 폴더에 필요한 파일들을 생성합니다.

```bash
cd ~/Projects/malgn-chatbot

# 폴더 구조 생성
mkdir -p css js docs
```

(Frontend 파일들은 Phase 3에서 자동 생성됩니다)

---

## 6. 로컬 개발 실행

### Backend 실행

```bash
cd ~/Projects/malgn-chatbot-api

# 개발 서버 실행
npm run dev

# 출력:
# ⎔ Starting local server...
# Ready on http://localhost:8787
```

**테스트:**
```bash
# 새 터미널에서
curl http://localhost:8787/health

# 기대 출력:
# {"status":"healthy","timestamp":"..."}
```

### Frontend 실행

```bash
cd ~/Projects/malgn-chatbot

# Pages 개발 서버 실행
npx wrangler pages dev . --port 8788

# 브라우저에서 http://localhost:8788 접속
```

---

## 7. 배포 방법

### Backend 배포

```bash
cd ~/Projects/malgn-chatbot-api

# Production 배포
wrangler deploy

# 또는 특정 환경으로 배포
wrangler deploy --env production
```

배포 후 URL이 출력됩니다:
```
Published malgn-chatbot-api (x.xx sec)
https://malgn-chatbot-api.your-subdomain.workers.dev
```

### Frontend 배포

```bash
cd ~/Projects/malgn-chatbot

# Pages에 배포
npx wrangler pages deploy .

# 첫 배포 시 프로젝트 이름 입력
# 예: malgn-chatbot
```

배포 후 URL:
```
https://malgn-chatbot.pages.dev
```

### 환경별 API URL 설정

Frontend의 `js/api.js`에서 API URL을 환경에 맞게 설정해야 합니다:

```javascript
// 개발 환경
const API_BASE_URL = 'http://localhost:8787';

// 운영 환경 (배포 시 변경)
// const API_BASE_URL = 'https://malgn-chatbot-api.your-subdomain.workers.dev';
```

---

## 8. 문제 해결

### 자주 발생하는 오류

#### 1. "Wrangler not found"

```bash
# 해결: Wrangler 재설치
npm install -g wrangler

# PATH 확인
which wrangler
```

#### 2. "D1 database not found"

```bash
# 해결: 데이터베이스 목록 확인
wrangler d1 list

# wrangler.toml의 database_id가 맞는지 확인
```

#### 3. "Vectorize index not found"

```bash
# 해결: 인덱스 목록 확인
wrangler vectorize list

# 없으면 다시 생성
wrangler vectorize create chatbot-docs --dimensions=768 --metric=cosine
```

#### 4. "CORS 에러" (브라우저에서)

Backend의 `src/index.js`에서 CORS 설정 확인:

```javascript
import { cors } from 'hono/cors';
app.use('*', cors());
```

#### 5. "AI binding error"

Workers AI는 유료 플랜에서만 완전히 사용 가능합니다.
무료 플랜에서는 일일 사용량 제한이 있습니다.

### 로그 확인

```bash
# 실시간 로그 확인 (배포된 Worker)
wrangler tail

# 로컬 개발 시에는 터미널에 로그 출력됨
```

### 유용한 명령어

```bash
# Wrangler 버전 확인
wrangler --version

# Cloudflare 계정 정보
wrangler whoami

# D1 데이터 조회
wrangler d1 execute chatbot-db --local --command="SELECT * FROM documents"

# KV 데이터 조회
wrangler kv:key list --binding=KV
```

---

## 체크리스트

배포 전 확인사항:

- [ ] Node.js 18+ 설치됨
- [ ] Wrangler CLI 설치됨
- [ ] Cloudflare 로그인 완료
- [ ] D1 데이터베이스 생성됨
- [ ] Vectorize 인덱스 생성됨
- [ ] KV 네임스페이스 생성됨
- [ ] wrangler.toml에 ID들 입력됨
- [ ] schema.sql 실행됨
- [ ] npm install 완료
- [ ] 로컬에서 테스트 완료

---

## 다음 단계

모든 설정이 완료되면:
1. Backend 개발 서버 실행 (`npm run dev`)
2. Frontend 개발 서버 실행
3. 문서 업로드 테스트
4. 채팅 기능 테스트

---

## 참고 링크

- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 문서](https://developers.cloudflare.com/workers/wrangler/)
- [D1 문서](https://developers.cloudflare.com/d1/)
- [Vectorize 문서](https://developers.cloudflare.com/vectorize/)
- [Workers AI 문서](https://developers.cloudflare.com/workers-ai/)
