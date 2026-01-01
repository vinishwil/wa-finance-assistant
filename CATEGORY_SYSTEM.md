# Category System Reference - WhatsApp Finance Assistant

## Overview
The category system uses a two-table architecture shared between Couplecents and the WhatsApp tracker.

---

## Table Structure

### **default_categories** (System Templates)
Global category templates available to all families.

```sql
default_category_id | name          | type    | icon              | emoji | display_order
--------------------|---------------|---------|-------------------|-------|---------------
uuid-1              | House         | expense | home-outline      | 🏠    | 0
uuid-2              | Food & Dining | expense | pizza-outline     | 🍕    | 1
uuid-3              | Employment    | income  | briefcase-outline | 💼    | 11
...
```

**Key Points:**
- Read-only system data
- Contains 15 default categories (10 expense, 5 income, 1 other)
- Shared across all families
- Never deleted or modified by users

---

### **categories** (Family Instances)
Family-specific category instances (both default and custom).

```sql
category_id | family_id | default_category_id | name     | type    | is_deleted | deleted_at | deleted_by
------------|-----------|---------------------|----------|---------|------------|------------|------------
uuid-a      | fam-1     | uuid-1 (House)      | House    | expense | false      | null       | null
uuid-b      | fam-1     | uuid-2 (Food)       | Food     | expense | false      | null       | null
uuid-c      | fam-1     | NULL (custom)       | Vacation | expense | false      | null       | null
uuid-d      | fam-1     | uuid-3 (deleted)    | Shopping | expense | true       | 2025-12-01 | user-x
```

**Key Points:**
- Each family has their own category records
- `default_category_id NOT NULL` = instance of a system default
- `default_category_id IS NULL` = custom user-created category
- Soft delete support via `is_deleted` flag (preserves transaction history)
- Migration added: `is_deleted`, `deleted_at`, `deleted_by` columns

---

## Migration History

### ❌ **Old System** (Pre-Migration)
- Each family had duplicate category records
- Transactions referenced family-specific `category_id`
- Problem: Lots of duplicate data

### ✅ **New System** (Post-Migration)
- Transactions can reference `default_category_id` directly
- Family categories still exist for custom ones
- Migration: `categories_simplified_migration.sql`

**What the migration does:**
```sql
-- 1. Add soft delete columns
ALTER TABLE categories
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN deleted_by UUID;

-- 2. Update transactions to use default_category_id
UPDATE transactions SET category_id = c.default_category_id
FROM categories c
WHERE transactions.category_id = c.category_id
  AND c.default_category_id IS NOT NULL;
```

---

## How the Tracker Uses Categories

### 1. **Get Categories for a Family**
```javascript
const categories = await getCategoriesForFamily(familyId);
// Returns only active (not deleted) categories
// Includes both default instances and custom categories
```

**SQL Query:**
```sql
SELECT * FROM categories
WHERE family_id = $1
  AND is_deleted = FALSE
ORDER BY name ASC;
```

### 2. **Find Category by Name**
```javascript
const categoryId = await findCategoryIdByName('Food', familyId);
// Case-insensitive search
// Returns null if not found or deleted
```

**SQL Query:**
```sql
SELECT category_id FROM categories
WHERE family_id = $1
  AND name ILIKE $2
  AND is_deleted = FALSE;
```

### 3. **Create New Custom Category**
```javascript
const categoryId = await addCategoryToFamily(
  familyId,
  'Vacation',
  'expense',
  '✈️',
  '#FF6B9D',
  '✈️'
);
```

**SQL Insert:**
```sql
INSERT INTO categories (
  category_id,
  family_id,
  default_category_id, -- NULL for custom
  name,
  type,
  icon,
  color,
  emoji
) VALUES (...);
```

### 4. **Initialize Default Categories for New Family**
```javascript
await initializeDefaultCategoriesForFamily(familyId);
// Copies all default_categories to the family's categories table
```

**SQL Logic:**
```sql
-- 1. Fetch all default_categories
SELECT * FROM default_categories;

-- 2. Create family instances
INSERT INTO categories (
  family_id,
  default_category_id, -- Link to default
  name,
  type,
  icon,
  color,
  emoji
)
SELECT $familyId, dc.* FROM default_categories dc;
```

### 5. **Soft Delete a Category**
```javascript
await softDeleteCategory(categoryId, familyId, userId);
// Sets is_deleted = TRUE
// Preserves category for historical transactions
```

**SQL Update:**
```sql
UPDATE categories
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = $userId
WHERE category_id = $categoryId
  AND family_id = $familyId;
```

---

## AI Transaction Processing

When the WhatsApp tracker extracts a transaction from user input:

### Step 1: AI Extracts Category Name
```javascript
const aiResponse = {
  type: 'debit',
  amount: 500,
  category: 'Food & Dining', // AI-suggested category
  // ...
};
```

### Step 2: Find or Create Category
```javascript
const categoryId = await getOrCreateCategory(
  aiResponse.category,
  user.family_id
);
```

**Logic:**
1. Search for existing category (case-insensitive)
2. If found: Use existing category_id
3. If not found: Create new custom category
4. Determine type (income/expense) from context
5. Assign appropriate emoji

### Step 3: Save Transaction
```javascript
await insertTransaction({
  family_id: user.family_id,
  user_id: user.user_id,
  amount: aiResponse.amount,
  type: aiResponse.type,
  category_id: categoryId, // ← Linked category
  transaction_date: aiResponse.date,
  description: aiResponse.description,
});
```

---

## Best Practices

### ✅ **DO:**
- Always filter by `is_deleted = FALSE` when querying categories
- Use soft delete instead of hard delete
- Preserve category_id in historical transactions
- Initialize default categories when creating a new family
- Allow custom categories for flexibility

### ❌ **DON'T:**
- Hard delete categories (breaks transaction history)
- Modify default_categories table (system-wide data)
- Skip the migration (tracker requires is_deleted columns)
- Query categories without family_id filter (performance)

---

## Database Queries Cheat Sheet

### Get all active categories for a family
```sql
SELECT * FROM categories
WHERE family_id = 'xxx'
  AND is_deleted = FALSE
ORDER BY display_order, name;
```

### Get default categories
```sql
SELECT * FROM default_categories
ORDER BY display_order;
```

### Get transactions with category names
```sql
SELECT
  t.*,
  c.name as category_name,
  c.emoji as category_emoji,
  c.type as category_type
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.category_id
WHERE t.family_id = 'xxx'
  AND c.is_deleted = FALSE
ORDER BY t.transaction_date DESC;
```

### Count transactions per category
```sql
SELECT
  c.name,
  c.emoji,
  COUNT(t.transaction_id) as transaction_count,
  SUM(t.amount) as total_amount
FROM categories c
LEFT JOIN transactions t ON c.category_id = t.category_id
WHERE c.family_id = 'xxx'
  AND c.is_deleted = FALSE
GROUP BY c.category_id, c.name, c.emoji
ORDER BY total_amount DESC;
```

---

## Troubleshooting

### Error: "column is_deleted does not exist"
**Solution:** Run the migration:
```bash
psql -f /path/to/Couplecents/db/categories_simplified_migration.sql
```

### Family has no categories
**Solution:** Initialize default categories:
```javascript
await initializeDefaultCategoriesForFamily(familyId);
```

### Custom category not found
**Check:** Category might be soft-deleted
```sql
SELECT * FROM categories
WHERE family_id = 'xxx'
  AND name ILIKE '%search%'
  AND is_deleted = TRUE; -- Check deleted ones
```

---

**Last Updated:** December 25, 2025
