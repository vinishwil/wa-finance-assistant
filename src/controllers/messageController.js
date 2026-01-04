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

    // Step 1: Check for LINK/VERIFY commands FIRST (before user check)
    // These commands should work even if user is not linked yet
    if (messageType === 'text') {
      const text = sanitizeInput(msg.text.body);
      
      if (text.toUpperCase().startsWith('LINK')) {
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
    }

    // Step 2: Check if user is linked
    const user = await supabaseService.getUserByWhatsapp(phoneNumber);

    if (!user) {
      // User not linked - send onboarding instructions
      await whatsappService.sendTextMessage(phoneNumber, getLinkingInstructionsMessage());
      return;
    }


    // Step 3: Check subscription
    const subscription = await supabaseService.checkSubscription(user.user_id);
    if (!subscription.hasSubscription) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        getSubscriptionRequiredMessage(user.full_name)
      );
      return;
    }

    // Step 4: Handle different message types
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

  // Note: LINK, VERIFY, and HELP commands are handled in processMessage before this function is called
  
  // Check for commands that require a linked user
  if (text.toUpperCase() === 'DELETE') {
    await handleDeleteCommand(user, phoneNumber);
    return;
  }

  if (text.toUpperCase() === 'CATEGORIES' || text.toUpperCase() === 'LIST CATEGORIES') {
    await handleCategoriesCommand(user, phoneNumber);
    return;
  }

  if (text.toUpperCase().startsWith('ADD CATEGORY')) {
    await handleAddCategoryCommand(text, user, phoneNumber);
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
  
  const result = await aiService.extractFromText(text, '', categories);


  if (!result) {
    await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
    await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
    return;
  }

  // Handle both single transaction and array of transactions
  const transactions = Array.isArray(result) ? result : [result];
  
  // Save all transactions
  for (const transaction of transactions) {
    await saveTransaction(transaction, user, phoneNumber, msg.id, categories);
  }
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
    const result = await aiService.extractFromImage(base64, finalMimeType, '', categories);

    if (!result) {
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
      return;
    }

    // Handle both single transaction and array of transactions
    const transactions = Array.isArray(result) ? result : [result];
    
    // Save all transactions
    for (const transaction of transactions) {
      // Add storage URL to transaction metadata
      transaction.mediaUrl = storageUrl;
      await saveTransaction(transaction, user, phoneNumber, msg.id, categories);
    }
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
    const result = await aiService.extractFromAudio(audioPath, '', categories);

    if (!result) {
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, msg.id, '❌');
      return;
    }

    // Handle both single transaction and array of transactions
    const transactions = Array.isArray(result) ? result : [result];
    
    // Save all transactions
    for (const transaction of transactions) {
      // Add storage URL to transaction metadata
      transaction.mediaUrl = storageUrl;
      await saveTransaction(transaction, user, phoneNumber, msg.id, categories);
    }
  } catch (error) {
    logger.logError(error, { context: 'handleAudioMessage', audioId });
    
    // Provide specific error messages based on error type
    let errorMessage = '❌ Failed to process audio. ';
    if (error.message.includes('empty text') || error.message.includes('unclear')) {
      errorMessage += 'The audio was too unclear or quiet. Please speak clearly and try again.';
    } else if (error.message.includes('transcription failed')) {
      errorMessage += 'Could not transcribe the audio. Please record a clear voice message.';
    } else {
      errorMessage += 'Please try again or send a text message instead.';
    }
    
    await whatsappService.sendTextMessage(phoneNumber, errorMessage);
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
    // Save transaction with pre-fetched categories
    await saveTransaction(transaction, user, phoneNumber, msg.id, categories);
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
 * @param {Object} transaction - Extracted transaction data
 * @param {Object} user - User object
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} messageId - WhatsApp message ID
 * @param {Array} categories - Pre-fetched categories list
 */
async function saveTransaction(transaction, user, phoneNumber, messageId, categories) {
  try {
    // Ensure transaction is a valid object and not an array
    if (Array.isArray(transaction)) {
      logger.error('saveTransaction received an array instead of an object', { transaction });
      throw new Error('Invalid transaction format: expected object, got array');
    }

    // Validate transaction data
    const { valid, value, errors } = await validate(transactionSchema, transaction);

    if (!valid) {
      logger.warn('Transaction validation failed', { errors, transaction });
      await whatsappService.sendTextMessage(phoneNumber, getExtractionErrorMessage());
      await whatsappService.sendReaction(phoneNumber, messageId, '❌');
      return;
    }

    // Try to find category using pre-fetched categories (includes fuzzy matching and "Other" fallback)
    const categoryId = supabaseService.getCategoryByName(value.category, categories);

    // Check if category was found
    const matchedCategory = categories.find(c => c.category_id === categoryId);
    const wasNotFound = matchedCategory && matchedCategory.name.toLowerCase() === 'other' 
                        && value.category.toLowerCase() !== 'other';

    // Prepare transaction data
    const transactionData = {
      user_id: user.user_id,
      family_id: user.family_id,
      amount: value.amount,
      type: value.type,
      description: value.description || value.vendor || `${value.category} transaction`,
      date: value.date,
      category_id: categoryId,
      wallet_id: user.user_id,
      recipient_id: user.user_id,
    };

    // Insert transaction
    const savedTransaction = await supabaseService.insertTransaction(transactionData);

    // Send confirmation AFTER successful save
    const confirmationMsg = getConfirmationMessage(value, user.full_name);
    await whatsappService.sendTextMessage(phoneNumber, confirmationMsg);
    await whatsappService.sendReaction(phoneNumber, messageId, '✅');

    // Notify user if category wasn't found and was mapped to "Other"
    if (wasNotFound) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        `⚠️ Category "${value.category}" not found. Transaction saved under "Other" category.\n\n` +
        `💡 Reply with "CATEGORIES" to see available categories, or update this transaction later in the app.`
      );
    }

    logger.info('Transaction saved successfully', {
      transaction_id: savedTransaction.transaction_id,
      user_id: user.user_id,
      amount: value.amount,
      category: value.category,
      mappedCategoryId: categoryId,
      mappedCategoryName: matchedCategory?.name,
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
      await whatsappService.sendTextMessage(phoneNumber, '❌ No recent transactions found to delete.');
      return;
    }

    // Delete the transaction
    await supabaseService.deleteTransaction(lastTransaction.transaction_id, user.user_id);

    await whatsappService.sendTextMessage(
      phoneNumber,
      `✅ Transaction deleted successfully!\n\n` +
        `Amount: ₹${lastTransaction.amount}\n` +
        `Description: ${lastTransaction.description}`
    );
  } catch (error) {
    logger.logError(error, { context: 'handleDeleteCommand', userId: user.user_id });
    await whatsappService.sendTextMessage(phoneNumber, '❌ Failed to delete transaction.');
  }
}

/**
 * Handle CATEGORIES command - List all available categories
 */
async function handleCategoriesCommand(user, phoneNumber) {
  try {
    const categories = await supabaseService.getCategoriesForFamily(user.family_id);

    if (!categories || categories.length === 0) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ No categories found. Please contact support.'
      );
      return;
    }

    // Group categories by type
    const expenseCategories = categories.filter(c => c.type === 'expense');
    const incomeCategories = categories.filter(c => c.type === 'income');

    let message = '📋 *Available Categories*\n\n';
    
    if (expenseCategories.length > 0) {
      message += '*💸 Expense Categories:*\n';
      expenseCategories.forEach(cat => {
        const emoji = cat.emoji || cat.icon || '📁';
        message += `${emoji} ${cat.name}\n`;
      });
      message += '\n';
    }

    if (incomeCategories.length > 0) {
      message += '*💰 Income Categories:*\n';
      incomeCategories.forEach(cat => {
        const emoji = cat.emoji || cat.icon || '💵';
        message += `${emoji} ${cat.name}\n`;
      });
      message += '\n';
    }

    message += '💡 *Tips:*\n';
    message += '• Use these category names in your transactions\n';
    message += '• Reply "ADD CATEGORY <name>" to add a custom category (Premium feature)\n';
    message += '• If no category matches, it will be saved as "Other"';

    await whatsappService.sendTextMessage(phoneNumber, message);
  } catch (error) {
    logger.logError(error, { context: 'handleCategoriesCommand', userId: user.user_id });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to fetch categories. Please try again.'
    );
  }
}

/**
 * Handle ADD CATEGORY command - Add custom category (Premium feature)
 */
async function handleAddCategoryCommand(text, user, phoneNumber) {
  try {
    // Check if user has premium subscription
    const subscription = await supabaseService.checkSubscription(user.user_id);
    
    if (!subscription.hasSubscription) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '🔒 *Custom Categories - Premium Feature*\n\n' +
        'Adding custom categories is a premium feature.\n\n' +
        'Upgrade to Premium to:\n' +
        '• Create unlimited custom categories\n' +
        '• Better organize your finances\n' +
        '• Access advanced analytics\n\n' +
        'Visit the app to upgrade! 🚀'
      );
      return;
    }

    // Parse category name from command
    // Format: "ADD CATEGORY Food & Dining" or "ADD CATEGORY Food"
    const match = text.match(/ADD CATEGORY\s+(.+)/i);
    
    if (!match || !match[1]) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Invalid format.\n\nUsage: ADD CATEGORY <category name>\n\nExample:\nADD CATEGORY Pets'
      );
      return;
    }

    const categoryName = match[1].trim();

    // Validate category name
    if (categoryName.length < 2 || categoryName.length > 50) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Category name must be between 2 and 50 characters.'
      );
      return;
    }

    // Check if category already exists
    const existingId = await supabaseService.findCategoryIdByName(categoryName, user.family_id);
    
    if (existingId) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        `ℹ️ Category "${categoryName}" already exists in your family account!`
      );
      return;
    }

    // Add the category
    const categoryId = await supabaseService.addCategoryToFamily(
      user.family_id,
      categoryName,
      'expense' // Default to expense, user can change in app
    );

    if (categoryId) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        `✅ *Category Added!*\n\n` +
        `📁 "${categoryName}" has been added to your categories.\n\n` +
        `You can now use this category in your transactions. ` +
        `Change the type (expense/income) in the app if needed.`
      );
    } else {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Failed to add category. Please try again.'
      );
    }
  } catch (error) {
    logger.logError(error, { context: 'handleAddCategoryCommand', userId: user.user_id });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to add category. Please try again.'
    );
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
