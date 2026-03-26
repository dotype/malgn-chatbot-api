-- TB_SESSION에 chat_content_ids 추가 (채팅 RAG 검색 대상 콘텐츠 ID)
-- JSON 배열 형식: '[1, 2, 3]'
-- NULL이면 세션의 contentIds(TB_SESSION_CONTENT)를 사용
ALTER TABLE TB_SESSION ADD COLUMN chat_content_ids TEXT;
