import { Hono } from 'hono';
import { UserService } from '../services/userService.js';

const users = new Hono();

// Get all users (authentication required via global middleware)
users.get('/', async (c) => {
  try {
    const userService = new UserService(c.env);
    const users = await userService.getUsers();
    return c.json({ data: users });
  } catch (error) {
    throw error;
  }
});

// Get user profile (authentication required via global middleware)
users.get('/profile', async (c) => {
  const userId = c.get('userId');
  const userEmail = c.get('userEmail');
  const userRole = c.get('userRole');

  const userService = new UserService(c.env);
  const user = await userService.getUserById(userId);

  return c.json({
    data: {
      ...user,
      email: userEmail,
      role: userRole
    }
  });
});

export default users;
