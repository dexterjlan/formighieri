#!/usr/bin/env bash
# Restaura um dump .dump.
# Sem --schema: recria o schema public no banco de destino (destrutivo).
# Com --schema NOME: grava a cópia nesse schema, sem alterar o public.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$ROOT/scripts/backup-prod-db.env}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/opt/libpq/bin:/usr/local/bin:$PATH"

log() {
    local line
    line="$(printf '[%s] %s' "$(date '+%Y-%m-%d %H:%M:%S')" "$*")"
    printf '%s\n' "$line"
    if [[ -n "${restore_log:-}" ]]; then
        printf '%s\n' "$line" >> "$restore_log"
    fi
}

fail() {
    log "ERRO: $*" >&2
    exit 1
}

confirm_restore() {
    if [[ "$assume_yes" == "1" ]]; then
        log "Confirmação automática (--yes)."
        return
    fi
    read -r -p "Digite RESTAURAR para continuar: " confirm
    [[ "$confirm" == "RESTAURAR" ]] || fail "Restore cancelado."
}

run_psql() {
    if [[ -n "${restore_log:-}" ]]; then
        psql "$db_url" -v ON_ERROR_STOP=1 "$@" >>"$restore_log" 2>&1
    else
        psql "$db_url" -v ON_ERROR_STOP=1 "$@"
    fi
}

usage() {
    fail "Uso:
  $0 /caminho/dump.dump --dev --schema prod_backup
  $0 /caminho/dump.dump                  # destrutivo no public de produção

Opções:
  --dev              usa SUPABASE_DB_URL_DEV
  --schema NOME      restaura nesse schema (não mexe no public)
  --drop-schema      apaga o schema de destino antes (só com --schema)
  --yes              não pede confirmação (uso pelo backup automático)
  --log ARQUIVO      grava a saída do restore neste arquivo
  --append-log       anexa ao arquivo de --log (não apaga o conteúdo)"
}

dump_file=""
target="prod"
restore_schema=""
drop_schema="0"
assume_yes="0"
restore_log=""
append_log="0"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev) target="dev"; shift ;;
        --schema)
            [[ $# -ge 2 ]] || usage
            restore_schema="$2"
            shift 2
            ;;
        --drop-schema) drop_schema="1"; shift ;;
        --yes) assume_yes="1"; shift ;;
        --log)
            [[ $# -ge 2 ]] || usage
            restore_log="$2"
            shift 2
            ;;
        --append-log) append_log="1"; shift ;;
        -h|--help) usage ;;
        *)
            if [[ -z "$dump_file" ]]; then
                dump_file="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[[ -n "$dump_file" ]] || usage
[[ -s "$dump_file" ]] || fail "Arquivo de dump não encontrado ou vazio: $dump_file"

if [[ -n "$restore_log" ]]; then
    mkdir -p "$(dirname "$restore_log")"
    if [[ "$append_log" != "1" ]]; then
        : > "$restore_log"
    fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
    fail "Arquivo de configuração não encontrado: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ "$target" == "dev" ]]; then
    DB_URL="${SUPABASE_DB_URL_DEV:-}"
    POOLER_REGION="${SUPABASE_POOLER_REGION_DEV:-${SUPABASE_POOLER_REGION:-aws-1-sa-east-1}}"
    [[ -n "$DB_URL" ]] || fail "Preencha SUPABASE_DB_URL_DEV em $ENV_FILE com a conexão Direct de desenvolvimento."
else
    DB_URL="${SUPABASE_DB_URL_PROD:-}"
    POOLER_REGION="${SUPABASE_POOLER_REGION:-aws-1-sa-east-1}"
    [[ -n "$DB_URL" ]] || fail "Preencha SUPABASE_DB_URL_PROD em $ENV_FILE."
    if [[ -z "$restore_schema" ]]; then
        log "ATENÇÃO: restore no public de PRODUÇÃO."
    fi
fi

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore não encontrado. Instale com: brew install libpq && brew link --force libpq"
command -v psql >/dev/null 2>&1 || fail "psql não encontrado. Instale com: brew install libpq && brew link --force libpq"
command -v python3 >/dev/null 2>&1 || fail "python3 não encontrado."

if [[ -f "${dump_file}.sha256" ]]; then
    expected="$(tr -d '[:space:]' < "${dump_file}.sha256")"
    actual="$(shasum -a 256 "$dump_file" | awk '{print $1}')"
    [[ "$expected" == "$actual" ]] || fail "Checksum SHA-256 não confere para $dump_file"
    log "Checksum SHA-256 ok."
fi

db_url="$(
    DB_URL="$DB_URL" SUPABASE_POOLER_REGION="$POOLER_REGION" \
        python3 "$ROOT/scripts/supabase-session-url.py"
)"

if [[ -n "$restore_schema" ]]; then
    if [[ ! "$restore_schema" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        fail "Nome de schema inválido: $restore_schema"
    fi
    log "Destino: banco ${target} | schema ${restore_schema} (o public não será alterado)"
    log "Dump: $dump_file"
    confirm_restore

    if [[ "$drop_schema" == "1" ]]; then
        log "Recriando schema ${restore_schema}..."
        run_psql -c "DROP SCHEMA IF EXISTS ${restore_schema} CASCADE; CREATE SCHEMA ${restore_schema};"
    else
        log "Garantindo schema ${restore_schema}..."
        run_psql -c "CREATE SCHEMA IF NOT EXISTS ${restore_schema};"
    fi

    sql_file="$(mktemp -t formighieri-restore.XXXXXX.sql)"
    trap 'rm -f "$sql_file"' EXIT
    log "Convertendo dump para o schema ${restore_schema}..."
    if [[ -n "$restore_log" ]]; then
        pg_restore --no-owner --no-acl --schema=public -f - "$dump_file" 2>>"$restore_log" \
            | python3 "$ROOT/scripts/remap-dump-schema.py" "$restore_schema" \
            > "$sql_file"
    else
        pg_restore --no-owner --no-acl --schema=public -f - "$dump_file" \
            | python3 "$ROOT/scripts/remap-dump-schema.py" "$restore_schema" \
            > "$sql_file"
    fi
    log "SQL gerado: $(wc -c < "$sql_file" | tr -d ' ') bytes"

    log "Aplicando SQL no schema ${restore_schema}..."
    run_psql -f "$sql_file"

    log "Restore concluído no schema ${restore_schema}."
    if [[ "$assume_yes" != "1" ]]; then
        echo "Consulta de teste:  SET search_path TO ${restore_schema};  SELECT count(*) FROM \"salesOrders\";"
        echo "Arquivos do Storage não entram neste dump."
    fi
    exit 0
fi

log "Este restore APAGA e recria as tabelas do dump no schema public do banco ${target}."
log "Dump: $dump_file"
confirm_restore

log "Restaurando dump no schema public..."
if [[ -n "$restore_log" ]]; then
    pg_restore \
        --dbname="$db_url" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --verbose \
        "$dump_file" >>"$restore_log" 2>&1
else
    pg_restore \
        --dbname="$db_url" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --verbose \
        "$dump_file"
fi

log "Restore concluído."
echo "Arquivos do Storage (imagens, anexos) não entram neste dump — só o banco Postgres."
