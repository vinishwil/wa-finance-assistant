const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIProvider = require('./AIProvider');
const logger = require('../../utils/logger');
const {
  getImageExtractionSystemPrompt,
  getTextExtractionSystemPrompt,
  getImageExtractionPrompt,
  getTextExtractionPrompt,
} = require('../../utils/prompts');
const fs = require('fs');

/**
 * Gemini Provider Implementation
 * Implements AIProvider interface using Google Gemini API
 */
class GeminiProvider extends AIProvider {
  constructor() {
    super();
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.visionModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    this.textModel = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
    this.audioModel = process.env.GEMINI_AUDIO_MODEL || 'gemini-2.0-flash';
  }

  getName() {
    return 'Gemini';
  }

  /**
   * Extract transaction from image using Gemini Vision
   */
  async extractFromImage(base64Image, mimeType, additionalContext = '', categories = []) {
    try {
      const model = this.client.getGenerativeModel({ model: this.visionModel });

      // Generate system prompt with dynamic categories
      const systemPrompt = getImageExtractionSystemPrompt(categories);
      const prompt = `${systemPrompt}\n\n${getImageExtractionPrompt(additionalContext)}`;

      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const content = response.text();

      logger.info('Gemini image extraction completed', {
        model: this.visionModel,
        text_length: content.length,
      });

      return this._parseTransactionJSON(content);
    } catch (error) {
      logger.logError(error, { context: 'GeminiProvider.extractFromImage' });
      throw new Error(`Gemini image extraction failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio using Gemini Audio
   * Note: Gemini 2.0 supports audio input directly
   */
  async transcribeAudio(audioFilePath) {
    try {
      const model = this.client.getGenerativeModel({ model: this.audioModel });

      // Read audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      const base64Audio = audioBuffer.toString('base64');

      // Determine MIME type based on file extension
      const ext = audioFilePath.split('.').pop().toLowerCase();
      const mimeTypeMap = {
        'ogg': 'audio/ogg',
        'mp3': 'audio/mpeg',
        'mp4': 'audio/mp4',
        'm4a': 'audio/mp4',
        'amr': 'audio/amr',
        'wav': 'audio/wav',
      };
      const mimeType = mimeTypeMap[ext] || 'audio/ogg';

      const audioPart = {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType,
        },
      };

      const prompt = 'Transcribe this audio accurately. Return only the transcribed text, no explanations.';

      const result = await model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();

      logger.info('Gemini audio transcription completed', {
        model: this.audioModel,
        text_length: text.length,
      });

      return text.trim();
    } catch (error) {
      logger.logError(error, { context: 'GeminiProvider.transcribeAudio', audioFilePath });
      throw new Error(`Gemini transcription failed: ${error.message}`);
    }
  }

  /**
   * Extract transaction from text using Gemini
   */
  async extractFromText(text, additionalContext = '', categories = []) {
    try {
      const model = this.client.getGenerativeModel({ model: this.textModel });

      // Generate system prompt with dynamic categories
      const systemPrompt = getTextExtractionSystemPrompt(categories);
      const prompt = `${systemPrompt}\n\n${getTextExtractionPrompt(text, additionalContext)}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      logger.info('Gemini text extraction completed', {
        model: this.textModel,
        text_length: content.length,
      });

      return this._parseTransactionJSON(content);
    } catch (error) {
      logger.logError(error, { context: 'GeminiProvider.extractFromText', text });
      throw new Error(`Gemini text extraction failed: ${error.message}`);
    }
  }

  /**
   * Health check for Gemini API
   */
  async checkHealth() {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('test');
      const response = await result.response;
      response.text(); // Verify response is valid

      return { 
        healthy: true, 
        provider: this.getName(),
        model: 'gemini-pro'
      };
    } catch (error) {
      logger.error('Gemini health check failed', error);
      return { 
        healthy: false, 
        provider: this.getName(),
        error: error.message 
      };
    }
  }

  /**
   * Parse JSON response from Gemini
   */
  _parseTransactionJSON(content) {
    try {
      let cleanContent = content.trim();
      
      // Remove markdown code blocks
      cleanContent = cleanContent.replace(/^```json\s*/i, '');
      cleanContent = cleanContent.replace(/^```\s*/i, '');
      cleanContent = cleanContent.replace(/\s*```$/i, '');
      cleanContent = cleanContent.trim();

      const parsed = JSON.parse(cleanContent);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid transaction format');
      }

      if (!parsed.amount || parsed.amount === null) {
        return null;
      }

      return {
        type: parsed.type || 'debit',
        amount: parseFloat(parsed.amount),
        currency: (parsed.currency || 'INR').toUpperCase(),
        date: parsed.date || new Date().toISOString().split('T')[0],
        category: parsed.category || 'Other',
        vendor: parsed.vendor || null,
        description: parsed.description || '',
        raw_text: parsed.raw_text || '',
      };
    } catch (error) {
      logger.warn('Failed to parse transaction JSON', { content, error: error.message });
      return null;
    }
  }
}

module.exports = GeminiProvider;
