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
   * TODO: Replace with actual database lookup using D1
   */
  async authenticateUser(username, password) {
    // TODO: Replace with actual database query
    // Example with D1:
    // const user = await D1.queryFirst(this.env.DB,
    //   'SELECT * FROM users WHERE username = ?', [username]);

    // This is a mock implementation for demonstration
    const mockUsers = {
      'admin': { id: '1', password: 'admin123', email: 'admin@example.com', role: 'admin' },
      'user': { id: '2', password: 'user123', email: 'user@example.com', role: 'user' }
    };

    const user = mockUsers[username];

    if (!user || user.password !== password) {
      return null;
    }

    return {
      id: user.id,
      username: username,
      email: user.email,
      role: user.role
    };
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
