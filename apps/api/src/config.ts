import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(4100),
  WEB_ORIGIN: z.string().url().default('http://localhost:3100'),
  STORAGE_MODE: z.enum(['demo', 'postgres']).default('demo'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  DEMO_PASSWORD: z.string().min(8).default('investigate-demo'),
  SESSION_SECRET: z.string().min(32).default('local-demo-only-replace-with-32-characters'),
  NODE_ENV: z.string().default('development'),
});
export const config = schema.parse(process.env);
if (config.STORAGE_MODE === 'postgres' && !config.DATABASE_URL)
  throw new Error('DATABASE_URL is required for postgres storage');
if (
  config.NODE_ENV === 'production' &&
  (config.SESSION_SECRET.startsWith('local-demo') || config.DEMO_PASSWORD === 'investigate-demo')
)
  throw new Error('Set unique SESSION_SECRET and DEMO_PASSWORD in production');
