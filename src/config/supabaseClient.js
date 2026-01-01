const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Create Supabase client with retry logic and error handling
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'wa-finance-assistant'
    }
  }
};

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);

// Test connection on initialization (non-blocking)
setImmediate(async () => {
  try {
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is fine
      logger.warn('Supabase connection test warning:', error.message);
    } else {
      logger.info('Supabase client initialized successfully');
    }
  } catch (error) {
    logger.error('Failed to test Supabase connection:', error);
  }
});

// Health check function
async function checkConnection() {
  try {
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    return { healthy: !error || error.code === 'PGRST116', error: error?.message };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

module.exports = {
  supabase,
  checkConnection
};
