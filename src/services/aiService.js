/**
 * AI Service - Unified interface for AI providers (OpenAI, Gemini)
 * Uses Factory Pattern for provider abstraction
 * Following Single Responsibility Principle
 */

const {
  aiServiceFactory,
  extractFromImage,
  extractFromText,
  extractFromAudio,
  transcribeAudio,
  checkAPIHealth,
} = require('./ai/AIServiceFactory');
const logger = require('../utils/logger');

// Re-export factory methods for backward compatibility
// These now use the configured AI provider (OpenAI or Gemini)
module.exports = {
  extractFromImage,
  extractFromText,
  extractFromAudio,
  transcribeAudio,
  checkAPIHealth,
  aiServiceFactory, // Export factory for advanced usage
  
  // Additional helper methods below
};

/**
 * Switch AI provider at runtime
 * @param {string} providerName - 'openai' or 'gemini'
 */
function switchProvider(providerName) {
  return aiServiceFactory.setProvider(providerName);
}

/**
 * Get current provider name
 */
function getCurrentProvider() {
  return aiServiceFactory.getCurrentProviderName();
}

/**
 * Get list of available providers
 */
function getAvailableProviders() {
  return aiServiceFactory.getAvailableProviders();
}

/**
 * Check health of all providers
 */
async function checkAllProvidersHealth() {
  return aiServiceFactory.checkAllProvidersHealth();
}

/**
 * Generate spending insights using current AI provider
 */
async function generateSpendingInsights(transactions) {
  try {
    const summary = transactions.map(t => 
      `${t.date}: ${t.type} ${t.currency} ${t.amount} - ${t.category}`
    ).join('\n');

    const prompt = `You are a financial advisor. Analyze these transactions and provide brief insights:\n\n${summary}`;

    // Use text extraction as it's simpler for this use case
    const provider = aiServiceFactory.getProvider();
    const result = await provider.extractFromText(prompt);

    return result ? result.description : null;
  } catch (error) {
    logger.logError(error, { context: 'generateSpendingInsights' });
    return null;
  }
}

/**
 * Classify transaction category using AI (fallback for unclear categories)
 */
async function classifyCategory(description, amount) {
  try {
    const text = `Classify this transaction into one category: Food, Transport, Shopping, Bills, Healthcare, Entertainment, Salary, Business, or Other. Transaction: ${description}, Amount: ${amount}. Reply with just the category name.`;
    
    const result = await extractFromText(text);
    return result?.category || 'Other';
  } catch (error) {
    logger.warn('Failed to classify category', { description, error: error.message });
    return 'Other';
  }
}

// Add new methods to exports
module.exports.generateSpendingInsights = generateSpendingInsights;
module.exports.classifyCategory = classifyCategory;
module.exports.switchProvider = switchProvider;
module.exports.getCurrentProvider = getCurrentProvider;
module.exports.getAvailableProviders = getAvailableProviders;
module.exports.checkAllProvidersHealth = checkAllProvidersHealth;
