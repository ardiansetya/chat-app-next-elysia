import { Redis } from "@upstash/redis";

// Membaca UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.
export const redis = Redis.fromEnv();
