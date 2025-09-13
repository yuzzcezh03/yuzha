-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create form_submissions table
CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
    description TEXT CHECK (length(description) <= 500),
    category TEXT NOT NULL CHECK (length(category) >= 1 AND length(category) <= 50),
    drive_url TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own submissions" ON form_submissions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions" ON form_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions" ON form_submissions
    FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_form_submissions_user_id ON form_submissions(user_id);
CREATE INDEX idx_form_submissions_submitted_at ON form_submissions(submitted_at DESC);
CREATE INDEX idx_form_submissions_category ON form_submissions(category);

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('form-photos', 'form-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for form-photos bucket
CREATE POLICY "Users can upload their own photos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'form-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'form-photos');

CREATE POLICY "Users can update their own photos" ON storage.objects
    FOR UPDATE USING (bucket_id = 'form-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own photos" ON storage.objects
    FOR DELETE USING (bucket_id = 'form-photos' AND auth.uid()::text = (storage.foldername(name))[1]);