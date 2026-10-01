import { randomUUID } from 'node:crypto';

import { type NextFunction, type Request, type Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DIAGNOSTIC_PATHS = new Set([
  '/api-sso/me',
  '/api-sso/refresh',
  '/api-sso/apps',
]);

const safeHeader = (req: Request, name: string, maxLength: number): string | undefined => {
  const value = req.get(name)?.trim();
  return value ? value.slice(0, maxLength) : undefined;
};

export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const incomingRequestId = safeHeader(req, 'X-Request-Id', 128);
  const requestId =
    incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();
  const startedAt = Date.now();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Session, quyền và danh sách app có thể thay đổi giữa hai request. Không
  // để Express phát ETag/304 khiến browser dùng lại auth payload cũ.
  if (DIAGNOSTIC_PATHS.has(req.path)) {
    res.setHeader('Cache-Control', 'no-store, private, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  if (DIAGNOSTIC_PATHS.has(req.path)) {
    res.on('finish', () => {
      console.info(
        JSON.stringify({
          event: 'api_request_completed',
          service: 'api-sso',
          request_id: requestId,
          navigation_id: safeHeader(req, 'X-Navigation-Id', 128),
          app_version: safeHeader(req, 'X-App-Version', 128),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - startedAt,
        }),
      );
    });
  }

  next();
};
