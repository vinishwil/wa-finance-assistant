const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIProvider = require('./AIProvider');
const logger = require('../../utils/logger');
const {
  getImageExtractionSystemPrompt,
  getTextExtractionSystemPrompt,
  getImageExtractionPrompt,
  getTextExtractionPrompt,
} = require('../../utils/prompts');
const { convertToWav } = require('../../utils/audioConverter');
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
    let wavFilePath = null;
    try {
      const model = this.client.getGenerativeModel({ model: this.audioModel });

      // Convert OGG/Opus to WAV for better compatibility
      logger.info('Converting audio to WAV format for better compatibility');
      wavFilePath = await convertToWav(audioFilePath);

      // Read converted audio file
      const audioBuffer = fs.readFileSync(wavFilePath);
      const base64Audio = audioBuffer.toString('base64');

      logger.info('Audio file loaded', {
        originalPath: audioFilePath,
        convertedPath: wavFilePath,
        size: `${(audioBuffer.length / 1024).toFixed(2)} KB`,
      });

      const audioPart = {
        inlineData: {
          data: base64Audio,
          mimeType: 'audio/wav',
        },
      };

      const prompt = 'Listen to this audio carefully and transcribe exactly what is being said. Include all words spoken. Return only the transcribed text, no explanations or additional commentary.';

      logger.info('Sending audio to Gemini for transcription', {
        model: this.audioModel,
        mimeType: 'audio/wav',
      });

      const result = await model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();

      logger.info('Gemini raw response', {
        hasText: !!text,
        textLength: text.length,
        firstChars: text.substring(0, 50),
      });

      logger.info('Gemini audio transcription completed', {
        model: this.audioModel,
        text_length: text.length,
        transcribed_text: text.substring(0, 200), // Log first 200 chars
      });

      const trimmedText = text.trim();
      
      if (!trimmedText) {
        logger.warn('Empty transcription received from Gemini', {
          audioFilePath,
          audioSize: audioBuffer.length,
        });
        throw new Error('Audio transcription returned empty text. The audio might be unclear, too short, or Gemini may not support this audio format well.');
      }

      return trimmedText;
    } catch (error) {
      logger.logError(error, { context: 'GeminiProvider.transcribeAudio', audioFilePath });
      throw new Error(`Gemini transcription failed: ${error.message}`);
    } finally {
      // Clean up converted WAV file
      if (wavFilePath && fs.existsSync(wavFilePath)) {
        try {
          fs.unlinkSync(wavFilePath);
          logger.info('Cleaned up converted WAV file', { path: wavFilePath });
        } catch (cleanupError) {
          logger.warn('Failed to cleanup WAV file', { path: wavFilePath, error: cleanupError.message });
        }
      }
    }
  }

  /**
   * Extract transaction from text using Gemini
   */
  async extractFromText(text, additionalContext = '', categories) {
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
      const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent('test');
      const response = await result.response;
      response.text(); // Verify response is valid

      return { 
        healthy: true, 
        provider: this.getName(),
        model: 'gemini-2.0-flash'
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
   * Now supports both single transaction objects and arrays of transactions
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

      if (!parsed) {
        throw new Error('Invalid transaction format');
      }

      // Helper function to normalize a single transaction
      const normalizeTransaction = (txn) => {
        if (!txn || typeof txn !== 'object') {
          return null;
        }
        if (!txn.amount || txn.amount === null) {
          return null;
        }
        return {
          type: txn.type || 'debit',
          amount: parseFloat(txn.amount),
          currency: (txn.currency || 'INR').toUpperCase(),
          date: txn.date || new Date().toISOString().split('T')[0],
          category: txn.category || 'Other',
          vendor: txn.vendor || null,
          description: txn.description || '',
          raw_text: txn.raw_text || '',
        };
      };

      // Check if response is an array (multiple transactions)
      if (Array.isArray(parsed)) {
        const normalized = parsed.map(normalizeTransaction).filter(t => t !== null);
        return normalized.length > 0 ? normalized : null;
      }

      // Single transaction object (backward compatibility)
      return normalizeTransaction(parsed);
    } catch (error) {
      logger.warn('Failed to parse transaction JSON', { content, error: error.message });
      return null;
    }
  }
}

module.exports = GeminiProvider;
