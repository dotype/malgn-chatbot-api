/**
 * Embedding Service
 *
 * 텍스트를 벡터(숫자 배열)로 변환하는 서비스입니다.
 * Cloudflare Workers AI의 임베딩 모델을 사용합니다.
 *
 * 사용 모델: @cf/baai/bge-base-en-v1.5 (768차원)
 */
export class EmbeddingService {
  constructor(env) {
    this.env = env;
    this.model = '@cf/baai/bge-base-en-v1.5';
  }

  /**
   * 단일 텍스트를 임베딩 벡터로 변환
   * @param {string} text - 변환할 텍스트
   * @returns {Promise<number[]>} - 768차원 벡터
   */
  async embed(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('텍스트가 비어있습니다.');
    }

    try {
      const result = await this.env.AI.run(this.model, {
        text: text
      });

      // Workers AI는 data 배열로 반환
      if (result.data && result.data.length > 0) {
        return result.data[0];
      }

      throw new Error('임베딩 결과가 없습니다.');
    } catch (error) {
      console.error('Embedding error:', error);
      throw new Error(`임베딩 생성 실패: ${error.message}`);
    }
  }

  /**
   * 여러 텍스트를 임베딩 벡터로 변환 (배치 처리)
   * @param {string[]} texts - 변환할 텍스트 배열
   * @returns {Promise<number[][]>} - 벡터 배열
   */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      throw new Error('텍스트 배열이 비어있습니다.');
    }

    try {
      const result = await this.env.AI.run(this.model, {
        text: texts
      });

      if (result.data && result.data.length > 0) {
        return result.data;
      }

      throw new Error('임베딩 결과가 없습니다.');
    } catch (error) {
      console.error('Batch embedding error:', error);
      throw new Error(`배치 임베딩 생성 실패: ${error.message}`);
    }
  }

  /**
   * 텍스트를 청크로 분할
   * @param {string} text - 분할할 텍스트
   * @param {number} chunkSize - 청크당 최대 문자 수 (기본값: 500)
   * @param {number} overlap - 청크 간 중복 문자 수 (기본값: 50)
   * @returns {string[]} - 청크 배열
   */
  splitIntoChunks(text, chunkSize = 500, overlap = 50) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = [];
    const cleanText = text.replace(/\s+/g, ' ').trim();

    let start = 0;
    while (start < cleanText.length) {
      let end = start + chunkSize;

      // 문장 경계에서 자르기 시도
      if (end < cleanText.length) {
        // 마지막 마침표, 물음표, 느낌표 찾기
        const lastSentenceEnd = cleanText.substring(start, end).search(/[.!?。？！]\s*$/);
        if (lastSentenceEnd > chunkSize * 0.5) {
          end = start + lastSentenceEnd + 1;
        }
      }

      const chunk = cleanText.substring(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start = end - overlap;
      if (start >= cleanText.length) break;
    }

    return chunks;
  }
}
