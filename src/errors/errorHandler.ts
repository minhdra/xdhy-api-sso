import { type NextFunction, type Request, type Response } from 'express';

import { config } from '../config/config';

import { AppError } from './AppError';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.locals.requestId as string | undefined;
  console.error('Lỗi:', { requestId, method: req.method, path: req.path, error: err });

  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message, request_id: requestId });
  }

  res.status(500).json({
    success: false,
    message: config.env === 'production' ? 'Lỗi máy chủ' : err.message,
    request_id: requestId,
  });
};
