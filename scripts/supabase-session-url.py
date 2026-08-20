#!/usr/bin/env python3
"""Converte a URL Direct IPv6 do Supabase para Session pooler IPv4."""
import os
import re
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

url = os.environ.get("DB_URL", "").strip()
region = os.environ.get("SUPABASE_POOLER_REGION", "aws-1-sa-east-1").strip() or "aws-1-sa-east-1"
parsed = urlparse(url)
host = parsed.hostname or ""
match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", host)
if match:
    ref = match.group(1)
    user = parsed.username or "postgres"
    if not user.startswith("postgres."):
        user = f"postgres.{ref}"
    password = parsed.password or ""
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    pooler_host = f"{region}.pooler.supabase.com" if region.startswith("aws-") else f"aws-0-{region}.pooler.supabase.com"
    netloc = f"{quote(user, safe='._-')}:{quote(password, safe='')}@{pooler_host}:5432"
    print(urlunparse(("postgresql", netloc, parsed.path or "/postgres", "", urlencode(query), "")))
else:
    if "sslmode=" not in url:
        url = f"{url}&sslmode=require" if "?" in url else f"{url}?sslmode=require"
    print(url)
