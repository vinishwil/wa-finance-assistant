-- =============================================
-- WhatsApp Finance Assistant Database Schema
-- Integrates with Couplecents Database
-- =============================================
--
-- This schema adds WhatsApp integration capabilities to the existing
-- Couplecents database. It assumes core tables already exist.
--
-- EXISTING TABLES (from Couplecents):
-- - users, families, family_members, transactions, budgets
-- - default_categories, categories, goals, recurring_transactions
-- - notifications, ai_usage, app_config, deletion_requests
--
-- NEW TABLES (WhatsApp Integration):
-- - whatsapp_links: Links WhatsApp numbers to user accounts
-- - event_logs: System event logs for WhatsApp message processing
--
-- =============================================

-- =============================================
-- WHATSAPP LINKS TABLE
-- Stores WhatsApp number to user account mappings
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL UNIQUE,
    linked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE,
    verification_code TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for WhatsApp links
CREATE INDEX IF NOT EXISTS idx_whatsapp_links_number ON whatsapp_links(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_links_user ON whatsapp_links(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_links_verified ON whatsapp_links(verified);

-- Enable RLS
ALTER TABLE whatsapp_links ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own WhatsApp links
CREATE POLICY IF NOT EXISTS "Users can view own whatsapp links" ON whatsapp_links
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own whatsapp links" ON whatsapp_links
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own whatsapp links" ON whatsapp_links
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- EVENT LOGS TABLE
-- Logs WhatsApp message events for debugging
-- =============================================

CREATE TABLE IF NOT EXISTS event_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for event logs
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at DESC);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for whatsapp_links updated_at
DROP TRIGGER IF EXISTS update_whatsapp_links_updated_at ON whatsapp_links;
CREATE TRIGGER update_whatsapp_links_updated_at
    BEFORE UPDATE ON whatsapp_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- STATISTICS FUNCTION
-- Get transaction statistics for a user (via WhatsApp)
-- =============================================

CREATE OR REPLACE FUNCTION get_user_transaction_stats(
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    total_credit DECIMAL,
    total_debit DECIMAL,
    transaction_count BIGINT,
    category_breakdown JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) AS total_credit,
        COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS total_debit,
        COUNT(*)::BIGINT AS transaction_count,
        jsonb_agg(
            jsonb_build_object(
                'category', COALESCE(c.name, 'Uncategorized'),
                'category_id', c.category_id,
                'amount', SUM(t.amount),
                'count', COUNT(*)
            )
        ) AS category_breakdown
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.category_id
    WHERE t.user_id = p_user_id
        AND t.transaction_date BETWEEN p_start_date AND p_end_date
    GROUP BY c.category_id, c.name;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- GRANTS
-- =============================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE whatsapp_links IS 'WhatsApp phone numbers linked to user accounts for messaging integration';
COMMENT ON TABLE event_logs IS 'System event logs for WhatsApp message processing and debugging';
