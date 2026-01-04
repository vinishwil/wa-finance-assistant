const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const logger = require('./logger');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convert audio file to WAV format for better compatibility
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output WAV file (optional)
 * @returns {Promise<string>} - Path to converted WAV file
 */
async function convertToWav(inputPath, outputPath = null) {
  return new Promise((resolve, reject) => {
    // If no output path provided, create one
    if (!outputPath) {
      const parsedPath = path.parse(inputPath);
      outputPath = path.join(parsedPath.dir, `${parsedPath.name}.wav`);
    }

    logger.info('Converting audio to WAV', {
      input: inputPath,
      output: outputPath,
    });

    ffmpeg(inputPath)
      .toFormat('wav')
      .audioCodec('pcm_s16le') // Standard PCM codec
      .audioChannels(1) // Mono
      .audioFrequency(16000) // 16kHz sample rate (optimal for speech)
      .on('start', (commandLine) => {
        logger.debug('FFmpeg command:', commandLine);
      })
      .on('end', () => {
        logger.info('Audio conversion completed', { output: outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('Audio conversion failed', {
          error: err.message,
          input: inputPath,
        });
        reject(new Error(`Audio conversion failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Get audio duration in seconds
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} - Duration in seconds
 */
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error('Failed to get audio duration', { error: err.message });
        reject(err);
      } else {
        const duration = metadata.format.duration;
        logger.info('Audio duration retrieved', {
          file: filePath,
          duration: `${duration.toFixed(2)}s`,
        });
        resolve(duration);
      }
    });
  });
}

module.exports = {
  convertToWav,
  getAudioDuration,
};
