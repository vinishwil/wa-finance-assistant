# Migration Guide: Existing Database Integration

## 📋 Overview

This guide explains how the WhatsApp Finance Assistant has been adapted to work with your **existing database structure** (users, families, transactions tables) with **categories stored in JSONB**.

---

## 🗄️ Database Structure

### Existing Tables Used

#### 1. **users** table
```sql
CREATE TABLE public.users (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  avatar_url TEXT,
  phone NUMERIC,
  -- ADDED BY MIGRATION:
  whatsapp_number TEXT,
  family_id UUID REFERENCES families(family_id)
);
```

#### 2. **families** table
```sql
CREATE TABLE families (
    family_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_name TEXT NOT NULL,
    family_code TEXT NOT NULL,
    symbol TEXT,
    avatar TEXT,
    created_by UUID REFERENCES users(user_id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES users(user_id) DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- EXISTING:
    categories_json JSONB DEFAULT NULL,
    -- ADDED BY MIGRATION:
    subscription_type TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'inactive',
    subscription_end_date TIMESTAMP WITH TIME ZONE
);
```

#### 3. **transactions** table
```sql
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(family_id),
    user_id UUID REFERENCES users(user_id),
    recipient_id UUID,
    wallet_id UUID REFERENCES users(user_id),
    category_id UUID,  -- References UUID in categories_json
    amount DECIMAL(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    description TEXT,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(user_id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES users(user_id) DEFAULT auth.uid()
);
```

---

## 📦 Categories JSON Structure

Categories are stored in `families.categories_json` as a JSONB array:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Food",
    "icon": "🍔",
    "type": "expense",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "Salary",
    "icon": "💰",
    "type": "income",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "Transport",
    "icon": "🚗",
    "type": "expense",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

### Field Definitions:
- **id**: UUID - Used as `category_id` in transactions table
- **name**: String - Display name of the category
- **icon**: String - Emoji icon for visual representation
- **type**: String - Either "income" or "expense"
- **createdAt**: ISO timestamp - When category was created

---

## 🔄 Migration Steps

### Step 1: Run Schema Alterations

Execute the schema updates in your Supabase SQL Editor:

```bash
cd wa-finance-assistant
psql -f infra/db/schema.sql
# OR run in Supabase SQL Editor
```

This will:
- ✅ Add `whatsapp_number` and `family_id` columns to users (if not exists)
- ✅ Add subscription columns to families (if not exists)
- ✅ Add JSON structure validation
- ✅ Create necessary indexes
- ✅ Set up RLS policies
- ✅ Create updated RPC functions

### Step 2: Initialize Default Categories (Optional)

If a family doesn't have categories yet, run this to add defaults:

```sql
-- Example: Add default categories to a family
UPDATE families
SET categories_json = '[
  {"id": "550e8400-e29b-41d4-a716-446655440001", "name": "Food", "icon": "🍔", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440002", "name": "Transport", "icon": "🚗", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440003", "name": "Shopping", "icon": "🛒", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440004", "name": "Bills", "icon": "📝", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440005", "name": "Healthcare", "icon": "⚕️", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440006", "name": "Entertainment", "icon": "🎬", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440007", "name": "Salary", "icon": "💰", "type": "income", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440008", "name": "Business", "icon": "💼", "type": "income", "createdAt": "2024-01-15T10:00:00Z"},
  {"id": "550e8400-e29b-41d4-a716-446655440009", "name": "Other", "icon": "📁", "type": "expense", "createdAt": "2024-01-15T10:00:00Z"}
]'::jsonb
WHERE family_id = 'your-family-id-here';
```

### Step 3: Verify Integration

Test the category system:

```sql
-- Get categories for a family
SELECT categories_json FROM families WHERE family_id = 'your-family-id';

-- Check if category lookup works
SELECT 
  cat->>'id' as category_id,
  cat->>'name' as category_name
FROM families f,
LATERAL jsonb_array_elements(f.categories_json) as cat
WHERE f.family_id = 'your-family-id';
```

---

## 🔧 How It Works

### 1. **Dynamic Category Fetching**

When a user sends a message, the system:
1. Identifies the user
2. Fetches their `family_id`
3. Retrieves `categories_json` from the families table
4. Passes categories to the AI for extraction

```javascript
// In messageController.js
const categories = await supabaseService.getCategoriesForFamily(user.family_id);
const transaction = await aiService.extractFromText(text, '', categories);
```

### 2. **AI Prompt Generation**

The AI is instructed to use **only** the categories from your database:

```javascript
// Dynamic prompt generation in prompts.js
function getTextExtractionSystemPrompt(categories = []) {
  const categoryList = categories.map(cat => cat.name).join(', ');
  return `...classify into one of these: ${categoryList}...`;
}
```

### 3. **Category Name → UUID Mapping**

When AI extracts a category name (e.g., "Food"), the system:
1. Looks up the category in `categories_json` by name
2. Extracts the UUID
3. Stores the UUID in `transactions.category_id`

```javascript
// In supabaseService.js
async function findCategoryIdByName(categoryName, familyId) {
  const categories = await getCategoriesForFamily(familyId);
  const category = categories.find(
    cat => cat.name.toLowerCase() === categoryName.toLowerCase()
  );
  return category?.id || null;
}
```

### 4. **Auto-Create New Categories**

If AI extracts a category not in your list, it's automatically added:

```javascript
async function addCategoryToFamily(familyId, categoryName, categoryType = 'expense', icon = '📁') {
  const categories = await getCategoriesForFamily(familyId);
  const newCategory = {
    id: uuidv4(),
    name: categoryName,
    icon: icon,
    type: categoryType,
    createdAt: new Date().toISOString(),
  };
  const updatedCategories = [...categories, newCategory];
  await supabase
    .from('families')
    .update({ categories_json: updatedCategories })
    .eq('family_id', familyId);
}
```

---

## 🎯 Key Features

### ✅ Dynamic Categories
- Categories are read from your existing `categories_json`
- Each family can have **custom categories**
- No hardcoded category lists

### ✅ Backward Compatible
- Works with existing data structure
- No breaking changes to your tables
- Uses ALTER queries (safe to run multiple times)

### ✅ Automatic Category Management
- New categories auto-created when AI detects them
- Category icons auto-assigned based on name
- Category type (income/expense) auto-determined

### ✅ Performance Optimized
- GIN index on `categories_json` for fast queries
- Indexed foreign keys
- RLS policies for security

---

## 📊 Queries & Analytics

### Get Transaction Stats with Categories

```sql
-- Use the updated RPC function
SELECT * FROM get_user_transaction_stats(
  'user-uuid-here',
  '2024-01-01'::date,
  '2024-12-31'::date
);
```

Returns:
```json
{
  "total_credit": 50000.00,
  "total_debit": 35000.00,
  "transaction_count": 150,
  "category_breakdown": [
    {"category": "Food", "amount": 12000, "count": 45},
    {"category": "Transport", "amount": 8000, "count": 30},
    {"category": "Salary", "amount": 50000, "count": 2}
  ]
}
```

### Get All Transactions with Category Names

```sql
SELECT 
  t.transaction_id,
  t.amount,
  t.type,
  t.transaction_date,
  COALESCE(
    (
      SELECT cat->>'name'
      FROM jsonb_array_elements(f.categories_json) AS cat
      WHERE (cat->>'id')::uuid = t.category_id
    ),
    'Uncategorized'
  ) AS category_name
FROM transactions t
LEFT JOIN families f ON t.family_id = f.family_id
WHERE t.user_id = 'your-user-id'
ORDER BY t.transaction_date DESC;
```

---

## 🔒 Security & RLS

Row-Level Security policies ensure:
- ✅ Users only see their family's transactions
- ✅ Users can only modify their own transactions
- ✅ Family creators can update family data

```sql
-- Users can view family transactions
CREATE POLICY "Users can view family transactions" ON transactions
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM users WHERE user_id = auth.uid())
    );
```

---

## 🐛 Troubleshooting

### Issue: Categories not showing in AI extraction

**Solution**: Ensure family has categories_json populated:
```sql
SELECT family_id, categories_json FROM families WHERE family_id = 'your-family-id';
```

### Issue: Category ID not found in transactions

**Solution**: Check if category exists in categories_json:
```sql
SELECT 
  cat->>'id' as id,
  cat->>'name' as name
FROM families f,
LATERAL jsonb_array_elements(f.categories_json) as cat
WHERE f.family_id = 'your-family-id'
  AND (cat->>'id')::uuid = 'category-id-from-transaction';
```

### Issue: New categories not being created

**Solution**: Check app logs and ensure supabaseService has permissions:
```bash
tail -f logs/combined.log | grep category
```

---

## 📝 Environment Variables

Ensure these are set in your `.env`:

```bash
# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Provider (uses categories from DB)
AI_PROVIDER=gemini  # or openai
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
```

---

## 🚀 Testing

### 1. Test Category Fetching
```bash
# In Node.js REPL
const supabaseService = require('./src/services/supabaseService');
const categories = await supabaseService.getCategoriesForFamily('your-family-id');
console.log(categories);
```

### 2. Test AI Extraction with Categories
```bash
# Send a WhatsApp message
"I spent 500 rupees on food"

# Check logs to see categories used
tail -f logs/combined.log | grep "categories"
```

### 3. Test Category Lookup
```bash
# In Node.js REPL
const id = await supabaseService.findCategoryIdByName('Food', 'your-family-id');
console.log(id);  // Should return UUID
```

---

## 📚 Related Files

| File | Purpose |
|------|---------|
| `infra/db/schema.sql` | Database migrations and RLS policies |
| `src/services/supabaseService.js` | Category CRUD operations |
| `src/utils/prompts.js` | Dynamic AI prompt generation |
| `src/controllers/messageController.js` | Category fetching in message flow |
| `src/services/ai/*.js` | AI providers with category support |

---

## ✅ Migration Checklist

- [ ] Run `schema.sql` updates
- [ ] Verify `categories_json` structure in families table
- [ ] Add default categories to test family
- [ ] Test WhatsApp message → category extraction
- [ ] Verify category UUID stored in transactions
- [ ] Test RPC function for stats
- [ ] Check RLS policies work correctly
- [ ] Update any custom queries to use new structure

---

## 🎉 Benefits

1. **No Separate Categories Table** - Uses existing JSONB structure
2. **Family-Specific Categories** - Each family can customize
3. **Dynamic AI Prompts** - AI uses actual categories from DB
4. **Auto-Category Creation** - New categories added on the fly
5. **Performance** - GIN indexes make JSON queries fast
6. **Type Safety** - UUIDs ensure referential integrity

---

## 📞 Support

For issues:
1. Check `logs/combined.log` for errors
2. Verify database structure matches schema.sql
3. Test category functions in Node.js REPL
4. Check AI provider configuration

---

**Built with ❤️ to integrate seamlessly with your existing database!**
