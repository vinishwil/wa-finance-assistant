# Database Schema Notes - WhatsApp Finance Assistant

## Overview
This document explains the database architecture for the WhatsApp Finance Assistant and its relationship with the main Couplecents application.

## Shared Database Architecture

The WhatsApp Finance Assistant shares a database with the main Couplecents application. This means:

- **Core tables are owned by Couplecents** and should NOT be duplicated in this project
- The tracker only creates **tracker-specific tables** in `infra/db/schema.sql`
- Both applications connect to the same Supabase instance

## Table Ownership

### Tables Owned by Couplecents (Main App)
These tables are defined in `/Users/vinish/Apps/Couplecents/db/` and should NOT be created by the tracker:

- `users` - User accounts
- `families` - Family groups
- `family_members` - Family membership
- `transactions` - Financial transactions
- `categories` - Family-specific categories
- `default_categories` - System-wide category templates
- `budgets` - Budget tracking
- `recurring_transactions` - Recurring transaction templates
- And other main application tables...

### Tables Owned by WhatsApp Tracker
These tables are defined in `infra/db/schema.sql` and are created/managed by this project:

- `whatsapp_links` - Links WhatsApp phone numbers to user accounts
- `event_logs` - Event logging for debugging and analytics
- `wallets` - Optional wallet tracking (future use)

## Schema Modifications

### Extensions to Existing Tables
The tracker adds the following columns to main application tables:

#### families table
```sql
ALTER TABLE families
ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;
```

These columns are used by the tracker to check if a family has an active subscription to use WhatsApp features.

## What Was Removed

To avoid duplication and maintain separation of concerns, the following were removed from the tracker schema:

1. **Removed RPC Function**: `get_user_transaction_stats`
   - This function was defined but never used in the codebase
   - Removed from both `schema.sql` and `supabaseService.js`

2. **Removed Unnecessary ALTER**: `users.whatsapp_number`
   - Originally added to users table, but not used by the code
   - WhatsApp numbers are stored in the `whatsapp_links` table instead

3. **Removed Duplicate Indexes**
   - Indexes for `transactions`, `categories`, etc. are managed by the main app
   - Only indexes for tracker-owned tables remain

4. **Removed Duplicate Triggers**
   - Triggers for main app tables removed
   - Only triggers for `whatsapp_links` and `wallets` remain

5. **Removed Duplicate RLS Policies**
   - RLS policies for `transactions`, `families`, `categories` removed
   - These should be managed by the main app
   - Only RLS for `whatsapp_links` remains

## Database Setup Instructions

### Prerequisites
Before setting up the tracker, the Couplecents database **MUST** have the following:

1. **Core tables** from Couplecents `/db` folder:
   - users.sql
   - families table.sql
   - categories.sql
   - transaction and budget.sql
   - And other core application tables

2. **REQUIRED MIGRATION** - Category soft delete support:
   - **File**: `/db/categories_simplified_migration.sql` (or `backup_and_migrate.sql`)
   - **Adds**: `is_deleted`, `deleted_at`, `deleted_by` columns to `categories` table
   - **Why**: The tracker uses soft deletes for categories to preserve historical data

### Setup Steps

1. **First**, run all Couplecents core SQL files
2. **Second**, run the category migration:
   ```bash
   psql -h your-db-host -U your-user -d your-db -f /path/to/Couplecents/db/categories_simplified_migration.sql
   ```
3. **Then**, run the tracker schema to add tracker-specific tables:
   ```bash
   psql -h your-db-host -U your-user -d your-db -f infra/db/schema.sql
   ```

## Important Notes

- **Do not duplicate core tables** - They are managed by the main application
- **Changes to shared tables** should be coordinated between both projects
- The tracker uses **Supabase RLS** for security on its own tables
- Both applications should use the same Supabase connection settings
- **CRITICAL**: The `categories` table MUST have soft delete columns (`is_deleted`, `deleted_at`, `deleted_by`) - run the migration if missing
- The tracker expects families to have subscription columns added by tracker schema

## Code Dependencies

The tracker's `supabaseService.js` queries both:
- **Tracker tables**: `whatsapp_links`, `event_logs`
- **Shared tables**: `users`, `families`, `transactions`, `categories`

This is intentional and expected in a shared database architecture.

## Future Considerations

- Consider moving subscription fields to a separate `subscriptions` table in the main app
- The `wallets` table is currently optional and may be removed if not used
- Event logs could potentially be moved to a centralized logging system

---

**Last Updated**: December 25, 2025
