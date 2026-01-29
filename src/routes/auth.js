import { Hono } from 'hono';
import { AuthService } from '../services/authService.js';

const auth = new Hono();

/**
 * POST /auth/login
 * Login with username and password, returns JWT token
 */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '사용자명과 비밀번호를 입력해 주세요.'
        }
      }, 400);
    }

    const authService = new AuthService(c.env);
    const user = await authService.authenticateUser(username, password);

    if (!user) {
      return c.json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: '사용자명 또는 비밀번호가 올바르지 않습니다.'
        }
      }, 401);
    }

    const token = await authService.generateToken(user);

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        expiresIn: '24h'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '로그인 중 오류가 발생했습니다.'
      }
    }, 500);
  }
});

export default auth;
