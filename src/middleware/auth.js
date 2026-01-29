import { jwtVerify } from 'jose';

/**
 * JWT Authentication middleware
 * Verifies JWT token and sets user context
 */
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '인증이 필요합니다.'
      }
    }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      console.error('JWT_SECRET is not configured');
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '인증 설정 오류가 발생했습니다.'
        }
      }, 401);
    }

    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ['HS256']
    });

    // Set user context from JWT payload
    c.set('userId', payload.sub || payload.userId);
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role);
    c.set('jwtPayload', payload);

    await next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '유효하지 않거나 만료된 토큰입니다.'
      }
    }, 401);
  }
};
