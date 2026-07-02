-- Execute uma vez no Supabase SQL Editor
ALTER TABLE "orderConversations"
ADD COLUMN IF NOT EXISTS "responseAt" timestamptz;
