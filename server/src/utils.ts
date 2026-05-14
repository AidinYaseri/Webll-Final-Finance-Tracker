import jwt from 'jsonwebtoken';

export interface AuthRequest {
  userId: number;
}

export const generateToken = (userId: number): string => {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    expiresIn: '24h',
  });
};

export const verifyToken = (token: string): AuthRequest | null => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AuthRequest;
    return decoded;
  } catch (error) {
    return null;
  }
};
