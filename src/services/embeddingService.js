/**
 * Embedding Service
 *
 * 텍스트를 벡터(숫자 배열)로 변환하는 서비스입니다.
 * Cloudflare Workers AI를 사용합니다. (지역 제한 없음)
 *
 * 사용 모델: @cf/baai/bge-base-en-v1.5 (768차원)
 */
export class EmbeddingService {
  constructor(env) {
    this.env = env;
    this.model = '@cf/baai/bge-base-en-v1.5';
  }

  /**
   * 텍스트를 임베딩 벡터로 변환
   * @param {string} text - 변환할 텍스트
   * @returns {Promise<number[]>} - 768차원 벡터
   */
  async embed(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('텍스트가 비어있습니다.');
    }

    try {
      // Workers AI를 사용하여 임베딩 생성
      const result = await this.env.AI.run(this.model, {
        text: text
      });

      if (result && result.data && result.data.length > 0) {
        return result.data[0];
      }

      throw new Error('임베딩 결과가 없습니다.');
    } catch (error) {
      console.error('Embedding error:', error);
      throw new Error(`임베딩 생성 실패: ${error.message}`);
    }
  }
}
