/**
 * OpenAI Service using Cloudflare AI Gateway
 *
 * Cloudflare AI Gateway provides:
 * - Caching
 * - Rate limiting
 * - Analytics
 * - Cost tracking
 *
 * Setup:
 * 1. Create AI Gateway at Cloudflare Dashboard
 * 2. Get your gateway URL: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/openai
 * 3. Set OPENAI_API_KEY in .dev.vars or wrangler secrets
 * 4. Set AI_GATEWAY_URL in wrangler.toml vars (optional)
 *
 * Usage:
 * const openai = new OpenAIService(c.env);
 * const response = await openai.chat(messages);
 */
export class OpenAIService {
  constructor(env) {
    this.env = env;
    this.apiKey = env.OPENAI_API_KEY;
    // Use AI Gateway if configured, otherwise direct OpenAI
    this.baseURL = env.AI_GATEWAY_URL || 'https://api.openai.com/v1';
  }

  /**
   * Chat completion
   */
  async chat(messages, options = {}) {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      max_tokens = 1000,
      ...otherOptions
    } = options;

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          ...otherOptions
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('OpenAI chat error:', error);
      throw error;
    }
  }

  /**
   * Stream chat completion
   * Returns a ReadableStream
   */
  async chatStream(messages, options = {}) {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      max_tokens = 1000,
      ...otherOptions
    } = options;

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          stream: true,
          ...otherOptions
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      return response.body;
    } catch (error) {
      console.error('OpenAI chatStream error:', error);
      throw error;
    }
  }

  /**
   * Create embeddings
   */
  async embeddings(input, options = {}) {
    const {
      model = 'text-embedding-3-small',
      ...otherOptions
    } = options;

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    try {
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input,
          ...otherOptions
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('OpenAI embeddings error:', error);
      throw error;
    }
  }

  /**
   * Simple chat helper - returns just the message content
   */
  async simpleChat(userMessage, systemMessage = null) {
    const messages = [];

    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    messages.push({ role: 'user', content: userMessage });

    const response = await this.chat(messages);
    return response.choices[0].message.content;
  }
}
