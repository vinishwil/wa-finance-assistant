const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : process.env.LOG_LEVEL || 'info';
};

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
    }
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.printf((info) => {
        const { timestamp, level, message, ...meta } = info;
        let output = `${timestamp} [${level}]: ${message}`;
        
        // In development, show metadata for better debugging
        if (Object.keys(meta).length > 0 && process.env.NODE_ENV === 'development') {
          // output += '\n' + JSON.stringify(meta, null, 2);
        }
        
        return output;
      })
    ),
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging helper
logger.logRequest = (req, res, duration) => {
  logger.http(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
};

// Add error logging helper with context
logger.logError = (error, context = {}) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

module.exports = logger;
