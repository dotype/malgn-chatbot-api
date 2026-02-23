-- Migration: TB_SESSION에 parent_id 컬럼 추가
-- parent_id = 0: 부모 세션 (관리자 템플릿)
-- parent_id > 0: 자식 세션 (학생별 세션, 부모 세션 ID 참조)

ALTER TABLE TB_SESSION ADD COLUMN parent_id INTEGER DEFAULT 0;

-- 부모-자식 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_session_parent_id ON TB_SESSION(parent_id);

-- 같은 부모 + 같은 학생 중복 방지용 인덱스
CREATE INDEX IF NOT EXISTS idx_session_parent_course_user ON TB_SESSION(parent_id, course_user_id);
