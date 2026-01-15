/**
 * AI Chatbot API - Entry Point
 *
 * Cloudflare Workers + Hono 기반 API 서버
 * RAG(Retrieval-Augmented Generation) 기반 채팅 기능 제공
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Import routes
import chatRoutes from './routes/chat.js';
import contentsRoutes from './routes/contents.js';
import sessionsRoutes from './routes/sessions.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';

const app = new Hono();

// Paths that don't require authentication (현재 모든 경로 공개)
const PUBLIC_PATHS = ['/health', '/docs', '/openapi.json', '/chat', '/contents', '/sessions'];

// Global middleware
app.use('*', logger());

// CORS 설정 - 모든 출처 허용 (개발용)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Routes
app.route('/chat', chatRoutes);
app.route('/contents', contentsRoutes);
app.route('/sessions', sessionsRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'AI Chatbot API',
    version: '1.0.0',
    description: 'RAG 기반 AI 챗봇 API',
    environment: c.env.ENVIRONMENT || 'unknown',
    endpoints: {
      chat: 'POST /chat',
      contents: {
        list: 'GET /contents',
        upload: 'POST /contents',
        get: 'GET /contents/:id',
        delete: 'DELETE /contents/:id'
      },
      sessions: {
        list: 'GET /sessions',
        create: 'POST /sessions',
        get: 'GET /sessions/:id',
        delete: 'DELETE /sessions/:id'
      },
      health: 'GET /health'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '요청한 경로를 찾을 수 없습니다.',
      path: c.req.path
    }
  }, 404);
});

export default app;
