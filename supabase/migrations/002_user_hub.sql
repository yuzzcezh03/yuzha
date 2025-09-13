-- User Hub Migration: Config Sync, Assets, and Extended Form Support
-- This migration adds tables for device sync, asset management, and modular form data

-- User Configurations Table (Two-way sync)
CREATE TABLE IF NOT EXISTS user_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT 'default',
    config_type TEXT NOT NULL, -- 'settings', 'sync-data', 'preferences'
    config_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, profile_name, config_type)
);

-- User Assets Table (File/Image storage)
CREATE TABLE IF NOT EXISTS user_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_name TEXT NOT NULL,
    asset_type TEXT NOT NULL, -- 'image', 'document', 'config-file'
    file_path TEXT NOT NULL, -- Storage bucket path
    file_size BIGINT,
    mime_type TEXT,
    metadata JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Module Form Submissions (Extended from existing)
CREATE TABLE IF NOT EXISTS module_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    module_name TEXT NOT NULL, -- 'module-a', 'module-b', 'feedback'
    submission_data JSONB NOT NULL DEFAULT '{}',
    submission_status TEXT DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_configs
CREATE POLICY "Users can view own configs"
    ON user_configs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own configs" 
    ON user_configs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own configs"
    ON user_configs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own configs"
    ON user_configs FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for user_assets
CREATE POLICY "Users can view own assets"
    ON user_assets FOR SELECT
    USING (auth.uid() = user_id OR is_public = TRUE);

CREATE POLICY "Users can insert own assets"
    ON user_assets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
    ON user_assets FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets"
    ON user_assets FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for module_submissions
CREATE POLICY "Users can view own submissions"
    ON module_submissions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions"
    ON module_submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions"
    ON module_submissions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX idx_user_configs_type ON user_configs(user_id, config_type);
CREATE INDEX idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX idx_user_assets_type ON user_assets(user_id, asset_type);
CREATE INDEX idx_module_submissions_user_id ON module_submissions(user_id);
CREATE INDEX idx_module_submissions_module ON module_submissions(user_id, module_name);

-- Updated timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_configs_updated_at 
    BEFORE UPDATE ON user_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_assets_updated_at 
    BEFORE UPDATE ON user_assets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_module_submissions_updated_at 
    BEFORE UPDATE ON module_submissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();