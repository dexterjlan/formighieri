-- Execute uma vez no Supabase SQL Editor
ALTER TABLE "OrderRequest"
ADD COLUMN IF NOT EXISTS "responseAt" timestamptz;
