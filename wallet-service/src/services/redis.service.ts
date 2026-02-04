import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';

export class RedisService {
  private client: RedisClientType | null = null;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('RedisService');
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    try {
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD || undefined,
      });

      this.client.on('error', (err) => {
        this.logger.error('Redis client error', err);
      });

      this.client.on('connect', () => {
        this.logger.info('Redis client connected');
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * Acquire a distributed lock using Redis SET NX (set if not exists)
   * 
   * @param key - Lock key
   * @param ttlMs - Time to live in milliseconds
   * @returns true if lock acquired, false otherwise
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    if (!this.client) {
      await this.connect();
    }

    try {
      const result = await this.client!.set(key, '1', {
        NX: true, // Only set if key doesn't exist
        PX: ttlMs, // Set expiry in milliseconds
      });

      return result === 'OK';
    } catch (error) {
      this.logger.error('Failed to acquire lock', { key, error });
      return false;
    }
  }

  /**
   * Release a distributed lock
   * 
   * @param key - Lock key
   */
  async releaseLock(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error('Failed to release lock', { key, error });
    }
  }

  /**
   * Set a value in Redis with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      await this.connect();
    }

    try {
      if (ttlSeconds) {
        await this.client!.setEx(key, ttlSeconds, value);
      } else {
        await this.client!.set(key, value);
      }
    } catch (error) {
      this.logger.error('Failed to set value', { key, error });
      throw error;
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) {
      await this.connect();
    }

    try {
      return await this.client!.get(key);
    } catch (error) {
      this.logger.error('Failed to get value', { key, error });
      return null;
    }
  }

  /**
   * Delete a key from Redis
   */
  async delete(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error('Failed to delete key', { key, error });
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger.info('Redis client disconnected');
    }
  }
}
