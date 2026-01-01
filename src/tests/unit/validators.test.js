const {
  validateFileSize,
  validateMediaType,
  sanitizeInput,
  validate,
  transactionSchema,
} = require('../../utils/validators');

describe('Validators', () => {
  describe('validateFileSize', () => {
    it('should pass for files within size limit', () => {
      const fiveMB = 5 * 1024 * 1024;
      expect(() => validateFileSize(fiveMB, 10)).not.toThrow();
    });

    it('should throw for files exceeding size limit', () => {
      const fifteenMB = 15 * 1024 * 1024;
      expect(() => validateFileSize(fifteenMB, 10)).toThrow();
    });
  });

  describe('validateMediaType', () => {
    it('should pass for allowed image types', () => {
      expect(() => validateMediaType('image/jpeg', 'image')).not.toThrow();
      expect(() => validateMediaType('image/png', 'image')).not.toThrow();
    });

    it('should throw for disallowed media types', () => {
      expect(() => validateMediaType('video/mp4', 'image')).toThrow();
      expect(() => validateMediaType('application/exe', 'audio')).toThrow();
    });

    it('should pass for allowed audio types', () => {
      expect(() => validateMediaType('audio/ogg', 'audio')).not.toThrow();
      expect(() => validateMediaType('audio/mpeg', 'audio')).not.toThrow();
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = sanitizeInput(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove SQL injection characters', () => {
      const input = "'; DROP TABLE users; --";
      const result = sanitizeInput(input);
      expect(result).not.toContain("'");
      expect(result).not.toContain(';');
      expect(result).not.toContain('"');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello World');
    });

    it('should limit length', () => {
      const longInput = 'a'.repeat(2000);
      const result = sanitizeInput(longInput);
      expect(result.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('transaction validation', () => {
    it('should validate correct transaction data', async () => {
      const validTransaction = {
        type: 'debit',
        amount: 500,
        currency: 'INR',
        date: new Date().toISOString().split('T')[0],
        category: 'Food',
        description: 'Groceries',
      };

      const { valid, errors } = await validate(transactionSchema, validTransaction);
      
      expect(valid).toBe(true);
      expect(errors).toBeNull();
    });

    it('should reject invalid transaction type', async () => {
      const invalidTransaction = {
        type: 'invalid_type',
        amount: 500,
        date: new Date().toISOString().split('T')[0],
      };

      const { valid, errors } = await validate(transactionSchema, invalidTransaction);
      
      expect(valid).toBe(false);
      expect(errors).not.toBeNull();
    });

    it('should reject negative amounts', async () => {
      const invalidTransaction = {
        type: 'debit',
        amount: -100,
        date: new Date().toISOString().split('T')[0],
      };

      const { valid, errors } = await validate(transactionSchema, invalidTransaction);
      
      expect(valid).toBe(false);
      expect(errors).not.toBeNull();
    });

    it('should reject future dates', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const invalidTransaction = {
        type: 'debit',
        amount: 500,
        date: futureDate.toISOString().split('T')[0],
      };

      const { valid, errors } = await validate(transactionSchema, invalidTransaction);
      
      expect(valid).toBe(false);
      expect(errors).not.toBeNull();
    });
  });
});
