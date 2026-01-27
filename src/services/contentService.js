/**
 * Content Service
 *
 * 콘텐츠 업로드, 조회, 삭제를 처리하는 서비스입니다.
 * - 파일에서 텍스트 추출
 * - D1에 전체 내용 저장
 * - Vectorize에 임베딩 저장
 */
import { EmbeddingService } from './embeddingService.js';
import { extractText as extractPdfTextFromBuffer } from 'unpdf';

export class ContentService {
  constructor(env) {
    this.env = env;
    this.embeddingService = new EmbeddingService(env);
  }

  /**
   * 콘텐츠 목록 조회
   */
  async listContents(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // 전체 개수 조회 (status = 1만)
    const countResult = await this.env.DB
      .prepare('SELECT COUNT(*) as total FROM TB_CONTENT WHERE status = 1')
      .first();
    const total = countResult?.total || 0;

    // 콘텐츠 목록 조회 (status = 1만)
    const { results } = await this.env.DB
      .prepare(`
        SELECT id, content_nm, filename, file_type, file_size, status, created_at
        FROM TB_CONTENT
        WHERE status = 1
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all();

    return {
      contents: results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 콘텐츠 상세 조회
   */
  async getContent(id) {
    // 콘텐츠 조회 (status = 1만)
    const content = await this.env.DB
      .prepare('SELECT id, content_nm, filename, file_type, file_size, content, status, created_at, updated_at FROM TB_CONTENT WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!content) {
      return null;
    }

    return content;
  }

  /**
   * 텍스트 콘텐츠 업로드
   */
  async uploadText(title, content) {
    if (!title || title.trim().length === 0) {
      throw new Error('제목은 필수입니다.');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('내용은 필수입니다.');
    }

    const contentTitle = title.trim();
    const contentText = content.trim();
    const contentSize = new TextEncoder().encode(contentText).length;

    // D1에 콘텐츠 저장
    const insertResult = await this.env.DB
      .prepare(`
        INSERT INTO TB_CONTENT (content_nm, filename, file_type, file_size, content)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(contentTitle, '', 'text', contentSize, contentText)
      .run();

    const contentId = insertResult.meta.last_row_id;

    // 임베딩 생성 및 Vectorize 저장
    await this.storeContentEmbedding(contentId, contentTitle, contentText);

    return {
      id: contentId,
      title: contentTitle,
      type: 'text',
      fileSize: contentSize,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 링크 콘텐츠 업로드
   */
  async uploadLink(title, url) {
    if (!title || title.trim().length === 0) {
      throw new Error('제목은 필수입니다.');
    }

    if (!url || url.trim().length === 0) {
      throw new Error('URL은 필수입니다.');
    }

    // URL 유효성 검사
    try {
      new URL(url);
    } catch {
      throw new Error('올바른 URL 형식이 아닙니다.');
    }

    // URL에서 콘텐츠 가져오기
    let content;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MalgnBot/1.0)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
        // HTML에서 텍스트 추출
        const html = await response.text();
        content = this.extractTextFromHtml(html);
      } else if (contentType.includes('text/') || contentType.includes('application/json')) {
        content = await response.text();
      } else {
        throw new Error('지원하지 않는 콘텐츠 형식입니다. (텍스트 기반 콘텐츠만 지원)');
      }
    } catch (error) {
      throw new Error(`URL에서 콘텐츠를 가져올 수 없습니다: ${error.message}`);
    }

    if (!content || content.trim().length === 0) {
      throw new Error('URL에서 유효한 텍스트를 추출할 수 없습니다.');
    }

    const contentTitle = title.trim();
    const contentText = content.trim();
    const contentSize = new TextEncoder().encode(contentText).length;

    // D1에 콘텐츠 저장
    const insertResult = await this.env.DB
      .prepare(`
        INSERT INTO TB_CONTENT (content_nm, filename, file_type, file_size, content)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(contentTitle, url, 'link', contentSize, contentText)
      .run();

    const contentId = insertResult.meta.last_row_id;

    // 임베딩 생성 및 Vectorize 저장
    await this.storeContentEmbedding(contentId, contentTitle, contentText);

    return {
      id: contentId,
      title: contentTitle,
      type: 'link',
      url,
      fileSize: contentSize,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * HTML에서 텍스트 추출
   */
  extractTextFromHtml(html) {
    // script, style 태그 제거
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // HTML 태그 제거
    text = text.replace(/<[^>]+>/g, ' ');

    // HTML 엔티티 디코딩
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));

    // 연속 공백 정리
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * 파일 업로드 및 처리
   */
  async uploadFile(file, title = null) {
    // 파일 정보 추출
    const filename = file.name;
    const fileType = this.getFileType(filename);
    const fileSize = file.size;

    // 지원 형식 확인
    if (!['pdf', 'txt', 'md'].includes(fileType)) {
      throw new Error('지원하지 않는 파일 형식입니다. (지원: PDF, TXT, MD)');
    }

    // 파일 크기 확인 (10MB 제한)
    const maxSize = fileType === 'pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (fileSize > maxSize) {
      throw new Error(`파일 크기가 너무 큽니다. (최대: ${maxSize / 1024 / 1024}MB)`);
    }

    // 텍스트 추출
    const text = await this.extractText(file, fileType);
    if (!text || text.trim().length === 0) {
      throw new Error('파일에서 텍스트를 추출할 수 없습니다.');
    }

    const contentTitle = title || filename.replace(/\.[^/.]+$/, '');
    const contentText = text.trim();

    // D1에 콘텐츠 저장
    const insertResult = await this.env.DB
      .prepare(`
        INSERT INTO TB_CONTENT (content_nm, filename, file_type, file_size, content)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(contentTitle, filename, fileType, fileSize, contentText)
      .run();

    const contentId = insertResult.meta.last_row_id;

    // 임베딩 생성 및 Vectorize 저장
    await this.storeContentEmbedding(contentId, contentTitle, contentText);

    return {
      id: contentId,
      title: contentTitle,
      filename,
      fileType,
      fileSize,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 콘텐츠 임베딩 생성 및 Vectorize 저장
   */
  async storeContentEmbedding(contentId, contentTitle, contentText) {
    // Vectorize가 없으면 스킵 (로컬 개발 환경)
    if (!this.env.VECTORIZE?.insert) {
      console.warn('Vectorize not available (local dev)');
      return;
    }

    try {
      // 전체 콘텐츠 임베딩 생성
      const embedding = await this.embeddingService.embed(contentText);

      // Vectorize에 저장
      await this.env.VECTORIZE.insert([{
        id: `content-${contentId}`,
        values: embedding,
        metadata: {
          type: 'content',
          contentId: contentId,
          contentTitle: contentTitle
        }
      }]);

      console.log(`Stored embedding for content ${contentId}`);
    } catch (error) {
      console.error('Embedding storage error:', error);
    }
  }

  /**
   * 콘텐츠 수정 (제목 및 내용 수정)
   */
  async updateContent(id, title, newContent = null) {
    if (!title || title.trim().length === 0) {
      throw new Error('제목은 필수입니다.');
    }

    // 콘텐츠 존재 확인 (status = 1만)
    const existingContent = await this.env.DB
      .prepare('SELECT id, file_type FROM TB_CONTENT WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!existingContent) {
      return null;
    }

    const contentTitle = title.trim();

    // 내용이 변경된 경우 임베딩 재생성
    if (newContent && newContent.trim().length > 0) {
      const contentText = newContent.trim();
      const contentSize = new TextEncoder().encode(contentText).length;

      // Vectorize에서 기존 벡터 삭제
      if (this.env.VECTORIZE?.deleteByIds) {
        try {
          await this.env.VECTORIZE.deleteByIds([`content-${id}`]);
        } catch (error) {
          console.warn('Vectorize delete skipped (local dev):', error.message);
        }
      }

      // 콘텐츠 업데이트
      await this.env.DB
        .prepare(`
          UPDATE TB_CONTENT
          SET content_nm = ?, file_size = ?, content = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(contentTitle, contentSize, contentText, id)
        .run();

      // 새 임베딩 생성 및 저장
      await this.storeContentEmbedding(id, contentTitle, contentText);
    } else {
      // 제목만 업데이트
      await this.env.DB
        .prepare('UPDATE TB_CONTENT SET content_nm = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(contentTitle, id)
        .run();
    }

    // 업데이트된 콘텐츠 반환
    return await this.getContent(id);
  }

  /**
   * 콘텐츠 삭제 (Soft Delete)
   */
  async deleteContent(id) {
    // 콘텐츠 존재 확인 (status = 1만)
    const content = await this.env.DB
      .prepare('SELECT id FROM TB_CONTENT WHERE id = ? AND status = 1')
      .bind(id)
      .first();

    if (!content) {
      return false;
    }

    // Vectorize에서 벡터 삭제
    if (this.env.VECTORIZE?.deleteByIds) {
      try {
        await this.env.VECTORIZE.deleteByIds([`content-${id}`]);
      } catch (error) {
        console.warn('Vectorize delete skipped (local dev):', error.message);
      }
    }

    // 콘텐츠 soft delete (status = -1)
    await this.env.DB
      .prepare('UPDATE TB_CONTENT SET status = -1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id)
      .run();

    return true;
  }

  /**
   * 파일 확장자 추출
   */
  getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ext;
  }

  /**
   * 파일에서 텍스트 추출
   */
  async extractText(file, fileType) {
    const buffer = await file.arrayBuffer();

    switch (fileType) {
      case 'txt':
      case 'md':
        return new TextDecoder('utf-8').decode(buffer);

      case 'pdf':
        // PDF 텍스트 추출 (간단한 방식)
        return await this.extractPdfText(buffer);

      default:
        throw new Error('지원하지 않는 파일 형식입니다.');
    }
  }

  /**
   * PDF에서 텍스트 추출 (unpdf 라이브러리 사용)
   */
  async extractPdfText(buffer) {
    try {
      const { text } = await extractPdfTextFromBuffer(new Uint8Array(buffer));

      if (!text || text.trim().length === 0) {
        throw new Error('PDF에서 텍스트를 추출할 수 없습니다.');
      }

      return text;
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('PDF에서 텍스트를 추출할 수 없습니다. TXT 또는 MD 파일을 사용해 주세요.');
    }
  }
}
