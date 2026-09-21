import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { makeError } from './errors.js';

export function securityMiddleware(allowedOrigin) {
  return [
    helmet(),
    express.json({ limit: '20kb' }),
    (request, _response, next) => {
      const requestOrigin = request.get('origin');
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        return next(makeError(403, 'This website is not allowed.'));
      }
      next();
    },
    cors({ origin: allowedOrigin, credentials: true }),
  ];
}
