const axios = require('axios');
const logger = require('../utils/logger');

/**
 * WhatsApp Service - Handle WhatsApp Cloud API operations
 * Following Single Responsibility Principle
 */

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}`;

/**
 * Send text message to WhatsApp user
 */
async function sendTextMessage(to, message) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp message sent', { to, message_id: response.data.messages?.[0]?.id });
    return response.data;
  } catch (error) {
    logger.logError(error, {
      context: 'sendTextMessage',
      to,
      response: error.response?.data,
    });
    throw new Error(`Failed to send WhatsApp message: ${error.message}`);
  }
}

/**
 * Send template message (for structured messages)
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components: components,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp template sent', { to, templateName });
    return response.data;
  } catch (error) {
    logger.logError(error, {
      context: 'sendTemplateMessage',
      to,
      templateName,
      response: error.response?.data,
    });
    throw new Error(`Failed to send template message: ${error.message}`);
  }
}

/**
 * Mark message as read
 */
async function markMessageAsRead(messageId) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.warn('Failed to mark message as read', { messageId, error: error.message });
    // Don't throw - marking as read is not critical
  }
}

/**
 * Send reaction to a message
 */
async function sendReaction(to, messageId, emoji) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji: emoji,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.warn('Failed to send reaction', { to, messageId, error: error.message });
    // Don't throw - reactions are not critical
  }
}

/**
 * Get media URL from media ID
 */
async function getMediaUrl(mediaId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        },
      }
    );

    return response.data.url;
  } catch (error) {
    logger.logError(error, { context: 'getMediaUrl', mediaId });
    throw new Error(`Failed to get media URL: ${error.message}`);
  }
}

/**
 * Download media file from WhatsApp
 */
async function downloadMedia(mediaUrl) {
  try {
    const response = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      responseType: 'arraybuffer',
      timeout: 30000, // 30 seconds timeout
    });

    return {
      buffer: response.data,
      mimeType: response.headers['content-type'],
      size: response.data.length,
    };
  } catch (error) {
    logger.logError(error, { context: 'downloadMedia', mediaUrl });
    throw new Error(`Failed to download media: ${error.message}`);
  }
}

/**
 * Send interactive button message
 */
async function sendButtonMessage(to, bodyText, buttons) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText,
          },
          action: {
            buttons: buttons.map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${idx}`,
                title: btn.title,
              },
            })),
          },
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp button message sent', { to });
    return response.data;
  } catch (error) {
    logger.logError(error, {
      context: 'sendButtonMessage',
      to,
      response: error.response?.data,
    });
    throw new Error(`Failed to send button message: ${error.message}`);
  }
}

/**
 * Send list message
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: bodyText,
          },
          action: {
            button: buttonText,
            sections: sections,
          },
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp list message sent', { to });
    return response.data;
  } catch (error) {
    logger.logError(error, {
      context: 'sendListMessage',
      to,
      response: error.response?.data,
    });
    throw new Error(`Failed to send list message: ${error.message}`);
  }
}

/**
 * Verify webhook signature (for security)
 */
function verifyWebhookSignature(signature, rawBody) {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET || '')
    .update(rawBody)
    .digest('hex');

  return signature === `sha256=${expectedSignature}`;
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  markMessageAsRead,
  sendReaction,
  getMediaUrl,
  downloadMedia,
  sendButtonMessage,
  sendListMessage,
  verifyWebhookSignature,
};
