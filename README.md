# WhatsApp Finance Assistant

A production-ready WhatsApp-based finance assistant that uses AI to extract transaction data from bills (images), voice notes (multilingual), and text messages. Built with Node.js, OpenAI (Whisper + GPT Vision), and Supabase.

## Features

- 🤖 **AI-Powered Extraction**: Automatically extracts transaction data (amount, currency, date, category, type) from:
  - 📸 Bill images (OCR + Vision AI)
  - 🎤 Voice notes (Whisper transcription, multilingual)
  - 💬 Text messages
- 🔐 **Secure User Linking**: Links WhatsApp users with existing finance app accounts via OTP
- 📊 **Supabase Integration**: Stores transactions with user authentication
- ⏰ **Daily Reminders**: Bot-initiated prompts asking about expenses/income
- ✅ **Transaction Confirmation**: Sends back summary with edit/undo options
- 🔒 **Security First**: Webhook verification, rate limiting, input validation
- 🎯 **Single Responsibility Principle**: Clean, maintainable codebase
- 📈 **Performance Optimized**: Async processing, efficient error handling

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account and project
- Meta WhatsApp Business API access
- OpenAI API key

## Installation

1. **Clone the repository**
   ```bash
   cd wa-finance-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

4. **Set up database**
   ```bash
   # Run the SQL schema in your Supabase SQL Editor
   # File: infra/db/schema.sql
   ```

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Configuration

### WhatsApp Cloud API Setup

1. Create a Meta Developer account
2. Set up WhatsApp Business API
3. Get your Phone Number ID and Access Token
4. Configure webhook URL: `https://your-domain.com/webhook/whatsapp`
5. Set verify token in `.env`

### Supabase Setup

1. Create tables using `infra/db/schema.sql`
2. Enable Row Level Security (RLS) policies
3. Set up Supabase Storage for media backups
4. Configure service role key for admin operations

### OpenAI Setup

1. Get API key from OpenAI platform
2. Ensure you have access to GPT-4 Vision and Whisper models

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  WhatsApp   │─────▶│   Node.js    │─────▶│  Supabase   │
│   User      │◀─────│   Express    │◀─────│  Database   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  OpenAI API  │
                     │ Whisper/GPT  │
                     └──────────────┘
```

## Project Structure

```
wa-finance-assistant/
├── src/
│   ├── index.js                    # Application entry point
│   ├── config/
│   │   └── supabaseClient.js       # Supabase connection
│   ├── routes/
│   │   ├── whatsappWebhook.js      # WhatsApp webhook routes
│   │   └── admin.js                # Admin API routes
│   ├── controllers/
│   │   ├── messageController.js    # Message processing logic
│   │   └── linkController.js       # User linking logic
│   ├── services/
│   │   ├── whatsappService.js      # WhatsApp API integration
│   │   ├── mediaService.js         # Media download/upload
│   │   ├── aiService.js            # OpenAI integration
│   │   ├── supabaseService.js      # Database operations
│   │   └── schedulerService.js     # Cron jobs
│   ├── utils/
│   │   ├── prompts.js              # AI prompts templates
│   │   ├── validators.js           # Input validation
│   │   └── logger.js               # Winston logger
│   ├── jobs/
│   │   └── dailyReminder.js        # Daily reminder job
│   └── tests/
│       ├── unit/                   # Unit tests
│       └── integration/            # Integration tests
└── infra/
    └── db/
        └── schema.sql              # Database schema
```

## API Endpoints

### WhatsApp Webhook
- `GET /webhook/whatsapp` - Webhook verification
- `POST /webhook/whatsapp` - Receive WhatsApp messages

### Admin API
- `GET /admin/health` - Health check
- `GET /admin/stats` - Usage statistics
- `POST /admin/link-user` - Manually link user

## Usage Flow

1. **User sends message/media to WhatsApp bot**
2. **Webhook receives message**
3. **System checks if user is linked**
   - If not linked: Initiates onboarding flow
   - If linked: Proceeds with extraction
4. **AI extracts transaction data**
   - Images: OCR + Vision analysis
   - Audio: Whisper transcription + GPT extraction
   - Text: Direct GPT extraction
5. **Transaction inserted into Supabase**
6. **Confirmation sent back to user**

## Security Features

- ✅ Webhook signature verification
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ Input validation with Joi
- ✅ Helmet.js security headers
- ✅ Environment variable management
- ✅ SQL injection prevention (Supabase parameterized queries)
- ✅ File size limits
- ✅ Subscription validation

## Performance Optimizations

- Async/await patterns for non-blocking I/O
- Efficient error handling and logging
- Media download streaming
- Database connection pooling
- Webhook response optimization (immediate 200 response)

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

## Deployment

### Recommended Platforms
- **Server**: Render, Railway, Heroku, or Vercel
- **Database**: Supabase (managed Postgres)
- **Monitoring**: Sentry, LogRocket

### Environment Variables
Ensure all variables in `.env.example` are set in your deployment platform.

## Monitoring & Logging

- Winston logger with multiple transports
- Event logging to Supabase `event_logs` table
- Error tracking with stack traces
- Request/response logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open a GitHub issue or contact the maintainer.

## Roadmap

- [ ] Multi-language support for responses
- [ ] Expense analytics and insights
- [ ] Budget alerts and notifications
- [ ] Receipt storage and retrieval
- [ ] Group expense splitting
- [ ] Integration with accounting software
