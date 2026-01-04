const Joi = require('joi');

/**
 * Validate WhatsApp phone number format
 */
const phoneNumberSchema = Joi.string()
  .pattern(/^\d{10,15}$/)
  .required()
  .messages({
    'string.pattern.base': 'Phone number must be 10-15 digits',
    'any.required': 'Phone number is required',
  });

/**
 * Validate transaction data extracted from AI
 */
const transactionSchema = Joi.object({
  type: Joi.string()
    .valid('credit', 'debit')
    .required()
    .messages({
      'any.only': 'Transaction type must be either credit or debit',
    }),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Amount must be positive',
      'any.required': 'Amount is required',
    }),
  currency: Joi.string()
    .length(3)
    .uppercase()
    .default('INR')
    .messages({
      'string.length': 'Currency must be a 3-letter code (e.g., INR, USD)',
    }),
  category: Joi.string()
    .max(50)
    .allow(null, '')
    .messages({
      'string.max': 'Category must not exceed 50 characters',
    }),
  date: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Transaction date cannot be in the future',
      'any.required': 'Transaction date is required',
    }),
  description: Joi.string()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 500 characters',
    }),
  vendor: Joi.string()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Vendor name must not exceed 100 characters',
    }),
  raw_text: Joi.string().allow(null, ''),
});

/**
 * Validate webhook payload from WhatsApp
 */
const webhookPayloadSchema = Joi.object({
  object: Joi.string().valid('whatsapp_business_account'),
  entry: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      changes: Joi.array().items(
        Joi.object({
          value: Joi.object({
            messaging_product: Joi.string().valid('whatsapp'),
            metadata: Joi.object(),
            contacts: Joi.array(),
            messages: Joi.array(),
            statuses: Joi.array(),
          }),
          field: Joi.string(),
        })
      ),
    })
  ),
});

/**
 * Validate user linking request
 */
const linkUserSchema = Joi.object({
  whatsapp_number: phoneNumberSchema,
  verification_code: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'Verification code must be 6 digits',
      'string.pattern.base': 'Verification code must contain only digits',
    }),
});

/**
 * Validate file size
 */
function validateFileSize(sizeInBytes, maxSizeMB = 10) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (sizeInBytes > maxSizeBytes) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
  }
  return true;
}

/**
 * Validate media type
 */
const allowedMediaTypes = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/wav'],
  document: ['application/pdf'],
};

function validateMediaType(mimeType, category) {
  // Extract base MIME type (remove codecs and other parameters)
  const baseMimeType = mimeType.split(';')[0].trim();
  
  const allowed = allowedMediaTypes[category];
  if (!allowed || !allowed.includes(baseMimeType)) {
    throw new Error(`Media type ${mimeType} is not allowed for ${category}`);
  }
  return true;
}

/**
 * Sanitize user input to prevent injection attacks
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['";]/g, '') // Remove potential SQL injection characters
    .substring(0, 1000); // Limit length
}

/**
 * Validate UUID format
 */
const uuidSchema = Joi.string()
  .uuid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'Invalid UUID format',
  });

/**
 * Validate email format
 */
const emailSchema = Joi.string()
  .email()
  .lowercase()
  .required()
  .messages({
    'string.email': 'Invalid email format',
  });

/**
 * Generic validation wrapper
 */
async function validate(schema, data) {
  try {
    const value = await schema.validateAsync(data, {
      abortEarly: false,
      stripUnknown: true,
    });
    return { valid: true, value, errors: null };
  } catch (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return { valid: false, value: null, errors };
  }
}

module.exports = {
  phoneNumberSchema,
  transactionSchema,
  webhookPayloadSchema,
  linkUserSchema,
  uuidSchema,
  emailSchema,
  validateFileSize,
  validateMediaType,
  sanitizeInput,
  validate,
  allowedMediaTypes,
};
