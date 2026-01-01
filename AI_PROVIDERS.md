# AI Provider Interface Pattern - Documentation

## Overview

The application now supports **multiple AI providers** with a clean **Strategy Pattern** implementation. You can easily switch between **OpenAI** and **Gemini** (or add new providers) without changing your application code.

---

## 🎯 Features

✅ **Plug & Play** - Switch providers with a single environment variable
✅ **Interface Pattern** - All providers implement the same interface
✅ **Runtime Switching** - Change providers without restarting the app
✅ **Backward Compatible** - Existing code continues to work
✅ **Easy to Extend** - Add new AI providers easily
✅ **Fallback Support** - Auto-fallback to available provider

---

## 📁 File Structure

```
src/services/
├── aiService.js                    # Main service (backward compatible)
└── ai/
    ├── AIProvider.js               # Abstract interface
    ├── OpenAIProvider.js           # OpenAI implementation
    ├── GeminiProvider.js           # Gemini implementation  
    └── AIServiceFactory.js         # Factory pattern manager
```

---

## 🚀 Quick Start

### 1. Configuration

Add to your `.env` file:

```env
# Choose your AI provider
AI_PROVIDER=gemini

# Gemini API Key (if using Gemini)
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-2.0-flash

# OpenAI API Key (if using OpenAI)
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4-vision-preview
```

### 2. Install Dependencies

```bash
npm install @google/generative-ai
```

### 3. Use in Your Code

**No changes needed!** Your existing code continues to work:

```javascript
const aiService = require('./services/aiService');

// Extract from image (uses configured provider)
const transaction = await aiService.extractFromImage(base64Image, mimeType);

// Extract from text (uses configured provider)
const transaction = await aiService.extractFromText(textMessage);

// Transcribe audio (uses configured provider)
const transcript = await aiService.transcribeAudio(audioPath);
```

---

## 🔄 Switching Providers

### Method 1: Environment Variable (Recommended)

Set in `.env`:
```env
AI_PROVIDER=gemini  # or 'openai'
```

Restart your application.

### Method 2: Runtime Switching (via API)

```bash
curl -X POST http://localhost:3000/admin/switch-ai-provider \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{"provider": "gemini"}'
```

### Method 3: Programmatic Switching

```javascript
const aiService = require('./services/aiService');

// Switch to Gemini
aiService.switchProvider('gemini');

// Switch to OpenAI
aiService.switchProvider('openai');

// Check current provider
const current = aiService.getCurrentProvider();
console.log(`Using: ${current}`); // "Gemini" or "OpenAI"
```

---

## 📊 Provider Comparison

| Feature | OpenAI | Gemini 2.0 Flash |
|---------|--------|------------------|
| **Image Analysis** | GPT-4 Vision | Gemini 2.0 Flash Vision |
| **Audio Transcription** | Whisper (best-in-class) | Gemini Audio (multilingual) |
| **Text Extraction** | GPT-4 | Gemini 2.0 Flash |
| **Speed** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (Faster) |
| **Cost** | $$$ | $ (Cheaper) |
| **Free Tier** | No | Yes (generous) |
| **Accuracy** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Multilingual** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🛠️ Advanced Usage

### Check Available Providers

```javascript
const providers = aiService.getAvailableProviders();
console.log(providers); // ['openai', 'gemini']
```

### Health Check All Providers

```javascript
const health = await aiService.checkAllProvidersHealth();
console.log(health);
// {
//   openai: { healthy: true, provider: 'OpenAI' },
//   gemini: { healthy: true, provider: 'Gemini' }
// }
```

### Use Specific Provider Directly

```javascript
const { aiServiceFactory } = require('./services/aiService');

// Get specific provider
const geminiProvider = aiServiceFactory.getProviderByName('gemini');
const result = await geminiProvider.extractFromText('Spent 500 on groceries');
```

---

## 🔧 Adding a New Provider

### Step 1: Create Provider Class

Create `src/services/ai/ClaudeProvider.js`:

```javascript
const AIProvider = require('./AIProvider');

class ClaudeProvider extends AIProvider {
  constructor() {
    super();
    // Initialize Claude client
  }

  getName() {
    return 'Claude';
  }

  async extractFromImage(base64Image, mimeType, context) {
    // Implement using Claude API
  }

  async transcribeAudio(audioFilePath) {
    // Implement using Claude API
  }

  async extractFromText(text, context) {
    // Implement using Claude API
  }

  async checkHealth() {
    // Implement health check
  }
}

module.exports = ClaudeProvider;
```

### Step 2: Register in Factory

Edit `src/services/ai/AIServiceFactory.js`:

```javascript
const ClaudeProvider = require('./ClaudeProvider');

_initializeProviders() {
  // ... existing code ...
  
  // Add Claude
  if (process.env.CLAUDE_API_KEY) {
    this.providers.set('claude', new ClaudeProvider());
    logger.info('Claude provider initialized');
  }
}
```

### Step 3: Configure

Add to `.env`:
```env
AI_PROVIDER=claude
CLAUDE_API_KEY=your-claude-key
```

Done! 🎉

---

## 🧪 Testing

### Test Health Endpoint

```bash
curl http://localhost:3000/admin/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "ai": {
      "current": {
        "healthy": true,
        "provider": "Gemini",
        "model": "gemini-pro"
      },
      "currentProvider": "Gemini",
      "availableProviders": ["openai", "gemini"],
      "allProviders": {
        "openai": { "healthy": true, "provider": "OpenAI" },
        "gemini": { "healthy": true, "provider": "Gemini" }
      }
    }
  }
}
```

### Test Provider Switching

```bash
# Check current provider
curl http://localhost:3000/admin/ai-providers \
  -H "x-api-key: your-admin-key"

# Switch to OpenAI
curl -X POST http://localhost:3000/admin/switch-ai-provider \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{"provider": "openai"}'

# Switch back to Gemini
curl -X POST http://localhost:3000/admin/switch-ai-provider \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{"provider": "gemini"}'
```

---

## 💡 Best Practices

### 1. Use Environment Variables
Set `AI_PROVIDER` in `.env` for consistent behavior across deployments.

### 2. Keep Both Keys
Configure both OpenAI and Gemini keys for redundancy:
```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
AI_PROVIDER=gemini  # Use Gemini by default
```

### 3. Monitor Health
Check `/admin/health` regularly to ensure providers are working.

### 4. Log Provider Usage
The factory logs which provider is being used:
```
[INFO] Active AI provider set to: Gemini
[INFO] Gemini image extraction completed
```

### 5. Test Both Providers
Test with both providers to ensure consistent results.

---

## 🐛 Troubleshooting

### Provider Not Available

**Error**: `Provider gemini not available`

**Solution**: 
- Check `GEMINI_API_KEY` is set in `.env`
- Ensure `@google/generative-ai` is installed
- Check logs for initialization errors

### API Key Invalid

**Error**: `Gemini API key invalid`

**Solution**:
- Verify key is correct (starts with `AI...`)
- Check key permissions
- Generate new key from Google AI Studio

### Transcription Fails

**Issue**: Audio transcription not working with Gemini

**Solution**:
- Gemini 2.0 supports audio, but file format matters
- Supported: OGG, MP3, MP4, WAV
- Check file size limits
- Fallback to OpenAI Whisper if needed

---

## 🚀 Performance Tips

### Gemini Advantages
- **Faster**: ~2x faster than GPT-4 Vision
- **Cheaper**: ~10x cheaper than OpenAI
- **Free Tier**: Generous free quota
- **Audio Support**: Native audio understanding

### OpenAI Advantages
- **Whisper**: Best-in-class transcription
- **Proven**: More battle-tested
- **Ecosystem**: Larger community/resources

### Recommendation
- **Production**: Use Gemini for cost savings
- **High Accuracy**: Use OpenAI for critical tasks
- **Hybrid**: Use Gemini for most, OpenAI for fallback

---

## 📝 API Reference

### AIProvider Interface

```javascript
class AIProvider {
  getName(): string
  extractFromImage(image, mimeType, context): Promise<Transaction>
  transcribeAudio(audioPath): Promise<string>
  extractFromText(text, context): Promise<Transaction>
  checkHealth(): Promise<{ healthy: boolean, provider: string }>
}
```

### Transaction Object

```javascript
{
  type: 'debit' | 'credit',
  amount: number,
  currency: string,        // e.g., 'INR', 'USD'
  date: string,            // YYYY-MM-DD
  category: string,        // e.g., 'Food', 'Transport'
  vendor: string | null,
  description: string,
  raw_text: string
}
```

---

## 🎓 Learn More

- [OpenAI API Docs](https://platform.openai.com/docs)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)

---

## 📞 Support

Having issues? 
1. Check logs: `tail -f logs/combined.log`
2. Test health: `GET /admin/health`
3. Check providers: `GET /admin/ai-providers`
4. Review this documentation

---

**Built with ❤️ using Strategy Pattern for maximum flexibility**
