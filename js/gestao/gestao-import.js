const GESTAO_IMPORT_TEMPLATE_FILENAME = 'fgp-importacao-pedidos-projetos.xlsx';
const GESTAO_IMPORT_SHEET_NAME = 'Importacao';

const gestaoImportClienteIdByName = new Map();

const GESTAO_IMPORT_COLUMNS = [
    { key: 'orderCode', header: 'codigo_pedido', label: 'Código do pedido', required: true },
    { key: 'clientName', header: 'cliente', label: 'Cliente', required: true },
    { key: 'consultantName', header: 'consultor', label: 'Consultor (WPS)', required: true },
    { key: 'clientDeliveryDate', header: 'entrega_cliente', label: 'Entrega no cliente', required: false },
    { key: 'projectCode', header: 'codigo_projeto', label: 'Código do projeto', required: true },
    { key: 'projectName', header: 'nome_projeto', label: 'Nome do projeto', required: true },
    { key: 'environmentName', header: 'ambiente', label: 'Ambiente', required: true },
    { key: 'saleValue', header: 'valor_venda', label: 'Valor de venda', required: false },
    { key: 'deliveryDate', header: 'entrega_projeto', label: 'Entrega do projeto', required: false },
    { key: 'statusName', header: 'status_projeto', label: 'Status do projeto (WPS)', required: false },
    { key: 'designerName', header: 'projetista', label: 'Projetista', required: false }
];

const GESTAO_IMPORT_HEADER_ALIASES = {
    codigo_pedido: 'orderCode',
    pedido: 'orderCode',
    order_code: 'orderCode',
    cliente: 'clientName',
    client_name: 'clientName',
    consultor: 'consultantName',
    consultant: 'consultantName',
    entrega_cliente: 'clientDeliveryDate',
    data_entrega_cliente: 'clientDeliveryDate',
    codigo_projeto: 'projectCode',
    project_code: 'projectCode',
    nome_projeto: 'projectName',
    projeto: 'projectName',
    project_name: 'projectName',
    ambiente: 'environmentName',
    environment: 'environmentName',
    valor_venda: 'saleValue',
    sale_value: 'saleValue',
    entrega_projeto: 'deliveryDate',
    data_entrega_projeto: 'deliveryDate',
    status_projeto: 'statusName',
    status: 'statusName',
    projetista: 'designerName',
    designer: 'designerName',
    data_medicao: 'measurementDate',
    medicao_data: 'measurementDate',
    data_de_medicao: 'measurementDate',
    dt_medicao: 'measurementDate',
    data_planta_levantada: 'plantaLevantadaDate',
    planta_levantada_data: 'plantaLevantadaDate',
    data_inicio_montagem_interna: 'inicioMontagemInterna',
    inicio_montagem_interna: 'inicioMontagemInterna',
    data_fim_montagem_interna: 'fimMontagemInterna',
    fim_montagem_interna: 'fimMontagemInterna',
    marceneiro: 'marceneiroName',
    marceneiro_wps: 'marceneiroName'
};

const GESTAO_IMPORT_PROJECT_DATE_COLUMNS = [
    { key: 'measurementDate', header: 'data_medicao', label: 'Data da medição do projeto' },
    { key: 'plantaLevantadaDate', header: 'data_planta_levantada', label: 'Data da planta levantada' },
    { key: 'inicioMontagemInterna', header: 'data_inicio_montagem_interna', label: 'Início da montagem interna' },
    { key: 'fimMontagemInterna', header: 'data_fim_montagem_interna', label: 'Fim da montagem interna' },
    { key: 'marceneiroName', header: 'marceneiro', label: 'Marceneiro (WPS)' }
];

async function insertGestaoImportProjectRecord(orderId, project, timestamps) {
    const { createdAt, updatedAt } = timestamps;
    const montagemFields = {
        inicioMontagemInterna: project.inicioMontagemInterna || undefined,
        fimMontagemInterna: project.fimMontagemInterna || undefined,
        marceneiroId: project.marceneiroId || undefined
    };
    const payloadVariants = [
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            statusId: project.statusId,
            designerId: project.designerId,
            ...montagemFields,
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
            deliveryDate: project.deliveryDate,
            statusId: project.statusId,
            designerId: project.designerId,
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

async function applyGestaoImportProjectMontagemFields(projectId, project, now) {
    if (!project.inicioMontagemInterna && !project.fimMontagemInterna && !project.marceneiroId) return;

    const montagemPayload = {
        updatedById: currentUser.id,
        updatedAt: now
    };

    if (project.inicioMontagemInterna) montagemPayload.inicioMontagemInterna = project.inicioMontagemInterna;
    if (project.fimMontagemInterna) montagemPayload.fimMontagemInterna = project.fimMontagemInterna;
    if (project.marceneiroId) montagemPayload.marceneiroId = project.marceneiroId;

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(montagemPayload)
        .eq('id', projectId);

    if (error && !error.message?.includes('MontagemInterna')
        && !error.message?.includes('inicioMontagemInterna')
        && !error.message?.includes('marceneiroId')) {
        throw error;
    }
}

async function insertGestaoImportProject(orderId, project, now) {
    const projectId = await insertGestaoImportProjectRecord(orderId, project, {
        createdAt: now,
        updatedAt: now
    });

    await applyGestaoImportProjectMontagemFields(projectId, project, now);

    return projectId;
}

async function getGestaoImportProjectStatusIdByName(statusName) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    if (error) {
        console.error('getGestaoImportProjectStatusIdByName:', error);
        return null;
    }

    return data?.id || null;
}

async function applyGestaoImportMedicaoProjectStatuses(entries, now) {
    const plantaProjectIds = entries
        .filter(entry => entry.plantaLevantadaDate)
        .map(entry => Number(entry.projectId))
        .filter(Boolean);
    const medicaoProjectIds = entries
        .filter(entry => entry.measurementDate && !entry.plantaLevantadaDate)
        .map(entry => Number(entry.projectId))
        .filter(Boolean);

    const updates = [];

    if (plantaProjectIds.length) {
        const statusId = await getGestaoImportProjectStatusIdByName('Planta Levantada');
        if (statusId) updates.push({ projectIds: plantaProjectIds, statusId });
    }

    if (medicaoProjectIds.length) {
        const statusId = await getGestaoImportProjectStatusIdByName('Medição Realizada');
        if (statusId) updates.push({ projectIds: medicaoProjectIds, statusId });
    }

    for (const update of updates) {
        const uniqueIds = [...new Set(update.projectIds)];
        if (!uniqueIds.length) continue;

        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: update.statusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .in('id', uniqueIds);

        if (error) throw error;
    }
}

async function insertGestaoImportMedicaoProject(medicaoId, entry) {
    const measurementDate = entry.measurementDate || entry.plantaLevantadaDate;
    if (!measurementDate) return false;

    const payload = {
        medicaoId,
        orderProjectId: entry.projectId,
        measurementDate,
        plantaLevantada: Boolean(entry.plantaLevantadaDate),
        plantaLevantadaDate: entry.plantaLevantadaDate || null
    };

    let insertResult = await supabaseClient.from('MedicaoProject').insert(payload);

    if (insertResult.error?.message?.includes('plantaLevantada')) {
        insertResult = await supabaseClient.from('MedicaoProject').insert({
            medicaoId,
            orderProjectId: entry.projectId,
            measurementDate
        });
    }

    if (insertResult.error) throw insertResult.error;
    return true;
}

async function createGestaoImportMedicaoForOrder(orderId, medicaoProjects, now) {
    const entries = medicaoProjects.filter(entry =>
        entry.projectId && (entry.measurementDate || entry.plantaLevantadaDate)
    );
    if (!entries.length) return 0;

    const projectIds = entries.map(entry => Number(entry.projectId)).filter(Boolean);
    const { data: existingLinks, error: linksError } = await supabaseClient
        .from('MedicaoProject')
        .select('orderProjectId')
        .in('orderProjectId', projectIds);

    if (linksError && !linksError.message?.includes('MedicaoProject')) {
        throw linksError;
    }

    const linkedProjectIds = new Set(
        (existingLinks || []).map(row => Number(row.orderProjectId)).filter(Boolean)
    );
    const pendingEntries = entries.filter(entry => !linkedProjectIds.has(Number(entry.projectId)));
    if (!pendingEntries.length) return 0;

    const { data: medicao, error } = await supabaseClient
        .from('Medicao')
        .insert({
            orderId,
            observation: 'Importado via planilha',
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .select('id')
        .single();

    if (error) throw error;

    let insertedCount = 0;

    for (const entry of pendingEntries) {
        const inserted = await insertGestaoImportMedicaoProject(medicao.id, entry);
        if (inserted) insertedCount += 1;
    }

    if (!insertedCount) return 0;

    await applyGestaoImportMedicaoProjectStatuses(pendingEntries, now);
    return insertedCount;
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
    const status = gestaoProjectStatusesCache.find(item => item.name === 'Vendido')?.name
        || gestaoProjectStatusesCache[0]?.name
        || 'Vendido';
    const consultantSelect = document.getElementById('gestao-ord-consultant');
    const selectedConsultantOption = consultantSelect?.selectedOptions?.[0]
        || consultantSelect?.querySelector('option[value]:not([value=""])');
    const consultant = consultantName
        || selectedConsultantOption?.textContent?.trim()
        || 'Nome do Consultor';
    const designer = gestaoProjetistasCache[0]?.name || '';

    return {
        orderCode: '123456',
        clientName: 'Cliente Exemplo Ltda',
        consultantName: consultant,
        clientDeliveryDate: '2026-08-15',
        projectCode: '101',
        projectName: 'Cozinha Principal',
        environmentName: environment,
        saleValue: '15000,00',
        deliveryDate: '2026-07-20',
        statusName: status,
        designerName: designer
    };
}

function buildGestaoImportTemplateRows(consultantName = '') {
    const projectDateColumns = GESTAO_IMPORT_PROJECT_DATE_COLUMNS;
    const headers = [
        ...GESTAO_IMPORT_COLUMNS.map(column => column.header),
        ...projectDateColumns.map(column => column.header)
    ];
    const example = getGestaoImportExampleRow(consultantName);
    const exampleRow = [
        ...GESTAO_IMPORT_COLUMNS.map(column => example[column.key] ?? ''),
        '2026-02-05',
        '',
        '',
        '',
        ''
    ];

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

        const { data: statusWpsList } = await supabaseClient
            .from('importStatusWPS')
            .select('StatusWPS, StatusFGP')
            .order('StatusWPS', { ascending: true });

        const { data: consultorWpsList } = await supabaseClient
            .from('importConsultorWPS')
            .select('ConsultorWPS, ConsultorFGP')
            .order('ConsultorWPS', { ascending: true });

        const { data: marceneiroWpsList } = await supabaseClient
            .from('importMarceneiroWPS')
            .select('MarceneiroWPS, MarceneiroFGP')
            .order('MarceneiroWPS', { ascending: true });

        const importSheet = XLSX.utils.aoa_to_sheet(
            buildGestaoImportTemplateRows(consultants?.[0]?.name || '')
        );
        importSheet['!cols'] = [
            ...GESTAO_IMPORT_COLUMNS.map(() => ({ wch: 18 })),
            ...GESTAO_IMPORT_PROJECT_DATE_COLUMNS.map(() => ({ wch: 22 }))
        ];

        const projectDateColumns = GESTAO_IMPORT_PROJECT_DATE_COLUMNS;
        const referenceRows = [
            ['Campo', 'Obrigatório', 'Descrição'],
            ...GESTAO_IMPORT_COLUMNS.map(column => [
                column.header,
                column.required ? 'Sim' : 'Não',
                column.label
            ]),
            [],
            ['Datas de projeto', 'Não', 'Opcional — medição, planta levantada e montagem interna.'],
            ['Coluna', 'Descrição'],
            ...projectDateColumns.map(column => [column.header, column.label]),
            [],
            ['Ambientes cadastrados', '', ''],
            ['Nome'],
            ...(gestaoEnvironmentTypesCache.length
                ? gestaoEnvironmentTypesCache.map(item => [item.name])
                : [['(nenhum cadastrado)']]),
            [],
            ['Status WPS → FGP (status_projeto na planilha)', '', ''],
            ['StatusWPS', 'StatusFGP'],
            ...((statusWpsList || []).length
                ? statusWpsList.map(item => [item.StatusWPS, item.StatusFGP])
                : [['(execute create-import-wps-mappings.sql)']]),
            [],
            ['Consultor WPS → FGP (consultor na planilha)', '', ''],
            ['ConsultorWPS', 'ConsultorFGP'],
            ...((consultorWpsList || []).length
                ? consultorWpsList.map(item => [item.ConsultorWPS, item.ConsultorFGP])
                : [['(execute create-import-wps-mappings.sql)']]),
            [],
            ['Marceneiro WPS → FGP (marceneiro na planilha)', '', ''],
            ['MarceneiroWPS', 'MarceneiroFGP'],
            ...((marceneiroWpsList || []).length
                ? marceneiroWpsList.map(item => [item.MarceneiroWPS, item.MarceneiroFGP])
                : [['(execute create-import-wps-mappings.sql)']]),
            [],
            ['Projetistas (ativos)', '', ''],
            ['Nome'],
            ...(gestaoProjetistasCache.length
                ? gestaoProjetistasCache.map(item => [item.name])
                : [['(opcional)']])
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
    mapped.projectName = String(mapped.projectName || '').trim();
    mapped.environmentName = String(mapped.environmentName || '').trim();
    mapped.statusName = String(mapped.statusName || '').trim();
    mapped.designerName = String(mapped.designerName || '').trim();
    mapped.clientDeliveryDate = parseGestaoImportDate(mapped.clientDeliveryDate);
    mapped.deliveryDate = parseGestaoImportDate(mapped.deliveryDate);
    mapped.measurementDate = parseGestaoImportDate(mapped.measurementDate);
    mapped.plantaLevantadaDate = parseGestaoImportDate(mapped.plantaLevantadaDate);
    mapped.inicioMontagemInterna = parseGestaoImportDate(mapped.inicioMontagemInterna);
    mapped.fimMontagemInterna = parseGestaoImportDate(mapped.fimMontagemInterna);
    mapped.marceneiroName = String(mapped.marceneiroName || '').trim();
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

    ['measurementDate', 'plantaLevantadaDate', 'inicioMontagemInterna', 'fimMontagemInterna'].forEach(field => {
        if (mapped[field] === null && rawRow && Object.keys(rawRow).some(key => {
            const alias = GESTAO_IMPORT_HEADER_ALIASES[normalizeGestaoImportHeader(key)];
            return alias === field && rawRow[key] !== null && rawRow[key] !== undefined && rawRow[key] !== '';
        })) {
            mapped.errors.push(`Data inválida em "${field}".`);
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
                clientDeliveryDate: row.clientDeliveryDate || null,
                clientDeliveryDatesSeen: row.clientDeliveryDate ? new Set([row.clientDeliveryDate]) : new Set(),
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
        if (row.clientDeliveryDate) {
            order.clientDeliveryDatesSeen.add(row.clientDeliveryDate);
            order.clientDeliveryDate = pickLatestIsoDate(order.clientDeliveryDate, row.clientDeliveryDate);
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
    const statusWpsToFgp = {};
    const consultorWpsToFgp = {};
    const marceneiroWpsToFgp = {};
    let consultorWpsRows = [];

    const statusResult = await supabaseClient
        .from('importStatusWPS')
        .select('StatusWPS, StatusFGP');

    if (!statusResult.error) {
        (statusResult.data || []).forEach(row => {
            const key = String(row.StatusWPS || '').trim().toLowerCase();
            if (key) statusWpsToFgp[key] = String(row.StatusFGP || '').trim();
        });
    } else if (!statusResult.error.message?.includes('importStatusWPS')) {
        console.error('loadGestaoImportWpsMappings status:', statusResult.error);
    }

    const consultorResult = await supabaseClient
        .from('importConsultorWPS')
        .select('ConsultorWPS, ConsultorFGP');

    if (!consultorResult.error) {
        consultorWpsRows = consultorResult.data || [];
        consultorWpsRows.forEach(row => {
            const key = String(row.ConsultorWPS || '').trim().toLowerCase();
            if (key) consultorWpsToFgp[key] = String(row.ConsultorFGP || '').trim();
        });
    } else if (!consultorResult.error.message?.includes('importConsultorWPS')) {
        console.error('loadGestaoImportWpsMappings consultor:', consultorResult.error);
    }

    const marceneiroResult = await supabaseClient
        .from('importMarceneiroWPS')
        .select('MarceneiroWPS, MarceneiroFGP');

    if (!marceneiroResult.error) {
        (marceneiroResult.data || []).forEach(row => {
            const key = String(row.MarceneiroWPS || '').trim().toLowerCase();
            if (key) marceneiroWpsToFgp[key] = String(row.MarceneiroFGP || '').trim();
        });
    } else if (!marceneiroResult.error.message?.includes('importMarceneiroWPS')) {
        console.error('loadGestaoImportWpsMappings marceneiro:', marceneiroResult.error);
    }

    return { statusWpsToFgp, consultorWpsToFgp, marceneiroWpsToFgp, consultorWpsRows };
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
        const wpsKey = String(row.ConsultorWPS || '').trim().toLowerCase();
        const fgpKey = String(row.ConsultorFGP || '').trim().toLowerCase();
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

function mapGestaoImportStatusWpsToFgp(statusWps, lookups) {
    const raw = String(statusWps || '').trim();
    const key = raw.toLowerCase();

    if (!key) return 'Vendido';
    if (lookups.statusWpsToFgp?.[key]) return lookups.statusWpsToFgp[key];
    if (lookups.statusByName?.[key]) return raw;

    return null;
}

function mapGestaoImportMarceneiroWpsToFgp(marceneiroWps, lookups) {
    const raw = String(marceneiroWps || '').trim();
    const key = raw.toLowerCase();

    if (!key) return null;
    if (lookups.marceneiroWpsToFgp?.[key]) return lookups.marceneiroWpsToFgp[key];
    if (lookups.marceneiroByName?.[key]) return raw;

    return null;
}

async function loadGestaoImportLookups() {
    await loadGestaoFormOptions();
    await loadGestaoConsultants();
    await loadMarceneiros(true);

    const { data: consultants } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('isActive', true)
        .eq('role', 'Consultor')
        .order('name', { ascending: true });

    const { data: clientes } = await supabaseClient
        .from('Cliente')
        .select('id, nome, ativo');

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
        designerByName: Object.fromEntries(
            gestaoProjetistasCache.map(item => [item.name.trim().toLowerCase(), item.id])
        ),
        marceneiroByName: Object.fromEntries(
            marceneirosCache
                .filter(marceneiro => marceneiro.isActive !== false)
                .map(marceneiro => [marceneiro.name.trim().toLowerCase(), marceneiro.id])
        ),
        clientByName: Object.fromEntries(
            (clientes || [])
                .filter(cliente => cliente.ativo !== false)
                .map(cliente => [cliente.nome.trim().toLowerCase(), cliente.id])
        ),
        ...consultantResolver,
        statusWpsToFgp: wpsMappings.statusWpsToFgp,
        consultorWpsToFgp: wpsMappings.consultorWpsToFgp,
        marceneiroWpsToFgp: wpsMappings.marceneiroWpsToFgp
    };
}

function resetGestaoImportClienteCache() {
    gestaoImportClienteIdByName.clear();
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

    const statusWps = (row.statusName || 'Vendido').trim();
    const statusFgp = mapGestaoImportStatusWpsToFgp(statusWps, lookups);
    if (!statusFgp) {
        return { error: `Status WPS "${statusWps}" não mapeado em importStatusWPS.` };
    }

    const statusKey = statusFgp.toLowerCase();
    const statusId = lookups.statusByName[statusKey] || getDefaultProjectStatusId();
    if (!statusId) {
        return { error: `Status FGP "${statusFgp}" (WPS: "${statusWps}") não encontrado.` };
    }

    let designerId = null;
    if (row.designerName) {
        designerId = lookups.designerByName[row.designerName.trim().toLowerCase()] || null;
        if (!designerId) {
            return { error: `Projetista "${row.designerName}" não encontrado.` };
        }
    }

    let marceneiroId = null;
    if (row.marceneiroName) {
        const marceneiroFgp = mapGestaoImportMarceneiroWpsToFgp(row.marceneiroName, lookups);
        if (!marceneiroFgp) {
            return { error: `Marceneiro WPS "${row.marceneiroName}" não mapeado em importMarceneiroWPS.` };
        }

        marceneiroId = lookups.marceneiroByName[marceneiroFgp.trim().toLowerCase()] || null;
        if (!marceneiroId) {
            return {
                error: `Marceneiro FGP "${marceneiroFgp}" (WPS: "${row.marceneiroName}") não cadastrado ou inativo.`
            };
        }
    }

    return {
        project: {
            projectCode: row.projectCode,
            name: row.projectName,
            environmentTypeId,
            saleValue: row.saleValue,
            deliveryDate: row.deliveryDate,
            statusId,
            designerId,
            measurementDate: row.measurementDate,
            plantaLevantadaDate: row.plantaLevantadaDate,
            inicioMontagemInterna: row.inicioMontagemInterna,
            fimMontagemInterna: row.fimMontagemInterna,
            marceneiroId
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
        .select('id')
        .eq('orderCode', order.orderCode)
        .maybeSingle();

    let orderId;
    let createdNewOrder = false;

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

        const clientResult = await resolveGestaoImportClienteIdForOrder(order, lookups);
        if (clientResult.error) {
            return { ok: false, message: clientResult.error };
        }

        const orderPayload = {
            orderCode: order.orderCode,
            clientId: clientResult.clientId,
            consultantUserId: consultantResult.consultantUserId,
            clientDeliveryDate: order.clientDeliveryDate || undefined,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        let { data: created, error } = await supabaseClient
            .from('salesOrders')
            .insert(orderPayload)
            .select('id')
            .single();

        if (error?.message?.includes('clientDeliveryDate') || error?.message?.includes('updatedAt')) {
            const { clientDeliveryDate: _d, updatedAt: _u, ...fallback } = orderPayload;
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

    let medicaoCount = 0;

    try {
        const medicaoProjects = importedProjects
            .filter(({ project }) => project.measurementDate || project.plantaLevantadaDate)
            .map(({ projectId, project }) => ({
                projectId,
                measurementDate: project.measurementDate,
                plantaLevantadaDate: project.plantaLevantadaDate
            }));

        if (medicaoProjects.length) {
            medicaoCount = await createGestaoImportMedicaoForOrder(orderId, medicaoProjects, now);
        }
    } catch (medicaoError) {
        if (createdNewOrder) {
            await supabaseClient.from('salesOrders').delete().eq('id', orderId);
            return { ok: false, message: `Pedido ${order.orderCode}: ${medicaoError.message}` };
        }

        projectErrors.push(`Pedido ${order.orderCode}: medição não criada — ${medicaoError.message}`);
    }

    const actionLabel = existingOrder ? 'adicionado(s)' : 'importado(s)';
    let successMessage = `Pedido ${order.orderCode}: ${importedProjects.length} projeto(s) ${actionLabel}.`;
    if (medicaoCount > 0) {
        successMessage += ` ${medicaoCount} medição(ões) registrada(s).`;
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

    if (order.clientDeliveryDatesSeen?.size > 1) {
        notes.push(
            `Pedido ${order.orderCode}: múltiplas datas de entrega na planilha — será usada a maior (${formatGestaoDate(order.clientDeliveryDate)}).`
        );
    }

    if (existingOrder) {
        notes.push(`Pedido ${order.orderCode}: já cadastrado — serão adicionados apenas projetos novos.`);
    } else {
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
