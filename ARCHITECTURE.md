# WhatsApp Finance Assistant - Architecture Documentation

## Project Overview

A production-ready WhatsApp bot that uses AI to automatically extract and track financial transactions from images, voice notes, and text messages.

## Technology Stack

- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4 Vision & Whisper
- **Messaging**: Meta WhatsApp Cloud API
- **Scheduler**: node-cron

## Architecture Diagram

```
┌──────────────┐
│   WhatsApp   │
│    Users     │
└──────┬───────┘
       │ Sends messages
       ▼
┌──────────────────────────────────┐
│  WhatsApp Cloud API (Meta)       │
└──────────┬───────────────────────┘
           │ Webhook
           ▼
┌──────────────────────────────────┐
│   Express.js Server               │
│  ┌────────────────────────────┐  │
│  │  Routes (Webhook/Admin)    │  │
│  └───────────┬────────────────┘  │
│              ▼                    │
│  ┌────────────────────────────┐  │
│  │  Controllers               │  │
│  │  - Message Controller      │  │
│  │  - Link Controller         │  │
│  └───────────┬────────────────┘  │
│              ▼                    │
│  ┌────────────────────────────┐  │
│  │  Services                  │  │
│  │  - WhatsApp Service        │  │
│  │  - Media Service           │  │
│  │  - AI Service              │  │
│  │  - Supabase Service        │  │
│  └───────────┬────────────────┘  │
└──────────────┼───────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────┐    ┌──────────────┐
│ OpenAI   │    │  Supabase    │
│ API      │    │  Database    │
└──────────┘    └──────────────┘
```

## Design Principles

### 1. Single Responsibility Principle (SRP)
Each module/class has one specific responsibility:
- **Controllers**: Handle HTTP requests and orchestrate services
- **Services**: Implement business logic for specific domains
- **Utils**: Provide reusable helper functions
- **Routes**: Define API endpoints and middleware

### 2. Separation of Concerns
- **Routes**: Request routing only
- **Controllers**: Request/response handling
- **Services**: Business logic
- **Database**: Data access layer
- **Utils**: Cross-cutting concerns

### 3. Dependency Injection
Services are injected where needed, making the code testable and maintainable.

### 4. Error Handling
- Global error handler in Express
- Try-catch blocks in async functions
- Proper error logging with Winston
- User-friendly error messages

## Directory Structure

```
wa-finance-assistant/
├── src/
│   ├── index.js                    # Application entry point
│   ├── config/
│   │   └── supabaseClient.js       # DB connection config
│   ├── routes/
│   │   ├── whatsappWebhook.js      # WhatsApp webhook routes
│   │   └── admin.js                # Admin API routes
│   ├── controllers/
│   │   ├── messageController.js    # Message handling logic
│   │   └── linkController.js       # User linking logic
│   ├── services/
│   │   ├── whatsappService.js      # WhatsApp API client
│   │   ├── mediaService.js         # Media processing
│   │   ├── aiService.js            # OpenAI integration
│   │   ├── supabaseService.js      # Database operations
│   │   └── schedulerService.js     # Cron job management
│   ├── utils/
│   │   ├── prompts.js              # AI prompt templates
│   │   ├── validators.js           # Input validation
│   │   └── logger.js               # Winston logger
│   ├── jobs/
│   │   └── dailyReminder.js        # Daily reminder cron
│   └── tests/
│       ├── unit/                   # Unit tests
│       └── integration/            # Integration tests
├── infra/
│   └── db/
│       └── schema.sql              # Database schema
├── logs/                           # Application logs
├── tmp/                            # Temporary files
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── SETUP.md
└── LICENSE
```

## Data Flow

### Message Processing Flow

1. **WhatsApp User** sends message (text/image/audio)
2. **WhatsApp Cloud API** receives message and triggers webhook
3. **Express Server** receives webhook POST request
4. **Message Controller** processes the message:
   - Checks if user is linked
   - Validates subscription
   - Routes to appropriate handler
5. **Media Service** (if media):
   - Downloads media from WhatsApp
   - Validates file type and size
   - Optionally uploads to Supabase Storage
6. **AI Service**:
   - For images: GPT-4 Vision extracts transaction data
   - For audio: Whisper transcribes, then GPT extracts
   - For text: GPT directly extracts
7. **Supabase Service**:
   - Validates transaction data
   - Gets or creates category
   - Inserts transaction record
8. **WhatsApp Service**:
   - Sends confirmation message
   - Adds reaction to original message

### User Linking Flow

1. User sends `LINK email@example.com`
2. System checks if email exists in database
3. Generates 6-digit verification code
4. Stores link with code in `whatsapp_links` table
5. Sends code to user via WhatsApp
6. User sends `VERIFY 123456`
7. System verifies code and marks link as verified
8. Sends success message

## Security Features

### 1. Webhook Verification
- Validates WhatsApp verify token
- Optional signature verification

### 2. Rate Limiting
- 100 requests per 15 minutes per IP
- Configurable via environment variables

### 3. Input Validation
- Joi schema validation for all inputs
- Sanitization to prevent XSS and SQL injection
- File size and type validation

### 4. Authentication
- Admin routes protected with API key
- Row-level security (RLS) in Supabase

### 5. Security Headers
- Helmet.js for HTTP security headers
- CORS configuration

### 6. Environment Variables
- All secrets in environment variables
- .env.example template provided
- Never committed to version control

## Performance Optimizations

### 1. Async Processing
- Webhook responds immediately (200 OK)
- Message processing happens asynchronously
- Non-blocking I/O operations

### 2. Efficient Media Handling
- Streaming downloads
- Temporary file cleanup
- Configurable file size limits

### 3. Database Optimization
- Indexes on frequently queried columns
- Efficient queries with proper joins
- Connection pooling via Supabase

### 4. Error Handling
- Try-catch blocks prevent crashes
- Graceful degradation on failures
- Proper error logging

### 5. Caching (Future Enhancement)
- Redis for session storage
- Cache frequently accessed data

## Monitoring & Logging

### 1. Winston Logger
- Multiple log levels (error, warn, info, debug)
- Log rotation (5MB max per file)
- Separate error log file
- Colorized console output

### 2. Event Logging
- All significant events logged to database
- `event_logs` table for analytics
- Includes payload for debugging

### 3. Health Checks
- `/admin/health` endpoint
- Checks Supabase connection
- Checks OpenAI API availability
- System metrics (uptime, memory)

### 4. Metrics (via logs)
- Messages received count
- Transactions created count
- Linked users count
- Job execution status

## Testing Strategy

### 1. Unit Tests
- Test individual functions
- Mock external dependencies
- Fast execution
- High coverage target (>80%)

### 2. Integration Tests
- Test API endpoints
- Test service integration
- Use test database
- Slower but comprehensive

### 3. Manual Testing
- Test with real WhatsApp messages
- Test subscription flows
- Test error scenarios
- Test different media types

## Deployment Checklist

- [ ] Set all environment variables
- [ ] Run database schema
- [ ] Configure WhatsApp webhook
- [ ] Test health endpoint
- [ ] Test message processing
- [ ] Set up monitoring
- [ ] Configure log rotation
- [ ] Set up backup strategy
- [ ] Document API endpoints
- [ ] Train users

## Scalability Considerations

### Current Architecture (Single Server)
- Handles ~100 requests/15min per IP
- Processes messages sequentially
- Suitable for small to medium deployments

### Future Scaling Options

1. **Horizontal Scaling**
   - Multiple server instances
   - Load balancer
   - Shared session storage (Redis)

2. **Queue-Based Processing**
   - RabbitMQ or AWS SQS
   - Separate webhook receiver and processor
   - Better fault tolerance

3. **Microservices**
   - Separate AI service
   - Separate media service
   - Independent scaling

4. **CDN for Media**
   - CloudFront or Cloudflare
   - Faster media delivery
   - Reduced server load

## Maintenance

### Regular Tasks
- Monitor logs for errors
- Check disk space (tmp/, logs/)
- Review event logs for anomalies
- Update dependencies monthly
- Backup database regularly

### Cron Jobs
- Daily reminders (9 AM)
- Temp file cleanup (every 6 hours)
- Health checks (every hour)

## Future Enhancements

- [ ] Multi-language support
- [ ] Expense analytics dashboard
- [ ] Budget alerts
- [ ] Receipt OCR improvements
- [ ] Group expense splitting
- [ ] Export to Excel/CSV
- [ ] Integration with accounting software
- [ ] Voice command improvements
- [ ] Custom categories per user
- [ ] Recurring transaction detection

## Contributing

1. Fork the repository
2. Create feature branch
3. Follow coding standards
4. Write tests
5. Update documentation
6. Submit pull request

## License

MIT License - see LICENSE file
