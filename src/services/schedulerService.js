const cron = require('node-cron');
const logger = require('../utils/logger');
const { mediaService } = require('./mediaService');

/**
 * Scheduler Service - Manage cron jobs
 * Following Single Responsibility Principle
 */

const jobs = new Map();

/**
 * Start all scheduled jobs
 */
function startScheduler() {
  logger.info('Starting scheduler service...');

  // Daily reminder job (9 AM every day)
  const dailyReminderCron = process.env.DAILY_REMINDER_CRON || '0 9 * * *';
  const dailyReminderJob = cron.schedule(dailyReminderCron, async () => {
    try {
      logger.info('Running daily reminder job');
      const { sendDailyReminders } = require('../jobs/dailyReminder');
      await sendDailyReminders();
    } catch (error) {
      logger.logError(error, { context: 'dailyReminderJob' });
    }
  }, {
    timezone: process.env.DAILY_REMINDER_TIMEZONE || 'Asia/Kolkata',
  });

  jobs.set('dailyReminder', dailyReminderJob);
  logger.info('Daily reminder job scheduled', { cron: dailyReminderCron });

  // Cleanup temp files job (every 6 hours)
  const cleanupJob = cron.schedule('0 */6 * * *', async () => {
    try {
      logger.info('Running temp files cleanup job');
      await mediaService.cleanupTempFiles(24); // Clean files older than 24 hours
    } catch (error) {
      logger.logError(error, { context: 'cleanupJob' });
    }
  });

  jobs.set('cleanup', cleanupJob);
  logger.info('Cleanup job scheduled (every 6 hours)');

  // Health check job (every hour)
  const healthCheckJob = cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Running health check job');
      const { checkConnection } = require('../config/supabaseClient');
      const supabaseHealth = await checkConnection();
      
      if (!supabaseHealth.healthy) {
        logger.error('Supabase health check failed', supabaseHealth);
      }
    } catch (error) {
      logger.logError(error, { context: 'healthCheckJob' });
    }
  });

  jobs.set('healthCheck', healthCheckJob);
  logger.info('Health check job scheduled (every hour)');

  logger.info(`Scheduler started with ${jobs.size} jobs`);
}

/**
 * Stop all scheduled jobs
 */
function stopScheduler() {
  logger.info('Stopping scheduler service...');
  
  jobs.forEach((job, name) => {
    job.stop();
    logger.info(`Stopped job: ${name}`);
  });
  
  jobs.clear();
  logger.info('Scheduler stopped');
}

/**
 * Get status of all jobs
 */
function getJobsStatus() {
  const status = {};
  
  jobs.forEach((job, name) => {
    status[name] = {
      name,
      running: job.running || false,
    };
  });
  
  return status;
}

/**
 * Manually trigger a specific job
 */
async function triggerJob(jobName) {
  if (jobName === 'dailyReminder') {
    const { sendDailyReminders } = require('../jobs/dailyReminder');
    await sendDailyReminders();
    return { success: true, message: 'Daily reminder job triggered' };
  }
  
  if (jobName === 'cleanup') {
    const { cleanupTempFiles } = require('./mediaService');
    await cleanupTempFiles(24);
    return { success: true, message: 'Cleanup job triggered' };
  }
  
  return { success: false, message: 'Job not found' };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getJobsStatus,
  triggerJob,
};
