/**
 * Content Service
 *
 * 콘텐츠 업로드, 조회, 삭제를 처리하는 서비스입니다.
 * - 파일에서 텍스트 추출
 * - D1에 전체 내용 저장
 * - Vectorize에 임베딩 저장
 */
import { EmbeddingService } from './embeddingService.js';

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
      const urlLower = url.toLowerCase();

      // 자막 파일 확인 (URL 확장자 또는 content-type)
      const isSubtitle = urlLower.endsWith('.srt') ||
                         urlLower.endsWith('.vtt') ||
                         contentType.includes('text/vtt') ||
                         contentType.includes('application/x-subrip');

      if (isSubtitle) {
        // 자막 파일에서 텍스트 추출
        const subtitleText = await response.text();
        content = this.extractTextFromSubtitle(subtitleText);
      } else if (contentType.includes('text/html')) {
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
   * 자막 파일에서 텍스트 추출 (SRT, VTT 지원)
   */
  extractTextFromSubtitle(subtitleText) {
    const lines = subtitleText.split('\n');
    const textLines = [];

    // VTT 헤더 제거
    let startIndex = 0;
    if (lines[0]?.trim().startsWith('WEBVTT')) {
      startIndex = 1;
      // 헤더 메타데이터 스킵
      while (startIndex < lines.length && lines[startIndex].trim() !== '') {
        startIndex++;
      }
    }

    // 타임스탬프 패턴 (다양한 형식 지원)
    // 00:00:00,000 --> 00:00:00,000 (SRT)
    // 00:00:00.000 --> 00:00:00.000 (VTT with hours)
    // 00:00.000 --> 00:00.000 (VTT without hours)
    const timestampRegex = /^(\d{1,2}:)?\d{2}:\d{2}[,\.]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[,\.]\d{3}/;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      // 빈 줄 스킵
      if (!line) continue;

      // 자막 번호 스킵 (SRT 형식: 숫자만 있는 줄)
      if (/^\d+$/.test(line)) continue;

      // 타임스탬프 줄 스킵
      if (timestampRegex.test(line)) continue;

      // VTT 큐 ID 스킵 (숫자 또는 문자로 시작하고 타임스탬프가 아닌 경우)
      // 예: "1", "cue-1", etc. - 다음 줄이 타임스탬프인지 확인
      if (/^[\w-]+$/.test(line) && i + 1 < lines.length && timestampRegex.test(lines[i + 1]?.trim())) {
        continue;
      }

      // VTT 큐 설정 스킵 (align:, position: 등)
      if (/^(align|position|line|size|vertical):/.test(line)) continue;

      // NOTE, STYLE, REGION 블록 스킵 (VTT)
      if (/^(NOTE|STYLE|REGION)/.test(line)) continue;

      // HTML 태그 제거 (<b>, <i>, <u>, <font> 등)
      let cleanLine = line
        .replace(/<[^>]+>/g, '')
        .replace(/\{[^}]+\}/g, ''); // SSA/ASS 스타일 태그 제거

      if (cleanLine.trim()) {
        textLines.push(cleanLine.trim());
      }
    }

    // 중복 제거 없이 모든 줄 유지
    return textLines.join('\n');
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
   * PDF에서 텍스트 추출
   * - 프로덕션: unpdf 라이브러리 사용
   * - 로컬: 기본 텍스트 추출 (제한적)
   */
  async extractPdfText(buffer) {
    try {
      // 프로덕션 환경에서는 unpdf 사용 시도
      if (this.env.ENVIRONMENT !== 'development') {
        try {
          const { extractText } = await import('unpdf');
          const { text } = await extractText(new Uint8Array(buffer));
          if (text && text.trim().length > 0) {
            return text;
          }
        } catch (e) {
          console.warn('unpdf failed, falling back to basic extraction:', e.message);
        }
      }

      // 기본 PDF 텍스트 추출 (로컬 개발용)
      return this.extractPdfTextBasic(buffer);
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('PDF에서 텍스트를 추출할 수 없습니다. TXT 또는 MD 파일을 사용해 주세요.');
    }
  }

  /**
   * 기본 PDF 텍스트 추출 (간단한 PDF용)
   */
  extractPdfTextBasic(buffer) {
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // 여러 방법으로 텍스트 추출 시도
    const textParts = [];

    // 방법 1: BT...ET 블록에서 텍스트 추출
    const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
    let match;

    while ((match = streamRegex.exec(text)) !== null) {
      const streamContent = match[1];

      // Tj, TJ 연산자에서 텍스트 추출
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(streamContent)) !== null) {
        const extracted = tjMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (extracted.trim()) {
          textParts.push(extracted);
        }
      }

      // TJ 배열에서 텍스트 추출
      const tjArrayRegex = /\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/gi;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayRegex.exec(streamContent)) !== null) {
        const arrayContent = tjArrayMatch[1];
        const stringRegex = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
          const extracted = strMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          if (extracted.trim()) {
            textParts.push(extracted);
          }
        }
      }
    }

    // 추출된 텍스트가 있으면 반환
    if (textParts.length > 0) {
      const result = textParts.join(' ').replace(/\s+/g, ' ').trim();
      if (result.length > 50) {
        return result;
      }
    }

    // 방법 2: 읽을 수 있는 텍스트 패턴 찾기
    const readableText = text
      .replace(/[^\x20-\x7E\xA0-\xFF가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 의미있는 텍스트가 있는지 확인 (최소 100자)
    if (readableText.length > 100) {
      // PDF 메타데이터 등 제거
      const cleanText = readableText
        .replace(/PDF-\d+\.\d+/g, '')
        .replace(/%[A-Za-z]+/g, '')
        .replace(/\d+\s+\d+\s+obj/g, '')
        .replace(/endobj/g, '')
        .replace(/stream|endstream/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanText.length > 100) {
        return cleanText;
      }
    }

    throw new Error('PDF에서 텍스트를 추출할 수 없습니다.');
  }
}
