# AI Provider Usage Examples

## Basic Usage (No Changes Needed!)

Your existing code works with any provider:

```javascript
const aiService = require('./services/aiService');

// Extract from image - automatically uses configured provider
const transaction = await aiService.extractFromImage(base64Image, 'image/jpeg');

// Extract from text - automatically uses configured provider
const transaction = await aiService.extractFromText('I spent 500 rupees on groceries');

// Transcribe audio - automatically uses configured provider
const transcript = await aiService.transcribeAudio('/path/to/audio.ogg');
```

---

## Example 1: Using Gemini (Default)

### Configuration (.env)
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key-here
GEMINI_MODEL=gemini-2.0-flash
```

### Usage
```javascript
const aiService = require('./services/aiService');

// All methods now use Gemini
async function processReceipt(imageBase64) {
  try {
    const transaction = await aiService.extractFromImage(
      imageBase64, 
      'image/jpeg'
    );
    
    console.log('Using:', aiService.getCurrentProvider()); // "Gemini"
    console.log('Transaction:', transaction);
    // {
    //   type: 'debit',
    //   amount: 450.50,
    //   currency: 'INR',
    //   category: 'Food',
    //   vendor: 'Swiggy',
    //   ...
    // }
  } catch (error) {
    console.error('Extraction failed:', error);
  }
}
```

---

## Example 2: Using OpenAI

### Configuration (.env)
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-vision-preview
OPENAI_WHISPER_MODEL=whisper-1
```

### Usage
```javascript
// Same code, different provider!
const transaction = await aiService.extractFromImage(imageBase64, 'image/jpeg');
console.log('Using:', aiService.getCurrentProvider()); // "OpenAI"
```

---

## Example 3: Runtime Provider Switching

```javascript
const aiService = require('./services/aiService');

async function processWithMultipleProviders(text) {
  // Process with Gemini
  aiService.switchProvider('gemini');
  const geminiResult = await aiService.extractFromText(text);
  console.log('Gemini:', geminiResult);
  
  // Process with OpenAI for comparison
  aiService.switchProvider('openai');
  const openaiResult = await aiService.extractFromText(text);
  console.log('OpenAI:', openaiResult);
  
  // Use the better result or average them
  return geminiResult.amount === openaiResult.amount 
    ? geminiResult 
    : { ...geminiResult, confidence: 'low' };
}
```

---

## Example 4: Fallback Strategy

```javascript
const aiService = require('./services/aiService');

async function extractWithFallback(image, mimeType) {
  const providers = aiService.getAvailableProviders();
  
  for (const provider of providers) {
    try {
      aiService.switchProvider(provider);
      const result = await aiService.extractFromImage(image, mimeType);
      
      if (result && result.amount) {
        console.log(`Success with ${provider}`);
        return result;
      }
    } catch (error) {
      console.log(`${provider} failed, trying next...`);
      continue;
    }
  }
  
  throw new Error('All providers failed');
}
```

---

## Example 5: Processing Voice Notes

```javascript
const aiService = require('./services/aiService');
const mediaService = require('./services/mediaService');

async function processVoiceNote(audioId, mimeType) {
  // Download audio
  const { tempPath } = await mediaService.processAudioMedia(audioId, mimeType);
  
  try {
    // Transcribe and extract (works with both Gemini and OpenAI)
    const transaction = await aiService.extractFromAudio(tempPath);
    
    console.log('Transcribed:', transaction.raw_text);
    console.log('Extracted:', transaction);
    // {
    //   type: 'debit',
    //   amount: 500,
    //   raw_text: 'I spent five hundred rupees on groceries',
    //   ...
    // }
    
    return transaction;
  } finally {
    // Cleanup
    await mediaService.deleteTempFile(tempPath);
  }
}
```

---

## Example 6: Health Monitoring

```javascript
const aiService = require('./services/aiService');

async function monitorProviderHealth() {
  // Check all providers
  const allHealth = await aiService.checkAllProvidersHealth();
  
  console.log('Provider Health:');
  for (const [name, status] of Object.entries(allHealth)) {
    console.log(`  ${name}: ${status.healthy ? '✅' : '❌'} ${status.error || ''}`);
  }
  
  // Check current provider
  const currentHealth = await aiService.checkAPIHealth();
  console.log(`Current (${aiService.getCurrentProvider()}):`, currentHealth);
}

// Run every 5 minutes
setInterval(monitorProviderHealth, 5 * 60 * 1000);
```

---

## Example 7: A/B Testing Providers

```javascript
const aiService = require('./services/aiService');

async function compareProviders(testData) {
  const results = {};
  
  for (const provider of aiService.getAvailableProviders()) {
    aiService.switchProvider(provider);
    
    const startTime = Date.now();
    const result = await aiService.extractFromText(testData.text);
    const duration = Date.now() - startTime;
    
    results[provider] = {
      result,
      duration,
      accuracy: result ? calculateAccuracy(result, testData.expected) : 0
    };
  }
  
  return results;
}

// Run A/B test
const testText = 'I paid 1200 rupees for electricity bill on Jan 15';
const results = await compareProviders({
  text: testText,
  expected: { amount: 1200, category: 'Bills' }
});

console.log('Provider Comparison:', results);
// {
//   gemini: { duration: 800, accuracy: 0.95, ... },
//   openai: { duration: 1500, accuracy: 0.98, ... }
// }
```

---

## Example 8: Custom Provider Selection

```javascript
const aiService = require('./services/aiService');

async function smartProviderSelection(task) {
  // Use Gemini for speed
  if (task.priority === 'fast') {
    aiService.switchProvider('gemini');
  }
  // Use OpenAI for accuracy
  else if (task.priority === 'accurate') {
    aiService.switchProvider('openai');
  }
  // Use Gemini for cost savings
  else {
    aiService.switchProvider('gemini');
  }
  
  return aiService.extractFromImage(task.image, task.mimeType);
}
```

---

## Example 9: Integration with Message Controller

This is already implemented in your `messageController.js`:

```javascript
// From src/controllers/messageController.js
async function handleImageMessage(msg, user, phoneNumber) {
  const imageId = msg.image.id;
  const mimeType = msg.image.mime_type;

  try {
    // Download and process image
    const { base64, mimeType: finalMimeType } = 
      await mediaService.processImageMedia(imageId, mimeType);

    // Extract transaction (uses configured provider automatically)
    const transaction = await aiService.extractFromImage(base64, finalMimeType);

    if (transaction) {
      await saveTransaction(transaction, user, phoneNumber, msg.id);
    }
  } catch (error) {
    logger.logError(error, { context: 'handleImageMessage' });
  }
}
```

---

## Example 10: Admin Provider Management

```javascript
// Express route example (already in admin.js)
router.post('/admin/switch-provider', authenticateAdmin, async (req, res) => {
  const { provider } = req.body;
  
  const success = aiService.switchProvider(provider);
  
  if (success) {
    res.json({
      success: true,
      currentProvider: aiService.getCurrentProvider(),
      message: `Switched to ${provider}`
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Provider not available',
      available: aiService.getAvailableProviders()
    });
  }
});
```

---

## Testing Commands

### Test with Gemini
```bash
# Set in .env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key

# Restart and test
npm run dev
```

### Test with OpenAI
```bash
# Set in .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key

# Restart and test
npm run dev
```

### Test Provider Switching via API
```bash
# Switch to Gemini
curl -X POST http://localhost:3000/admin/switch-ai-provider \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{"provider": "gemini"}'

# Check current provider
curl http://localhost:3000/admin/ai-providers \
  -H "x-api-key: your-admin-key"
```

---

## Pro Tips

### 1. Use Gemini for Development
```env
AI_PROVIDER=gemini  # Faster + Free tier
```

### 2. Use OpenAI for Production (if needed)
```env
AI_PROVIDER=openai  # More battle-tested
```

### 3. Keep Both Keys for Redundancy
```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
AI_PROVIDER=gemini
```

### 4. Monitor and Switch
Check health, switch if one fails:
```javascript
const health = await aiService.checkAPIHealth();
if (!health.healthy) {
  aiService.switchProvider('backup-provider');
}
```

---

**That's it! Your app now supports multiple AI providers with zero code changes! 🚀**
