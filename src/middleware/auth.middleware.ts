import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.replace('Bearer ', '');

  if (token !== config.apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
