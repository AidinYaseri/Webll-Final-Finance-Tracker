import { Request, Response, NextFunction } from "express";
import { User } from "./models/User.js";

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  req.userId = userId;
  next();
};

export const isAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const user = await User.findById(userId);

    if (!user || !(user as any).is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error("isAdmin check failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
};
