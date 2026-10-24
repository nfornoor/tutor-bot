import { ZodError } from 'zod';

/**
 * Validates request data (body, query, params) against a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query' | 'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errorMessages
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Malformed request data'
      });
    }
  };
}
