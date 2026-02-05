// Mock Redis for tests with realistic locking behavior
jest.mock("../services/redis.service", () => {
  let lockState: Record<string, boolean> = {};

  const mockRedisInstance = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    setWithExpiry: jest.fn().mockResolvedValue("OK"),

    // Simulate realistic lock behavior - only first caller gets lock
    acquireLock: jest.fn().mockImplementation(async (key: string) => {
      if (lockState[key]) {
        return false; // Lock already held
      }
      lockState[key] = true;
      return true; // Lock acquired
    }),

    releaseLock: jest.fn().mockImplementation(async (key: string) => {
      delete lockState[key];
      return true;
    }),

    disconnect: jest.fn().mockResolvedValue(undefined),
  };

  return {
    RedisService: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

// Increase timeout for all tests
jest.setTimeout(10000);

// Reset lock state before each test
beforeEach(() => {
  jest.clearAllMocks();
});
