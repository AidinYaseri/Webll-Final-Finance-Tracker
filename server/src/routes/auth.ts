import { Router } from 'express';
import { User, DuplicateEmailError, InvalidCredentialsError } from '../models/User.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware.js';

const router = Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.create({ username, email, password });
    req.session.userId = user.user_id;

    const rememberEmail = req.body.rememberMe;
    if (rememberEmail) {
      res.cookie('rememberEmail', email, {
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error: any) {
    if (error instanceof DuplicateEmailError) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.login(email, password);
    req.session.userId = user.user_id;

    if (rememberMe) {
      res.cookie('rememberEmail', email, {
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
    } else {
      res.clearCookie('rememberEmail');
    }

    res.json({
      message: 'Login successful',
      user,
    });
  } catch (error: any) {
    if (error instanceof InvalidCredentialsError) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await User.findById(req.userId!);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/logout', authMiddleware, (req, res) => {
  req.session.destroy(() => undefined);
  res.clearCookie('connect.sid');
  res.json({ message: 'Logged out successfully' });
});

export default router;
