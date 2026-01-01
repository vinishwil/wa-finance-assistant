const whatsappService = require('../services/whatsappService');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');
const {
  getVerificationCodeMessage,
  getSuccessfulLinkMessage,
  getLinkingInstructionsMessage,
} = require('../utils/prompts');
const { sanitizeInput } = require('../utils/validators');
const crypto = require('crypto');

/**
 * Link Controller - Handle user account linking
 * Following Single Responsibility Principle
 */

/**
 * Generate 6-digit verification code
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Handle LINK command from WhatsApp
 * Format: LINK email@example.com
 */
async function handleLinkCommand(text, phoneNumber) {
  try {
    // Parse email from command
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Invalid format. Please use:\n*LINK your-email@example.com*'
      );
      return;
    }

    const email = sanitizeInput(parts[1].toLowerCase().trim());

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await whatsappService.sendTextMessage(phoneNumber, '❌ Invalid email format.');
      return;
    }

    // Check if user exists in database
    const user = await supabaseService.getUserByEmail(email);

    if (!user) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        `❌ No account found with email: ${email}\n\nPlease sign up at ${process.env.APP_BASE_URL} first.`
      );
      return;
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create WhatsApp link with verification code
    await supabaseService.createWhatsappLink(user.user_id, phoneNumber, verificationCode);

    // Send verification code
    await whatsappService.sendTextMessage(phoneNumber, getVerificationCodeMessage(verificationCode));

    // Log event
    await supabaseService.logEvent('link_initiated', {
      phoneNumber,
      email,
      userId: user.user_id,
    });

    logger.info('Link initiated', { phoneNumber, email, userId: user.user_id });

    // TODO: Optionally send verification code via email as well
  } catch (error) {
    logger.logError(error, { context: 'handleLinkCommand', phoneNumber, text });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to initiate linking. Please try again.'
    );
  }
}

/**
 * Handle VERIFY command from WhatsApp
 * Format: VERIFY 123456
 */
async function handleVerifyCommand(text, phoneNumber) {
  try {
    // Parse verification code from command
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Invalid format. Please use:\n*VERIFY 123456*'
      );
      return;
    }

    const code = sanitizeInput(parts[1].trim());

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      await whatsappService.sendTextMessage(phoneNumber, '❌ Invalid verification code format.');
      return;
    }

    // Verify the code
    const user = await supabaseService.verifyWhatsappLink(phoneNumber, code);

    if (!user) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Invalid or expired verification code. Please request a new code with:\n*LINK your-email@example.com*'
      );
      return;
    }

    // Send success message
    await whatsappService.sendTextMessage(phoneNumber, getSuccessfulLinkMessage(user.full_name));

    // Log event
    await supabaseService.logEvent('link_verified', {
      phoneNumber,
      userId: user.user_id,
    });

    logger.info('Link verified successfully', { phoneNumber, userId: user.user_id });
  } catch (error) {
    logger.logError(error, { context: 'handleVerifyCommand', phoneNumber, text });
    await whatsappService.sendTextMessage(
      phoneNumber,
      '❌ Failed to verify code. Please try again.'
    );
  }
}

/**
 * Manual linking via API (for admin purposes)
 */
async function manualLink(req, res) {
  try {
    const { email, whatsappNumber } = req.body;

    if (!email || !whatsappNumber) {
      return res.status(400).json({
        success: false,
        message: 'Email and WhatsApp number are required',
      });
    }

    // Get user by email
    const user = await supabaseService.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create link
    await supabaseService.createWhatsappLink(user.user_id, whatsappNumber, verificationCode);

    // Send verification code via WhatsApp
    await whatsappService.sendTextMessage(whatsappNumber, getVerificationCodeMessage(verificationCode));

    // Log event
    await supabaseService.logEvent('manual_link_initiated', {
      email,
      whatsappNumber,
      userId: user.user_id,
      adminAction: true,
    });

    res.json({
      success: true,
      message: 'Verification code sent to WhatsApp',
      userId: user.user_id,
    });
  } catch (error) {
    logger.logError(error, { context: 'manualLink' });
    res.status(500).json({
      success: false,
      message: 'Failed to initiate linking',
      error: error.message,
    });
  }
}

/**
 * Unlink WhatsApp account
 */
async function unlinkAccount(req, res) {
  try {
    const { whatsappNumber } = req.body;

    if (!whatsappNumber) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp number is required',
      });
    }

    // Delete WhatsApp link
    const { error } = await supabaseService.supabase
      .from('whatsapp_links')
      .delete()
      .eq('whatsapp_number', whatsappNumber);

    if (error) throw error;

    // Notify user
    await whatsappService.sendTextMessage(
      whatsappNumber,
      '🔓 Your WhatsApp account has been unlinked.\n\nYou can link again anytime by sending:\n*LINK your-email@example.com*'
    );

    // Log event
    await supabaseService.logEvent('account_unlinked', {
      whatsappNumber,
      adminAction: true,
    });

    res.json({
      success: true,
      message: 'Account unlinked successfully',
    });
  } catch (error) {
    logger.logError(error, { context: 'unlinkAccount' });
    res.status(500).json({
      success: false,
      message: 'Failed to unlink account',
      error: error.message,
    });
  }
}

module.exports = {
  handleLinkCommand,
  handleVerifyCommand,
  manualLink,
  unlinkAccount,
};
