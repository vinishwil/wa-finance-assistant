// Jest setup file
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
