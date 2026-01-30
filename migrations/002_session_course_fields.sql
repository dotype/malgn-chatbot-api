-- TB_SESSION에 course_id, course_user_id, lesson_id 컬럼 추가
ALTER TABLE TB_SESSION ADD COLUMN course_id INTEGER;
ALTER TABLE TB_SESSION ADD COLUMN course_user_id INTEGER;
ALTER TABLE TB_SESSION ADD COLUMN lesson_id INTEGER;
