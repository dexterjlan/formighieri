#!/usr/bin/env bash
# Backup do banco Supabase de produção (pg_dump), restore no DEV (schema prod_backup)
# e conferência de COUNT(*) por tabela.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$ROOT/scripts/backup-prod-db.env}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/opt/libpq/bin:/usr/local/bin:$PATH"
export PGOPTIONS="${PGOPTIONS:--c statement_timeout=600000}"

log_file=""

log() {
    local line
    line="$(printf '[%s] %s' "$(date '+%Y-%m-%d %H:%M:%S')" "$*")"
    printf '%s\n' "$line"
    if [[ -n "$log_file" ]]; then
        printf '%s\n' "$line" >> "$log_file"
    fi
}

fail() {
    log "ERRO: $*" >&2
    exit 1
}

step() {
    log "======== $* ========"
}

if [[ ! -f "$ENV_FILE" ]]; then
    fail "Arquivo de configuração não encontrado: $ENV_FILE
Copie scripts/backup-prod-db.env.example para scripts/backup-prod-db.env e preencha a URL do banco."
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

DB_URL="${SUPABASE_DB_URL_PROD:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Formighieri/backups/prod-db}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_SCHEMAS="${BACKUP_SCHEMAS:-public}"
VERIFY_RESTORE_DEV="${VERIFY_RESTORE_DEV:-1}"
RESTORE_DEV_SCHEMA="${RESTORE_DEV_SCHEMA:-prod_backup}"

if [[ -z "$DB_URL" ]] || [[ "$DB_URL" == *'\[SENHA\]'* ]] || [[ "$DB_URL" == *'\[PROJECT_REF\]'* ]]; then
    fail "Preencha SUPABASE_DB_URL_PROD em $ENV_FILE com a conexão Direct de produção."
fi

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump não encontrado. Instale com: brew install libpq && brew link --force libpq"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore não encontrado. Instale com: brew install libpq && brew link --force libpq"
command -v psql >/dev/null 2>&1 || fail "psql não encontrado. Instale com: brew install libpq && brew link --force libpq"
command -v python3 >/dev/null 2>&1 || fail "python3 não encontrado."

mkdir -p "$BACKUP_DIR"

stamp="$(date '+%Y%m%d-%H%M')"
prefix="$BACKUP_DIR/formighieri-prod-$stamp"
dump_file="$prefix.dump"
log_file="$prefix.log"
counts_prod="$prefix.counts.tsv"

: > "$log_file"
log "Início do backup de produção (stamp $stamp)"
log "Pasta: $BACKUP_DIR"
log "Log: $log_file"

schema_args=()
IFS=',' read -r -a schema_list <<< "$BACKUP_SCHEMAS"
for schema in "${schema_list[@]}"; do
    schema="${schema// /}"
    [[ -n "$schema" ]] && schema_args+=(--schema="$schema")
done

prod_url="$(
    DB_URL="$DB_URL" SUPABASE_POOLER_REGION="${SUPABASE_POOLER_REGION:-aws-1-sa-east-1}" \
        python3 "$ROOT/scripts/supabase-session-url.py"
)"

if [[ "$DB_URL" == *'db.'*'supabase.co'* ]]; then
    log "Conexão Direct é IPv6; usando Session pooler (${SUPABASE_POOLER_REGION:-aws-1-sa-east-1})."
fi

step "1/3 Dump de produção"
log "Gerando dump → $dump_file"
pg_dump "$prod_url" \
    --format=custom \
    --no-owner \
    --no-acl \
    --verbose \
    "${schema_args[@]}" \
    --file="$dump_file" \
    >>"$log_file" 2>&1

[[ -s "$dump_file" ]] || fail "Dump gerado está vazio. Veja $log_file"

shasum -a 256 "$dump_file" | awk '{print $1}' > "${dump_file}.sha256"
size="$(du -h "$dump_file" | awk '{print $1}')"
log "Dump concluído ($size): $dump_file"

if [[ "$VERIFY_RESTORE_DEV" != "1" ]]; then
    log "VERIFY_RESTORE_DEV=0 — restore no DEV e comparação pulados."
else
    DEV_URL="${SUPABASE_DB_URL_DEV:-}"
    if [[ -z "$DEV_URL" ]] || [[ "$DEV_URL" == *'\[SENHA_DEV\]'* ]] || [[ "$DEV_URL" == *'\[PROJECT_REF_DEV\]'* ]]; then
        fail "Preencha SUPABASE_DB_URL_DEV em $ENV_FILE para restaurar e conferir no DEV.
Para pular essa etapa, defina VERIFY_RESTORE_DEV=0."
    fi

    log "Contando linhas em public (logo após o dump)..."
    COMPARE_DB_URL="$prod_url" COMPARE_SCHEMA="public" COMPARE_OUT="$counts_prod" \
        python3 "$ROOT/scripts/compare-schema-counts.py" export --log "$log_file" --append
    log "Counts da origem: $counts_prod"

    step "2/3 Restore no DEV (schema ${RESTORE_DEV_SCHEMA})"
    log "Recriando ${RESTORE_DEV_SCHEMA} e aplicando o dump..."
    if ! "$ROOT/scripts/restore-prod-db.sh" \
            "$dump_file" \
            --dev \
            --schema "$RESTORE_DEV_SCHEMA" \
            --drop-schema \
            --yes \
            --log "$log_file" \
            --append-log
    then
        fail "Restore no DEV falhou. Veja $log_file"
    fi
    log "Restore concluído."

    step "3/3 Comparação de COUNT(*) (prod após dump × ${RESTORE_DEV_SCHEMA})"
    dev_url="$(
        DB_URL="$DEV_URL" SUPABASE_POOLER_REGION="${SUPABASE_POOLER_REGION_DEV:-${SUPABASE_POOLER_REGION:-aws-1-sa-east-1}}" \
            python3 "$ROOT/scripts/supabase-session-url.py"
    )"
    if ! COMPARE_FROM_FILE="$counts_prod" COMPARE_TO_URL="$dev_url" COMPARE_TO_SCHEMA="$RESTORE_DEV_SCHEMA" \
            python3 "$ROOT/scripts/compare-schema-counts.py" compare --log "$log_file" --append
    then
        fail "Comparação de COUNT(*) falhou. Veja $log_file"
    fi
    log "Comparação OK."
fi

if [[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_KEEP_DAYS > 0 )); then
    find "$BACKUP_DIR" -type f \( \
            -name 'formighieri-prod-*.dump' \
            -o -name 'formighieri-prod-*.dump.sha256' \
            -o -name 'formighieri-prod-*.log' \
            -o -name 'formighieri-prod-*.tsv' \
        \) -mtime "+$BACKUP_KEEP_DAYS" -delete
    log "Arquivos com mais de ${BACKUP_KEEP_DAYS} dia(s) foram removidos."
fi

step "Concluído"
log "Log: $log_file"
