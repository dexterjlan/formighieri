#!/usr/bin/env python3
"""Migra endereços do WPS para o FGP a partir de uma planilha Excel.

A chave é o código do pedido (orderCode). Para cada linha o script:
  1. Confere se o pedido existe no FGP e tem cliente associado
  2. Cria (ou reutiliza) o endereço no cadastro desse cliente
  3. Vincula o endereço ao pedido (salesOrders.addrId)
  4. Atualiza CalendarEvent e AssemblySchedule desse pedido com o mesmo addrId
  5. Logradouro, bairro, cidade, UF e país vêm do ViaCEP a partir do CEP
  6. Sem apelido/observações; o último endereço importado de cada cliente fica como principal

Uso:
  python3 scripts/migrate-wps-addr.py template
  python3 scripts/migrate-wps-addr.py template /tmp/enderecos-wps.xlsx

  # Conferência (não grava nada) — padrão
  python3 scripts/migrate-wps-addr.py import planilha.xlsx --target dev

  # Grava no DEV
  python3 scripts/migrate-wps-addr.py import planilha.xlsx --target dev --apply

  # Pedidos que já têm endereço: religa (não apaga o endereço antigo)
  python3 scripts/migrate-wps-addr.py import planilha.xlsx --target dev --apply --overwrite

Dependências para import: pip install 'psycopg[binary]' (o template usa só a biblioteca padrão).
A URL do banco sai de scripts/backup-prod-db.env (igual ao backup), ou de --db-url.
O agente não executa este script contra DEV/prod — rode localmente.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE = ROOT / "scripts" / "fgp-migracao-enderecos-wps.xlsx"
DEFAULT_ENV_FILE = ROOT / "scripts" / "backup-prod-db.env"
DEFAULT_LABEL = "Obra"
DEFAULT_COUNTRY = "BR"
OWNER_TYPE_CLIENT = "client"
SHEET_DATA = "Enderecos"
SHEET_REF = "Referencias"

BRAZIL_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}

COLUMNS = [
    {"key": "orderCode", "header": "codigo_pedido", "required": True, "label": "Código do pedido no FGP (orderCode)"},
    {"key": "labelName", "header": "label", "required": False, "label": f"Label do endereço (padrão: {DEFAULT_LABEL}; cria se não existir)"},
    {"key": "postalCode", "header": "cep", "required": True, "label": "CEP com 8 dígitos — logradouro, bairro, cidade, UF e país vêm do ViaCEP"},
    {"key": "number", "header": "numero", "required": False, "label": "Número"},
    {"key": "complement", "header": "complemento", "required": False, "label": "Complemento"},
]

HEADER_ALIASES = {
    "codigo_pedido": "orderCode",
    "pedido": "orderCode",
    "order_code": "orderCode",
    "ordercode": "orderCode",
    "label": "labelName",
    "tipo": "labelName",
    "cep": "postalCode",
    "postal_code": "postalCode",
    "logradouro": "street",
    "rua": "street",
    "endereco": "street",
    "street": "street",
    "numero": "number",
    "number": "number",
    "n": "number",
    "complemento": "complement",
    "complement": "complement",
    "bairro": "neighborhood",
    "neighborhood": "neighborhood",
    "cidade": "city",
    "city": "city",
    "uf": "state",
    "estado": "state",
    "state": "state",
    "pais": "country",
    "country": "country",
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
        rel_by_id = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels
        }
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
        ["cliente", "", "Vem do pedido. A planilha não informa o cliente."],
        ["label", "padrão Obra", "Se não existir em addrlabel, o script cria (e reativa se estiver inativo)"],
        ["cep", "ViaCEP", "Logradouro, bairro, cidade, UF e país são preenchidos pelo CEP (https://viacep.com.br)"],
        ["duplicata", "", "Se o cliente já tiver o mesmo CEP+logradouro+número+cidade+UF, o endereço é reutilizado"],
        ["calendário / montagem", "", "Todos os registros do pedido recebem o addrId criado"],
        ["principal", "", "Sempre o último endereço importado daquele cliente"],
        [],
        ["Exemplo (não copie esta linha para a aba Enderecos se o pedido 123456 não existir)", "", ""],
        headers,
        [
            "123456",
            "Obra",
            "01310-100",
            "1000",
            "cj 101",
        ],
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
    row = {
        "rowNumber": raw["rowNumber"],
        "orderCode": digits_only(raw.get("orderCode")),
        "labelName": collapse_spaces(cell_text(raw.get("labelName"))) or DEFAULT_LABEL,
        "nickname": None,
        "postalCode": digits_only(raw.get("postalCode"))[:8],
        "street": collapse_spaces(cell_text(raw.get("street"))),
        "number": collapse_spaces(cell_text(raw.get("number"))) or None,
        "complement": collapse_spaces(cell_text(raw.get("complement"))) or None,
        "neighborhood": collapse_spaces(cell_text(raw.get("neighborhood"))) or None,
        "city": collapse_spaces(cell_text(raw.get("city"))),
        "state": collapse_spaces(cell_text(raw.get("state"))).upper()[:2],
        "country": DEFAULT_COUNTRY,
        "notes": None,
        "isPrimary": False,
        "errors": [],
    }
    if not row["orderCode"]:
        row["errors"].append("codigo_pedido obrigatório")
    if len(row["postalCode"]) != 8:
        row["errors"].append("cep deve ter 8 dígitos")
    return row


def lookup_viacep(cep: str) -> dict | None:
    url = f"https://viacep.com.br/ws/{cep}/json/"
    request = urllib.request.Request(url, headers={"User-Agent": "Formighieri-FGP-addr-migration"})
    last_error = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict) or payload.get("erro"):
                return None
            street = collapse_spaces(payload.get("logradouro") or "")
            neighborhood = collapse_spaces(payload.get("bairro") or "") or None
            city = collapse_spaces(payload.get("localidade") or "")
            state = collapse_spaces(payload.get("uf") or "").upper()[:2]
            return {
                "street": street,
                "neighborhood": neighborhood,
                "city": city,
                "state": state,
                "country": DEFAULT_COUNTRY,
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            time.sleep(0.4)
    print(f"  AVISO: falha ao consultar ViaCEP {cep}: {last_error}")
    return None


def enrich_rows_from_viacep(rows: list[dict]) -> None:
    unique_ceps = []
    seen = set()
    for row in rows:
        cep = row["postalCode"]
        if row["errors"] or len(cep) != 8 or cep in seen:
            continue
        seen.add(cep)
        unique_ceps.append(cep)
    if not unique_ceps:
        return

    print(f"[{now_iso()}] Consultando ViaCEP: {len(unique_ceps)} CEP(s) único(s)")
    cache: dict[str, dict | None] = {}
    for index, cep in enumerate(unique_ceps, start=1):
        cache[cep] = lookup_viacep(cep)
        if index < len(unique_ceps):
            time.sleep(0.12)

    for row in rows:
        if row["errors"] or len(row["postalCode"]) != 8:
            continue
        data = cache.get(row["postalCode"])
        if not data:
            row["errors"].append("CEP não encontrado no ViaCEP")
            continue
        row["street"] = data["street"] or row["street"]
        row["neighborhood"] = data["neighborhood"] or row["neighborhood"]
        row["city"] = data["city"] or row["city"]
        row["state"] = data["state"] or row["state"]
        row["country"] = data["country"]
        if not row["street"]:
            row["errors"].append("CEP sem logradouro no ViaCEP")
        if not row["city"]:
            row["errors"].append("CEP sem cidade no ViaCEP")
        if len(row["state"]) != 2:
            row["errors"].append("CEP sem UF no ViaCEP")
        elif row["state"] not in BRAZIL_UFS:
            row["errors"].append(f'UF "{row["state"]}" inválida no ViaCEP')


def fetch_one(cur, sql: str, params=None):
    cur.execute(sql, params or ())
    return cur.fetchone()


def fetch_all(cur, sql: str, params=None):
    cur.execute(sql, params or ())
    return list(cur.fetchall())


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


def load_labels(cur) -> dict[str, dict]:
    rows = fetch_all(
        cur,
        """
        SELECT id, name, "isActive"
        FROM addrlabel
        """,
    )
    mapping: dict[str, dict] = {}
    for row in rows:
        mapping[normalize_header(row["name"])] = {
            "id": int(row["id"]),
            "name": row["name"],
            "isActive": bool(row["isActive"]),
        }
    return mapping


def next_label_sort_order(cur) -> int:
    row = fetch_one(cur, 'SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS n FROM addrlabel')
    return int(row["n"]) if row else 1


def resolve_label(cur, labels: dict[str, dict], label_name: str, apply: bool) -> tuple[object, str]:
    key = normalize_header(label_name)
    if not key:
        raise ValueError("label vazio")

    existing = labels.get(key)
    if existing and int(existing.get("id") or 0) > 0:
        label_id = int(existing["id"])
        if existing.get("isActive"):
            return label_id, "existente"
        if not apply:
            return label_id, "seria reativado"
        cur.execute(
            """
            UPDATE addrlabel
            SET "isActive" = true,
                "updatedAt" = now()
            WHERE id = %s
            """,
            (label_id,),
        )
        existing["isActive"] = True
        return label_id, "reativado"

    if existing and existing.get("id") == -1:
        return "(novo)", "seria criado"

    if not apply:
        labels[key] = {"id": -1, "name": label_name, "isActive": True}
        return "(novo)", "seria criado"

    sort_order = next_label_sort_order(cur)
    cur.execute(
        """
        INSERT INTO addrlabel (name, "sortOrder", "isActive", "createdAt", "updatedAt")
        VALUES (%s, %s, true, now(), now())
        ON CONFLICT ((lower(trim(name)))) DO UPDATE SET
            "isActive" = true,
            "updatedAt" = now()
        RETURNING id
        """,
        (label_name, sort_order),
    )
    created = cur.fetchone()
    label_id = int(created["id"])
    labels[key] = {"id": label_id, "name": label_name, "isActive": True}
    return label_id, "criado"


def find_order(cur, order_code: str):
    rows = fetch_all(
        cur,
        """
        SELECT
            o.id,
            o."orderCode",
            o."clientId",
            o."addrId",
            c.name AS "clientName"
        FROM "salesOrders" o
        LEFT JOIN "Client" c ON c.id = o."clientId"
        WHERE o."orderCode" = %s
           OR regexp_replace(COALESCE(o."orderCode", ''), '\\D', '', 'g') = %s
        ORDER BY o.id
        """,
        (order_code, order_code),
    )
    return rows


def find_existing_addr(cur, client_id: int, row: dict):
    return fetch_one(
        cur,
        """
        SELECT id, "isPrimary"
        FROM addr
        WHERE "ownerType" = %s
          AND "ownerId" = %s
          AND "isActive" = true
          AND "postalCode" = %s
          AND lower(trim(street)) = lower(trim(%s))
          AND COALESCE(lower(trim(number)), '') = COALESCE(lower(trim(%s)), '')
          AND lower(trim(city)) = lower(trim(%s))
          AND upper(state) = upper(%s)
        ORDER BY "isPrimary" DESC, id
        LIMIT 1
        """,
        (
            OWNER_TYPE_CLIENT,
            client_id,
            row["postalCode"],
            row["street"],
            row["number"],
            row["city"],
            row["state"],
        ),
    )


def unset_other_primary(cur, client_id: int, except_id: int | None) -> None:
    if except_id:
        cur.execute(
            """
            UPDATE addr
            SET "isPrimary" = false,
                "updatedAt" = now()
            WHERE "ownerType" = %s
              AND "ownerId" = %s
              AND "isPrimary" = true
              AND "isActive" = true
              AND id <> %s
            """,
            (OWNER_TYPE_CLIENT, client_id, except_id),
        )
        return
    cur.execute(
        """
        UPDATE addr
        SET "isPrimary" = false,
            "updatedAt" = now()
        WHERE "ownerType" = %s
          AND "ownerId" = %s
          AND "isPrimary" = true
          AND "isActive" = true
        """,
        (OWNER_TYPE_CLIENT, client_id),
    )


def set_client_primary_addr(cur, client_id: int, addr_id: int) -> None:
    unset_other_primary(cur, client_id, addr_id)
    cur.execute(
        """
        UPDATE addr
        SET "isPrimary" = true,
            "updatedAt" = now()
        WHERE id = %s
        """,
        (addr_id,),
    )


def insert_addr(cur, client_id: int, label_id: int, row: dict) -> int:
    cur.execute(
        """
        INSERT INTO addr (
            "ownerType", "ownerId", "labelId", nickname, "postalCode",
            street, number, complement, neighborhood, city, state, country,
            notes, "isPrimary", "isActive", "createdAt", "updatedAt"
        )
        VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, true, now(), now()
        )
        RETURNING id
        """,
        (
            OWNER_TYPE_CLIENT,
            client_id,
            label_id,
            None,
            row["postalCode"],
            row["street"],
            row["number"],
            row["complement"],
            row["neighborhood"],
            row["city"],
            row["state"],
            row["country"],
            None,
            False,
        ),
    )
    created = cur.fetchone()
    return int(created["id"])


def link_order(cur, order_id: int, addr_id: int) -> None:
    cur.execute(
        """
        UPDATE "salesOrders"
        SET "addrId" = %s,
            "updatedAt" = now()
        WHERE id = %s
        """,
        (addr_id, order_id),
    )


def update_related(cur, order_id: int, addr_id: int, has_calendar: bool, has_assembly: bool) -> tuple[int, int]:
    calendar_count = 0
    assembly_count = 0
    if has_calendar:
        cur.execute(
            """
            UPDATE "CalendarEvent"
            SET "addrId" = %s,
                "updatedAt" = now()
            WHERE "orderId" = %s
            """,
            (addr_id, order_id),
        )
        calendar_count = cur.rowcount or 0
    if has_assembly:
        cur.execute(
            """
            UPDATE "AssemblySchedule"
            SET "addrId" = %s,
                "updatedAt" = now()
            WHERE "orderId" = %s
            """,
            (addr_id, order_id),
        )
        assembly_count = cur.rowcount or 0
    return calendar_count, assembly_count


def process_row(
    cur,
    row: dict,
    labels: dict[str, dict],
    seen_orders: dict[str, int],
    overwrite: bool,
    apply: bool,
    has_calendar: bool,
    has_assembly: bool,
) -> dict:
    result = {
        "linha": row["rowNumber"],
        "codigo_pedido": row["orderCode"],
        "status": "erro",
        "mensagem": "",
        "orderId": "",
        "clientId": "",
        "cliente": "",
        "addrId": "",
        "endereco": "criado",
        "label": row.get("labelName") or "",
        "labelAcao": "",
        "cep": row.get("postalCode") or "",
        "logradouro": row.get("street") or "",
        "bairro": row.get("neighborhood") or "",
        "cidade": row.get("city") or "",
        "uf": row.get("state") or "",
        "principal": "Não",
        "calendario": 0,
        "montagem": 0,
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
        result["mensagem"] = f"código de pedido ambíguo ({codes})"
        return result

    order = orders[0]
    result["orderId"] = order["id"]
    result["clientId"] = order["clientId"] or ""
    result["cliente"] = order["clientName"] or ""
    if not order["clientId"]:
        result["mensagem"] = "pedido sem cliente associado"
        return result

    existing_order_addr = order["addrId"]
    if existing_order_addr and not overwrite:
        result["status"] = "ignorado"
        result["addrId"] = existing_order_addr
        result["endereco"] = "já vinculado"
        result["mensagem"] = (
            f"pedido já possui endereço (addrId={existing_order_addr}); use --overwrite para religar"
        )
        return result

    existing_addr = find_existing_addr(cur, int(order["clientId"]), row)
    reused = existing_addr is not None
    addr_id = int(existing_addr["id"]) if reused else None
    result["endereco"] = "reutilizado" if reused else "criado"

    if reused:
        result["labelAcao"] = "não usado (endereço reutilizado)"
        label_id = None
        label_action = result["labelAcao"]
    else:
        try:
            label_id, label_action = resolve_label(cur, labels, row["labelName"], apply)
        except ValueError as exc:
            result["mensagem"] = str(exc)
            return result
        result["labelAcao"] = label_action

    if not apply:
        calendar_count = 0
        assembly_count = 0
        if has_calendar:
            counted = fetch_one(
                cur,
                'SELECT count(*)::int AS n FROM "CalendarEvent" WHERE "orderId" = %s',
                (order["id"],),
            )
            calendar_count = int(counted["n"]) if counted else 0
        if has_assembly:
            counted = fetch_one(
                cur,
                'SELECT count(*)::int AS n FROM "AssemblySchedule" WHERE "orderId" = %s',
                (order["id"],),
            )
            assembly_count = int(counted["n"]) if counted else 0
        result["status"] = "ok"
        result["addrId"] = addr_id or "(novo)"
        result["calendario"] = calendar_count
        result["montagem"] = assembly_count
        result["mensagem"] = (
            f"dry-run: pedido e cliente ok; endereço seria {result['endereco']}; "
            f"label {label_action}; calendário={calendar_count}; montagem={assembly_count}"
        )
        return result

    if not reused:
        addr_id = insert_addr(cur, int(order["clientId"]), int(label_id), row)

    link_order(cur, int(order["id"]), int(addr_id))
    calendar_count, assembly_count = update_related(
        cur, int(order["id"]), int(addr_id), has_calendar, has_assembly
    )
    result["status"] = "ok"
    result["addrId"] = addr_id
    result["calendario"] = calendar_count
    result["montagem"] = assembly_count
    result["mensagem"] = (
        f"endereço {'reutilizado' if reused else 'criado'}; "
        f"label {label_action}; calendário={calendar_count}; montagem={assembly_count}"
    )
    return result


def write_report(path: Path, results: list[dict]) -> None:
    fieldnames = [
        "linha",
        "codigo_pedido",
        "status",
        "mensagem",
        "orderId",
        "clientId",
        "cliente",
        "addrId",
        "endereco",
        "label",
        "labelAcao",
        "cep",
        "logradouro",
        "bairro",
        "cidade",
        "uf",
        "principal",
        "calendario",
        "montagem",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
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
    enrich_rows_from_viacep(rows)

    db_url = resolve_db_url(args)
    conn, is_psycopg3 = connect_db(db_url)
    apply = bool(args.apply)
    results: list[dict] = []
    seen_orders: dict[str, int] = {}

    try:
        cur = cursor_for(conn, is_psycopg3)
        if not table_has_column(cur, "addr", "ownerType"):
            raise SystemExit("Tabela addr não encontrada. Execute supabase/feats/create-addr.sql no SQL Editor.")
        if not table_has_column(cur, "salesOrders", "addrId"):
            raise SystemExit("salesOrders.addrId não existe. Execute supabase/feats/create-addr.sql no SQL Editor.")
        has_calendar = table_has_column(cur, "CalendarEvent", "addrId")
        has_assembly = table_has_column(cur, "AssemblySchedule", "addrId")
        if not has_calendar:
            print("AVISO: CalendarEvent.addrId ausente — eventos não serão atualizados.")
        if not has_assembly:
            print("AVISO: AssemblySchedule.addrId ausente — programações de montagem não serão atualizadas.")

        labels = load_labels(cur)
        last_primary_by_client: dict[int, int] = {}
        last_result_index_by_client: dict[int, int] = {}

        print(
            f"[{now_iso()}] {'Gravando' if apply else 'Dry-run'} em {args.target} — "
            f"{len(rows)} linha(s)"
        )
        for row in rows:
            result = process_row(
                cur, row, labels, seen_orders, args.overwrite, apply, has_calendar, has_assembly
            )
            results.append(result)
            if result["status"] == "ok" and result.get("clientId"):
                last_result_index_by_client[int(result["clientId"])] = len(results) - 1
                if apply and result.get("addrId"):
                    last_primary_by_client[int(result["clientId"])] = int(result["addrId"])
            if apply and result["status"] == "ok":
                conn.commit()
            elif apply:
                conn.rollback()
            print(
                f"  linha {result['linha']:>4}  pedido {result['codigo_pedido'] or '—'}: "
                f"{result['status']} — {result['mensagem']}"
            )

        for client_id, index in last_result_index_by_client.items():
            results[index]["principal"] = "Sim"
        if apply and last_primary_by_client:
            for client_id, addr_id in last_primary_by_client.items():
                set_client_primary_addr(cur, client_id, addr_id)
            conn.commit()
            print(
                f"[{now_iso()}] Principal: último endereço de {len(last_primary_by_client)} cliente(s)"
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
        description="Migra endereços do WPS para o FGP (chave = codigo_pedido)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    template = sub.add_parser("template", help="Gera a planilha Excel modelo")
    template.add_argument("output", nargs="?", help="Caminho do .xlsx (padrão: scripts/fgp-migracao-enderecos-wps.xlsx)")
    template.set_defaults(func=cmd_template)

    importer = sub.add_parser("import", help="Valida e importa a planilha preenchida")
    importer.add_argument("spreadsheet", help="Planilha .xlsx preenchida")
    importer.add_argument("--apply", action="store_true", help="Grava no banco (sem esta flag é só conferência)")
    importer.add_argument(
        "--overwrite",
        action="store_true",
        help="Religa pedidos que já têm addrId (não apaga o endereço antigo)",
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
