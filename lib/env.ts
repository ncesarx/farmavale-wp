import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  META_VERIFY_TOKEN: z.string().min(24),
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_APP_SECRET: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().default("v26.0"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

export function getEnv() {
  return schema.parse(process.env);
}
