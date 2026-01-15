/**
 * Sessions Routes
 *
 * 채팅 세션 관리 API 엔드포인트
 * GET /sessions - 세션 목록 조회
 * POST /sessions - 새 세션 생성
 * GET /sessions/:id - 세션 상세 조회 (메시지 포함)
 * DELETE /sessions/:id - 세션 삭제
 */
import { Hono } from 'hono';

const sessions = new Hono();

/**
 * GET /sessions
 * 세션 목록 조회
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본값: 1)
 * - limit: 페이지당 개수 (기본값: 50, 최대: 100)
 */
sessions.get('/', async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50')));
    const offset = (page - 1) * limit;

    // 전체 개수 조회 (status = 1만)
    const countResult = await c.env.DB
      .prepare('SELECT COUNT(*) as total FROM TB_SESSION WHERE status = 1')
      .first();
    const total = countResult?.total || 0;

    // 세션 목록 조회 (status = 1만, 메시지도 status = 1만)
    const { results } = await c.env.DB
      .prepare(`
        SELECT
          s.id,
          s.created_at,
          s.updated_at,
          (SELECT content FROM TB_MESSAGE WHERE session_id = s.id AND status = 1 ORDER BY created_at ASC LIMIT 1) as firstMessage,
          (SELECT content FROM TB_MESSAGE WHERE session_id = s.id AND status = 1 ORDER BY created_at DESC LIMIT 1) as lastMessage,
          (SELECT COUNT(*) FROM TB_MESSAGE WHERE session_id = s.id AND status = 1) as messageCount
        FROM TB_SESSION s
        WHERE s.status = 1
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all();

    // 제목 생성 (첫 번째 메시지 기반)
    const sessionsWithTitle = (results || []).map(session => ({
      id: session.id,
      title: session.firstMessage
        ? session.firstMessage.substring(0, 30) + (session.firstMessage.length > 30 ? '...' : '')
        : '새 대화',
      lastMessage: session.lastMessage
        ? session.lastMessage.substring(0, 50) + (session.lastMessage.length > 50 ? '...' : '')
        : null,
      messageCount: session.messageCount || 0,
      created_at: session.created_at,
      updated_at: session.updated_at
    }));

    return c.json({
      success: true,
      data: {
        sessions: sessionsWithTitle,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('List sessions error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '세션 목록 조회 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * POST /sessions
 * 새 세션 생성
 *
 * Body (optional):
 * - user_id: 사용자 ID
 * - content_ids: 연결할 콘텐츠 ID 배열 (답변 범위 설정)
 */
sessions.post('/', async (c) => {
  try {
    // 요청 본문 파싱 (선택적)
    let userId = null;
    let contentIds = [];

    try {
      const body = await c.req.json();
      userId = body.user_id || null;
      contentIds = Array.isArray(body.content_ids) ? body.content_ids : [];
    } catch {
      // JSON 파싱 실패 시 기본값 사용
    }

    // 세션 생성
    const insertResult = await c.env.DB
      .prepare('INSERT INTO TB_SESSION (user_id) VALUES (?)')
      .bind(userId)
      .run();

    const sessionId = insertResult.meta.last_row_id;

    // 콘텐츠 연결 (TB_SESSION_CONTENT)
    if (contentIds.length > 0) {
      for (const contentId of contentIds) {
        await c.env.DB
          .prepare('INSERT INTO TB_SESSION_CONTENT (session_id, content_id) VALUES (?, ?)')
          .bind(sessionId, contentId)
          .run();
      }
    }

    // 생성된 세션 조회
    const session = await c.env.DB
      .prepare('SELECT * FROM TB_SESSION WHERE id = ?')
      .bind(sessionId)
      .first();

    // 연결된 콘텐츠 조회
    const { results: linkedContents } = await c.env.DB
      .prepare(`
        SELECT c.id, c.content_nm
        FROM TB_SESSION_CONTENT sc
        JOIN TB_CONTENT c ON sc.content_id = c.id AND c.status = 1
        WHERE sc.session_id = ? AND sc.status = 1
      `)
      .bind(sessionId)
      .all();

    return c.json({
      success: true,
      data: {
        id: sessionId,
        userId: session.user_id,
        title: '새 대화',
        settings: {
          persona: session.persona,
          temperature: session.temperature,
          topP: session.top_p,
          maxTokens: session.max_tokens,
          summaryCount: session.summary_count,
          recommendCount: session.recommend_count,
          quizCount: session.quiz_count
        },
        contents: linkedContents || [],
        lastMessage: null,
        messageCount: 0,
        created_at: session.created_at,
        updated_at: session.updated_at
      },
      message: '새 세션이 생성되었습니다.'
    }, 201);

  } catch (error) {
    console.error('Create session error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '세션 생성 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * GET /sessions/:id
 * 세션 상세 조회 (메시지 포함)
 */
sessions.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id) || id <= 0) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '유효한 세션 ID가 필요합니다.'
        }
      }, 400);
    }

    // 세션 조회 (status = 1만)
    const session = await c.env.DB
      .prepare('SELECT * FROM TB_SESSION WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!session) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '세션을 찾을 수 없습니다.'
        }
      }, 404);
    }

    // 메시지 조회 (status = 1만)
    const { results: messages } = await c.env.DB
      .prepare(`
        SELECT id, role, content, created_at
        FROM TB_MESSAGE
        WHERE session_id = ? AND status = 1
        ORDER BY created_at ASC
      `)
      .bind(id)
      .all();

    // 연결된 콘텐츠 조회
    const { results: linkedContents } = await c.env.DB
      .prepare(`
        SELECT c.id, c.content_nm
        FROM TB_SESSION_CONTENT sc
        JOIN TB_CONTENT c ON sc.content_id = c.id AND c.status = 1
        WHERE sc.session_id = ? AND sc.status = 1
      `)
      .bind(id)
      .all();

    // 제목 생성
    const firstUserMessage = (messages || []).find(m => m.role === 'user');
    const title = firstUserMessage
      ? firstUserMessage.content.substring(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '')
      : '새 대화';

    return c.json({
      success: true,
      data: {
        id: session.id,
        userId: session.user_id,
        title,
        settings: {
          persona: session.persona,
          temperature: session.temperature,
          topP: session.top_p,
          maxTokens: session.max_tokens,
          summaryCount: session.summary_count,
          recommendCount: session.recommend_count,
          quizCount: session.quiz_count
        },
        contents: linkedContents || [],
        messages: messages || [],
        messageCount: (messages || []).length,
        created_at: session.created_at,
        updated_at: session.updated_at
      }
    });

  } catch (error) {
    console.error('Get session error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '세션 조회 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * PUT /sessions/:id
 * 세션 AI 설정 업데이트
 */
sessions.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id) || id <= 0) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '유효한 세션 ID가 필요합니다.'
        }
      }, 400);
    }

    // 세션 존재 확인 (status = 1만)
    const session = await c.env.DB
      .prepare('SELECT * FROM TB_SESSION WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!session) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '세션을 찾을 수 없습니다.'
        }
      }, 404);
    }

    // 요청 본문에서 설정 추출
    const body = await c.req.json();
    const { settings } = body;

    if (!settings) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'settings 필드는 필수입니다.'
        }
      }, 400);
    }

    // 설정 값 검증 및 기본값 적용
    const persona = settings.persona ?? session.persona;
    const temperature = settings.temperature !== undefined
      ? Math.max(0, Math.min(1, settings.temperature))
      : session.temperature;
    const topP = settings.topP !== undefined
      ? Math.max(0.1, Math.min(1, settings.topP))
      : session.top_p;
    const maxTokens = settings.maxTokens !== undefined
      ? Math.max(256, Math.min(4096, settings.maxTokens))
      : session.max_tokens;

    // 학습 설정 값 검증 및 기본값 적용
    const summaryCount = settings.summaryCount !== undefined
      ? Math.max(1, Math.min(10, settings.summaryCount))
      : session.summary_count;
    const recommendCount = settings.recommendCount !== undefined
      ? Math.max(1, Math.min(10, settings.recommendCount))
      : session.recommend_count;
    const quizCount = settings.quizCount !== undefined
      ? Math.max(1, Math.min(20, settings.quizCount))
      : session.quiz_count;

    // 세션 업데이트
    await c.env.DB
      .prepare(`
        UPDATE TB_SESSION
        SET persona = ?, temperature = ?, top_p = ?, max_tokens = ?,
            summary_count = ?, recommend_count = ?, quiz_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(persona, temperature, topP, maxTokens, summaryCount, recommendCount, quizCount, id)
      .run();

    return c.json({
      success: true,
      data: {
        id,
        settings: {
          persona,
          temperature,
          topP,
          maxTokens,
          summaryCount,
          recommendCount,
          quizCount
        }
      },
      message: 'AI 설정이 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('Update session error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '세션 업데이트 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * DELETE /sessions/:id
 * 세션 삭제 (Soft Delete)
 */
sessions.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id) || id <= 0) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '유효한 세션 ID가 필요합니다.'
        }
      }, 400);
    }

    // 세션 존재 확인 (status = 1만)
    const session = await c.env.DB
      .prepare('SELECT id FROM TB_SESSION WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!session) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '세션을 찾을 수 없습니다.'
        }
      }, 404);
    }

    // 메시지 soft delete (status = -1)
    await c.env.DB
      .prepare('UPDATE TB_MESSAGE SET status = -1 WHERE session_id = ?')
      .bind(id)
      .run();

    // 세션-콘텐츠 연결 soft delete (status = -1)
    await c.env.DB
      .prepare('UPDATE TB_SESSION_CONTENT SET status = -1 WHERE session_id = ?')
      .bind(id)
      .run();

    // 세션 soft delete (status = -1)
    await c.env.DB
      .prepare('UPDATE TB_SESSION SET status = -1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id)
      .run();

    return c.json({
      success: true,
      message: '세션이 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('Delete session error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '세션 삭제 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

export default sessions;
