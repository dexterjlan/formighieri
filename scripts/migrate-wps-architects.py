#!/usr/bin/env python3
"""Cria arquitetos e vincula aos pedidos a partir de uma planilha.

Colunas do template:
  codigo_pedido | arquiteto | telefone | email

Para cada linha o script:
  1. Confere se o pedido existe no FGP (chave = orderCode)
  2. Se o nome do arquiteto não existir, cria o cadastro
  3. Completa telefone/e-mail no contato do arquiteto só quando ainda está vazio
  4. Associa o pedido (salesOrders.architectId)
  5. Se o pedido tiver um Deal vinculado sem arquiteto, preenche também

Uso:
  python3 scripts/migrate-wps-architects.py template
  python3 scripts/migrate-wps-architects.py template /tmp/arquitetos.xlsx

  # Conferência (não grava nada) — padrão
  python3 scripts/migrate-wps-architects.py import planilha.xlsx --target dev

  # Grava no DEV
  python3 scripts/migrate-wps-architects.py import planilha.xlsx --target dev --apply

  # Pedidos que já têm arquiteto diferente: substitui o vínculo
  python3 scripts/migrate-wps-architects.py import planilha.xlsx --target dev --apply --overwrite

Dependências para import: pip install 'psycopg[binary]' (o template usa só a biblioteca padrão).
A URL do banco sai de scripts/backup-prod-db.env, ou de --db-url.
O agente não executa este script contra DEV/prod — rode localmente depois de create-architect.sql e create-contact.sql.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE = ROOT / "scripts" / "fgp-migracao-arquitetos.xlsx"
DEFAULT_ENV_FILE = ROOT / "scripts" / "backup-prod-db.env"
SHEET_DATA = "Arquitetos"
SHEET_REF = "Referencias"

COLUMNS = [
    {"key": "orderCode", "header": "codigo_pedido", "required": True, "label": "Código do pedido no FGP (orderCode)"},
    {"key": "architectName", "header": "arquiteto", "required": True, "label": "Nome do arquiteto. Se não existir, o script cria."},
    {"key": "phone", "header": "telefone", "required": False, "label": "Telefone. Só grava se o contato do arquiteto ainda não tiver telefone."},
    {"key": "email", "header": "email", "required": False, "label": "E-mail. Só grava se o contato do arquiteto ainda não tiver e-mail."},
]

HEADER_ALIASES = {
    "codigo_pedido": "orderCode",
    "pedido": "orderCode",
    "order_code": "orderCode",
    "ordercode": "orderCode",
    "arquiteto": "architectName",
    "nome_arquiteto": "architectName",
    "nome": "architectName",
    "architect": "architectName",
    "architect_name": "architectName",
    "telefone": "phone",
    "phone": "phone",
    "arquiteto_telefone": "phone",
    "email": "email",
    "e_mail": "email",
    "arquiteto_email": "email",
    "architect_email": "email",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def normalize_header(value: object) -> str:
    text = strip_accents(str(value or "")).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sim" if value else "nao"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value).strip()
    return str(value).strip()


def digits_only(value: object) -> str:
    return re.sub(r"\D", "", cell_text(value))


def collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def architect_key(name: str) -> str:
    return collapse_spaces(name).casefold()


SPREADSHEET_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
WORKBOOK_RELS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_letter(index: int) -> str:
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def write_xlsx(path: Path, sheets: list[tuple[str, list[list[object]]]]) -> None:
    def sheet_xml(rows: list[list[object]]) -> str:
        lines = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            "<sheetData>",
        ]
        for row_index, row in enumerate(rows, start=1):
            lines.append(f'<row r="{row_index}">')
            for col_index, value in enumerate(row, start=1):
                text = "" if value is None else str(value)
                ref = f"{col_letter(col_index)}{row_index}"
                lines.append(
                    f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{xml_escape(text)}</t></is></c>'
                )
            lines.append("</row>")
        lines.append("</sheetData></worksheet>")
        return "\n".join(lines)

    workbook_sheets = []
    workbook_rels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ]
    content_overrides = []
    for index, (name, _rows) in enumerate(sheets, start=1):
        rid = f"rId{index}"
        workbook_sheets.append(
            f'<sheet name="{xml_escape(name)}" sheetId="{index}" r:id="{rid}"/>'
        )
        workbook_rels.append(
            f'<Relationship Id="{rid}" Type="{WORKBOOK_RELS_NS}/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
        content_overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    workbook_rels.append("</Relationships>")
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(workbook_sheets)}</sheets></workbook>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(content_overrides)
        + "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{WORKBOOK_RELS_NS}/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", "\n".join(workbook_rels))
        for index, (_name, rows) in enumerate(sheets, start=1):
            zf.writestr(f"xl/worksheets/sheet{index}.xml", sheet_xml(rows))


def column_index_from_ref(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    index = 0
    for ch in letters.upper():
        index = index * 26 + (ord(ch) - 64)
    return index - 1


def read_xlsx_sheet_rows(path: Path, preferred_sheet: str) -> list[list[object]]:
    with zipfile.ZipFile(path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_by_id = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheet_target = None
        first_target = None
        ns_r = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
        for sheet in workbook.findall("m:sheets/m:sheet", SPREADSHEET_NS):
            target = rel_by_id.get(sheet.attrib.get(f"{ns_r}id") or sheet.attrib.get("id", ""))
            if target and first_target is None:
                first_target = target
            if sheet.attrib.get("name") == preferred_sheet:
                sheet_target = target
                break
        sheet_target = sheet_target or first_target
        if not sheet_target:
            raise SystemExit("Nenhuma aba encontrada na planilha.")
        if not sheet_target.startswith("xl/"):
            sheet_target = "xl/" + sheet_target.lstrip("/")

        shared: list[str] = []
        try:
            shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("m:si", SPREADSHEET_NS):
                texts = [node.text or "" for node in item.findall(".//m:t", SPREADSHEET_NS)]
                shared.append("".join(texts))
        except KeyError:
            pass

        sheet_root = ET.fromstring(zf.read(sheet_target))
        rows: list[list[object]] = []
        for row in sheet_root.findall("m:sheetData/m:row", SPREADSHEET_NS):
            values: dict[int, object] = {}
            max_index = -1
            for cell in row.findall("m:c", SPREADSHEET_NS):
                ref = cell.attrib.get("r", "")
                index = column_index_from_ref(ref) if ref else max_index + 1
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    texts = [node.text or "" for node in cell.findall(".//m:t", SPREADSHEET_NS)]
                    value = "".join(texts)
                elif cell_type == "s":
                    raw = cell.find("m:v", SPREADSHEET_NS)
                    value = shared[int(raw.text)] if raw is not None and raw.text else ""
                else:
                    raw = cell.find("m:v", SPREADSHEET_NS)
                    value = raw.text if raw is not None else ""
                values[index] = value
                max_index = max(max_index, index)
            width = max_index + 1 if max_index >= 0 else 0
            rows.append([values.get(i, "") for i in range(width)])
        return rows


def load_psycopg():
    try:
        import psycopg
        from psycopg.rows import dict_row
        return psycopg, dict_row
    except ImportError:
        pass
    try:
        import psycopg2
        import psycopg2.extras
        return psycopg2, psycopg2.extras.RealDictCursor
    except ImportError as exc:
        raise SystemExit(
            "Pacote psycopg não encontrado. Instale com:\n  pip install 'psycopg[binary]'"
        ) from exc


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, _, rest = line.partition("=")
        key = key.strip()
        rest = rest.strip()
        if len(rest) >= 2 and rest[0] == rest[-1] and rest[0] in {'"', "'"}:
            rest = rest[1:-1]
        values[key] = rest
    return values


def to_session_pooler_url(url: str, region: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", host)
    if not match:
        if "sslmode=" not in url:
            return f"{url}&sslmode=require" if "?" in url else f"{url}?sslmode=require"
        return url
    ref = match.group(1)
    user = parsed.username or "postgres"
    if not user.startswith("postgres."):
        user = f"postgres.{ref}"
    password = parsed.password or ""
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    region = region.strip() or "aws-1-sa-east-1"
    pooler_host = (
        f"{region}.pooler.supabase.com"
        if region.startswith("aws-")
        else f"aws-0-{region}.pooler.supabase.com"
    )
    netloc = f"{quote(user, safe='._-')}:{quote(password, safe='')}@{pooler_host}:5432"
    return urlunparse(("postgresql", netloc, parsed.path or "/postgres", "", urlencode(query), ""))


def resolve_db_url(args: argparse.Namespace) -> str:
    if args.db_url:
        raw = args.db_url.strip()
        region = os.environ.get("SUPABASE_POOLER_REGION", "aws-1-sa-east-1")
        return to_session_pooler_url(raw, region)

    env_path = Path(args.env_file).expanduser() if args.env_file else DEFAULT_ENV_FILE
    file_values = parse_env_file(env_path)
    target = args.target
    if target == "prod":
        raw = file_values.get("SUPABASE_DB_URL_PROD") or os.environ.get("SUPABASE_DB_URL_PROD", "")
        region = file_values.get("SUPABASE_POOLER_REGION") or os.environ.get("SUPABASE_POOLER_REGION", "aws-1-sa-east-1")
    else:
        raw = (
            file_values.get("SUPABASE_DB_URL_DEV")
            or os.environ.get("SUPABASE_DB_URL_DEV")
            or os.environ.get("DB_URL", "")
        )
        region = (
            file_values.get("SUPABASE_POOLER_REGION_DEV")
            or file_values.get("SUPABASE_POOLER_REGION")
            or os.environ.get("SUPABASE_POOLER_REGION_DEV")
            or os.environ.get("SUPABASE_POOLER_REGION", "aws-1-sa-east-1")
        )
    raw = (raw or "").strip()
    if not raw or "[SENHA" in raw or "[PROJECT_REF" in raw:
        raise SystemExit(
            f"URL do banco ({target}) vazia. Preencha {'SUPABASE_DB_URL_PROD' if target == 'prod' else 'SUPABASE_DB_URL_DEV'} "
            f"em {env_path} ou passe --db-url."
        )
    return to_session_pooler_url(raw, region or "aws-1-sa-east-1")


def connect_db(url: str):
    psycopg, dict_row = load_psycopg()
    if hasattr(psycopg, "connect") and "psycopg2" not in getattr(psycopg, "__name__", ""):
        conn = psycopg.connect(url, row_factory=dict_row, autocommit=False)
        return conn, True
    conn = psycopg.connect(url)
    conn.autocommit = False
    return conn, False


def cursor_for(conn, is_psycopg3: bool):
    if is_psycopg3:
        return conn.cursor()
    import psycopg2.extras
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_one(cur, sql: str, params=None):
    cur.execute(sql, params or ())
    return cur.fetchone()


def fetch_all(cur, sql: str, params=None):
    cur.execute(sql, params or ())
    return list(cur.fetchall())


def table_exists(cur, table: str) -> bool:
    row = fetch_one(
        cur,
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = %s
        """,
        (table,),
    )
    return row is not None


def table_has_column(cur, table: str, column: str) -> bool:
    row = fetch_one(
        cur,
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
          AND column_name = %s
        """,
        (table, column),
    )
    return row is not None


def build_template(path: Path) -> None:
    headers = [col["header"] for col in COLUMNS]
    data_rows = [headers]
    ref_rows = [["Campo", "Obrigatório", "Descrição"]]
    for col in COLUMNS:
        ref_rows.append([col["header"], "Sim" if col["required"] else "Não", col["label"]])
    ref_rows.extend([
        [],
        ["Regras", "", ""],
        ["chave", "codigo_pedido", "Se o pedido não existir no FGP, a linha é ignorada"],
        ["arquiteto", "nome", "Comparação ignora maiúsculas/minúsculas e espaços nas pontas"],
        ["cadastro", "", "Se o nome não existir, cria Architect com telefone e e-mail da linha"],
        ["contato", "", "Telefone/e-mail só preenchem campos vazios do cadastro (não sobrescrevem)"],
        ["pedido", "", "Grava salesOrders.architectId"],
        ["negócio", "", "Se o pedido tiver Deal vinculado sem arquiteto, preenche Deal.architectId"],
        ["duplicata de pedido", "", "O mesmo codigo_pedido duas vezes na planilha gera erro"],
        ["já vinculado", "", "Se o pedido já tem outro arquiteto, use --overwrite para trocar"],
        [],
        ["Exemplo (não copie esta linha para a aba Arquitetos se o pedido 123456 não existir)", "", ""],
        headers,
        ["123456", "Arquiteto Exemplo", "11999999999", "arquiteto@exemplo.com"],
    ])
    write_xlsx(path, [(SHEET_DATA, data_rows), (SHEET_REF, ref_rows)])


def rows_from_matrix(matrix: list[list[object]]):
    if not matrix:
        raise SystemExit("Planilha vazia.")
    header_row = matrix[0]
    key_by_index: dict[int, str] = {}
    for index, header in enumerate(header_row):
        field = HEADER_ALIASES.get(normalize_header(header))
        if field:
            key_by_index[index] = field
    if "orderCode" not in key_by_index.values():
        raise SystemExit('Coluna obrigatória "codigo_pedido" não encontrada na planilha.')
    if "architectName" not in key_by_index.values():
        raise SystemExit('Coluna obrigatória "arquiteto" não encontrada na planilha.')

    for offset, raw in enumerate(matrix[1:], start=2):
        if raw is None or all(cell_text(value) == "" for value in raw):
            continue
        mapped = {col["key"]: "" for col in COLUMNS}
        mapped["rowNumber"] = offset
        for index, value in enumerate(raw):
            field = key_by_index.get(index)
            if not field:
                continue
            mapped[field] = value
        yield mapped


def iter_sheet_rows(path: Path):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            matrix = [list(row) for row in csv.reader(fh)]
        yield from rows_from_matrix(matrix)
        return
    if suffix not in {".xlsx", ".xlsm"}:
        raise SystemExit("Use um arquivo .xlsx (ou .csv).")
    yield from rows_from_matrix(read_xlsx_sheet_rows(path, SHEET_DATA))


def normalize_row(raw: dict) -> dict:
    email = collapse_spaces(cell_text(raw.get("email")))
    row = {
        "rowNumber": raw["rowNumber"],
        "orderCode": digits_only(raw.get("orderCode")),
        "architectName": collapse_spaces(cell_text(raw.get("architectName"))),
        "phone": collapse_spaces(cell_text(raw.get("phone"))) or None,
        "email": email.lower() if email else None,
        "errors": [],
    }
    if not row["orderCode"]:
        row["errors"].append("codigo_pedido obrigatório")
    if not row["architectName"]:
        row["errors"].append("arquiteto obrigatório")
    return row


def find_order(cur, order_code: str):
    return fetch_all(
        cur,
        """
        SELECT
            o.id,
            o."orderCode",
            o."architectId"
        FROM "salesOrders" o
        WHERE o."orderCode" = %s
           OR regexp_replace(COALESCE(o."orderCode", ''), '\\D', '', 'g') = %s
        ORDER BY o.id
        """,
        (order_code, order_code),
    )


def load_architect_contact(cur, architect_id: int) -> dict:
    if not table_exists(cur, "Contact"):
        return {}
    row = fetch_one(
        cur,
        """
        SELECT id, name, phone, email, "isPrimary"
        FROM "Contact"
        WHERE "ownerType" = 'architect' AND "ownerId" = %s
        ORDER BY "isPrimary" DESC, id
        LIMIT 1
        """,
        (architect_id,),
    )
    return dict(row) if row else {}


def upsert_architect_contact(cur, architect_id: int, name: str | None, phone: str | None, email: str | None) -> list[str]:
    notes: list[str] = []
    if not table_exists(cur, "Contact"):
        notes.append("tabela Contact ausente — rode create-contact.sql")
        return notes
    existing = load_architect_contact(cur, architect_id)
    if not existing:
        if phone or email or name:
            cur.execute(
                """
                INSERT INTO "Contact" ("ownerType", "ownerId", name, phone, email, "isPrimary", "isActive", "updatedAt")
                VALUES ('architect', %s, %s, %s, %s, true, true, now())
                """,
                (architect_id, name or "Contato", phone or None, email or None),
            )
            notes.append("contato criado")
        return notes

    patch: dict[str, object] = {}
    if phone and not existing.get("phone"):
        patch["phone"] = phone
    elif phone and existing.get("phone") and existing["phone"] != phone:
        notes.append("telefone da planilha ignorado (já cadastrado)")
    if email and not existing.get("email"):
        patch["email"] = email
    elif email and existing.get("email") and str(existing["email"]).casefold() != email:
        notes.append("e-mail da planilha ignorado (já cadastrado)")
    if name and not str(existing.get("name") or "").strip():
        patch["name"] = name
    if patch:
        assignments = [f'{column} = %s' if column == "name" else f'"{column}" = %s' for column in patch]
        params = list(patch.values()) + [existing["id"]]
        cur.execute(
            f"""
            UPDATE "Contact"
            SET {", ".join(assignments)}, "updatedAt" = now()
            WHERE id = %s
            """,
            params,
        )
        notes.insert(0, "contato atualizado")
    return notes


def load_architect_cache(cur) -> dict[str, dict]:
    cache: dict[str, dict] = {}
    for item in fetch_all(
        cur,
        """
        SELECT id, name, "isActive"
        FROM "Architect"
        """,
    ):
        contact = load_architect_contact(cur, int(item["id"]))
        cache[architect_key(item["name"] or "")] = {
            "id": int(item["id"]),
            "name": item["name"],
            "phone": contact.get("phone") or None,
            "email": contact.get("email") or None,
            "isActive": item.get("isActive") is not False,
        }
    return cache


def resolve_architect(cur, cache: dict[str, dict], row: dict, apply: bool) -> tuple[object, str, list[str]]:
    notes: list[str] = []
    key = architect_key(row["architectName"])
    existing = cache.get(key)

    if existing and existing.get("id") != -1:
        architect_id = int(existing["id"])
        patch: dict[str, object] = {}
        if existing.get("isActive") is False:
            patch["isActive"] = True

        contact_notes: list[str] = []
        if apply:
            contact_notes = upsert_architect_contact(
                cur,
                architect_id,
                existing.get("name"),
                row["phone"],
                row["email"],
            )
            if row["phone"]:
                existing["phone"] = existing.get("phone") or row["phone"]
            if row["email"]:
                existing["email"] = existing.get("email") or row["email"]
        else:
            if row["phone"] and not existing.get("phone"):
                contact_notes.append("contato seria atualizado")
            elif row["phone"] and existing.get("phone") and existing["phone"] != row["phone"]:
                notes.append("telefone da planilha ignorado (já cadastrado)")
            if row["email"] and not existing.get("email"):
                if "contato seria atualizado" not in contact_notes:
                    contact_notes.append("contato seria atualizado")
            elif row["email"] and existing.get("email") and str(existing["email"]).casefold() != row["email"]:
                notes.append("e-mail da planilha ignorado (já cadastrado)")

        if patch:
            if apply:
                assignments = [f'"{column}" = %s' for column in patch]
                params = list(patch.values()) + [architect_id]
                cur.execute(
                    f"""
                    UPDATE "Architect"
                    SET {", ".join(assignments)}, "updatedAt" = now()
                    WHERE id = %s
                    """,
                    params,
                )
                existing.update(patch)
                existing["isActive"] = True
                notes.insert(0, "cadastro atualizado")
            else:
                notes.insert(0, "cadastro seria atualizado")
        elif contact_notes:
            notes.insert(0, contact_notes[0])
            notes.extend(contact_notes[1:])
        else:
            notes.insert(0, "já existia")
        if contact_notes and notes[0] == "cadastro atualizado":
            notes.extend(contact_notes)
        return architect_id, notes[0] if notes else "já existia", notes[1:]

    if not apply:
        cache[key] = {
            "id": -1,
            "name": row["architectName"],
            "phone": row["phone"],
            "email": row["email"],
            "isActive": True,
        }
        return "(novo)", "seria criado", []

    cur.execute(
        """
        INSERT INTO "Architect" (name, "isActive", "createdAt", "updatedAt")
        VALUES (%s, true, now(), now())
        ON CONFLICT ((lower(trim(name)))) DO UPDATE SET
            "isActive" = true,
            "updatedAt" = now()
        RETURNING id, name, "isActive"
        """,
        (row["architectName"],),
    )
    created = cur.fetchone()
    architect_id = int(created["id"])
    upsert_architect_contact(cur, architect_id, created["name"], row["phone"], row["email"])
    cache[key] = {
        "id": architect_id,
        "name": created["name"],
        "phone": row["phone"] or None,
        "email": row["email"] or None,
        "isActive": created.get("isActive") is not False,
    }
    return architect_id, "criado", []


def link_linked_deals(cur, order_id: int, architect_id: int, overwrite: bool, apply: bool) -> str:
    if not table_exists(cur, "Deal") or not table_has_column(cur, "Deal", "architectId"):
        return ""
    deals = fetch_all(
        cur,
        """
        SELECT id, "architectId"
        FROM "Deal"
        WHERE "orderId" = %s
        """,
        (order_id,),
    )
    if not deals:
        return ""

    to_fill = []
    skipped = 0
    for deal in deals:
        current = deal.get("architectId")
        if current is None:
            to_fill.append(int(deal["id"]))
        elif int(current) == int(architect_id):
            continue
        elif overwrite:
            to_fill.append(int(deal["id"]))
        else:
            skipped += 1

    if not to_fill:
        if skipped:
            return f"Deal já tinha outro arquiteto ({skipped})"
        return "Deal já vinculado"

    if not apply:
        return f"Deal seria atualizado ({len(to_fill)})"

    placeholders = ", ".join(["%s"] * len(to_fill))
    cur.execute(
        f"""
        UPDATE "Deal"
        SET "architectId" = %s, "updatedAt" = now()
        WHERE id IN ({placeholders})
        """,
        [architect_id, *to_fill],
    )
    message = f"Deal atualizado ({len(to_fill)})"
    if skipped:
        message += f"; {skipped} Deal(s) com outro arquiteto (use --overwrite)"
    return message


def process_row(cur, row: dict, cache: dict, seen_orders: dict[str, int], overwrite: bool, apply: bool) -> dict:
    result = {
        "linha": row["rowNumber"],
        "codigo_pedido": row["orderCode"],
        "arquiteto": row["architectName"],
        "telefone": row["phone"] or "",
        "email": row["email"] or "",
        "status": "erro",
        "mensagem": "",
        "orderId": "",
        "architectId": "",
        "acao_arquiteto": "",
        "acao_pedido": "",
        "acao_deal": "",
    }
    if row["errors"]:
        result["mensagem"] = "; ".join(row["errors"])
        return result

    previous_line = seen_orders.get(row["orderCode"])
    if previous_line:
        result["mensagem"] = f"codigo_pedido duplicado na planilha (já na linha {previous_line})"
        return result
    seen_orders[row["orderCode"]] = row["rowNumber"]

    orders = find_order(cur, row["orderCode"])
    if not orders:
        result["status"] = "ignorado"
        result["mensagem"] = "pedido não encontrado no FGP"
        return result
    if len(orders) > 1:
        codes = ", ".join(f'{item["id"]}:{item["orderCode"]}' for item in orders)
        result["mensagem"] = f"mais de um pedido bate com este código ({codes})"
        return result

    order = orders[0]
    order_id = int(order["id"])
    current_architect_id = int(order["architectId"]) if order.get("architectId") else None
    result["orderId"] = order_id

    architect_id, architect_action, extra_notes = resolve_architect(cur, cache, row, apply)
    result["architectId"] = architect_id
    result["acao_arquiteto"] = architect_action

    same_link = (
        current_architect_id is not None
        and architect_id not in (None, "(novo)")
        and int(current_architect_id) == int(architect_id)
    )
    if current_architect_id and not same_link and not overwrite:
        result["status"] = "ignorado"
        result["acao_pedido"] = "já tinha outro arquiteto"
        result["mensagem"] = (
            f"pedido já vinculado ao arquiteto {current_architect_id}; "
            "passe --overwrite para trocar"
        )
        return result

    if same_link:
        result["acao_pedido"] = "já vinculado"
    elif not apply:
        result["acao_pedido"] = "seria vinculado"
    else:
        cur.execute(
            """
            UPDATE "salesOrders"
            SET "architectId" = %s, "updatedAt" = now()
            WHERE id = %s
            """,
            (architect_id, order_id),
        )
        result["acao_pedido"] = "substituído" if current_architect_id and not same_link else "vinculado"

    link_id = int(architect_id) if architect_id not in (None, "(novo)") else 0
    result["acao_deal"] = link_linked_deals(
        cur, order_id, link_id, overwrite, apply and architect_id != "(novo)"
    )

    parts = [architect_action, result["acao_pedido"]]
    if result["acao_deal"]:
        parts.append(result["acao_deal"])
    parts.extend(extra_notes)
    result["status"] = "ok"
    result["mensagem"] = " — ".join(part for part in parts if part)
    return result


def write_report(path: Path, results: list[dict]) -> None:
    fields = [
        "linha", "codigo_pedido", "arquiteto", "telefone", "email",
        "status", "mensagem", "orderId", "architectId",
        "acao_arquiteto", "acao_pedido", "acao_deal",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)


def cmd_template(args: argparse.Namespace) -> int:
    path = Path(args.output).expanduser() if args.output else DEFAULT_TEMPLATE
    build_template(path)
    print(f"Template gerado: {path}")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    source = Path(args.spreadsheet).expanduser()
    if not source.is_file():
        raise SystemExit(f"Arquivo não encontrado: {source}")
    if args.target == "prod" and args.apply and not args.confirm_prod:
        raise SystemExit("Para gravar em produção, passe também --confirm-prod.")

    rows = [normalize_row(raw) for raw in iter_sheet_rows(source)]
    if not rows:
        raise SystemExit("Nenhuma linha de dados encontrada na planilha.")

    db_url = resolve_db_url(args)
    conn, is_psycopg3 = connect_db(db_url)
    apply = bool(args.apply)
    results: list[dict] = []
    seen_orders: dict[str, int] = {}

    try:
        cur = cursor_for(conn, is_psycopg3)
        if not table_exists(cur, "Architect"):
            raise SystemExit("Tabela Architect não encontrada. Execute supabase/feats/create-architect.sql no SQL Editor.")
        if not table_has_column(cur, "salesOrders", "architectId"):
            raise SystemExit("salesOrders.architectId não existe. Execute supabase/feats/create-architect.sql no SQL Editor.")

        cache = load_architect_cache(cur)
        print(
            f"[{now_iso()}] {'Gravando' if apply else 'Dry-run'} em {args.target} — "
            f"{len(rows)} linha(s), {len(cache)} arquiteto(s) já cadastrado(s)"
        )
        for row in rows:
            result = process_row(cur, row, cache, seen_orders, args.overwrite, apply)
            results.append(result)
            if apply and result["status"] == "ok":
                conn.commit()
            elif apply:
                conn.rollback()
            print(
                f"  linha {result['linha']:>4}  pedido {result['codigo_pedido'] or '—'}: "
                f"{result['status']} — {result['mensagem']}"
            )
        cur.close()
    finally:
        conn.close()

    report_path = (
        Path(args.report).expanduser()
        if args.report
        else source.with_name(source.stem + "-resultado.csv")
    )
    write_report(report_path, results)

    ok = sum(1 for item in results if item["status"] == "ok")
    skipped = sum(1 for item in results if item["status"] == "ignorado")
    errors = sum(1 for item in results if item["status"] == "erro")
    print("")
    print(f"OK: {ok}  |  ignorado: {skipped}  |  erro: {errors}")
    print(f"Relatório: {report_path}")
    if not apply:
        print("Nada foi gravado (dry-run). Passe --apply para persistir.")
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Cria arquitetos e vincula aos pedidos (chave = codigo_pedido)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    template = sub.add_parser("template", help="Gera a planilha Excel modelo")
    template.add_argument(
        "output",
        nargs="?",
        help="Caminho do .xlsx (padrão: scripts/fgp-migracao-arquitetos.xlsx)",
    )
    template.set_defaults(func=cmd_template)

    importer = sub.add_parser("import", help="Valida e importa a planilha preenchida")
    importer.add_argument("spreadsheet", help="Planilha .xlsx preenchida")
    importer.add_argument("--apply", action="store_true", help="Grava no banco (sem esta flag é só conferência)")
    importer.add_argument(
        "--overwrite",
        action="store_true",
        help="Troca o arquiteto de pedidos (e Deals) que já têm outro vínculo",
    )
    importer.add_argument("--target", choices=("dev", "prod"), default="dev", help="Banco alvo (padrão: dev)")
    importer.add_argument("--confirm-prod", action="store_true", help="Obrigatório junto de --apply --target prod")
    importer.add_argument("--env-file", default=str(DEFAULT_ENV_FILE), help="Arquivo com SUPABASE_DB_URL_*")
    importer.add_argument("--db-url", default="", help="URL Postgres (sobrescreve o env-file)")
    importer.add_argument("--report", default="", help="CSV de resultado (padrão: <planilha>-resultado.csv)")
    importer.set_defaults(func=cmd_import)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
