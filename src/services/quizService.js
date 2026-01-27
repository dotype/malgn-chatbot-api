/**
 * Quiz Service
 *
 * 학습 콘텐츠를 기반으로 퀴즈를 생성하는 서비스입니다.
 * OpenAI API를 사용하여 4지선다와 OX퀴즈를 생성합니다.
 */
export class QuizService {
  constructor(env) {
    this.env = env;
    this.model = 'gpt-4o-mini';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * 세션에 연결된 콘텐츠 기반으로 퀴즈 생성
   * @param {number} sessionId - 세션 ID
   * @param {number[]} contentIds - 콘텐츠 ID 배열
   * @param {number} quizCount - 생성할 퀴즈 수
   * @returns {Promise<Object[]>} - 생성된 퀴즈 배열
   */
  async generateQuizzes(sessionId, contentIds, quizCount = 5) {
    if (!contentIds || contentIds.length === 0) {
      return [];
    }

    // 콘텐츠에서 청크 가져오기
    const context = await this.getContentContext(contentIds);

    if (!context || context.trim().length === 0) {
      return [];
    }

    // 퀴즈 생성 (4지선다와 OX 혼합)
    const choiceCount = Math.ceil(quizCount / 2);
    const oxCount = quizCount - choiceCount;

    const quizzes = [];

    // 4지선다 퀴즈 생성
    if (choiceCount > 0) {
      const choiceQuizzes = await this.generateChoiceQuizzes(context, choiceCount);
      quizzes.push(...choiceQuizzes);
    }

    // OX 퀴즈 생성
    if (oxCount > 0) {
      const oxQuizzes = await this.generateOXQuizzes(context, oxCount);
      quizzes.push(...oxQuizzes);
    }

    // DB에 저장
    await this.saveQuizzes(sessionId, quizzes);

    return quizzes;
  }

  /**
   * 콘텐츠에서 컨텍스트 텍스트 추출
   */
  async getContentContext(contentIds) {
    const placeholders = contentIds.map(() => '?').join(',');

    const { results } = await this.env.DB
      .prepare(`
        SELECT c.content
        FROM TB_CHUNK c
        JOIN TB_CONTENT ct ON c.content_id = ct.id
        WHERE ct.id IN (${placeholders}) AND c.status = 1 AND ct.status = 1
        ORDER BY ct.id, c.position
        LIMIT 20
      `)
      .bind(...contentIds)
      .all();

    return (results || []).map(r => r.content).join('\n\n');
  }

  /**
   * 4지선다 퀴즈 생성
   */
  async generateChoiceQuizzes(context, count) {
    const systemPrompt = `당신은 교육 콘텐츠 전문가입니다. 주어진 내용을 바탕으로 4지선다 퀴즈를 생성해 주세요.

반드시 아래 JSON 형식으로만 응답하세요:
[
  {
    "question": "질문 내용",
    "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
    "answer": 1,
    "explanation": "정답 해설"
  }
]

규칙:
1. answer는 정답 선택지의 번호입니다 (1, 2, 3, 4 중 하나)
2. 선택지는 반드시 4개여야 합니다
3. 제공된 내용에 기반한 문제만 출제하세요
4. 한국어로 작성하세요`;

    const userPrompt = `다음 내용을 바탕으로 4지선다 퀴즈 ${count}개를 생성해 주세요.

내용:
${context}`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 2048,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        console.error('Choice quiz generation failed');
        return [];
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '[]';

      // JSON 파싱 (```json ... ``` 제거)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const quizzes = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');

      return quizzes.map(q => ({
        quiz_type: 'choice',
        question: q.question,
        options: JSON.stringify(q.options),
        answer: String(q.answer),
        explanation: q.explanation
      }));
    } catch (error) {
      console.error('Choice quiz generation error:', error);
      return [];
    }
  }

  /**
   * OX 퀴즈 생성
   */
  async generateOXQuizzes(context, count) {
    const systemPrompt = `당신은 교육 콘텐츠 전문가입니다. 주어진 내용을 바탕으로 OX 퀴즈를 생성해 주세요.

반드시 아래 JSON 형식으로만 응답하세요:
[
  {
    "question": "~은/는 ~이다.",
    "answer": "O",
    "explanation": "정답 해설"
  }
]

규칙:
1. answer는 "O" 또는 "X"입니다
2. 문제는 명확한 참/거짓 판단이 가능해야 합니다
3. 제공된 내용에 기반한 문제만 출제하세요
4. 한국어로 작성하세요`;

    const userPrompt = `다음 내용을 바탕으로 OX 퀴즈 ${count}개를 생성해 주세요.

내용:
${context}`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 2048,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        console.error('OX quiz generation failed');
        return [];
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '[]';

      // JSON 파싱 (```json ... ``` 제거)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const quizzes = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');

      return quizzes.map(q => ({
        quiz_type: 'ox',
        question: q.question,
        options: null,
        answer: q.answer,
        explanation: q.explanation
      }));
    } catch (error) {
      console.error('OX quiz generation error:', error);
      return [];
    }
  }

  /**
   * 퀴즈 DB 저장
   */
  async saveQuizzes(sessionId, quizzes) {
    for (let i = 0; i < quizzes.length; i++) {
      const quiz = quizzes[i];
      await this.env.DB
        .prepare(`
          INSERT INTO TB_QUIZ (session_id, quiz_type, question, options, answer, explanation, position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          sessionId,
          quiz.quiz_type,
          quiz.question,
          quiz.options,
          quiz.answer,
          quiz.explanation,
          i + 1
        )
        .run();
    }
  }

  /**
   * 세션의 퀴즈 목록 조회
   */
  async getQuizzesBySession(sessionId) {
    const { results } = await this.env.DB
      .prepare(`
        SELECT id, quiz_type, question, options, answer, explanation, position, created_at
        FROM TB_QUIZ
        WHERE session_id = ? AND status = 1
        ORDER BY position ASC
      `)
      .bind(sessionId)
      .all();

    return (results || []).map(q => ({
      id: q.id,
      quizType: q.quiz_type,
      question: q.question,
      options: q.options ? JSON.parse(q.options) : null,
      answer: q.answer,
      explanation: q.explanation,
      position: q.position,
      createdAt: q.created_at
    }));
  }
}
