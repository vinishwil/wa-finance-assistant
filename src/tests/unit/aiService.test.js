const aiService = require('../../services/aiService');

describe('AI Service - Transaction Extraction', () => {
  describe('parseTransactionJSON', () => {
    it('should parse valid JSON response', () => {
      const validJSON = JSON.stringify({
        type: 'debit',
        amount: 450.50,
        currency: 'INR',
        date: '2024-01-15',
        category: 'Food',
        vendor: 'Swiggy',
        description: 'Food delivery',
        raw_text: 'Receipt text',
      });

      const result = aiService.parseTransactionJSON(validJSON);
      
      expect(result).not.toBeNull();
      expect(result.type).toBe('debit');
      expect(result.amount).toBe(450.50);
      expect(result.currency).toBe('INR');
      expect(result.category).toBe('Food');
    });

    it('should handle JSON with markdown code blocks', () => {
      const jsonWithMarkdown = '```json\n{"type": "debit", "amount": 100, "currency": "INR", "date": "2024-01-01", "category": "Other"}\n```';
      
      const result = aiService.parseTransactionJSON(jsonWithMarkdown);
      
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
    });

    it('should return null for missing amount', () => {
      const invalidJSON = JSON.stringify({
        type: 'debit',
        amount: null,
        currency: 'INR',
      });

      const result = aiService.parseTransactionJSON(invalidJSON);
      
      expect(result).toBeNull();
    });

    it('should apply default values for missing fields', () => {
      const minimalJSON = JSON.stringify({
        amount: 500,
      });

      const result = aiService.parseTransactionJSON(minimalJSON);
      
      expect(result).not.toBeNull();
      expect(result.type).toBe('debit');
      expect(result.currency).toBe('INR');
      expect(result.category).toBe('Other');
    });

    it('should handle invalid JSON', () => {
      const invalidJSON = 'not valid json';
      
      const result = aiService.parseTransactionJSON(invalidJSON);
      
      expect(result).toBeNull();
    });
  });
});
