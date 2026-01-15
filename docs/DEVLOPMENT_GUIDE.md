# 개발 가이드 (Development Guide)

이 문서는 Cloudflare Workers 프로젝트의 개발 표준 가이드입니다. 새로운 기능을 추가하거나 코드를 작성할 때 이 가이드를 참고하세요.

## 목차

- [프로젝트 구조](#프로젝트-구조)
- [코딩 컨벤션](#코딩-컨벤션)
- [아키텍처 패턴](#아키텍처-패턴)
- [Cloudflare 바인딩 사용](#cloudflare-바인딩-사용)
- [인증 및 보안](#인증-및-보안)
- [환경 변수 관리](#환경-변수-관리)
- [에러 처리](#에러-처리)

---

## 프로젝트 구조

```
src/
├── routes/          # API 라우트 핸들러
├── services/        # 비즈니스 로직 및 외부 서비스 통합 (클래스 기반)
├── utils/           # 유틸리티 함수 및 Cloudflare 바인딩 헬퍼
├── middleware/      # 미들웨어 (인증, 에러 핸들링 등)
└── index.js         # 엔트리 포인트
```

### 폴더별 역할

#### `routes/`
- HTTP 요청/응답 처리
- 입력 검증
- 서비스 호출
- **규칙**: 비즈니스 로직 포함 금지, 서비스 레이어에 위임

#### `services/`
- 비즈니스 로직
- 외부 API 통합
- 데이터 처리
- **규칙**: 반드시 클래스 기반, `constructor(env)` 패턴

#### `utils/`
- 범용 유틸리티 함수 (`utils.js`)
- **규칙**: 상태 없는(stateless) 함수

#### `middleware/`
- 인증, 로깅, CORS 등
- 라우트 전후 처리
- **규칙**: Hono 미들웨어 패턴 사용

---

## 코딩 컨벤션

### 파일명
- **서비스**: `camelCase` (예: `authService.js`, `userService.js`)
- **라우트**: `camelCase` (예: `users.js`, `auth.js`)
- **유틸리티**: `camelCase` (예: `utils.js`)

### 변수/함수명
- **변수**: `camelCase`
- **함수**: `camelCase`
- **클래스**: `PascalCase`
- **상수**: `UPPER_SNAKE_CASE`

### Export 패턴

```javascript
// ✅ 좋은 예: Services (클래스)
export class UserService {
  constructor(env) { ... }
}

// ✅ 좋은 예: Utils (객체)
export const KV = {
  async get(kv, key) { ... }
}

// ✅ 좋은 예: 개별 함수
export const formatResponse = (data) => { ... }

// ❌ 나쁜 예: default export 남용
export default function() { ... }
```

---

## 아키텍처 패턴

### 레이어 구조

```
Request → Route → Service → Utils/Bindings → Response
```

### 서비스 레이어 패턴

모든 서비스는 **클래스 기반**으로 작성합니다.

```javascript
// ✅ 올바른 서비스 패턴
export class UserService {
  constructor(env) {
    this.env = env;
  }

  async getUser(userId) {
    // KV 캐시 확인
    const cached = await this.env.KV.get(`user:${userId}`, { type: 'json' });
    if (cached) return cached;

    // D1 조회
    const user = await this.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();

    // 캐시 저장
    if (user) {
      await this.env.KV.put(`user:${userId}`, JSON.stringify(user), {
        expirationTtl: 3600
      });
    }

    return user;
  }
}
```

### 라우트 패턴

```javascript
// ✅ 올바른 라우트 패턴
import { Hono } from 'hono';
import { UserService } from '../services/userService.js';

const users = new Hono();

users.get('/:id', async (c) => {
  const userId = c.req.param('id');

  // 서비스 인스턴스 생성
  const userService = new UserService(c.env);

  // 비즈니스 로직은 서비스에 위임
  const user = await userService.getUser(userId);

  return c.json({ data: user });
});

export default users;
```

---

## Cloudflare 바인딩 사용

Cloudflare 바인딩은 **직접 사용**합니다. 별도의 헬퍼 함수 없이 공식 API를 그대로 사용하세요.

### KV (Key-Value Storage)

```javascript
// 값 저장 (1시간 TTL)
await c.env.KV.put('key', 'value', { expirationTtl: 3600 });

// 값 조회
const value = await c.env.KV.get('key');

// JSON 저장/조회
await c.env.KV.put('data', JSON.stringify({ foo: 'bar' }));
const data = await c.env.KV.get('data', { type: 'json' });

// 삭제
await c.env.KV.delete('key');
```

**참고**: [KV 공식 문서](https://developers.cloudflare.com/kv/api/)

### D1 (SQLite Database)

```javascript
// 단일 행 조회
const user = await c.env.DB
  .prepare('SELECT * FROM users WHERE id = ?')
  .bind(userId)
  .first();

// 여러 행 조회
const { results } = await c.env.DB
  .prepare('SELECT * FROM users')
  .all();

// INSERT/UPDATE/DELETE
const result = await c.env.DB
  .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
  .bind(name, email)
  .run();
```

**참고**: [D1 공식 문서](https://developers.cloudflare.com/d1/api/)

### R2 (Object Storage)

```javascript
// 파일 업로드
await c.env.BUCKET.put('file.txt', 'Hello World');

// 파일 다운로드
const object = await c.env.BUCKET.get('file.txt');
const text = await object.text();

// 파일 삭제
await c.env.BUCKET.delete('file.txt');

// 메타데이터만 조회
const metadata = await c.env.BUCKET.head('file.txt');
```

**참고**: [R2 공식 문서](https://developers.cloudflare.com/r2/api/)

---

## 인증 및 보안

### JWT 인증

모든 라우트는 기본적으로 JWT 인증이 필요합니다. 제외 경로는 `src/index.js`의 `PUBLIC_PATHS`에 추가합니다.

```javascript
// src/index.js
const PUBLIC_PATHS = ['/health', '/docs', '/auth'];
```

### 인증이 필요한 라우트에서 사용자 정보 접근

```javascript
users.get('/profile', async (c) => {
  // JWT에서 추출된 사용자 정보
  const userId = c.get('userId');
  const userEmail = c.get('userEmail');
  const userRole = c.get('userRole');
  const jwtPayload = c.get('jwtPayload');

  // ...
});
```

### 토큰 생성 패턴

```javascript
import { AuthService } from '../services/authService.js';

const authService = new AuthService(c.env);
const token = await authService.generateToken(user);
// 토큰은 24시간 만료
```

---

## 환경 변수 관리

### 로컬 개발 (`.dev.vars`)

```bash
# .dev.vars
ENVIRONMENT=development
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=sk-...
```

**중요**: `.dev.vars`는 git에 커밋하지 마세요!

### Production (Wrangler Secrets)

```bash
# 민감한 정보는 Wrangler Secrets 사용
wrangler secret put JWT_SECRET --env production
wrangler secret put OPENAI_API_KEY --env production
```

### 환경 변수 접근

```javascript
// 서비스 클래스 내부
constructor(env) {
  this.apiKey = env.OPENAI_API_KEY;
  this.secret = env.JWT_SECRET;
}

// 라우트에서 직접
const environment = c.env.ENVIRONMENT;
```

---

## 에러 처리

### 서비스 레이어에서 에러 throw

```javascript
export class UserService {
  async getUser(userId) {
    if (!userId) {
      const error = new Error('User ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    const user = await D1.queryFirst(this.db, '...', [userId]);

    if (!user) {
      const error = new Error('User not found');
      error.name = 'NotFoundError';
      throw error;
    }

    return user;
  }
}
```

### 라우트에서 에러 처리

```javascript
users.get('/:id', async (c) => {
  try {
    const userService = new UserService(c.env);
    const user = await userService.getUser(c.req.param('id'));
    return c.json({ data: user });
  } catch (error) {
    // 글로벌 에러 핸들러가 처리하도록 throw
    throw error;
  }
});
```

### 글로벌 에러 핸들러 (`src/middleware/errorHandler.js`)

모든 에러는 자동으로 처리됩니다:
- `ValidationError` → 400
- `UnauthorizedError` → 401
- `NotFoundError` → 404
- 기타 → 500

---

## 새로운 기능 추가 가이드

### 1. 새로운 엔드포인트 추가

```bash
# 1. 라우트 파일 생성
src/routes/products.js

# 2. 서비스 생성 (필요시)
src/services/productService.js

# 3. src/index.js에 라우트 등록
import productsRoutes from './routes/products.js';
app.route('/products', productsRoutes);
```

### 2. 새로운 서비스 추가

```javascript
// src/services/productService.js
export class ProductService {
  constructor(env) {
    this.env = env;
  }

  async getProducts() {
    const { results } = await this.env.DB
      .prepare('SELECT * FROM products')
      .all();
    return results;
  }
}
```

### 3. 새로운 유틸리티 함수 추가

```javascript
// src/utils/utils.js에 추가
export const slugify = (text) => {
  return text.toLowerCase().replace(/\s+/g, '-');
};
```

---

## AI 개발 시 참고사항

이 프로젝트를 AI와 함께 개발할 때 다음을 명심하세요:

1. **서비스는 항상 클래스로 작성**
2. **utils는 stateless 함수로 작성**
3. **라우트에는 비즈니스 로직 금지**
4. **파일명은 camelCase**
5. **env는 생성자에서 주입**
6. **Cloudflare 바인딩은 직접 사용 (c.env.KV, c.env.DB, c.env.BUCKET)**
7. **인증이 필요한 라우트는 PUBLIC_PATHS에서 제외**

---

## 참고 자료

- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Hono 문서](https://hono.dev/)
- [Wrangler 문서](https://developers.cloudflare.com/workers/wrangler/)
