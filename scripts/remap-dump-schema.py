#!/usr/bin/env python3
"""Reescreve um SQL de pg_restore do schema public para outro schema."""
import re
import sys

SCHEMA_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
RESERVED = {
    "public", "pg_catalog", "information_schema", "auth", "storage",
    "extensions", "graphql", "graphql_public", "realtime", "vault",
    "supabase_functions", "net", "cron",
}
EXTERNAL_SCHEMAS = (
    "auth", "storage", "supabase_functions", "realtime", "vault",
    "extensions", "net", "cron", "graphql", "graphql_public",
)
EXTERNAL_RE = "|".join(EXTERNAL_SCHEMAS)

SKIP_PREFIXES = (
    "CREATE EXTENSION",
    "COMMENT ON EXTENSION",
    "ALTER EXTENSION",
    "CREATE SCHEMA public",
    "DROP SCHEMA public",
    "ALTER SCHEMA public",
    "COMMENT ON SCHEMA public",
)


def strip_external_foreign_keys(sql: str) -> str:
    sql = re.sub(
        rf"ALTER TABLE(?: ONLY)?\s+\S+\s+ADD CONSTRAINT\s+\S+\s+FOREIGN KEY\s*\([^)]+\)\s+REFERENCES\s+(?:{EXTERNAL_RE})\.[\s\S]*?;\n?",
        "",
        sql,
        flags=re.I,
    )
    sql = re.sub(
        rf",?\s*CONSTRAINT\s+[\w.\"]+\s+FOREIGN KEY\s*\([^)]+\)\s+REFERENCES\s+(?:{EXTERNAL_RE})\.[\w.\"]+\s*(?:\([^)]*\))?(?:\s+ON\s+DELETE\s+[\w\s]+)?(?:\s+ON\s+UPDATE\s+[\w\s]+)?",
        "",
        sql,
        flags=re.I,
    )
    sql = re.sub(
        rf",?\s*FOREIGN KEY\s*\([^)]+\)\s+REFERENCES\s+(?:{EXTERNAL_RE})\.[\w.\"]+\s*(?:\([^)]*\))?(?:\s+ON\s+DELETE\s+[\w\s]+)?(?:\s+ON\s+UPDATE\s+[\w\s]+)?",
        "",
        sql,
        flags=re.I,
    )
    sql = re.sub(r",(\s*)\);", r"\1);", sql)
    return sql


def remap_sql(sql: str, target: str) -> str:
    sql = strip_external_foreign_keys(sql)
    out_lines = []
    for line in sql.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.startswith(SKIP_PREFIXES):
            continue
        line = re.sub(r"\bSET search_path\s*=\s*public\b", f"SET search_path = {target}", line, flags=re.I)
        line = re.sub(r"\bSET search_path\s+TO\s+public\b", f"SET search_path TO {target}", line, flags=re.I)
        line = re.sub(r"\bON SCHEMA public\b", f"ON SCHEMA {target}", line, flags=re.I)
        line = re.sub(r"\bIN SCHEMA public\b", f"IN SCHEMA {target}", line, flags=re.I)
        line = re.sub(r"\bSCHEMA public\b", f"SCHEMA {target}", line, flags=re.I)
        line = re.sub(r'"public"\.', f'"{target}".', line)
        line = re.sub(r"\bpublic\.", f"{target}.", line)
        out_lines.append(line)
    body = "".join(out_lines)
    return (
        "SET session_replication_role = replica;\n"
        + body
        + "\nSET session_replication_role = origin;\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        print("Uso: remap-dump-schema.py NOME_DO_SCHEMA < dump.sql", file=sys.stderr)
        sys.exit(1)
    target = sys.argv[1]
    if not SCHEMA_RE.fullmatch(target) or target.lower() in RESERVED:
        print(f"Schema inválido ou reservado: {target}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(remap_sql(sys.stdin.read(), target))


if __name__ == "__main__":
    main()
