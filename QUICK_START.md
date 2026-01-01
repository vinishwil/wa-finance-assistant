# 🚀 Quick Start: Existing Database Integration

## ✅ What Was Done

Your WhatsApp Finance Assistant is now **fully integrated** with your existing database structure (users, families, transactions) using **categories_json** in the families table.

---

## 📝 Quick Setup (3 Steps)

### Step 1: Run Database Migrations
```bash
# In Supabase SQL Editor, run:
cd wa-finance-assistant
cat infra/db/schema.sql
# Copy and paste into Supabase SQL Editor → Run
```

**What it does:**
- ✅ Adds missing columns (whatsapp_number, family_id, subscription fields)
- ✅ Creates indexes for performance
- ✅ Sets up RLS policies
- ✅ Updates RPC functions to use categories_json

### Step 2: Initialize Categories
```bash
# In Supabase SQL Editor, run:
cat infra/db/init_categories.sql
# Copy the UPDATE query and run it
```

**What it does:**
- ✅ Adds default categories (Food, Transport, etc.) to families
- ✅ Works with existing families, no data loss

### Step 3: Start the App
```bash
npm install  # Already done
npm start    # Start the server
```

**Done!** Your app is ready to use. 🎉

---

## 🎯 How It Works

### Categories Structure in Database

Your `families` table has a `categories_json` column:

```json
[
  {"id": "uuid-1", "name": "Food", "icon": "🍔", "type": "expense"},
  {"id": "uuid-2", "name": "Transport", "icon": "🚗", "type": "expense"},
  {"id": "uuid-3", "name": "Salary", "icon": "💰", "type": "income"}
]
```

### When User Sends Message

1. **User**: "I spent 500 on food"
2. **System fetches** categories from family's `categories_json`
3. **AI gets prompt**: "classify into: Food, Transport, Salary..."
4. **AI extracts**: `{amount: 500, category: "Food"}`
5. **System maps** "Food" → UUID from categories_json
6. **Saves transaction** with `category_id` = UUID

---

## 🔧 Key Changes Made

### 1. Database (`infra/db/schema.sql`)
- ✅ ALTER queries for existing tables
- ✅ JSONB validation constraints
- ✅ Updated RPC functions
- ✅ Comprehensive indexes

### 2. Category Management (`src/services/supabaseService.js`)
```javascript
getCategoriesForFamily(familyId)        // Fetch categories array
findCategoryIdByName(name, familyId)    // Map name → UUID
addCategoryToFamily(familyId, name)     // Auto-create new ones
```

### 3. AI Prompts (`src/utils/prompts.js`)
```javascript
// OLD: Hardcoded
"categories: Food, Transport, Shopping..."

// NEW: Dynamic from DB
getImageExtractionSystemPrompt(categories)
getTextExtractionSystemPrompt(categories)
```

### 4. Message Flow (`src/controllers/messageController.js`)
```javascript
// Fetch categories before AI extraction
const categories = await getCategoriesForFamily(user.family_id);

// Pass to AI
const transaction = await aiService.extractFromText(text, '', categories);
```

---

## 📊 Features

### ✅ Per-Family Categories
- Each family can have **custom categories**
- Stored in `families.categories_json`
- AI uses actual categories from database

### ✅ Auto-Category Creation
- AI detects new category? → Auto-added to JSONB
- Smart icon assignment (🍔 for Food, 🚗 for Transport)
- Auto-determines type (income vs expense)

### ✅ Performance
- GIN index on categories_json
- Fast JSON queries
- Optimized foreign keys

### ✅ Secure
- RLS policies enforce family boundaries
- Users see only their family data
- Validated UUID references

---

## 🧪 Testing

### 1. Check Categories
```sql
SELECT family_id, categories_json FROM families LIMIT 1;
```

### 2. Send Test Message
```
WhatsApp: "I spent 500 on food"
```

### 3. Verify Transaction
```sql
SELECT 
  t.amount,
  (
    SELECT cat->>'name'
    FROM jsonb_array_elements(f.categories_json) AS cat
    WHERE (cat->>'id')::uuid = t.category_id
  ) AS category_name
FROM transactions t
LEFT JOIN families f ON t.family_id = f.family_id
ORDER BY t.created_at DESC
LIMIT 5;
```

### 4. Check Logs
```bash
tail -f logs/combined.log | grep category
```

Expected output:
```
[INFO] Fetched categories for family: abc-123
[INFO] Using categories: Food, Transport, Shopping...
[INFO] Category 'Food' mapped to UUID: 550e8400-...
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **INTEGRATION_SUMMARY.md** | Complete summary of changes |
| **MIGRATION_GUIDE.md** | Detailed migration steps |
| **AI_PROVIDERS.md** | AI provider configuration |
| **infra/db/init_categories.sql** | Category initialization queries |
| **infra/db/schema.sql** | Database migrations |

---

## 🎓 Common Operations

### Add Custom Category to Family
```sql
UPDATE families
SET categories_json = categories_json || '[
  {
    "id": "new-uuid-here",
    "name": "Groceries",
    "icon": "🥗",
    "type": "expense",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]'::jsonb
WHERE family_id = 'your-family-id';
```

### Get All Transactions with Categories
```sql
SELECT 
  t.transaction_id,
  t.amount,
  t.type,
  (
    SELECT cat->>'name'
    FROM jsonb_array_elements(f.categories_json) AS cat
    WHERE (cat->>'id')::uuid = t.category_id
  ) AS category_name
FROM transactions t
LEFT JOIN families f ON t.family_id = f.family_id
WHERE t.user_id = 'your-user-id'
ORDER BY t.transaction_date DESC;
```

### Category Statistics
```sql
SELECT * FROM get_user_transaction_stats(
  'user-uuid',
  '2024-01-01'::date,
  '2024-12-31'::date
);
```

---

## 🐛 Troubleshooting

### Categories not showing?
```sql
-- Check if family has categories
SELECT categories_json FROM families WHERE family_id = 'your-id';

-- If NULL, run init_categories.sql
```

### Transaction has null category_id?
```bash
# Check logs for category mapping
grep "Category.*not found" logs/combined.log

# System will auto-create if missing
```

### AI not using custom categories?
```bash
# Verify categories are fetched
grep "Fetched categories" logs/combined.log

# Should see: Fetched categories for family: xxx
```

---

## 💡 Pro Tips

### 1. Different Categories for Different Families
```sql
-- Business Family
UPDATE families SET categories_json = '[
  {"id": "...", "name": "Revenue", "icon": "💰", "type": "income"},
  {"id": "...", "name": "Expenses", "icon": "💸", "type": "expense"},
  {"id": "...", "name": "Payroll", "icon": "👥", "type": "expense"}
]'::jsonb WHERE family_name = 'Business';

-- Personal Family
UPDATE families SET categories_json = '[
  {"id": "...", "name": "Food", "icon": "🍔", "type": "expense"},
  {"id": "...", "name": "Entertainment", "icon": "🎬", "type": "expense"}
]'::jsonb WHERE family_name = 'Personal';
```

### 2. Category Icons Reference
```
🍔 Food        🚗 Transport    🛒 Shopping
📝 Bills       ⚕️ Healthcare   🎬 Entertainment
🏠 Rent        💡 Utilities    📱 Phone
⛽ Fuel        🎓 Education    💰 Salary
💼 Business    📈 Investment   🎁 Gifts
```

### 3. Backup Categories
```sql
-- Export to CSV
\COPY (SELECT family_id, categories_json FROM families) TO '/tmp/categories_backup.csv' CSV;
```

---

## ✅ Checklist

- [ ] Run `schema.sql` migrations
- [ ] Run `init_categories.sql` for defaults
- [ ] Start app with `npm start`
- [ ] Send test WhatsApp message
- [ ] Verify transaction in database
- [ ] Check logs for category operations
- [ ] Customize categories per family (optional)

---

## 🎉 You're Done!

Your WhatsApp Finance Assistant now:
- ✅ Works with your existing database
- ✅ Uses categories from families.categories_json
- ✅ Auto-creates new categories
- ✅ Supports custom categories per family
- ✅ Has full AI integration (Gemini + OpenAI)

**Just run the SQL migrations and start the app!**

---

## 📞 Need Help?

1. Check `logs/combined.log` for errors
2. Review `MIGRATION_GUIDE.md` for details
3. Test category functions in Node REPL
4. Verify database structure matches schema

---

**Built with ❤️ to work seamlessly with your production database!**
