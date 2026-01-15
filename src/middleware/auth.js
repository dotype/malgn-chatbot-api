import { jwtVerify } from 'jose';

/**
 * JWT Authentication middleware
 * Verifies JWT token and sets user context
 */
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing or invalid authorization header');
    error.name = 'UnauthorizedError';
    throw error;
  }

  const token = authHeader.substring(7);

  try {
    // Get JWT secret from environment variables
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      console.error('JWT_SECRET is not configured');
      const error = new Error('Authentication configuration error');
      error.name = 'UnauthorizedError';
      throw error;
    }

    // Verify JWT token
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
    const error = new Error('Invalid or expired token');
    error.name = 'UnauthorizedError';
    throw error;
  }
};
