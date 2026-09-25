// Gắn bởi middlewares/auth.ts (requireAuth) sau khi verify access token.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

export {};
