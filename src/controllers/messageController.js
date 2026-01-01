const whatsappService = require('../services/whatsappService');
const mediaService = require('../services/mediaService');
const aiService = require('../services/aiService');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');
const {
  getConfirmationMessage,
  getLinkingInstructionsMessage,
  getExtractionErrorMessage,
  getSubscriptionRequiredMessage,
  getHelpMessage,
} = require('../utils/prompts');
const { validate, transactionSchema, sanitizeInput } = require('../utils/validators');

/**
 * Message Controller - Handle incoming WhatsApp messages
 * Following Single Responsibility Principle
 */

/**
 * Handle incoming webhook from WhatsApp
 */
async function handleIncoming(req, res) {
  try {
    const body = req.body;

    // Respond quickly to WhatsApp (200 OK)
    res.sendStatus(200);

    // Process messages asynchronously
    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const messages = (value && value.messages) || [];
        
        for (const msg of messages) {
          // Process each message independently
          processMessage(value, msg).catch((err) =>
            logger.logError(err, { context: 'processMessage', messageId: msg.id })
          );
        }
      }
    }
  } catch (error) {
    logger.logError(error, { context: 'handleIncoming' });
    // Already sent 200, so just log the error
  }
}

/**
 * Process individual message
 */
async function processMessage(value, msg) {
  const phoneNumber = msg.from;
  const messageId = msg.id;
  const messageType = msg.type;

  try {
    // Log incoming message
    await supabaseService.logEvent('whatsapp_message_received', {
      phoneNumber,
      messageId,
      messageType,
      timestamp: msg.timestamp,
    });

    // Mark message as read
    await whatsappService.markMessageAsRead(messageId);

    // Step 1: Check if user is linked
    const user = await supabaseService.getUserByWhatsapp(phoneNumber);

    if (!user) {
      // User not linked - send onboarding instructions
      await whatsappService.sendTextMessage(phoneNumber, getLinkingInstructionsMessage());
      return;
    }

    // Step 2: Check subscription
    const subscription = await supabaseService.checkSubscription(user.user_id);
    if (!subscription.hasSubscription) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        getSubscriptionRequiredMessage(user.full_name)
      );
      return;
    }

    // Step 3: Handle different message types
    if (messageType === 'text') {
      await handleTextMessage(msg, user, phoneNumber);
    } else if (messageType === 'image') {
      await handleImageMessage(msg, user, phoneNumber);
    } else if (messageType === 'audio' || messageType === 'voice') {
      await handleAudioMessage(msg, user, phoneNumber);
    } else if (messageType === 'document') {
      await handleDocumentMessage(msg, user, phoneNumber);
    } else {
      logger.info('Unsupported message type', { messageType, phoneNumber });
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Unsupported message type. Please send text, image, voice note, or document.'
      );
    }
  } catch (error) {
    logger.logError(error, {
      context: 'processMessage',
      phoneNumber,
      messageId,
      messageType,
    });

    // Send error message to user
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Sorry, something went wrong processing your message. Please try again.'
    );
  }
}

/**
 * Handle text messages
 */
async function handleTextMessage(msg, user, phoneNumber) {
  const text = sanitizeInput(msg.text.body);

  // Check for commands
  if (text.toUpperCase().startsWith('LINK')) {
    // Handled by link controller
    const linkController = require('./linkController');
    await linkController.handleLinkCommand(text, phoneNumber);
    return;
  }

  if (text.toUpperCase().startsWith('VERIFY')) {
    const linkController = require('./linkController');
    await linkController.handleVerifyCommand(text, phoneNumber);
    return;
  }

  if (text.toUpperCase() === 'HELP') {
    await whatsappService.sendTextMessage(phoneNumber, getHelpMessage());
    return;
  }

  if (text.toUpperCase() === 'DELETE') {
    await handleDeleteCommand(user, phoneNumber);
    return;
  }

  if (text.toUpperCase() === 'NONE' || text.toUpperCase() === 'NO') {
    await whatsappService.sendTextMessage(phoneNumber, '✅ Got it! Have a great day!');
    return;
  }

  // Extract transaction from text
  await whatsappService.sendReaction(phoneNumber, msg.id, '⏳');

  // Fetch categories for the user's family
  const categories = await supabaseService.getCategoriesForFamily(user.family_id);

  const transaction = await aiService.extractFromText(text, '', categories);

  if (!transaction) {
    await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
    await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
    return;
  }

  // Save transaction
  await saveTransaction(transaction, user, phoneNumber, msg.id);
}

/**
 * Handle image messages
 */
async function handleImageMessage(msg, user, phoneNumber) {
  const imageId = msg.image.id;
  const mimeType = msg.image.mime_type;

  try {
    await whatsappService.sendReaction(phoneNumber, msg.id, '⏳');
    await whatsappService.sendTextMessage(phoneNumber, '📸 Processing your bill image...');

    // Download and process image
    const { base64, mimeType: finalMimeType, storageUrl } = await mediaService.processImageMedia(
      imageId,
      mimeType
    );

    // Fetch categories for the user's family
    const categories = await supabaseService.getCategoriesForFamily(user.family_id);

    // Extract transaction from image
    const transaction = await aiService.extractFromImage(base64, finalMimeType, '', categories);

    if (!transaction) {
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
      return;
    }

    // Add storage URL to transaction metadata
    transaction.mediaUrl = storageUrl;

    // Save transaction
    await saveTransaction(transaction, user, phoneNumber, msg.id);
  } catch (error) {
    logger.logError(error, { context: 'handleImageMessage', imageId });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to process image. Please try again or send a clearer photo.'
    );
    await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
  }
}

/**
 * Handle audio/voice messages
 */
async function handleAudioMessage(msg, user, phoneNumber) {
  const audioId = msg.audio?.id || msg.voice?.id;
  const mimeType = msg.audio?.mime_type || msg.voice?.mime_type;

  let tempPath = null;
  try {
    await whatsappService.sendReaction(phoneNumber, msg.id, '⏳');
    await whatsappService.sendTextMessage(phoneNumber, '🎤 Transcribing your voice note...');

    // Download and process audio
    const { tempPath: audioPath, storageUrl } = await mediaService.processAudioMedia(
      audioId,
      mimeType
    );
    tempPath = audioPath;

    // Fetch categories for the user's family
    const categories = await supabaseService.getCategoriesForFamily(user.family_id);

    // Extract transaction from audio
    const transaction = await aiService.extractFromAudio(audioPath, '', categories);

    if (!transaction) {
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
      return;
    }

    // Add storage URL to transaction metadata
    transaction.mediaUrl = storageUrl;

    // Save transaction
    await saveTransaction(transaction, user, phoneNumber, msg.id);
  } catch (error) {
    logger.logError(error, { context: 'handleAudioMessage', audioId });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to transcribe audio. Please speak clearly and try again.'
    );
    await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
  } finally {
    // Cleanup temp file
    if (tempPath) {
      await mediaService.deleteTempFile(tempPath);
    }
  }
}

/**
 * Handle document messages (PDFs)
 */
async function handleDocumentMessage(msg, user, phoneNumber) {
  const documentId = msg.document.id;
  const mimeType = msg.document.mime_type;

  try {
    await whatsappService.sendReaction(phoneNumber, msg.id, '⏳');
    await whatsappService.sendTextMessage(phoneNumber, '📄 Processing your document...');

    // For now, treat documents like images for OCR
    const { base64, storageUrl } = await mediaService.processDocumentMedia(documentId, mimeType);

    // Fetch categories for the user's family
    const categories = await supabaseService.getCategoriesForFamily(user.family_id);

    // If it's a PDF, you might need additional OCR processing
    // For simplicity, we'll try image extraction
    const transaction = await aiService.extractFromImage(base64, mimeType, '', categories);

    if (!transaction) {
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
      return;
    }

    transaction.mediaUrl = storageUrl;
    await saveTransaction(transaction, user, phoneNumber, msg.id);
  } catch (error) {
    logger.logError(error, { context: 'handleDocumentMessage', documentId });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to process document. Please send as image instead.'
    );
    await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
  }
}

/**
 * Save transaction to database and send confirmation
 */
async function saveTransaction(transaction, user, phoneNumber, messageId) {
  try {
    // Validate transaction data
    const { valid, value, errors } = await validate(transactionSchema, transaction);

    if (!valid) {
      logger.warn('Transaction validation failed', { errors, transaction });
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, messageId, '❌');
      return;
    }

    // Get or create category
    const categoryId = await supabaseService.getOrCreateCategory(
      value.category,
      user.family_id
    );

    // Prepare transaction data
    const transactionData = {
      user_id: user.user_id,
      family_id: user.family_id,
      amount: value.amount,
      type: value.type,
      description: value.description || value.vendor || `${value.category} transaction`,
      date: value.date,
      category_id: categoryId,
    };

    // Insert transaction
    const savedTransaction = await supabaseService.insertTransaction(transactionData);

    // Send confirmation
    const confirmationMsg = getConfirmationMessage(value, user.full_name);
    await whatsappService.sendTextMessage(phoneNumber, confirmationMsg);
    await whatsappService.sendReaction(phoneNumber, messageId, '✅');

    logger.info('Transaction saved successfully', {
      transaction_id: savedTransaction.transaction_id,
      user_id: user.user_id,
      amount: value.amount,
    });
  } catch (error) {
    logger.logError(error, { context: 'saveTransaction', transaction, userId: user.user_id });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to save transaction. Please try again.'
    );
    await whatsappService.sendReaction(phoneNumber, messageId, '❌');
  }
}

/**
 * Handle DELETE command
 */
async function handleDeleteCommand(user, phoneNumber) {
  try {
    const lastTransaction = await supabaseService.getLastTransaction(user.user_id);

    if (!lastTransaction) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        'No recent transactions found to delete.'
      );
      return;
    }

    await supabaseService.deleteTransaction(lastTransaction.transaction_id, user.user_id);
    await whatsappService.sendTextMessage(
      phoneNumber,
      `✅ Deleted transaction: ${lastTransaction.description} (${lastTransaction.amount})`
    );
  } catch (error) {
    logger.logError(error, { context: 'handleDeleteCommand', userId: user.user_id });
    await whatsappService.sendTextMessage(phoneNumber, '❌ Failed to delete transaction.');
  }
}

module.exports = {
  handleIncoming,
  processMessage,
};
