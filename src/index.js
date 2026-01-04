require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const whatsappWebhook = require('./routes/whatsappWebhook');
const adminRoutes = require('./routes/admin');
const { startScheduler } = require('./services/schedulerService');
const logger = require('./utils/logger');

/**
 * WhatsApp Finance Assistant - Main Application Entry
 * Built with Express.js, OpenAI, and Supabase
 */

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// TRUST PROXY CONFIGURATION
// =============================================

// Enable trust proxy for ngrok, render, heroku, etc.
// This allows rate limiter to see real client IP from X-Forwarded-For header
app.set('trust proxy', 1);

// =============================================
// SECURITY MIDDLEWARE
// =============================================

// Helmet - Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// =============================================
// BODY PARSING MIDDLEWARE
// =============================================

// Parse JSON bodies (with size limit)
app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook signature verification
    req.rawBody = buf.toString('utf8');
  }
}));

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// =============================================
// REQUEST LOGGING MIDDLEWARE
// =============================================

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  
  next();
});

// =============================================
// ROUTES
// =============================================

// Health check endpoint (public)
app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp Finance Assistant',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// WhatsApp webhook routes
app.use('/webhook/whatsapp', whatsappWebhook);

// Admin routes
app.use('/admin', adminRoutes);

// =============================================
// ERROR HANDLING
// =============================================

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.logError(err, {
    context: 'globalErrorHandler',
    method: req.method,
    path: req.path,
  });

  // Don't expose internal errors in production
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'Something went wrong',
    ...(isDev && { stack: err.stack }),
  });
});

// =============================================
// SERVER STARTUP
// =============================================

const server = app.listen(PORT, () => {
  logger.info('='.repeat(50));
  logger.info('WhatsApp Finance Assistant');
  logger.info('='.repeat(50));
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Server listening on port ${PORT}`);
  logger.info(`Webhook URL: ${process.env.APP_BASE_URL}/webhook/whatsapp`);
  logger.info('='.repeat(50));
  
  // Start scheduler jobs
  try {
    startScheduler();
    logger.info('Scheduler started successfully');
  } catch (error) {
    logger.error('Failed to start scheduler:', error);
  }
});

// =============================================
// GRACEFUL SHUTDOWN
// =============================================

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Stop scheduler
    const { stopScheduler } = require('./services/schedulerService');
    stopScheduler();
    
    logger.info('Application shutdown complete');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Stop scheduler
    const { stopScheduler } = require('./services/schedulerService');
    stopScheduler();
    
    logger.info('Application shutdown complete');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
