const express = require('express');
const router = express.Router();
const { handleIncoming } = require('../controllers/messageController');
const logger = require('../utils/logger');

/**
 * WhatsApp Webhook Routes
 */

/**
 * GET /webhook/whatsapp - Webhook verification
 * WhatsApp will call this endpoint to verify the webhook
 */
router.get('/', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('Webhook verification request', { mode, token: token ? '***' : 'missing' });

    if (mode && token) {
      if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('Webhook verified successfully');
        return res.status(200).send(challenge);
      } else {
        logger.warn('Webhook verification failed - invalid token');
        return res.status(403).send('Forbidden');
      }
    }

    logger.warn('Webhook verification failed - missing parameters');
    res.status(400).send('Bad Request');
  } catch (error) {
    logger.logError(error, { context: 'webhookVerification' });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /webhook/whatsapp - Receive WhatsApp messages
 * WhatsApp will call this endpoint when messages are received
 */
router.post('/', handleIncoming);

module.exports = router;
