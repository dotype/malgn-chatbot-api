-- Migration: TB_QUIZ를 session 기반에서 content 기반으로 변경
-- 실행 방법: Cloudflare Dashboard > D1 > malgn-chatbot-db > Console에서 실행

-- 1. 기존 TB_QUIZ 테이블 삭제 (데이터가 있다면 백업 필요)
DROP TABLE IF EXISTS TB_QUIZ;

-- 2. 새로운 TB_QUIZ 테이블 생성 (content_id 기반)
CREATE TABLE IF NOT EXISTS TB_QUIZ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('choice', 'ox')),
  question TEXT NOT NULL,
  options TEXT,
  answer TEXT NOT NULL,
  explanation TEXT,
  position INTEGER NOT NULL,
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES TB_CONTENT(id) ON DELETE CASCADE
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_quiz_content ON TB_QUIZ(content_id, position);
CREATE INDEX IF NOT EXISTS idx_quiz_status ON TB_QUIZ(status);
