const supabaseService = require('../services/supabaseService');
const whatsappService = require('../services/whatsappService');
const { getDailyReminderMessage } = require('../utils/prompts');
const logger = require('../utils/logger');

/**
 * Daily Reminder Job
 * Sends daily prompts to all active WhatsApp users
 */

async function sendDailyReminders() {
  try {
    logger.info('Starting daily reminder job');

    // Get all active WhatsApp users
    const activeUsers = await supabaseService.getActiveWhatsappUsers();

    if (!activeUsers || activeUsers.length === 0) {
      logger.info('No active WhatsApp users found');
      return;
    }

    logger.info(`Sending daily reminders to ${activeUsers.length} users`);

    let successCount = 0;
    let failureCount = 0;

    // Send reminders to all users
    for (const link of activeUsers) {
      try {
        const userName = link.users?.full_name || 'there';
        const message = getDailyReminderMessage(userName);

        await whatsappService.sendTextMessage(link.whatsapp_number, message);
        
        successCount++;
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.logError(error, {
          context: 'sendDailyReminder',
          whatsappNumber: link.whatsapp_number,
          userId: link.users?.user_id,
        });
        failureCount++;
      }
    }

    // Log summary
    await supabaseService.logEvent('daily_reminders_sent', {
      totalUsers: activeUsers.length,
      successCount,
      failureCount,
      timestamp: new Date().toISOString(),
    });

    logger.info('Daily reminder job completed', {
      totalUsers: activeUsers.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    logger.logError(error, { context: 'sendDailyReminders' });
    throw error;
  }
}

module.exports = {
  sendDailyReminders,
};
