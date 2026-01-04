const express = require('express');
const router = express.Router();
const { checkConnection, supabase } = require('../config/supabaseClient');
const aiService = require('../services/aiService');
const supabaseService = require('../services/supabaseService');
const { triggerJob, getJobsStatus } = require('../services/schedulerService');
const { manualLink, unlinkAccount } = require('../controllers/linkController');
const logger = require('../utils/logger');

/**
 * Admin API Routes
 * Protected endpoints for admin operations
 */

// Simple API key authentication middleware
function authenticateAdmin(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminApiKey) {
    logger.warn('ADMIN_API_KEY not configured');
    return res.status(500).json({ error: 'Admin API not configured' });
  }

  if (apiKey !== adminApiKey) {
    logger.warn('Unauthorized admin access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * GET /admin/health - Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const supabaseHealth = await checkConnection();
    const aiHealth = await aiService.checkAPIHealth();
    const allAIProviders = await aiService.checkAllProvidersHealth();

    const health = {
      status: supabaseHealth.healthy && aiHealth.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        supabase: supabaseHealth,
        ai: {
          current: aiHealth,
          currentProvider: aiService.getCurrentProvider(),
          availableProviders: aiService.getAvailableProviders(),
          allProviders: allAIProviders,
        },
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.logError(error, { context: 'healthCheck' });
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

/**
 * GET /admin/stats - Get usage statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Ensure supabase client is available
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { count: messageCount, error: messageError } = await supabase
      .from('event_logs')
      .select('count', { count: 'exact', head: true })
      .eq('event_type', 'whatsapp_message_received');

    if (messageError) throw messageError;

    const { count: transactionCount, error: transactionError } = await supabase
      .from('transactions')
      .select('count', { count: 'exact', head: true });

    if (transactionError) throw transactionError;

    const { count: linkedUsers, error: linkedError } = await supabase
      .from('whatsapp_links')
      .select('count', { count: 'exact', head: true })
      .eq('verified', true);

    if (linkedError) throw linkedError;

    res.json({
      success: true,
      stats: {
        messagesReceived: messageCount,
        transactionsCreated: transactionCount,
        linkedUsers: linkedUsers,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.logError(error, { context: 'getStats' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/link-user - Manually link a user
 */
router.post('/link-user', authenticateAdmin, manualLink);

/**
 * POST /admin/unlink-user - Unlink a user
 */
router.post('/unlink-user', authenticateAdmin, unlinkAccount);

/**
 * GET /admin/jobs - Get scheduler jobs status
 */
router.get('/jobs', authenticateAdmin, (req, res) => {
  try {
    const jobs = getJobsStatus();
    res.json({
      success: true,
      jobs,
    });
  } catch (error) {
    logger.logError(error, { context: 'getJobs' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/trigger-job - Manually trigger a job
 */
router.post('/trigger-job', authenticateAdmin, async (req, res) => {
  try {
    const { jobName } = req.body;

    if (!jobName) {
      return res.status(400).json({
        success: false,
        message: 'jobName is required',
      });
    }

    const result = await triggerJob(jobName);
    res.json(result);
  } catch (error) {
    logger.logError(error, { context: 'triggerJob' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /admin/logs - Get recent event logs
 */
router.get('/logs', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const eventType = req.query.eventType;

    let query = supabase
      .from('event_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      logs: data,
      count: data.length,
    });
  } catch (error) {
    logger.logError(error, { context: 'getLogs' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /admin/ai-providers - Get AI provider information
 */
router.get('/ai-providers', authenticateAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      current: aiService.getCurrentProvider(),
      available: aiService.getAvailableProviders(),
    });
  } catch (error) {
    logger.logError(error, { context: 'getAIProviders' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/switch-ai-provider - Switch AI provider
 */
router.post('/switch-ai-provider', authenticateAdmin, (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        success: false,
        message: 'provider is required (openai or gemini)',
      });
    }

    const success = aiService.switchProvider(provider);

    if (!success) {
      return res.status(400).json({
        success: false,
        message: `Provider ${provider} is not available`,
        available: aiService.getAvailableProviders(),
      });
    }

    logger.info(`AI provider switched to: ${provider}`);

    res.json({
      success: true,
      message: `Switched to ${provider}`,
      currentProvider: aiService.getCurrentProvider(),
    });
  } catch (error) {
    logger.logError(error, { context: 'switchAIProvider' });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
