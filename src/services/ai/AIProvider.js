/**
 * AI Provider Interface
 * Abstract interface that all AI providers must implement
 */

class AIProvider {
  /**
   * Extract transaction from image
   * @param {string|Buffer} image - Base64 string or buffer
   * @param {string} mimeType - Image MIME type
   * @param {string} additionalContext - Extra context for extraction
   * @param {Array} categories - Array of category objects from family's categories_json
   * @returns {Promise<Object>} Extracted transaction data
   */
  async extractFromImage(image, mimeType, additionalContext = '', categories = []) {
    throw new Error('Method extractFromImage() must be implemented');
  }

  /**
   * Transcribe audio to text
   * @param {string} audioFilePath - Path to audio file
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioFilePath) {
    throw new Error('Method transcribeAudio() must be implemented');
  }

  /**
   * Extract transaction from text
   * @param {string} text - Text to extract from
   * @param {string} additionalContext - Extra context
   * @param {Array} categories - Array of category objects from family's categories_json
   * @returns {Promise<Object>} Extracted transaction data
   */
  async extractFromText(text, additionalContext = '', categories = []) {
    throw new Error('Method extractFromText() must be implemented');
  }

  /**
   * Health check for the provider
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    throw new Error('Method checkHealth() must be implemented');
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getName() {
    throw new Error('Method getName() must be implemented');
  }
}

module.exports = AIProvider;
