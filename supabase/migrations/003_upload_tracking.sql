-- Upload Tracking & Retry System
-- This migration adds tables to track upload status and enable retry mechanisms

-- Upload Status Tracking Table
CREATE TABLE IF NOT EXISTS upload_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Supabase storage path
    drive_file_id TEXT, -- Google Drive file ID (null if failed)
    drive_url TEXT, -- Google Drive public URL (null if failed)
    upload_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'drive_success', 'drive_failed', 'cleanup_done'
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ
);

-- Upload Logs Table (for monitoring)
CREATE TABLE IF NOT EXISTS upload_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    upload_id UUID REFERENCES upload_status(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL, -- 'info', 'warning', 'error'
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE upload_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for upload_status
CREATE POLICY "Users can view own upload status"
    ON upload_status FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage upload status"
    ON upload_status FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for upload_logs  
CREATE POLICY "Users can view own upload logs"
    ON upload_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM upload_status 
        WHERE upload_status.id = upload_logs.upload_id 
        AND upload_status.user_id = auth.uid()
    ));

CREATE POLICY "Service role can manage upload logs"
    ON upload_logs FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes for performance
CREATE INDEX idx_upload_status_user_id ON upload_status(user_id);
CREATE INDEX idx_upload_status_status ON upload_status(upload_status);
CREATE INDEX idx_upload_status_retry ON upload_status(upload_status, retry_count) WHERE upload_status = 'drive_failed';
CREATE INDEX idx_upload_logs_upload_id ON upload_logs(upload_id);

-- Updated timestamp trigger for upload_status
CREATE TRIGGER update_upload_status_updated_at 
    BEFORE UPDATE ON upload_status 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get failed uploads for retry
CREATE OR REPLACE FUNCTION get_failed_uploads(max_retries INTEGER DEFAULT 3)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    file_name TEXT,
    file_path TEXT,
    retry_count INTEGER,
    error_message TEXT
)
LANGUAGE sql
AS $$
    SELECT 
        us.id,
        us.user_id,
        us.file_name,
        us.file_path,
        us.retry_count,
        us.error_message
    FROM upload_status us
    WHERE us.upload_status = 'drive_failed'
    AND us.retry_count < max_retries
    AND (us.last_retry_at IS NULL OR us.last_retry_at < NOW() - INTERVAL '1 hour')
    ORDER BY us.created_at ASC;
$$;