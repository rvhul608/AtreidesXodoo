process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-hmac';
process.env.COOKIE_SECURE = 'false';
