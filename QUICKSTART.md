# Quick Start Guide - WhatsApp Finance Assistant

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies (1 minute)

```bash
cd wa-finance-assistant
npm install
```

### Step 2: Configure Environment (2 minutes)

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=any-random-string
OPENAI_API_KEY=your-openai-key
```

### Step 3: Set Up Database (1 minute)

1. Open Supabase SQL Editor
2. Copy and run `infra/db/schema.sql`

### Step 4: Start Server (1 minute)

```bash
npm run dev
```

Server runs at `http://localhost:3000` ✅

---

## 📱 Test Your Bot

### 1. Set Up Webhook (First Time Only)

In Meta Developer Console:
- Webhook URL: `https://your-domain.com/webhook/whatsapp`
- Verify Token: (from your `.env`)
- Subscribe to: `messages`

### 2. Link Your WhatsApp

Send to your WhatsApp Business number:
```
LINK your-email@example.com
```

You'll receive a verification code. Reply with:
```
VERIFY 123456
```

### 3. Start Tracking Expenses!

Send any of these:
- 📸 Photo of a bill/receipt
- 🎤 Voice message: "I spent 500 rupees on groceries"
- 💬 Text: "Paid 1200 for electricity bill"

The bot will:
- Extract transaction details
- Save to your database
- Send you a confirmation ✅

---

## 🧪 Test Locally

### Health Check
```bash
curl http://localhost:3000/admin/health
```

### Send Test Message
```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "test-msg-id",
            "type": "text",
            "text": {"body": "I spent 500 rupees on food"}
          }]
        }
      }]
    }]
  }'
```

---

## 📊 Admin Endpoints

Set `ADMIN_API_KEY` in `.env`, then:

```bash
# Get statistics
curl http://localhost:3000/admin/stats \
  -H "x-api-key: your-admin-key"

# Trigger daily reminder manually
curl -X POST http://localhost:3000/admin/trigger-job \
  -H "x-api-key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"jobName": "dailyReminder"}'

# View recent logs
curl http://localhost:3000/admin/logs?limit=50 \
  -H "x-api-key: your-admin-key"
```

---

## 🎯 Key Features to Try

### 1. Image Processing
- Take a photo of any receipt
- Send to WhatsApp bot
- Watch it extract amount, date, vendor automatically

### 2. Voice Notes
- Record expense in your language
- "मैंने 500 रुपये खाने पे खर्च किये" (Hindi)
- "I paid 1200 for groceries" (English)

### 3. Text Messages
- Quick text updates
- "Received salary 50000"
- "Spent 250 on uber"

### 4. Commands
- `HELP` - Show all commands
- `DELETE` - Remove last transaction
- `STATS` - View your statistics
- `LINK [email]` - Link account
- `VERIFY [code]` - Verify link

### 5. Daily Reminders
- Bot asks every morning (9 AM)
- "Any expenses today?"
- Reply with expenses or "NONE"

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Use different port
PORT=3001 npm run dev
```

### Database errors
```bash
# Check Supabase connection
node -e "require('./src/config/supabaseClient').checkConnection().then(console.log)"
```

### OpenAI errors
```bash
# Test OpenAI connection
node -e "require('./src/services/aiService').checkAPIHealth().then(console.log)"
```

### Webhook not receiving
- Ensure server is publicly accessible (use ngrok for local testing)
- Check WhatsApp webhook configuration
- Verify token matches

---

## 🚢 Deploy to Production

### Option 1: Render (Recommended)
1. Push code to GitHub
2. Create Web Service on Render
3. Connect repository
4. Add environment variables
5. Deploy ✅

### Option 2: Heroku
```bash
heroku create
heroku config:set $(cat .env | xargs)
git push heroku main
```

### Option 3: Railway
1. Import from GitHub
2. Add environment variables
3. Deploy ✅

---

## 📚 Documentation

- **README.md** - Overview and features
- **SETUP.md** - Detailed setup instructions
- **ARCHITECTURE.md** - System design and architecture
- **This file** - Quick start guide

---

## 🎓 Learn More

### Understanding the Code

Key files to explore:
1. `src/index.js` - Application entry point
2. `src/controllers/messageController.js` - Message handling
3. `src/services/aiService.js` - AI extraction logic
4. `src/utils/prompts.js` - AI prompts (customize here!)

### Customization

Want to change AI behavior?
- Edit prompts in `src/utils/prompts.js`
- Adjust categories in database
- Modify extraction logic in `src/services/aiService.js`

---

## 💡 Tips

1. **Start Small**: Test with text messages first
2. **Check Logs**: `tail -f logs/combined.log`
3. **Monitor Database**: Use Supabase dashboard
4. **Test Thoroughly**: Try different scenarios
5. **Read Docs**: Check SETUP.md for detailed info

---

## 🆘 Need Help?

1. Check logs in `logs/` directory
2. Review `event_logs` table in Supabase
3. Enable debug logging: `LOG_LEVEL=debug npm run dev`
4. Check GitHub issues
5. Review documentation files

---

## ✅ Success Checklist

- [x] Dependencies installed
- [x] Environment configured
- [x] Database set up
- [x] Server running
- [x] Webhook configured
- [x] Account linked
- [x] First transaction tracked

**You're all set! 🎉**

Start sending expenses to your WhatsApp bot and watch your finance tracker come to life!
