#!/usr/bin/env python3
"""Exporta e compara COUNT(*) de tabelas entre schemas Postgres."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime

LIST_TABLES_SQL = """
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = {schema}
  AND c.relkind IN ('r', 'p')
  AND NOT c.relispartition
ORDER BY 1;
"""


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class StepLog:
    def __init__(self, path: str | None) -> None:
        self.path = path
        if path:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)

    def write(self, message: str) -> None:
        line = f"[{now()}] {message}"
        print(line, flush=True)
        if self.path:
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def quote_literal(name: str) -> str:
    return "'" + name.replace("'", "''") + "'"


def psql(url: str, sql: str) -> str:
    result = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def list_tables(url: str, schema: str) -> list[str]:
    sql = LIST_TABLES_SQL.format(schema=quote_literal(schema))
    return [line for line in psql(url, sql).splitlines() if line]


def count_table(url: str, schema: str, table: str) -> int:
    sql = f"SELECT count(*)::bigint FROM {quote_ident(schema)}.{quote_ident(table)};"
    return int(psql(url, sql).strip())


def export_counts(url: str, schema: str, log: StepLog) -> dict[str, int]:
    log.write(f"Listando tabelas em {schema}...")
    tables = list_tables(url, schema)
    log.write(f"{len(tables)} tabela(s) encontrada(s).")
    counts: dict[str, int] = {}
    for index, table in enumerate(tables, start=1):
        log.write(f"COUNT ({index}/{len(tables)}) {schema}.{table}")
        counts[table] = count_table(url, schema, table)
        log.write(f"  → {counts[table]}")
    return counts


def write_tsv(path: str, counts: dict[str, int]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("table_name\tcount\n")
        for table, n in counts.items():
            fh.write(f"{table}\t{n}\n")


def read_tsv(path: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    with open(path, encoding="utf-8") as fh:
        header = True
        for line in fh:
            line = line.strip()
            if not line:
                continue
            if header:
                header = False
                continue
            table, n = line.split("\t", 1)
            counts[table] = int(n)
    return counts


def fmt(n: int | None) -> str:
    return "—" if n is None else str(n)


def compare(from_counts: dict[str, int], to_counts: dict[str, int], log: StepLog) -> int:
    tables = sorted(set(from_counts) | set(to_counts))
    ok = 0
    mismatches: list[str] = []
    header = f"{'tabela':<42} {'origem':>12} {'destino':>12} {'status'}"
    log.write(header)
    log.write("-" * len(header))
    for table in tables:
        src = from_counts.get(table)
        dst = to_counts.get(table)
        if src is None:
            status = "SÓ_DESTINO"
            mismatches.append(table)
        elif dst is None:
            status = "AUSENTE"
            mismatches.append(table)
        elif src == dst:
            status = "OK"
            ok += 1
        else:
            status = "DIFERE"
            mismatches.append(table)
        log.write(f"{table:<42} {fmt(src):>12} {fmt(dst):>12} {status}")

    log.write("")
    log.write(f"Tabelas origem: {len(from_counts)}")
    log.write(f"Tabelas destino: {len(to_counts)}")
    log.write(f"OK: {ok}")
    log.write(f"Divergências: {len(mismatches)}")
    if mismatches:
        log.write("Tabelas com divergência: " + ", ".join(mismatches))
        return 1
    log.write("Comparação de COUNT(*) conferiu em todas as tabelas.")
    return 0


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"Variável obrigatória vazia: {name}", file=sys.stderr)
        sys.exit(2)
    return value


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in {"export", "compare"}:
        print(
            "Uso:\n"
            "  COMPARE_DB_URL=... COMPARE_SCHEMA=public COMPARE_OUT=counts.tsv \\\n"
            "    compare-schema-counts.py export [--log arquivo.log] [--append]\n"
            "  COMPARE_FROM_FILE=counts.tsv COMPARE_TO_URL=... COMPARE_TO_SCHEMA=prod_backup \\\n"
            "    compare-schema-counts.py compare [--log arquivo.log] [--append]",
            file=sys.stderr,
        )
        return 2

    command = sys.argv[1]
    log_path = ""
    append = "--append" in sys.argv
    if "--log" in sys.argv:
        idx = sys.argv.index("--log")
        if idx + 1 >= len(sys.argv):
            print("--log exige um arquivo", file=sys.stderr)
            return 2
        log_path = sys.argv[idx + 1]
        if log_path and not append:
            open(log_path, "w", encoding="utf-8").close()

    log = StepLog(log_path or None)

    if command == "export":
        url = require_env("COMPARE_DB_URL")
        schema = os.environ.get("COMPARE_SCHEMA", "public").strip() or "public"
        out = require_env("COMPARE_OUT")
        log.write(f"Exportando COUNT(*) do schema {schema}")
        counts = export_counts(url, schema, log)
        write_tsv(out, counts)
        log.write(f"Arquivo gerado: {out}")
        return 0

    from_file = require_env("COMPARE_FROM_FILE")
    to_url = require_env("COMPARE_TO_URL")
    to_schema = os.environ.get("COMPARE_TO_SCHEMA", "prod_backup").strip() or "prod_backup"
    log.write("Origem: COUNT(*) em public logo após o pg_dump")
    log.write(f"Destino: schema {to_schema} no DEV após o restore")
    log.write(f"Arquivo de origem: {from_file}")
    from_counts = read_tsv(from_file)
    to_counts = export_counts(to_url, to_schema, log)
    return compare(from_counts, to_counts, log)


if __name__ == "__main__":
    sys.exit(main())
