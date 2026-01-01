const OpenAI = require('openai');
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
 * OpenAI Provider Implementation
 * Implements AIProvider interface using OpenAI API
 */
class OpenAIProvider extends AIProvider {
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.visionModel = process.env.OPENAI_MODEL || 'gpt-4-vision-preview';
    this.textModel = 'gpt-4';
    this.whisperModel = process.env.OPENAI_WHISPER_MODEL || 'whisper-1';
  }

  getName() {
    return 'OpenAI';
  }

  /**
   * Extract transaction from image using GPT-4 Vision
   */
  async extractFromImage(base64Image, mimeType, additionalContext = '', categories = []) {
    try {
      // Generate system prompt with dynamic categories
      const systemPrompt = getImageExtractionSystemPrompt(categories);
      
      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: getImageExtractionPrompt(additionalContext),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      });

      const content = response.choices[0].message.content;
      logger.info('OpenAI image extraction completed', {
        model: this.visionModel,
        tokens: response.usage?.total_tokens,
      });

      return this._parseTransactionJSON(content);
    } catch (error) {
      logger.logError(error, { context: 'OpenAIProvider.extractFromImage' });
      throw new Error(`OpenAI image extraction failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio using Whisper
   */
  async transcribeAudio(audioFilePath) {
    try {
      const audioFile = fs.createReadStream(audioFilePath);

      const response = await this.client.audio.transcriptions.create({
        file: audioFile,
        model: this.whisperModel,
        response_format: 'json',
      });

      logger.info('OpenAI audio transcription completed', {
        model: this.whisperModel,
        text_length: response.text?.length,
      });

      return response.text;
    } catch (error) {
      logger.logError(error, { context: 'OpenAIProvider.transcribeAudio', audioFilePath });
      throw new Error(`OpenAI transcription failed: ${error.message}`);
    }
  }

  /**
   * Extract transaction from text using GPT-4
   */
  async extractFromText(text, additionalContext = '', categories = []) {
    try {
      // Generate system prompt with dynamic categories
      const systemPrompt = getTextExtractionSystemPrompt(categories);
      
      const response = await this.client.chat.completions.create({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: getTextExtractionPrompt(text, additionalContext),
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const content = response.choices[0].message.content;
      logger.info('OpenAI text extraction completed', {
        model: this.textModel,
        tokens: response.usage?.total_tokens,
      });

      return this._parseTransactionJSON(content);
    } catch (error) {
      logger.logError(error, { context: 'OpenAIProvider.extractFromText', text });
      throw new Error(`OpenAI text extraction failed: ${error.message}`);
    }
  }

  /**
   * Health check for OpenAI API
   */
  async checkHealth() {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });

      return { 
        healthy: true, 
        provider: this.getName(),
        model: response.model 
      };
    } catch (error) {
      logger.error('OpenAI health check failed', error);
      return { 
        healthy: false, 
        provider: this.getName(),
        error: error.message 
      };
    }
  }

  /**
   * Parse JSON response from OpenAI
   */
  _parseTransactionJSON(content) {
    try {
      let cleanContent = content.trim();
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

module.exports = OpenAIProvider;
