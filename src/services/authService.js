import { SignJWT } from 'jose';

/**
 * Authentication Service
 * Handles login and token generation
 */
export class AuthService {
  constructor(env) {
    this.env = env;
  }

  /**
   * Authenticate user with username and password
   * 환경변수 기반 관리자 인증
   */
  async authenticateUser(username, password) {
    const adminUsername = this.env.ADMIN_USERNAME;
    const adminPassword = this.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      throw new Error('인증 설정이 되어 있지 않습니다.');
    }

    if (username !== adminUsername || password !== adminPassword) {
      return null;
    }

    return { id: '1', username, email: '', role: 'admin' };
  }

  /**
   * Generate JWT token
   * Token expires in 24 hours (1 day)
   */
  async generateToken(user) {
    const encoder = new TextEncoder();
    const secret = this.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('24h') // 1 day expiration
      .sign(encoder.encode(secret));

    return token;
  }
}
