import { z } from 'zod';
import { ApiError } from '../middleware/errors.js';

const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(15).max(128);
const title = z.string().trim().min(1).max(200);
const body = z.string().min(1).max(10000).refine(value => value.trim().length > 0, 'Body must not be whitespace-only.');
export const registerSchema = z.strictObject({ email, password, displayName: z.string().trim().min(1).max(80) });
export const loginSchema = z.strictObject({ email, password });
export const postSchema = z.strictObject({ title, body });
export const patchSchema = postSchema.partial().refine(value => Object.keys(value).length > 0, 'At least one field is required.');
export const idSchema = z.strictObject({ id: z.string().uuid() });
const integer = (fallback, max) => z.string().regex(/^[1-9]\d*$/).transform(Number)
  .refine(value => Number.isSafeInteger(value) && value <= max, 'Integer is out of range.').default(fallback);
export const paginationSchema = z.strictObject({ page: integer(1, 2147483647), limit: integer(20, 100) });
export const emptySchema = z.strictObject({});

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source] ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.',
        parsed.error.issues.map(issue => ({ field: issue.path.join('.') || source, message: issue.message })));
    }
    req.validated ??= {};
    req.validated[source] = parsed.data;
    next();
  };
}
