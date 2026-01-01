# Schema Audit Report - WhatsApp Finance Assistant
**Date**: December 25, 2025

## Executive Summary
This document audits the `supabaseService.js` methods against the actual Couplecents database schema (including migrations).

---

## Table Schemas (After Migrations)

### 1. **users** table (Couplecents)
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  avatar_url TEXT,
  phone NUMERIC,
  theme TEXT
);
```
**Status**: ✅ Used by tracker (queries only)

---

### 2. **families** table (Couplecents + Tracker extensions)
```sql
CREATE TABLE families (
  family_id UUID PRIMARY KEY,
  family_name TEXT NOT NULL,
  family_code TEXT NOT NULL,
  symbol TEXT,
  avatar TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  family_passcode TEXT DEFAULT '000000',
  currency TEXT DEFAULT '₹',
  restrict_join BOOLEAN DEFAULT FALSE,
  -- Tracker additions:
  subscription_type TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  subscription_end_date TIMESTAMP WITH TIME ZONE
);
```
**Status**: ✅ Tracker adds subscription columns (correct)

---

### 3. **default_categories** table (Couplecents)
```sql
CREATE TABLE default_categories (
  default_category_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  emoji TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  display_order INTEGER
);
```
**Status**: ✅ Used by tracker (read-only)

---

### 4. **categories** table (Couplecents + Migration)
```sql
CREATE TABLE categories (
  category_id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(family_id),
  default_category_id UUID REFERENCES default_categories(default_category_id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  emoji TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  display_order INTEGER,
  -- Added by migration (categories_simplified_migration.sql):
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES users(user_id)
);
```
**Status**: ✅ Tracker expects these columns (correct after migration)

---

### 5. **transactions** table (Couplecents)
```sql
CREATE TABLE transactions (
  transaction_id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(family_id),
  user_id UUID REFERENCES users(user_id),
  recipient_id UUID,
  wallet_id UUID REFERENCES users(user_id),
  category_id UUID REFERENCES categories(category_id),
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  description TEXT,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(user_id),
  updated_by UUID REFERENCES users(user_id)
);
```
**Status**: ✅ Tracker methods align correctly

---

### 6. **whatsapp_links** table (Tracker-owned)
```sql
CREATE TABLE whatsapp_links (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT FALSE,
  verification_code TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```
**Status**: ✅ Tracker-owned (correct)

---

### 7. **event_logs** table (Tracker-owned)
```sql
CREATE TABLE event_logs (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ
);
```
**Status**: ✅ Tracker-owned (correct)

---

## Method Audit Results

### ✅ **CORRECT Methods** (No changes needed)

1. **getUserByWhatsapp()** - Queries whatsapp_links + users
2. **getUserByEmail()** - Queries users table
3. **createWhatsappLink()** - Inserts/updates whatsapp_links
4. **verifyWhatsappLink()** - Updates whatsapp_links
5. **checkSubscription()** - Queries users + families (uses tracker's subscription columns)
6. **insertTransaction()** - Inserts into transactions (all columns match)
7. **getCategoriesForFamily()** - Queries categories with is_deleted filter ✅
8. **findCategoryIdByName()** - Queries categories with is_deleted filter ✅
9. **addCategoryToFamily()** - Inserts into categories (columns match) ✅
10. **initializeDefaultCategoriesForFamily()** - Copies default_categories to categories ✅
11. **getOrCreateCategory()** - Uses findCategoryIdByName + addCategoryToFamily ✅
12. **softDeleteCategory()** - Updates is_deleted, deleted_at, deleted_by ✅
13. **logEvent()** - Inserts into event_logs
14. **getLastTransaction()** - Queries transactions
15. **deleteTransaction()** - Deletes from transactions
16. **updateTransaction()** - Updates transactions
17. **getActiveWhatsappUsers()** - Queries whatsapp_links + users

---

## Critical Findings

### ⚠️ **IMPORTANT**: Migration Dependency

The tracker code **REQUIRES** that the Couplecents database has run the migration:
- `categories_simplified_migration.sql` (or `backup_and_migrate.sql`)

This migration adds the following columns to the `categories` table:
- `is_deleted BOOLEAN DEFAULT FALSE`
- `deleted_at TIMESTAMP WITH TIME ZONE`
- `deleted_by UUID REFERENCES users(user_id)`

**Without this migration, the tracker will fail when:**
- Calling `getCategoriesForFamily()` - filters by `is_deleted`
- Calling `findCategoryIdByName()` - filters by `is_deleted`
- Calling `softDeleteCategory()` - tries to update non-existent columns

---

## Category System Architecture

### How Categories Work (After Understanding Both Systems)

1. **default_categories** (System-wide templates)
   - Defined once in the system
   - Contains standard categories like "Food", "Transport", etc.
   - Read-only for families

2. **categories** (Family-specific instances)
   - Each family gets their own category records
   - Can be copies of default_categories (default_category_id IS NOT NULL)
   - Can be custom categories (default_category_id IS NULL)
   - Supports soft delete via is_deleted flag

3. **Migration Strategy** (from Couplecents)
   - Old system: Each family had duplicate category records
   - New system: Transactions/budgets reference default_category_id directly
   - Tracker uses the NEW system (expects is_deleted columns)

---

## Recommendations

### ✅ **No Code Changes Needed** - Everything is Correct!

The tracker's `supabaseService.js` is **already correctly implemented** assuming:

1. ✅ Couplecents database has run the category migration
2. ✅ The `categories` table has `is_deleted`, `deleted_at`, `deleted_by` columns
3. ✅ Subscription columns exist in `families` table

### 📝 **Documentation Additions Needed**

1. **Update DB_SCHEMA_NOTES.md** to document:
   - Required migrations from Couplecents
   - Dependency on is_deleted columns
   - Category system architecture

2. **Add to README.md** prerequisites:
   - Database must have category migration applied
   - List required Couplecents SQL files that must be run first

3. **Create SETUP.md** section:
   - Step 1: Run Couplecents core schema
   - Step 2: Run Couplecents migrations (especially categories_simplified_migration.sql)
   - Step 3: Run tracker schema.sql

---

## Testing Checklist

- [ ] Verify `categories` table has `is_deleted` column in production
- [ ] Verify `families` table has subscription columns
- [ ] Test category creation for new families
- [ ] Test soft delete of categories
- [ ] Test transaction creation with categories
- [ ] Test WhatsApp linking flow

---

## Conclusion

**Status**: ✅ **ALL METHODS ARE CORRECT**

The tracker's database service layer is properly implemented and aligned with the Couplecents schema **after migrations**. The only requirement is ensuring the production database has the necessary migrations applied before deploying the tracker.

The use of `is_deleted`, `deleted_at`, and `deleted_by` columns is **correct and expected** based on Couplecents migration files.
