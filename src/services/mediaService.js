const whatsappService = require('./whatsappService');
const logger = require('../utils/logger');
const { validateFileSize, validateMediaType } = require('../utils/validators');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabaseClient');

/**
 * Media Service - Handle media download, upload, and storage
 * Following Single Responsibility Principle
 */

const TEMP_DIR = path.join(process.cwd(), 'tmp');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 10;

// Ensure temp directory exists
(async () => {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create temp directory:', error);
  }
})();

/**
 * Download media from WhatsApp and return buffer
 */
async function downloadWhatsAppMedia(mediaId, mimeType) {
  try {
    // Get media URL from WhatsApp
    const mediaUrl = await whatsappService.getMediaUrl(mediaId);
    
    // Download media
    const { buffer, mimeType: detectedMimeType, size } = await whatsappService.downloadMedia(mediaUrl);
    
    // Validate file size
    validateFileSize(size, MAX_FILE_SIZE_MB);
    
    const finalMimeType = mimeType || detectedMimeType;
    
    logger.info('Media downloaded successfully', {
      mediaId,
      size: `${(size / 1024).toFixed(2)} KB`,
      mimeType: finalMimeType,
    });
    
    return {
      buffer,
      mimeType: finalMimeType,
      size,
    };
  } catch (error) {
    logger.logError(error, { context: 'downloadWhatsAppMedia', mediaId });
    throw new Error(`Failed to download media: ${error.message}`);
  }
}

/**
 * Save buffer to temporary file
 */
async function saveToTempFile(buffer, extension) {
  try {
    const filename = `${uuidv4()}.${extension}`;
    const filepath = path.join(TEMP_DIR, filename);
    
    await fs.writeFile(filepath, buffer);
    
    logger.info('File saved to temp', { filepath });
    return filepath;
  } catch (error) {
    logger.logError(error, { context: 'saveToTempFile' });
    throw new Error(`Failed to save temp file: ${error.message}`);
  }
}

/**
 * Delete temporary file
 */
async function deleteTempFile(filepath) {
  try {
    await fs.unlink(filepath);
    logger.info('Temp file deleted', { filepath });
  } catch (error) {
    logger.warn('Failed to delete temp file', { filepath, error: error.message });
    // Don't throw - cleanup failures shouldn't break the flow
  }
}

/**
 * Upload media to Supabase Storage
 */
async function uploadToSupabaseStorage(buffer, filename, mimeType, bucketName = 'whatsapp-media') {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filename, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);

    logger.info('Media uploaded to Supabase Storage', {
      filename,
      url: urlData.publicUrl,
    });

    return {
      path: data.path,
      publicUrl: urlData.publicUrl,
    };
  } catch (error) {
    logger.logError(error, { context: 'uploadToSupabaseStorage', filename });
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }
}

/**
 * Process image media (download and prepare for AI)
 */
async function processImageMedia(mediaId, mimeType) {
  try {
    // Validate media type
    validateMediaType(mimeType, 'image');
    
    // Download media
    const { buffer, mimeType: finalMimeType, size } = await downloadWhatsAppMedia(mediaId, mimeType);
    
    // Convert buffer to base64 for OpenAI Vision API
    const base64Image = buffer.toString('base64');
    
    // Optionally upload to Supabase Storage for backup
    const timestamp = Date.now();
    const extension = finalMimeType.split('/')[1];
    const filename = `images/${timestamp}_${mediaId}.${extension}`;
    
    let storageUrl = null;
    try {
      const { publicUrl } = await uploadToSupabaseStorage(buffer, filename, finalMimeType);
      storageUrl = publicUrl;
    } catch (uploadError) {
      logger.warn('Failed to upload image to storage, continuing without backup', uploadError);
    }
    
    return {
      base64: base64Image,
      mimeType: finalMimeType,
      size,
      storageUrl,
    };
  } catch (error) {
    logger.logError(error, { context: 'processImageMedia', mediaId });
    throw error;
  }
}

/**
 * Process audio media (download and prepare for Whisper)
 */
async function processAudioMedia(mediaId, mimeType) {
  try {
    // Validate media type
    validateMediaType(mimeType, 'audio');
    
    // Download media
    const { buffer, mimeType: finalMimeType, size } = await downloadWhatsAppMedia(mediaId, mimeType);
    
    // Extract extension from MIME type (handle codecs parameter)
    const baseMimeType = finalMimeType.split(';')[0].trim();
    const extension = baseMimeType.split('/')[1] || 'ogg';
    const tempPath = await saveToTempFile(buffer, extension);
    
    // Optionally upload to Supabase Storage for backup
    const timestamp = Date.now();
    const filename = `audio/${timestamp}_${mediaId}.${extension}`;
    
    let storageUrl = null;
    try {
      const { publicUrl } = await uploadToSupabaseStorage(buffer, filename, finalMimeType);
      storageUrl = publicUrl;
    } catch (uploadError) {
      logger.warn('Failed to upload audio to storage, continuing without backup', uploadError);
    }
    
    return {
      tempPath,
      mimeType: finalMimeType,
      size,
      storageUrl,
    };
  } catch (error) {
    logger.logError(error, { context: 'processAudioMedia', mediaId });
    throw error;
  }
}

/**
 * Process document media (download for OCR)
 */
async function processDocumentMedia(mediaId, mimeType) {
  try {
    validateMediaType(mimeType, 'document');
    
    const { buffer, mimeType: finalMimeType, size } = await downloadWhatsAppMedia(mediaId, mimeType);
    
    // For PDFs, convert to base64 for processing
    const base64Document = buffer.toString('base64');
    
    const timestamp = Date.now();
    const extension = finalMimeType.split('/')[1];
    const filename = `documents/${timestamp}_${mediaId}.${extension}`;
    
    let storageUrl = null;
    try {
      const { publicUrl } = await uploadToSupabaseStorage(buffer, filename, finalMimeType);
      storageUrl = publicUrl;
    } catch (uploadError) {
      logger.warn('Failed to upload document to storage', uploadError);
    }
    
    return {
      base64: base64Document,
      buffer,
      mimeType: finalMimeType,
      size,
      storageUrl,
    };
  } catch (error) {
    logger.logError(error, { context: 'processDocumentMedia', mediaId });
    throw error;
  }
}

/**
 * Clean up old temp files (run periodically)
 */
async function cleanupTempFiles(maxAgeHours = 24) {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    
    let cleaned = 0;
    for (const file of files) {
      const filepath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filepath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAgeMs) {
        await deleteTempFile(filepath);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old temp files`);
    }
  } catch (error) {
    logger.warn('Failed to cleanup temp files', error);
  }
}

module.exports = {
  downloadWhatsAppMedia,
  saveToTempFile,
  deleteTempFile,
  uploadToSupabaseStorage,
  processImageMedia,
  processAudioMedia,
  processDocumentMedia,
  cleanupTempFiles,
};
