const OpenAIProvider = require('./OpenAIProvider');
const GeminiProvider = require('./GeminiProvider');
const logger = require('../../utils/logger');

/**
 * AI Service Factory
 * Creates and manages AI provider instances based on configuration
 * Supports: OpenAI, Gemini
 */

class AIServiceFactory {
  constructor() {
    this.providers = new Map();
    this.currentProvider = null;
    this._initializeProviders();
  }

  /**
   * Initialize available providers based on environment configuration
   */
  _initializeProviders() {
    // Initialize OpenAI if API key is present
    if (process.env.OPENAI_API_KEY) {
      try {
        this.providers.set('openai', new OpenAIProvider());
        logger.info('OpenAI provider initialized');
      } catch (error) {
        logger.warn('Failed to initialize OpenAI provider', error);
      }
    }

    // Initialize Gemini if API key is present
    if (process.env.GEMINI_API_KEY) {
      try {
        this.providers.set('gemini', new GeminiProvider());
        logger.info('Gemini provider initialized');
      } catch (error) {
        logger.warn('Failed to initialize Gemini provider', error);
      }
    }

    // Set default provider based on AI_PROVIDER env variable or fallback
    const defaultProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    this.setProvider(defaultProvider);

    if (!this.currentProvider) {
      logger.error('No AI provider configured! Please set OPENAI_API_KEY or GEMINI_API_KEY');
      throw new Error('No AI provider available');
    }
  }

  /**
   * Set the active AI provider
   * @param {string} providerName - 'openai' or 'gemini'
   */
  setProvider(providerName) {
    const provider = this.providers.get(providerName.toLowerCase());
    
    if (!provider) {
      logger.warn(`Provider ${providerName} not available, keeping current provider`);
      
      // Fallback to first available provider
      if (!this.currentProvider && this.providers.size > 0) {
        const firstProvider = this.providers.values().next().value;
        this.currentProvider = firstProvider;
        logger.info(`Using fallback provider: ${firstProvider.getName()}`);
      }
      return false;
    }

    this.currentProvider = provider;
    logger.info(`Active AI provider set to: ${provider.getName()}`);
    return true;
  }

  /**
   * Get the current active provider
   */
  getProvider() {
    return this.currentProvider;
  }

  /**
   * Get provider by name
   * @param {string} providerName - 'openai' or 'gemini'
   */
  getProviderByName(providerName) {
    return this.providers.get(providerName.toLowerCase());
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(providerName) {
    return this.providers.has(providerName.toLowerCase());
  }

  /**
   * Extract transaction from image (uses current provider)
   */
  async extractFromImage(base64Image, mimeType, additionalContext = '', categories = []) {
    return this.currentProvider.extractFromImage(base64Image, mimeType, additionalContext, categories);
  }

  /**
   * Transcribe audio (uses current provider)
   */
  async transcribeAudio(audioFilePath) {
    return this.currentProvider.transcribeAudio(audioFilePath);
  }

  /**
   * Extract transaction from text (uses current provider)
   */
  async extractFromText(text, additionalContext = '', categories = []) {
    return this.currentProvider.extractFromText(text, additionalContext, categories);
  }

  /**
   * Extract transaction from audio (transcribe + extract, uses current provider)
   */
  async extractFromAudio(audioFilePath, additionalContext = '', categories = []) {
    try {
      // Step 1: Transcribe audio
      const transcribedText = await this.transcribeAudio(audioFilePath);

      if (!transcribedText || transcribedText.trim().length === 0) {
        throw new Error('No text could be transcribed from audio');
      }

      logger.info('Transcribed text:', { text: transcribedText });

      // Step 2: Extract transaction(s) from transcribed text
      const result = await this.extractFromText(transcribedText, additionalContext, categories);

      // Handle both single transaction and array of transactions
      if (Array.isArray(result)) {
        // Add transcribed text to each transaction
        return result.map(txn => ({
          ...txn,
          raw_text: transcribedText,
        }));
      }

      // Single transaction
      return {
        ...result,
        raw_text: transcribedText,
      };
    } catch (error) {
      logger.logError(error, { context: 'AIServiceFactory.extractFromAudio', audioFilePath });
      throw error;
    }
  }

  /**
   * Health check for current provider
   */
  async checkHealth() {
    return this.currentProvider.checkHealth();
  }

  /**
   * Health check for all providers
   */
  async checkAllProvidersHealth() {
    const healthChecks = {};
    
    for (const [name, provider] of this.providers) {
      healthChecks[name] = await provider.checkHealth();
    }
    
    return healthChecks;
  }

  /**
   * Get current provider name
   */
  getCurrentProviderName() {
    return this.currentProvider ? this.currentProvider.getName() : 'None';
  }
}

// Export singleton instance
const aiServiceFactory = new AIServiceFactory();

module.exports = {
  aiServiceFactory,
  AIServiceFactory,
  // Backward compatibility exports
  extractFromImage: (base64Image, mimeType, context, categories) => 
    aiServiceFactory.extractFromImage(base64Image, mimeType, context, categories),
  extractFromText: (text, context, categories) => 
    aiServiceFactory.extractFromText(text, context, categories),
  extractFromAudio: (audioPath, context, categories) => 
    aiServiceFactory.extractFromAudio(audioPath, context, categories),
  transcribeAudio: (audioPath) => 
    aiServiceFactory.transcribeAudio(audioPath),
  checkAPIHealth: () => 
    aiServiceFactory.checkHealth(),
};
