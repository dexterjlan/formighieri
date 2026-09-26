const GESTAO_IMPORT_TEMPLATE_FILENAME = 'fgp-importacao-pedidos-projetos.xlsx';
const GESTAO_IMPORT_SHEET_NAME = 'Importacao';
/** Importação cria projetos sempre com este status FGP (não há coluna de status na planilha). */
const GESTAO_IMPORT_PROJECT_STATUS_NAME = 'Vendido';

const gestaoImportClienteIdByName = new Map();

const GESTAO_IMPORT_COLUMNS = [
    { key: 'orderCode', header: 'codigo_pedido', label: 'Código do pedido', required: true },
    { key: 'saleDate', header: 'data_venda', label: 'Data de venda', required: true },
    { key: 'clientName', header: 'cliente', label: 'Cliente', required: true },
    { key: 'consultantName', header: 'consultor', label: 'Consultor (WPS)', required: true },
    { key: 'architectName', header: 'arquiteto', label: 'Arquiteto', required: false },
    { key: 'architectPhone', header: 'arquiteto_telefone', label: 'Telefone do arquiteto', required: false },
    { key: 'architectEmail', header: 'arquiteto_email', label: 'E-mail do arquiteto', required: false },
    { key: 'clientDeliveryDate', header: 'entrega_cliente', label: 'Entrega no cliente', required: false },
    { key: 'addrPostalCode', header: 'endereco_cep', label: 'CEP do endereço do pedido', required: false },
    { key: 'addrNumber', header: 'endereco_numero', label: 'Número do endereço', required: false },
    { key: 'addrComplement', header: 'endereco_complemento', label: 'Complemento do endereço', required: false },
    { key: 'projectCode', header: 'codigo_projeto', label: 'Código do projeto', required: true },
    { key: 'projectName', header: 'nome_projeto', label: 'Nome do projeto', required: true },
    { key: 'environmentName', header: 'ambiente', label: 'Ambiente', required: true },
    { key: 'saleValue', header: 'valor_venda', label: 'Valor de venda', required: false }
];

const GESTAO_IMPORT_HEADER_ALIASES = {
    codigo_pedido: 'orderCode',
    pedido: 'orderCode',
    order_code: 'orderCode',
    data_venda: 'saleDate',
    dt_venda: 'saleDate',
    sale_date: 'saleDate',
    cliente: 'clientName',
    client_name: 'clientName',
    consultor: 'consultantName',
    consultant: 'consultantName',
    arquiteto: 'architectName',
    architect: 'architectName',
    architect_name: 'architectName',
    arquiteto_telefone: 'architectPhone',
    architect_phone: 'architectPhone',
    telefone_arquiteto: 'architectPhone',
    arquiteto_email: 'architectEmail',
    architect_email: 'architectEmail',
    email_arquiteto: 'architectEmail',
    entrega_cliente: 'clientDeliveryDate',
    data_entrega_cliente: 'clientDeliveryDate',
    endereco_cep: 'addrPostalCode',
    cep: 'addrPostalCode',
    cep_pedido: 'addrPostalCode',
    pedido_cep: 'addrPostalCode',
    endereco_numero: 'addrNumber',
    numero_endereco: 'addrNumber',
    endereco_complemento: 'addrComplement',
    complemento_endereco: 'addrComplement',
    codigo_projeto: 'projectCode',
    project_code: 'projectCode',
    nome_projeto: 'projectName',
    projeto: 'projectName',
    project_name: 'projectName',
    ambiente: 'environmentName',
    environment: 'environmentName',
    valor_venda: 'saleValue',
    sale_value: 'saleValue'
};

const gestaoImportViaCepCache = new Map();
let gestaoImportDefaultAddrLabelIdPromise = null;

function gestaoImportDigitsOnlyPostalCode(value) {
    if (typeof digitsOnlyPostalCode === 'function') {
        return digitsOnlyPostalCode(value);
    }
    return String(value ?? '').replace(/\D/g, '').slice(0, 8);
}

function normalizeGestaoImportAddrToken(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeGestaoImportAddrState(value) {
    if (typeof normalizeAddrState === 'function') {
        return normalizeAddrState(value);
    }
    return String(value || '').trim().toUpperCase().slice(0, 2);
}

function gestaoImportOrderHasAddrFields(order) {
    return Boolean(gestaoImportDigitsOnlyPostalCode(order?.addrPostalCode));
}

function gestaoImportOrderAddrKey(order) {
    const postalCode = gestaoImportDigitsOnlyPostalCode(order?.addrPostalCode);
    if (!postalCode) return '';
    return [
        postalCode,
        normalizeGestaoImportAddrToken(order?.addrNumber),
        normalizeGestaoImportAddrToken(order?.addrComplement)
    ].join('|');
}

async function fetchGestaoImportAddrFromViaCep(postalCode) {
    const cep = gestaoImportDigitsOnlyPostalCode(postalCode);
    if (cep.length !== 8) {
        return { error: 'CEP inválido (informe 8 dígitos).' };
    }
    if (gestaoImportViaCepCache.has(cep)) {
        return gestaoImportViaCepCache.get(cep);
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) {
            const result = { error: 'Não foi possível consultar o CEP.' };
            gestaoImportViaCepCache.set(cep, result);
            return result;
        }
        const data = await response.json();
        if (data?.erro) {
            const result = { error: 'CEP não encontrado.' };
            gestaoImportViaCepCache.set(cep, result);
            return result;
        }
        const result = {
            postalCode: cep,
            street: String(data.logradouro || '').trim(),
            neighborhood: String(data.bairro || '').trim(),
            city: String(data.localidade || '').trim(),
            state: normalizeGestaoImportAddrState(data.uf)
        };
        gestaoImportViaCepCache.set(cep, result);
        return result;
    } catch (error) {
        console.warn('fetchGestaoImportAddrFromViaCep:', error);
        const result = { error: 'Não foi possível consultar o CEP.' };
        gestaoImportViaCepCache.set(cep, result);
        return result;
    }
}

async function getGestaoImportDefaultAddrLabelId() {
    if (!gestaoImportDefaultAddrLabelIdPromise) {
        gestaoImportDefaultAddrLabelIdPromise = (async () => {
            if (typeof loadAddrLabels === 'function') {
                const labels = await loadAddrLabels(true);
                const firstId = labels?.[0]?.id;
                if (firstId) return Number(firstId);
            }
            const { data, error } = await supabaseClient
                .from('addrlabel')
                .select('id')
                .eq('isActive', true)
                .order('sortOrder', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (error) {
                console.warn('getGestaoImportDefaultAddrLabelId:', error);
                return null;
            }
            return data?.id ? Number(data.id) : null;
        })();
    }
    return gestaoImportDefaultAddrLabelIdPromise;
}

async function findGestaoImportExistingClientAddrId(clientId, postalCode, number, complement) {
    const { data, error } = await supabaseClient
        .from('addr')
        .select('id, postalCode, number, complement')
        .eq('ownerType', 'client')
        .eq('ownerId', clientId)
        .eq('isActive', true);

    if (error) {
        throw new Error(error.message);
    }

    const targetNumber = normalizeGestaoImportAddrToken(number);
    const targetComplement = normalizeGestaoImportAddrToken(complement);
    const cep = gestaoImportDigitsOnlyPostalCode(postalCode);

    const match = (data || []).find(row =>
        gestaoImportDigitsOnlyPostalCode(row.postalCode) === cep
        && normalizeGestaoImportAddrToken(row.number) === targetNumber
        && normalizeGestaoImportAddrToken(row.complement) === targetComplement
    );

    return match?.id ? Number(match.id) : null;
}

async function resolveGestaoImportOrderAddrId(clientId, order) {
    if (!gestaoImportOrderHasAddrFields(order)) {
        return { addrId: null };
    }

    const postalCode = gestaoImportDigitsOnlyPostalCode(order.addrPostalCode);
    const number = String(order.addrNumber || '').trim();
    const complement = String(order.addrComplement || '').trim();

    const existingId = await findGestaoImportExistingClientAddrId(clientId, postalCode, number, complement);
    if (existingId) {
        return { addrId: existingId };
    }

    const viaCep = await fetchGestaoImportAddrFromViaCep(postalCode);
    if (viaCep.error) {
        return { error: viaCep.error };
    }
    if (!viaCep.street || !viaCep.city || viaCep.state.length !== 2) {
        return { error: 'CEP sem logradouro/cidade/UF completos na consulta.' };
    }

    const labelId = await getGestaoImportDefaultAddrLabelId();
    if (!labelId) {
        return { error: 'Cadastre ao menos um label de endereço ativo (Gestão → Endereços).' };
    }

    const now = new Date().toISOString();
    const payload = {
        ownerType: 'client',
        ownerId: clientId,
        labelId,
        nickname: null,
        postalCode: viaCep.postalCode,
        street: viaCep.street,
        number: number || null,
        complement: complement || null,
        neighborhood: viaCep.neighborhood || null,
        city: viaCep.city,
        state: viaCep.state,
        country: 'BR',
        notes: null,
        isPrimary: false,
        isActive: true,
        createdAt: now,
        createdById: currentUser?.id || null,
        updatedAt: now,
        updatedById: currentUser?.id || null
    };

    const { data, error } = await supabaseClient
        .from('addr')
        .insert(payload)
        .select('id')
        .single();

    if (error) {
        return { error: error.message };
    }

    return { addrId: data?.id ? Number(data.id) : null };
}

async function persistGestaoImportOrderAddrId(orderId, clientId, order, now) {
    const addrResult = await resolveGestaoImportOrderAddrId(clientId, order);
    if (addrResult.error) {
        return { error: `Pedido ${order.orderCode}: ${addrResult.error}` };
    }
    if (!addrResult.addrId) {
        return { ok: true };
    }

    let { error } = await supabaseClient
        .from('salesOrders')
        .update({
            addrId: addrResult.addrId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', orderId);

    if (error?.message?.includes('addrId')) {
        return { ok: true };
    }
    if (error) {
        return { error: `Pedido ${order.orderCode}: não foi possível vincular o endereço — ${error.message}` };
    }
    return { ok: true, addrId: addrResult.addrId };
}

async function insertGestaoImportProjectRecord(orderId, project, timestamps) {
    const { createdAt, updatedAt } = timestamps;
    const payloadVariants = [
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            statusId: project.statusId,
            createdAt,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt
        },
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId: project.statusId,
            createdAt,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt
        },
        {
            orderId,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId: project.statusId,
            createdAt,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt
        }
    ];

    let lastError = null;
    const seen = new Set();

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { data, error } = await supabaseClient
            .from('OrderProject')
            .insert(cleanPayload)
            .select('id')
            .single();

        if (!error && data?.id) return data.id;
        lastError = error;
    }

    throw lastError || new Error('Não foi possível inserir o projeto.');
}

async function insertGestaoImportProject(orderId, project, now) {
    return insertGestaoImportProjectRecord(orderId, project, {
        createdAt: now,
        updatedAt: now
    });
}

let gestaoImportSelectedFile = null;
let gestaoImportValidationPassed = false;
let sheetJsLoadPromise = null;

const SHEET_JS_LIBRARY_SOURCES = [
    'js/vendor/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
];

function loadSheetJsScript(src) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Tempo esgotado ao carregar a biblioteca de Excel.'));
        }, 30000);

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            clearTimeout(timeoutId);
            if (window.XLSX) resolve(window.XLSX);
            else reject(new Error('Biblioteca de Excel indisponível.'));
        };
        script.onerror = () => {
            clearTimeout(timeoutId);
            script.remove();
            reject(new Error('Não foi possível carregar a biblioteca de Excel.'));
        };
        document.head.appendChild(script);
    });
}

function normalizeGestaoImportHeader(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function loadSheetJsLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);

    if (!sheetJsLoadPromise) {
        sheetJsLoadPromise = (async () => {
            let lastError = null;

            for (const src of SHEET_JS_LIBRARY_SOURCES) {
                try {
                    return await loadSheetJsScript(src);
                } catch (error) {
                    lastError = error;
                }
            }

            throw lastError || new Error('Não foi possível carregar a biblioteca de Excel.');
        })().catch(error => {
            sheetJsLoadPromise = null;
            throw error;
        });
    }

    return sheetJsLoadPromise;
}

function parseGestaoImportDate(value) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return toGestaoInputDate(value.toISOString());
    }

    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed) {
            const month = String(parsed.m).padStart(2, '0');
            const day = String(parsed.d).padStart(2, '0');
            return `${parsed.y}-${month}-${day}`;
        }
    }

    const text = String(value).trim();
    if (!text) return null;

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
        const day = brMatch[1].padStart(2, '0');
        const month = brMatch[2].padStart(2, '0');
        return `${brMatch[3]}-${month}-${day}`;
    }

    const parsedDate = new Date(text);
    if (!Number.isNaN(parsedDate.getTime())) {
        return toGestaoInputDate(parsedDate.toISOString());
    }

    return null;
}

function parseGestaoImportSaleValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value * 100) / 100;
    }
    return parseSaleValueInput(String(value));
}

function getGestaoImportExampleRow(consultantName = '') {
    const environment = gestaoEnvironmentTypesCache[0]?.name || 'Cozinha';
    const consultantSelect = document.getElementById('gestao-ord-consultant');
    const selectedConsultantOption = consultantSelect?.selectedOptions?.[0]
        || consultantSelect?.querySelector('option[value]:not([value=""])');
    const consultant = consultantName
        || selectedConsultantOption?.textContent?.trim()
        || 'Nome do Consultor';
    return {
        orderCode: '123456',
        saleDate: '2026-01-10',
        clientName: 'Cliente Exemplo Ltda',
        consultantName: consultant,
        architectName: 'Arquiteto Exemplo',
        architectPhone: '11999999999',
        architectEmail: 'arquiteto@exemplo.com',
        clientDeliveryDate: '2026-08-15',
        addrPostalCode: '01310-100',
        addrNumber: '1000',
        addrComplement: 'Apto 12',
        projectCode: '101',
        projectName: 'Cozinha Principal',
        environmentName: environment,
        saleValue: '15000,00'
    };
}

function buildGestaoImportTemplateRows(consultantName = '') {
    const headers = GESTAO_IMPORT_COLUMNS.map(column => column.header);
    const example = getGestaoImportExampleRow(consultantName);
    const exampleRow = GESTAO_IMPORT_COLUMNS.map(column => example[column.key] ?? '');
    return [headers, exampleRow];
}

async function downloadGestaoImportTemplate() {
    if (!canAccessGestao()) return;

    try {
        const XLSX = await loadSheetJsLibrary();
        await loadGestaoFormOptions();
        await loadGestaoConsultants();

        const { data: consultants } = await supabaseClient
            .from('appUsers')
            .select('name')
            .eq('role', 'Consultor')
            .eq('isActive', true)
            .order('name', { ascending: true });

        const { data: consultorWpsList } = await supabaseClient
            .from('importConsultorWPS')
            .select('consultantWps, consultantFgp')
            .order('consultantWps', { ascending: true });

        const importSheet = XLSX.utils.aoa_to_sheet(
            buildGestaoImportTemplateRows(consultants?.[0]?.name || '')
        );
        importSheet['!cols'] = GESTAO_IMPORT_COLUMNS.map(() => ({ wch: 18 }));

        const referenceRows = [
            ['Campo', 'Obrigatório', 'Descrição'],
            ...GESTAO_IMPORT_COLUMNS.map(column => [
                column.header,
                column.required ? 'Sim' : 'Não',
                column.label
            ]),
            [],
            ['Endereço do pedido', 'Não', 'Opcional — CEP consulta logradouro/bairro/cidade/UF (ViaCEP); informe número e complemento.'],
            ['endereco_cep', '8 dígitos'],
            ['endereco_numero', 'Número'],
            ['endereco_complemento', 'Complemento'],
            [],
            ['Ambientes cadastrados', '', ''],
            ['Nome'],
            ...(gestaoEnvironmentTypesCache.length
                ? gestaoEnvironmentTypesCache.map(item => [item.name])
                : [['(nenhum cadastrado)']]),
            [],
            [`Status dos projetos importados`, 'Sim', `Sempre "${GESTAO_IMPORT_PROJECT_STATUS_NAME}" (FGP).`],
            [],
            ['Consultor WPS → FGP (consultor na planilha)', '', ''],
            ['consultantWps', 'consultantFgp'],
            ...((consultorWpsList || []).length
                ? consultorWpsList.map(item => [item.consultantWps, item.consultantFgp])
                : [['(execute create-import-wps-mappings.sql)']]),
        ];

        const referencesSheet = XLSX.utils.aoa_to_sheet(referenceRows);
        referencesSheet['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 28 }, { wch: 24 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, importSheet, GESTAO_IMPORT_SHEET_NAME);
        XLSX.utils.book_append_sheet(workbook, referencesSheet, 'Referencias');
        XLSX.writeFile(workbook, GESTAO_IMPORT_TEMPLATE_FILENAME);
    } catch (error) {
        alertAppDialog('Erro ao gerar template: ' + error.message);
    }
}

function mapGestaoImportRow(rawRow, rowNumber) {
    const mapped = { rowNumber, raw: rawRow, errors: [] };

    Object.entries(rawRow).forEach(([header, value]) => {
        const normalizedHeader = normalizeGestaoImportHeader(header);
        const fieldKey = GESTAO_IMPORT_HEADER_ALIASES[normalizedHeader];
        if (!fieldKey) return;

        if (value === null || value === undefined) {
            mapped[fieldKey] = '';
            return;
        }

        mapped[fieldKey] = typeof value === 'string' ? value.trim() : value;
    });

    mapped.orderCode = normalizeProjectCodeInput(mapped.orderCode || '');
    mapped.projectCode = normalizeProjectCodeInput(mapped.projectCode || '');
    mapped.clientName = String(mapped.clientName || '').trim();
    mapped.consultantName = String(mapped.consultantName || '').trim();
    mapped.architectName = String(mapped.architectName || '').trim();
    mapped.architectPhone = String(mapped.architectPhone || '').trim();
    mapped.architectEmail = String(mapped.architectEmail || '').trim();
    mapped.projectName = String(mapped.projectName || '').trim();
    mapped.environmentName = String(mapped.environmentName || '').trim();
    mapped.saleDate = parseGestaoImportDate(mapped.saleDate);
    mapped.clientDeliveryDate = parseGestaoImportDate(mapped.clientDeliveryDate);
    mapped.addrPostalCode = gestaoImportDigitsOnlyPostalCode(mapped.addrPostalCode);
    mapped.addrNumber = String(mapped.addrNumber || '').trim();
    mapped.addrComplement = String(mapped.addrComplement || '').trim();
    mapped.saleValue = parseGestaoImportSaleValue(mapped.saleValue);

    if (!mapped.orderCode) mapped.errors.push('Código do pedido é obrigatório.');
    if (!mapped.clientName) mapped.errors.push('Cliente é obrigatório.');
    if (!mapped.consultantName) mapped.errors.push('Consultor é obrigatório.');
    if (!mapped.projectCode) mapped.errors.push('Código do projeto é obrigatório.');
    if (!mapped.projectName) mapped.errors.push('Nome do projeto é obrigatório.');
    if (!mapped.environmentName) mapped.errors.push('Ambiente é obrigatório.');
    if (mapped.projectCode && !isNumericProjectCode(mapped.projectCode)) {
        mapped.errors.push('Código do projeto deve conter somente números.');
    }
    if (Number.isNaN(mapped.saleValue)) {
        mapped.errors.push('Valor de venda inválido.');
    }
    const hasAddrNumberOrComplement = mapped.addrNumber || mapped.addrComplement;
    if (hasAddrNumberOrComplement && mapped.addrPostalCode.length !== 8) {
        mapped.errors.push('Informe um CEP válido (8 dígitos) em "endereco_cep".');
    }
    if (mapped.addrPostalCode && mapped.addrPostalCode.length !== 8) {
        mapped.errors.push('CEP inválido em "endereco_cep" (use 8 dígitos).');
    }

    ['saleDate', 'clientDeliveryDate'].forEach(field => {
        if (mapped[field] === null && rawRow && Object.keys(rawRow).some(key => {
            const alias = GESTAO_IMPORT_HEADER_ALIASES[normalizeGestaoImportHeader(key)];
            return alias === field && rawRow[key] !== null && rawRow[key] !== undefined && rawRow[key] !== '';
        })) {
            const fieldHeader = GESTAO_IMPORT_COLUMNS.find(column => column.key === field)?.header || field;
            mapped.errors.push(`Data inválida em "${fieldHeader}".`);
        }
    });

    return mapped;
}

function isGestaoImportRowEmpty(rawRow) {
    return Object.values(rawRow).every(value => String(value ?? '').trim() === '');
}

async function parseGestaoImportWorkbook(arrayBuffer) {
    const XLSX = await loadSheetJsLibrary();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.includes(GESTAO_IMPORT_SHEET_NAME)
        ? GESTAO_IMPORT_SHEET_NAME
        : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        return { rows: [], errors: ['Planilha de importação não encontrada.'] };
    }

    const table = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const rows = [];
    const errors = [];

    table.forEach((rawRow, index) => {
        if (isGestaoImportRowEmpty(rawRow)) return;

        const rowNumber = index + 2;
        const mapped = mapGestaoImportRow(rawRow, rowNumber);
        rows.push(mapped);
        if (mapped.errors.length) {
            errors.push(`Linha ${rowNumber}: ${mapped.errors.join(' ')}`);
        }
    });

    if (!rows.length) {
        errors.push('Nenhuma linha de dados encontrada na planilha.');
    }

    return { rows, errors };
}

function groupGestaoImportRowsByOrder(rows) {
    const orders = new Map();

    rows.forEach(row => {
        if (row.errors.length) return;

        const key = row.orderCode;
        if (!orders.has(key)) {
            orders.set(key, {
                orderCode: row.orderCode,
                clientName: row.clientName,
                consultantName: row.consultantName,
                architectName: row.architectName || '',
                architectPhone: row.architectPhone || '',
                architectEmail: row.architectEmail || '',
                saleDate: row.saleDate || null,
                saleDatesSeen: row.saleDate ? new Set([row.saleDate]) : new Set(),
                clientDeliveryDate: row.clientDeliveryDate || null,
                clientDeliveryDatesSeen: row.clientDeliveryDate ? new Set([row.clientDeliveryDate]) : new Set(),
                addrPostalCode: '',
                addrNumber: '',
                addrComplement: '',
                _addrKey: '',
                projects: [],
                rowNumbers: []
            });
        }

        const order = orders.get(key);

        if (order.clientName !== row.clientName) {
            row.errors.push(`Cliente diverge do pedido ${key} (linha ${order.rowNumbers[0]}).`);
            return;
        }
        if (order.consultantName !== row.consultantName) {
            row.errors.push(`Consultor diverge do pedido ${key} (linha ${order.rowNumbers[0]}).`);
            return;
        }
        if (row.architectName) {
            if (order.architectName
                && String(order.architectName).trim().toLowerCase() !== String(row.architectName).trim().toLowerCase()) {
                row.errors.push(`Arquiteto diverge do pedido ${key} (linha ${order.rowNumbers[0]}).`);
                return;
            }
            order.architectName = order.architectName || row.architectName;
            if (row.architectPhone && !order.architectPhone) order.architectPhone = row.architectPhone;
            if (row.architectEmail && !order.architectEmail) order.architectEmail = row.architectEmail;
        }
        if (row.saleDate) {
            order.saleDatesSeen.add(row.saleDate);
            order.saleDate = pickLatestIsoDate(order.saleDate, row.saleDate);
        }
        if (row.clientDeliveryDate) {
            order.clientDeliveryDatesSeen.add(row.clientDeliveryDate);
            order.clientDeliveryDate = pickLatestIsoDate(order.clientDeliveryDate, row.clientDeliveryDate);
        }
        if (gestaoImportDigitsOnlyPostalCode(row.addrPostalCode) || row.addrNumber || row.addrComplement) {
            const rowKey = gestaoImportOrderAddrKey({
                addrPostalCode: row.addrPostalCode,
                addrNumber: row.addrNumber,
                addrComplement: row.addrComplement
            });
            if (!order._addrKey && rowKey) {
                order.addrPostalCode = gestaoImportDigitsOnlyPostalCode(row.addrPostalCode);
                order.addrNumber = String(row.addrNumber || '').trim();
                order.addrComplement = String(row.addrComplement || '').trim();
                order._addrKey = rowKey;
            } else if (rowKey && order._addrKey && rowKey !== order._addrKey) {
                row.errors.push(`Endereço diverge do pedido ${key} (linha ${order.rowNumbers[0]}).`);
                return;
            }
        }

        if (order.projects.some(project => project.projectCode === row.projectCode)) {
            row.errors.push(`Código de projeto duplicado (${row.projectCode}) no pedido ${key}.`);
            return;
        }

        order.rowNumbers.push(row.rowNumber);
        order.projects.push(row);
    });

    return [...orders.values()];
}

async function loadGestaoImportWpsMappings() {
    const consultorWpsToFgp = {};
    let consultorWpsRows = [];

    const consultorResult = await supabaseClient
        .from('importConsultorWPS')
        .select('consultantWps, consultantFgp');

    if (!consultorResult.error) {
        consultorWpsRows = consultorResult.data || [];
        consultorWpsRows.forEach(row => {
            const key = String(row.consultantWps || '').trim().toLowerCase();
            if (key) consultorWpsToFgp[key] = String(row.consultantFgp || '').trim();
        });
    } else if (!consultorResult.error.message?.includes('importConsultorWPS')) {
        console.error('loadGestaoImportWpsMappings consultor:', consultorResult.error);
    }

    return { consultorWpsToFgp, consultorWpsRows };
}

function buildGestaoImportConsultantResolver(consultants, consultorWpsToFgp, consultorWpsRows = []) {
    const consultantByName = {};
    const consultantCanonicalNameByKey = {};

    (consultants || []).forEach(item => {
        const canonical = String(item.name || '').trim();
        const key = canonical.toLowerCase();
        if (!key) return;
        consultantByName[key] = item.id;
        consultantCanonicalNameByKey[key] = canonical;
    });

    const consultantResolvedNameByAlias = { ...consultantCanonicalNameByKey };

    Object.entries(consultorWpsToFgp || {}).forEach(([wpsKey, fgpName]) => {
        const fgpKey = String(fgpName || '').trim().toLowerCase();
        const canonical = consultantCanonicalNameByKey[fgpKey]
            || consultantCanonicalNameByKey[wpsKey];
        if (canonical) {
            consultantResolvedNameByAlias[wpsKey] = canonical;
            if (fgpKey) consultantResolvedNameByAlias[fgpKey] = canonical;
        }
    });

    (consultorWpsRows || []).forEach(row => {
        const wpsKey = String(row.consultantWps || '').trim().toLowerCase();
        const fgpKey = String(row.consultantFgp || '').trim().toLowerCase();
        const canonical = consultantCanonicalNameByKey[fgpKey]
            || consultantCanonicalNameByKey[wpsKey];
        if (!canonical) return;
        if (wpsKey) consultantResolvedNameByAlias[wpsKey] = canonical;
        if (fgpKey) consultantResolvedNameByAlias[fgpKey] = canonical;
    });

    return {
        consultantByName,
        consultantCanonicalNameByKey,
        consultantResolvedNameByAlias
    };
}

function resolveGestaoImportConsultantName(consultorWps, lookups) {
    const key = String(consultorWps || '').trim().toLowerCase();
    if (!key) return null;
    return lookups.consultantResolvedNameByAlias?.[key] || null;
}

function mapGestaoImportConsultorWpsToFgp(consultorWps, lookups) {
    return resolveGestaoImportConsultantName(consultorWps, lookups);
}

function getGestaoImportSoldProjectStatusId(lookups) {
    const statusKey = GESTAO_IMPORT_PROJECT_STATUS_NAME.toLowerCase();
    const statusId = lookups.statusByName?.[statusKey]
        || (typeof getDefaultProjectStatusId === 'function' ? getDefaultProjectStatusId() : null);
    if (!statusId) {
        return {
            error: `Status "${GESTAO_IMPORT_PROJECT_STATUS_NAME}" não encontrado no cadastro de status de projeto.`
        };
    }
    return { statusId };
}

async function loadGestaoImportLookups() {
    await loadGestaoFormOptions();
    await loadGestaoConsultants();

    const { data: consultants } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('isActive', true)
        .eq('role', 'Consultor')
        .order('name', { ascending: true });

    const { data: clientes } = await supabaseClient
        .from('Client')
        .select('id, name, isActive');

    const wpsMappings = await loadGestaoImportWpsMappings();
    const consultantResolver = buildGestaoImportConsultantResolver(
        consultants,
        wpsMappings.consultorWpsToFgp,
        wpsMappings.consultorWpsRows
    );

    return {
        environmentByName: Object.fromEntries(
            gestaoEnvironmentTypesCache.map(item => [item.name.trim().toLowerCase(), item.id])
        ),
        statusByName: Object.fromEntries(
            gestaoProjectStatusesCache
                .filter(status => status.isActive !== false)
                .map(status => [status.name.trim().toLowerCase(), status.id])
        ),
        clientByName: Object.fromEntries(
            (clientes || [])
                .filter(cliente => cliente.isActive !== false)
                .map(cliente => [cliente.name.trim().toLowerCase(), cliente.id])
        ),
        ...consultantResolver,
        consultorWpsToFgp: wpsMappings.consultorWpsToFgp
    };
}

function resetGestaoImportClienteCache() {
    gestaoImportClienteIdByName.clear();
    gestaoImportViaCepCache.clear();
    gestaoImportDefaultAddrLabelIdPromise = null;
}

async function resolveGestaoImportClienteId(clientName, lookups = null) {
    const trimmed = String(clientName || '').trim();
    if (!trimmed) return null;

    const cacheKey = trimmed.toLowerCase();
    if (gestaoImportClienteIdByName.has(cacheKey)) {
        return gestaoImportClienteIdByName.get(cacheKey);
    }

    const existingId = lookups?.clientByName?.[cacheKey];
    if (existingId) {
        gestaoImportClienteIdByName.set(cacheKey, existingId);
        return existingId;
    }

    if (typeof resolveOrCreateClienteId !== 'function') {
        return null;
    }

    const clientId = await resolveOrCreateClienteId(trimmed);
    gestaoImportClienteIdByName.set(cacheKey, clientId);
    if (clientId && lookups?.clientByName) {
        lookups.clientByName[cacheKey] = clientId;
    }
    return clientId;
}

function resolveGestaoImportConsultantUserId(consultantNameFromSheet, orderCode, lookups) {
    const consultantFgp = mapGestaoImportConsultorWpsToFgp(consultantNameFromSheet, lookups);
    if (!consultantFgp) {
        return {
            error: `Pedido ${orderCode}: consultor "${consultantNameFromSheet}" não encontrado no cadastro nem no DE-PARA importConsultorWPS.`
        };
    }

    const consultantUserId = lookups.consultantByName?.[consultantFgp.trim().toLowerCase()] || null;
    if (!consultantUserId) {
        return {
            error: `Pedido ${orderCode}: consultor "${consultantFgp}" não encontrado entre os usuários Consultor ativos.`
        };
    }

    return { consultantUserId, consultantFgp };
}

async function resolveGestaoImportClienteIdForOrder(order, lookups) {
    const clientId = await resolveGestaoImportClienteId(order.clientName, lookups);
    if (!clientId) {
        return {
            error: `Pedido ${order.orderCode}: não foi possível cadastrar ou localizar o cliente "${order.clientName}".`
        };
    }
    return { clientId };
}

function resolveGestaoImportProject(row, lookups) {
    const environmentTypeId = lookups.environmentByName[row.environmentName.trim().toLowerCase()];
    if (!environmentTypeId) {
        return { error: `Ambiente "${row.environmentName}" não encontrado.` };
    }

    const statusResult = getGestaoImportSoldProjectStatusId(lookups);
    if (statusResult.error) {
        return { error: statusResult.error };
    }
    const statusId = statusResult.statusId;

    return {
        project: {
            projectCode: row.projectCode,
            name: row.projectName,
            environmentTypeId,
            saleValue: row.saleValue,
            statusId
        }
    };
}

async function createGestaoImportOrder(order, lookups, now) {
    const projects = [];
    for (const row of order.projects) {
        const resolved = resolveGestaoImportProject(row, lookups);
        if (resolved.error) {
            return { ok: false, message: `Pedido ${order.orderCode}, linha ${row.rowNumber}: ${resolved.error}` };
        }
        projects.push({ ...resolved.project, rowNumber: row.rowNumber });
    }

    const { data: existingOrder } = await supabaseClient
        .from('salesOrders')
        .select('id, clientId')
        .eq('orderCode', order.orderCode)
        .maybeSingle();

    let orderId;
    let createdNewOrder = false;
    let orderClientId = existingOrder?.clientId || null;

    if (existingOrder) {
        orderId = existingOrder.id;
    } else {
        const consultantResult = resolveGestaoImportConsultantUserId(
            order.consultantName,
            order.orderCode,
            lookups
        );
        if (consultantResult.error) {
            return { ok: false, message: consultantResult.error };
        }

        if (!order.saleDate) {
            return { ok: false, message: `Pedido ${order.orderCode}: informe a data de venda (coluna data_venda).` };
        }

        const clientResult = await resolveGestaoImportClienteIdForOrder(order, lookups);
        if (clientResult.error) {
            return { ok: false, message: clientResult.error };
        }

        const addrResult = await resolveGestaoImportOrderAddrId(clientResult.clientId, order);
        if (addrResult.error) {
            return { ok: false, message: `Pedido ${order.orderCode}: ${addrResult.error}` };
        }

        const orderPayload = {
            orderCode: order.orderCode,
            clientId: clientResult.clientId,
            consultantUserId: consultantResult.consultantUserId,
            saleDate: order.saleDate || undefined,
            clientDeliveryDate: order.clientDeliveryDate || undefined,
            addrId: addrResult.addrId || undefined,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        let { data: created, error } = await supabaseClient
            .from('salesOrders')
            .insert(orderPayload)
            .select('id')
            .single();

        if (error?.message?.includes('saleDate')
            || error?.message?.includes('clientDeliveryDate')
            || error?.message?.includes('updatedAt')
            || error?.message?.includes('addrId')) {
            const { saleDate: _s, clientDeliveryDate: _d, updatedAt: _u, addrId: _a, ...fallback } = orderPayload;
            ({ data: created, error } = await supabaseClient
                .from('salesOrders')
                .insert(fallback)
                .select('id')
                .single());
        }

        if (error) {
            return { ok: false, message: `Pedido ${order.orderCode}: ${error.message}` };
        }

        orderId = created.id;
        createdNewOrder = true;
        orderClientId = clientResult.clientId;

        if (addrResult.addrId) {
            const persistAddr = await persistGestaoImportOrderAddrId(orderId, clientResult.clientId, order, now);
            if (persistAddr.error) {
                await supabaseClient.from('salesOrders').delete().eq('id', orderId);
                return { ok: false, message: persistAddr.error };
            }
        }
    }

    if (existingOrder && gestaoImportOrderHasAddrFields(order)) {
        const clientId = orderClientId || (await resolveGestaoImportClienteIdForOrder(order, lookups))?.clientId;
        if (clientId) {
            const persistAddr = await persistGestaoImportOrderAddrId(orderId, clientId, order, now);
            if (persistAddr.error) {
                return { ok: false, message: persistAddr.error };
            }
        }
    }

    if (order.architectName && typeof resolveOrCreateArchitectId === 'function') {
        const architectId = await resolveOrCreateArchitectId(order.architectName, {
            phone: order.architectPhone,
            email: order.architectEmail
        });
        if (architectId && typeof persistSalesOrderArchitectId === 'function') {
            await persistSalesOrderArchitectId(orderId, architectId);
        }
    }

    const { data: existingProjects } = await supabaseClient
        .from('OrderProject')
        .select('projectCode')
        .eq('orderId', orderId);

    const existingProjectCodes = new Set(
        (existingProjects || [])
            .map(item => normalizeProjectCodeInput(item.projectCode || ''))
            .filter(Boolean)
    );

    const importedProjects = [];
    const projectErrors = [];

    if (order.saleDate && typeof persistSalesOrderSaleDate === 'function') {
        try {
            await persistSalesOrderSaleDate(orderId, order.saleDate, { orderCode: order.orderCode });
        } catch (saleDateError) {
            if (createdNewOrder) {
                await supabaseClient.from('salesOrders').delete().eq('id', orderId);
                return { ok: false, message: `Pedido ${order.orderCode}: ${saleDateError.message}` };
            }
            projectErrors.push(`Pedido ${order.orderCode}: data de venda não gravada — ${saleDateError.message}`);
        }
    }

    for (const project of projects) {
        if (existingProjectCodes.has(project.projectCode)) {
            projectErrors.push(
                `Pedido ${order.orderCode}, linha ${project.rowNumber}: projeto ${project.projectCode} já existe.`
            );
            continue;
        }

        try {
            const projectId = await insertGestaoImportProject(orderId, project, now);
            importedProjects.push({ projectId, project });
            existingProjectCodes.add(project.projectCode);
        } catch (projectError) {
            projectErrors.push(
                `Pedido ${order.orderCode}, linha ${project.rowNumber}: ${projectError.message}`
            );
        }
    }

    if (!importedProjects.length) {
        if (createdNewOrder) {
            await supabaseClient.from('salesOrders').delete().eq('id', orderId);
        }

        return {
            ok: false,
            message: projectErrors.join(' ') || `Pedido ${order.orderCode}: nenhum projeto importado.`
        };
    }

    const actionLabel = existingOrder ? 'adicionado(s)' : 'importado(s)';
    let successMessage = `Pedido ${order.orderCode}: ${importedProjects.length} projeto(s) ${actionLabel}.`;
    if (typeof tryLinkUniqueWonDealForClient === 'function' && orderClientId) {
        await tryLinkUniqueWonDealForClient(orderId, orderClientId);
    }
    const message = projectErrors.length
        ? `${successMessage} ${projectErrors.join(' ')}`
        : successMessage;

    return { ok: true, message, partial: projectErrors.length > 0 };
}

async function loadGestaoImportValidationContext(orders) {
    const orderCodes = [...new Set(orders.map(order => order.orderCode).filter(Boolean))];
    const existingOrdersByCode = new Map();
    const existingProjectsByOrderId = new Map();

    if (!orderCodes.length) {
        return { existingOrdersByCode, existingProjectsByOrderId };
    }

    const { data: existingOrders, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode')
        .in('orderCode', orderCodes);

    if (error) {
        throw new Error(`Erro ao verificar pedidos existentes: ${error.message}`);
    }

    (existingOrders || []).forEach(order => {
        const code = normalizeProjectCodeInput(order.orderCode || '');
        if (code) existingOrdersByCode.set(code, order);
    });

    const orderIds = (existingOrders || []).map(order => order.id).filter(Boolean);
    if (orderIds.length) {
        const { data: projects, error: projectsError } = await supabaseClient
            .from('OrderProject')
            .select('orderId, projectCode')
            .in('orderId', orderIds);

        if (projectsError) {
            throw new Error(`Erro ao verificar projetos existentes: ${projectsError.message}`);
        }

        (projects || []).forEach(project => {
            const orderId = Number(project.orderId);
            if (!existingProjectsByOrderId.has(orderId)) {
                existingProjectsByOrderId.set(orderId, new Set());
            }
            const code = normalizeProjectCodeInput(project.projectCode || '');
            if (code) existingProjectsByOrderId.get(orderId).add(code);
        });
    }

    return { existingOrdersByCode, existingProjectsByOrderId };
}

function validateGestaoImportOrder(order, lookups, context) {
    const errors = [];
    const notes = [];
    const importableProjects = [];

    for (const row of order.projects) {
        const resolved = resolveGestaoImportProject(row, lookups);
        if (resolved.error) {
            errors.push(`Pedido ${order.orderCode}, linha ${row.rowNumber}: ${resolved.error}`);
            continue;
        }
        importableProjects.push({ row, project: resolved.project });
    }

    const existingOrder = context.existingOrdersByCode.get(order.orderCode) || null;

    if (order.saleDatesSeen?.size > 1) {
        notes.push(
            `Pedido ${order.orderCode}: múltiplas datas de venda na planilha — será usada a maior (${formatGestaoDate(order.saleDate)}).`
        );
    }

    if (order.clientDeliveryDatesSeen?.size > 1) {
        notes.push(
            `Pedido ${order.orderCode}: múltiplas datas de entrega na planilha — será usada a maior (${formatGestaoDate(order.clientDeliveryDate)}).`
        );
    }

    if (existingOrder) {
        notes.push(`Pedido ${order.orderCode}: já cadastrado — serão adicionados apenas projetos novos.`);
        if (order.saleDate) {
            notes.push(`Pedido ${order.orderCode}: data de venda será atualizada para ${formatGestaoDate(order.saleDate)}.`);
        }
    } else {
        if (!order.saleDate) {
            errors.push(`Pedido ${order.orderCode}: informe a data de venda (coluna data_venda).`);
        }
        const consultantResult = resolveGestaoImportConsultantUserId(
            order.consultantName,
            order.orderCode,
            lookups
        );
        if (consultantResult.error) {
            errors.push(consultantResult.error);
        } else {
            notes.push(`Pedido ${order.orderCode}: será criado com consultor ${consultantResult.consultantFgp}.`);
            const clientKey = String(order.clientName || '').trim().toLowerCase();
            if (clientKey && !lookups.clientByName?.[clientKey]) {
                notes.push(`Pedido ${order.orderCode}: cliente "${order.clientName}" será cadastrado automaticamente.`);
            }
        }
    }

    if (order.architectName) {
        notes.push(`Pedido ${order.orderCode}: arquiteto "${order.architectName}" será cadastrado (se novo) e vinculado ao pedido.`);
    }

    if (gestaoImportOrderHasAddrFields(order)) {
        notes.push(`Pedido ${order.orderCode}: endereço (CEP ${order.addrPostalCode}) será consultado e vinculado ao pedido.`);
    }

    const existingProjectCodes = existingOrder
        ? context.existingProjectsByOrderId.get(Number(existingOrder.id)) || new Set()
        : new Set();

    const newProjectsInFile = new Set();

    for (const { row, project } of importableProjects) {
        const code = project.projectCode;
        if (existingProjectCodes.has(code)) {
            errors.push(`Pedido ${order.orderCode}, linha ${row.rowNumber}: projeto ${code} já existe no pedido.`);
            continue;
        }
        if (newProjectsInFile.has(code)) {
            errors.push(`Pedido ${order.orderCode}, linha ${row.rowNumber}: projeto ${code} duplicado na planilha.`);
            continue;
        }
        newProjectsInFile.add(code);
    }

    if (!importableProjects.length && !errors.length) {
        errors.push(`Pedido ${order.orderCode}: nenhum projeto válido para importação.`);
    } else if (!newProjectsInFile.size && !errors.length) {
        errors.push(`Pedido ${order.orderCode}: nenhum projeto novo para importar.`);
    } else if (newProjectsInFile.size) {
        notes.push(`Pedido ${order.orderCode}: ${newProjectsInFile.size} projeto(s) novo(s) serão importados.`);
    }

    return {
        ok: errors.length === 0,
        errors,
        notes,
        importableCount: newProjectsInFile.size
    };
}

async function validateGestaoImportFromFile(file) {
    const buffer = await file.arrayBuffer();
    const parsed = await parseGestaoImportWorkbook(buffer);

    if (parsed.errors.length) {
        return {
            valid: false,
            orderCount: 0,
            projectCount: 0,
            importableProjectCount: 0,
            errors: parsed.errors,
            notes: []
        };
    }

    const orders = groupGestaoImportRowsByOrder(parsed.rows);
    const rowErrors = parsed.rows
        .filter(row => row.errors.length)
        .map(row => `Linha ${row.rowNumber}: ${row.errors.join(' ')}`);

    if (rowErrors.length) {
        return {
            valid: false,
            orderCount: orders.length,
            projectCount: parsed.rows.length,
            importableProjectCount: 0,
            errors: rowErrors,
            notes: []
        };
    }

    if (!orders.length) {
        return {
            valid: false,
            orderCount: 0,
            projectCount: 0,
            importableProjectCount: 0,
            errors: ['Nenhum pedido encontrado na planilha.'],
            notes: []
        };
    }

    const lookups = await loadGestaoImportLookups();
    const context = await loadGestaoImportValidationContext(orders);

    const errors = [];
    const notes = [];
    let importableProjectCount = 0;

    for (const order of orders) {
        const result = validateGestaoImportOrder(order, lookups, context);
        errors.push(...result.errors);
        notes.push(...result.notes);
        importableProjectCount += result.importableCount;
    }

    const projectCount = parsed.rows.length;

    if (importableProjectCount === 0 && !errors.length) {
        errors.push('Nenhum projeto novo encontrado para importação.');
    }

    return {
        valid: errors.length === 0 && importableProjectCount > 0,
        orderCount: orders.length,
        projectCount,
        importableProjectCount,
        errors,
        notes
    };
}

async function runGestaoImportFromFile(file) {
    const buffer = await file.arrayBuffer();
    const parsed = await parseGestaoImportWorkbook(buffer);

    if (parsed.errors.length) {
        return {
            imported: 0,
            skipped: 0,
            messages: parsed.errors
        };
    }

    const orders = groupGestaoImportRowsByOrder(parsed.rows);
    const rowErrors = parsed.rows
        .filter(row => row.errors.length)
        .map(row => `Linha ${row.rowNumber}: ${row.errors.join(' ')}`);

    if (rowErrors.length) {
        return { imported: 0, skipped: 0, messages: rowErrors };
    }

    const lookups = await loadGestaoImportLookups();
    resetGestaoImportClienteCache();
    const now = new Date().toISOString();
    const messages = [];
    let imported = 0;
    let skipped = 0;

    for (const order of orders) {
        const result = await createGestaoImportOrder(order, lookups, now);
        messages.push(result.message);
        if (result.ok) imported += 1;
        else skipped += 1;
    }

    if (imported > 0) {
        try {
            await loadGestaoOrdersList();
        } catch (refreshError) {
            console.error('loadGestaoOrdersList after import:', refreshError);
            messages.push(`Lista de pedidos não atualizou: ${refreshError.message || refreshError}`);
        }

        if (typeof loadOrders === 'function') {
            try {
                await loadOrders();
            } catch (refreshError) {
                console.error('loadOrders after import:', refreshError);
            }
        }

        if (typeof loadClientesDatalist === 'function') {
            try {
                await loadClientesDatalist();
            } catch (refreshError) {
                console.error('loadClientesDatalist after import:', refreshError);
            }
        }
    }

    return { imported, skipped, messages };
}

function renderGestaoImportResult(result) {
    const container = document.getElementById('gestao-import-result');
    if (!container) return;

    const hasErrors = result.skipped > 0 && result.imported === 0;
    const partial = result.imported > 0 && result.skipped > 0;

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="rounded-xl border ${hasErrors ? 'border-red-200 bg-red-50/60' : partial ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'} p-4">
            <p class="text-sm font-semibold ${hasErrors ? 'text-red-800' : partial ? 'text-amber-800' : 'text-emerald-800'}">
                ${result.imported} pedido(s) importado(s)${result.skipped ? `, ${result.skipped} ignorado(s)` : ''}.
            </p>
            ${result.messages.length
                ? `<ul class="mt-3 space-y-1 max-h-56 overflow-y-auto text-xs ${hasErrors ? 'text-red-700' : partial ? 'text-amber-800' : 'text-emerald-800'}">
                    ${result.messages.map(message => `<li>• ${escapeHtml(message)}</li>`).join('')}
                </ul>`
                : ''}
        </div>
    `;
}

function renderGestaoImportValidationResult(result) {
    const container = document.getElementById('gestao-import-result');
    if (!container) return;

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="rounded-xl border ${result.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'} p-4 space-y-3">
            <p class="text-sm font-semibold ${result.valid ? 'text-emerald-800' : 'text-red-800'}">
                ${result.valid
                    ? `Arquivo válido: ${result.orderCount} pedido(s), ${result.importableProjectCount} projeto(s) prontos para importação.`
                    : 'Arquivo com pendências — corrija os erros antes de importar.'}
            </p>
            ${result.notes.length
                ? `<div>
                    <p class="text-[10px] font-semibold uppercase tracking-wide ${result.valid ? 'text-emerald-700' : 'text-slate-500'} mb-1">Resumo</p>
                    <ul class="space-y-1 max-h-40 overflow-y-auto text-xs ${result.valid ? 'text-emerald-800' : 'text-slate-600'}">
                        ${result.notes.map(note => `<li>• ${escapeHtml(note)}</li>`).join('')}
                    </ul>
                </div>`
                : ''}
            ${result.errors.length
                ? `<div>
                    <p class="text-[10px] font-semibold uppercase tracking-wide text-red-700 mb-1">Erros</p>
                    <ul class="space-y-1 max-h-56 overflow-y-auto text-xs text-red-700">
                        ${result.errors.map(error => `<li>• ${escapeHtml(error)}</li>`).join('')}
                    </ul>
                </div>`
                : ''}
        </div>
    `;
}

function updateGestaoImportActionButtons() {
    const validateBtn = document.getElementById('gestao-import-validate');
    const submit = document.getElementById('gestao-import-submit');
    const hasFile = Boolean(gestaoImportSelectedFile);

    if (validateBtn) {
        if (hasFile) validateBtn.removeAttribute('disabled');
        else validateBtn.setAttribute('disabled', 'disabled');
    }

    if (submit) {
        if (hasFile && gestaoImportValidationPassed) submit.removeAttribute('disabled');
        else submit.setAttribute('disabled', 'disabled');
    }
}

function resetGestaoImportSubmitButton(forceDisabled = false) {
    const submit = document.getElementById('gestao-import-submit');
    if (!submit) return;

    submit.textContent = 'Importar arquivo';

    if (forceDisabled || !gestaoImportSelectedFile || !gestaoImportValidationPassed) {
        submit.setAttribute('disabled', 'disabled');
    } else {
        submit.removeAttribute('disabled');
    }
}

function resetGestaoImportValidateButton() {
    const validateBtn = document.getElementById('gestao-import-validate');
    if (!validateBtn) return;
    validateBtn.textContent = 'Validar arquivo';
}

function resetGestaoImportForm() {
    gestaoImportSelectedFile = null;
    gestaoImportValidationPassed = false;
    const input = document.getElementById('gestao-import-file');
    if (input) input.value = '';
    document.getElementById('gestao-import-file-name')?.classList.add('hidden');
    resetGestaoImportSubmitButton(true);
    resetGestaoImportValidateButton();
    updateGestaoImportActionButtons();
    document.getElementById('gestao-import-result')?.classList.add('hidden');
}

function updateGestaoImportFileLabel(file) {
    const label = document.getElementById('gestao-import-file-name');
    if (!label) return;

    if (!file) {
        label.classList.add('hidden');
        label.textContent = '';
        return;
    }

    label.textContent = file.name;
    label.classList.remove('hidden');
}

function showGestaoImportPanel() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    hideAllGestaoPanels();
    document.getElementById('gestao-import-panel')?.classList.remove('hidden');
    setGestaoNavActive('pedido');
    resetGestaoImportForm();
}

async function validateGestaoImport() {
    if (!canAccessGestao()) return;
    if (!gestaoImportSelectedFile) {
        alertAppDialog('Selecione um arquivo Excel para validar.');
        return;
    }

    const validateBtn = document.getElementById('gestao-import-validate');
    if (validateBtn) {
        validateBtn.setAttribute('disabled', 'disabled');
        validateBtn.textContent = 'Validando...';
    }

    gestaoImportValidationPassed = false;
    updateGestaoImportActionButtons();

    try {
        const result = await validateGestaoImportFromFile(gestaoImportSelectedFile);
        renderGestaoImportValidationResult(result);
        gestaoImportValidationPassed = result.valid;
        updateGestaoImportActionButtons();
    } catch (error) {
        console.error('validateGestaoImport:', error);
        gestaoImportValidationPassed = false;
        renderGestaoImportValidationResult({
            valid: false,
            orderCount: 0,
            projectCount: 0,
            importableProjectCount: 0,
            errors: [error?.message || 'Erro inesperado ao validar o arquivo.'],
            notes: []
        });
        updateGestaoImportActionButtons();
    } finally {
        resetGestaoImportValidateButton();
        updateGestaoImportActionButtons();
    }
}

async function submitGestaoImport() {
    if (!canAccessGestao()) return;
    if (!gestaoImportSelectedFile) {
        alertAppDialog('Selecione um arquivo Excel para importar.');
        return;
    }
    if (!gestaoImportValidationPassed) {
        alertAppDialog('Valide o arquivo antes de importar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const submit = document.getElementById('gestao-import-submit');
    if (submit) {
        submit.setAttribute('disabled', 'disabled');
        submit.textContent = 'Importando...';
    }

    try {
        const result = await runGestaoImportFromFile(gestaoImportSelectedFile);
        renderGestaoImportResult(result);
        if (result.imported > 0) {
            gestaoImportValidationPassed = false;
        }
    } catch (error) {
        console.error('submitGestaoImport:', error);
        renderGestaoImportResult({
            imported: 0,
            skipped: 0,
            messages: [error?.message || 'Erro inesperado ao importar.']
        });
    } finally {
        resetGestaoImportSubmitButton(false);
    }
}

function bindGestaoImportEvents() {
    document.getElementById('btn-gestao-import-orders')?.addEventListener('click', showGestaoImportPanel);
    document.getElementById('btn-gestao-import-back')?.addEventListener('click', async () => {
        resetGestaoImportForm();
        showGestaoPedidoListPanel();
        loadGestaoOrdersList();
    });
    document.getElementById('btn-gestao-import-template')?.addEventListener('click', downloadGestaoImportTemplate);
    document.getElementById('gestao-import-file')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0] || null;
        gestaoImportSelectedFile = file;
        gestaoImportValidationPassed = false;
        updateGestaoImportFileLabel(file);
        updateGestaoImportActionButtons();
        document.getElementById('gestao-import-result')?.classList.add('hidden');
    });
    document.getElementById('gestao-import-validate')?.addEventListener('click', validateGestaoImport);
    document.getElementById('gestao-import-submit')?.addEventListener('click', submitGestaoImport);
}
