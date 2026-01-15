/**
 * Documents Routes
 *
 * 문서 관리 API 엔드포인트
 * GET /documents - 문서 목록 조회
 * POST /documents - 문서 등록 (텍스트, 파일, 링크)
 * GET /documents/:id - 문서 상세 조회
 * DELETE /documents/:id - 문서 삭제
 *
 * 지원 형식:
 * - 텍스트: JSON { type: 'text', title, content }
 * - 파일: FormData { file, title }
 * - 링크: JSON { type: 'link', title, url }
 */
import { Hono } from 'hono';
import { DocumentService } from '../services/documentService.js';

const documents = new Hono();

/**
 * GET /documents
 * 업로드된 문서 목록 조회
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본값: 1)
 * - limit: 페이지당 개수 (기본값: 20, 최대: 100)
 */
documents.get('/', async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));

    const documentService = new DocumentService(c.env);
    const result = await documentService.listDocuments(page, limit);

    return c.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('List documents error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '문서 목록 조회 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * POST /documents
 * 새 문서 업로드
 *
 * 지원 형식:
 * 1. 텍스트 (JSON): { type: 'text', title, content }
 * 2. 링크 (JSON): { type: 'link', title, url }
 * 3. 파일 (FormData): file, title
 */
documents.post('/', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const documentService = new DocumentService(c.env);

    // JSON 요청 (텍스트 또는 링크)
    if (contentType.includes('application/json')) {
      const body = await c.req.json();
      const { type, title, content, url } = body;

      if (type === 'text') {
        // 텍스트 콘텐츠 처리
        if (!title) {
          return c.json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'title 필드는 필수입니다.'
            }
          }, 400);
        }

        if (!content) {
          return c.json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'content 필드는 필수입니다.'
            }
          }, 400);
        }

        const result = await documentService.uploadText(title, content);
        return c.json({
          success: true,
          data: result,
          message: '텍스트가 성공적으로 추가되었습니다.'
        }, 201);

      } else if (type === 'link') {
        // 링크 콘텐츠 처리
        if (!title) {
          return c.json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'title 필드는 필수입니다.'
            }
          }, 400);
        }

        if (!url) {
          return c.json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'url 필드는 필수입니다.'
            }
          }, 400);
        }

        const result = await documentService.uploadLink(title, url);
        return c.json({
          success: true,
          data: result,
          message: '링크가 성공적으로 추가되었습니다.'
        }, 201);

      } else {
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'type 필드는 text 또는 link여야 합니다.'
          }
        }, 400);
      }
    }

    // FormData 요청 (파일 업로드)
    const formData = await c.req.formData();
    const file = formData.get('file');
    const title = formData.get('title');

    // 파일 검증
    if (!file || !(file instanceof File)) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'file 필드는 필수입니다.'
        }
      }, 400);
    }

    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: '파일 크기가 너무 큽니다. (최대 10MB)'
        }
      }, 413);
    }

    // 파일 확장자 검증
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'txt', 'md'].includes(ext)) {
      return c.json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: '지원하지 않는 파일 형식입니다. (지원: PDF, TXT, MD)'
        }
      }, 415);
    }

    // 문서 서비스 호출
    const result = await documentService.uploadDocument(file, title);

    return c.json({
      success: true,
      data: result,
      message: '문서가 성공적으로 업로드되었습니다.'
    }, 201);

  } catch (error) {
    console.error('Upload document error:', error);

    // URL 관련 에러
    if (error.message.includes('URL')) {
      return c.json({
        success: false,
        error: {
          code: 'URL_ERROR',
          message: error.message
        }
      }, 400);
    }

    // 파일 형식 에러
    if (error.message.includes('지원하지 않는')) {
      return c.json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: error.message
        }
      }, 415);
    }

    // 파일 크기 에러
    if (error.message.includes('크기')) {
      return c.json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: error.message
        }
      }, 413);
    }

    // 텍스트 추출 에러
    if (error.message.includes('텍스트')) {
      return c.json({
        success: false,
        error: {
          code: 'EXTRACTION_ERROR',
          message: error.message
        }
      }, 400);
    }

    // 임베딩 에러
    if (error.message.includes('임베딩')) {
      return c.json({
        success: false,
        error: {
          code: 'EMBEDDING_ERROR',
          message: '문서 처리 중 오류가 발생했습니다.'
        }
      }, 500);
    }

    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '문서 업로드 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * GET /documents/:id
 * 문서 상세 조회
 */
documents.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id) || id <= 0) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '유효한 문서 ID가 필요합니다.'
        }
      }, 400);
    }

    const documentService = new DocumentService(c.env);
    const document = await documentService.getDocument(id);

    if (!document) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '문서를 찾을 수 없습니다.'
        }
      }, 404);
    }

    return c.json({
      success: true,
      data: document
    });

  } catch (error) {
    console.error('Get document error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '문서 조회 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

/**
 * DELETE /documents/:id
 * 문서 삭제
 */
documents.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id) || id <= 0) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '유효한 문서 ID가 필요합니다.'
        }
      }, 400);
    }

    const documentService = new DocumentService(c.env);
    const deleted = await documentService.deleteDocument(id);

    if (!deleted) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '문서를 찾을 수 없습니다.'
        }
      }, 404);
    }

    return c.json({
      success: true,
      message: '문서가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('Delete document error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '문서 삭제 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

export default documents;
