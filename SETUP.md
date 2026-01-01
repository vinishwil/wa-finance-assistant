# WhatsApp Finance Assistant - Setup Guide

## Prerequisites

Before you begin, ensure you have:
- Node.js v18+ installed
- A Supabase account and project
- Meta WhatsApp Business API access
- OpenAI API key

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

#### Supabase Configuration
1. Go to your Supabase project settings
2. Copy the project URL and anon/service role key
3. Update `SUPABASE_URL` and `SUPABASE_KEY`

#### WhatsApp Configuration
1. Go to Meta Developer Console (https://developers.facebook.com)
2. Create a WhatsApp Business App
3. Get your Phone Number ID and Access Token
4. Update `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`
5. Set a custom `WHATSAPP_VERIFY_TOKEN` (any random string)

#### OpenAI Configuration
1. Go to OpenAI platform (https://platform.openai.com)
2. Create an API key
3. Update `OPENAI_API_KEY`

### 3. Set Up Database

1. Open Supabase SQL Editor
2. Copy the contents of `infra/db/schema.sql`
3. Execute the SQL script
4. Verify all tables are created

### 4. Configure WhatsApp Webhook

1. Deploy your application (see Deployment section)
2. In Meta Developer Console, go to WhatsApp > Configuration
3. Set Webhook URL: `https://your-domain.com/webhook/whatsapp`
4. Set Verify Token: (same as `WHATSAPP_VERIFY_TOKEN` in .env)
5. Subscribe to webhook events: `messages`

### 5. Start the Application

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

### 6. Test the Setup

1. Send a message to your WhatsApp Business number
2. Check logs for incoming webhook
3. Try the health endpoint: `curl http://localhost:3000/admin/health`

## Deployment

### Deploy to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables from `.env`
6. Deploy

### Deploy to Heroku

```bash
heroku create your-app-name
heroku config:set $(cat .env | xargs)
git push heroku main
```

### Deploy to Railway

1. Connect your GitHub repository to Railway
2. Railway will auto-detect the Node.js app
3. Add environment variables in Settings
4. Deploy

## Testing

Run tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

## Monitoring

- Check logs: `tail -f logs/combined.log`
- Monitor health: `GET /admin/health`
- View stats: `GET /admin/stats` (requires `x-api-key` header)

## Troubleshooting

### Webhook not receiving messages
- Verify webhook URL is publicly accessible
- Check Meta Developer Console for webhook errors
- Verify `WHATSAPP_VERIFY_TOKEN` matches

### Database connection errors
- Verify Supabase credentials
- Check Supabase project status
- Ensure RLS policies are configured

### OpenAI API errors
- Verify API key is valid
- Check OpenAI account has credits
- Ensure you have access to GPT-4 Vision

### Media download failures
- Check WhatsApp access token is valid
- Verify file size limits
- Check temporary directory permissions

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review event logs in Supabase `event_logs` table
- Open a GitHub issue

## Next Steps

1. Customize AI prompts in `src/utils/prompts.js`
2. Add custom categories in database
3. Configure daily reminder schedule
4. Set up monitoring and alerts
5. Add custom business logic
