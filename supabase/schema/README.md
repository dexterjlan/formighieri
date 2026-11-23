# Schema `public` (DEV)

Snapshot **somente DDL** do banco de desenvolvimento (espelho de produção), para consulta e backup no git.

- **`public.sql`** — dump completo (`pg_dump --schema-only`)
- Pastas **`00-init` … `07-rls`** — split por tipo de objeto (`split-schema.js`)
- **`APPLY-ORDER.md`** — manifesto gerado pelo split

## Atualizar localmente

```bash
# senha em supabase/.db-dev-password.local ou SUPABASE_DB_PASSWORD
./supabase/scripts/dump-dev-schema.sh
```

Não é fluxo de migração automática em prod — mudanças novas seguem `supabase/feats/` + `PENDING-PROD-SQL.md` (local).