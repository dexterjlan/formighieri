const GESTAO_IMPORT_TEMPLATE_FILENAME = 'fgp-importacao-pedidos-projetos.xlsx';
const GESTAO_IMPORT_SHEET_NAME = 'Importacao';

const GESTAO_IMPORT_COLUMNS = [
    { key: 'orderCode', header: 'codigo_pedido', label: 'Código do pedido', required: true },
    { key: 'clientName', header: 'cliente', label: 'Cliente', required: true },
    { key: 'consultantName', header: 'consultor', label: 'Consultor', required: true },
    { key: 'clientDeliveryDate', header: 'entrega_cliente', label: 'Entrega no cliente', required: false },
    { key: 'projectCode', header: 'codigo_projeto', label: 'Código do projeto', required: true },
    { key: 'projectName', header: 'nome_projeto', label: 'Nome do projeto', required: true },
    { key: 'environmentName', header: 'ambiente', label: 'Ambiente', required: true },
    { key: 'saleValue', header: 'valor_venda', label: 'Valor de venda', required: false },
    { key: 'deliveryDate', header: 'entrega_projeto', label: 'Entrega do projeto', required: false },
    { key: 'statusName', header: 'status_projeto', label: 'Status do projeto', required: false },
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
    data_planta_levantada: 'plantaLevantadaDate',
    planta_levantada_data: 'plantaLevantadaDate',
    data_inicio_montagem_interna: 'inicioMontagemInterna',
    inicio_montagem_interna: 'inicioMontagemInterna',
    data_fim_montagem_interna: 'fimMontagemInterna',
    fim_montagem_interna: 'fimMontagemInterna'
};

const GESTAO_IMPORT_PROJECT_DATE_COLUMNS = [
    { key: 'measurementDate', header: 'data_medicao', label: 'Data da medição do projeto' },
    { key: 'plantaLevantadaDate', header: 'data_planta_levantada', label: 'Data da planta levantada' },
    { key: 'inicioMontagemInterna', header: 'data_inicio_montagem_interna', label: 'Início da montagem interna' },
    { key: 'fimMontagemInterna', header: 'data_fim_montagem_interna', label: 'Fim da montagem interna' }
];

async function insertGestaoImportProjectRecord(orderId, project, timestamps) {
    const { createdAt, updatedAt } = timestamps;
    const montagemFields = {
        inicioMontagemInterna: project.inicioMontagemInterna || undefined,
        fimMontagemInterna: project.fimMontagemInterna || undefined
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
    if (!project.inicioMontagemInterna && !project.fimMontagemInterna) return;

    const montagemPayload = {
        updatedById: currentUser.id,
        updatedAt: now
    };

    if (project.inicioMontagemInterna) montagemPayload.inicioMontagemInterna = project.inicioMontagemInterna;
    if (project.fimMontagemInterna) montagemPayload.fimMontagemInterna = project.fimMontagemInterna;

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(montagemPayload)
        .eq('id', projectId);

    if (error && !error.message?.includes('MontagemInterna') && !error.message?.includes('inicioMontagemInterna')) {
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

async function createGestaoImportMedicaoForOrder(orderId, medicaoProjects, now) {
    if (!medicaoProjects.length) return;

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

    for (const entry of medicaoProjects) {
        const measurementDate = entry.measurementDate || entry.plantaLevantadaDate;
        if (!measurementDate) continue;

        const payload = {
            medicaoId: medicao.id,
            orderProjectId: entry.projectId,
            measurementDate,
            plantaLevantada: Boolean(entry.plantaLevantadaDate),
            plantaLevantadaDate: entry.plantaLevantadaDate || null
        };

        let insertResult = await supabaseClient.from('MedicaoProject').insert(payload);

        if (insertResult.error?.message?.includes('plantaLevantada')) {
            insertResult = await supabaseClient.from('MedicaoProject').insert({
                medicaoId: medicao.id,
                orderProjectId: entry.projectId,
                measurementDate
            });
        }

        if (insertResult.error) throw insertResult.error;
    }
}

let gestaoImportSelectedFile = null;
let sheetJsLoadPromise = null;

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
        sheetJsLoadPromise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Tempo esgotado ao carregar a biblioteca de Excel.'));
            }, 30000);

            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            script.onload = () => {
                clearTimeout(timeoutId);
                if (window.XLSX) resolve(window.XLSX);
                else reject(new Error('Biblioteca de Excel indisponível.'));
            };
            script.onerror = () => {
                clearTimeout(timeoutId);
                reject(new Error('Não foi possível carregar a biblioteca de Excel.'));
            };
            document.body.appendChild(script);
        }).catch(error => {
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
    const consultant = consultantName
        || document.querySelector('#gestao-ord-consultant option[value]:not([value=""])')?.value
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
            ['Status de projeto (ativos)', '', ''],
            ['Nome'],
            ...(gestaoProjectStatusesCache.filter(status => status.isActive !== false).length
                ? gestaoProjectStatusesCache
                    .filter(status => status.isActive !== false)
                    .map(status => [status.name])
                : [['Vendido']]),
            [],
            ['Consultores (ativos)', '', ''],
            ['Nome'],
            ...((consultants || []).length
                ? consultants.map(item => [item.name])
                : [['(nenhum cadastrado)']]),
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
                clientDeliveryDate: row.clientDeliveryDate,
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
        if (order.clientDeliveryDate && row.clientDeliveryDate
            && order.clientDeliveryDate !== row.clientDeliveryDate) {
            row.errors.push(`Entrega do cliente diverge do pedido ${key}.`);
            return;
        }
        if (!order.clientDeliveryDate && row.clientDeliveryDate) {
            order.clientDeliveryDate = row.clientDeliveryDate;
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

async function loadGestaoImportLookups() {
    await loadGestaoFormOptions();
    await loadGestaoConsultants();

    const { data: consultants } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Consultor')
        .eq('isActive', true);

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
        consultantNames: new Set((consultants || []).map(item => item.name.trim()))
    };
}

function resolveGestaoImportProject(row, lookups) {
    const environmentTypeId = lookups.environmentByName[row.environmentName.trim().toLowerCase()];
    if (!environmentTypeId) {
        return { error: `Ambiente "${row.environmentName}" não encontrado.` };
    }

    const statusKey = (row.statusName || 'Vendido').trim().toLowerCase();
    const statusId = lookups.statusByName[statusKey] || getDefaultProjectStatusId();
    if (!statusId) {
        return { error: `Status "${row.statusName || 'Vendido'}" não encontrado.` };
    }

    let designerId = null;
    if (row.designerName) {
        designerId = lookups.designerByName[row.designerName.trim().toLowerCase()] || null;
        if (!designerId) {
            return { error: `Projetista "${row.designerName}" não encontrado.` };
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
            fimMontagemInterna: row.fimMontagemInterna
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
        if (!lookups.consultantNames.has(order.consultantName)) {
            return { ok: false, message: `Consultor "${order.consultantName}" não cadastrado ou inativo.` };
        }

        const orderPayload = {
            orderCode: order.orderCode,
            clientName: order.clientName,
            consultantName: order.consultantName,
            clientDeliveryDate: order.clientDeliveryDate,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        let { data: created, error } = await supabaseClient
            .from('salesOrders')
            .insert(orderPayload)
            .select('id')
            .single();

        if (error?.message?.includes('clientDeliveryDate')) {
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

    try {
        const medicaoProjects = importedProjects
            .filter(({ project }) => project.measurementDate || project.plantaLevantadaDate)
            .map(({ projectId, project }) => ({
                projectId,
                measurementDate: project.measurementDate,
                plantaLevantadaDate: project.plantaLevantadaDate
            }));

        if (medicaoProjects.length) {
            await createGestaoImportMedicaoForOrder(orderId, medicaoProjects, now);
        }
    } catch (medicaoError) {
        if (createdNewOrder) {
            await supabaseClient.from('salesOrders').delete().eq('id', orderId);
        }

        return { ok: false, message: `Pedido ${order.orderCode}: ${medicaoError.message}` };
    }

    const actionLabel = existingOrder ? 'adicionado(s)' : 'importado(s)';
    const successMessage = `Pedido ${order.orderCode}: ${importedProjects.length} projeto(s) ${actionLabel}.`;
    const message = projectErrors.length
        ? `${successMessage} ${projectErrors.join(' ')}`
        : successMessage;

    return { ok: true, message, partial: projectErrors.length > 0 };
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

function resetGestaoImportSubmitButton(forceDisabled = false) {
    const submit = document.getElementById('gestao-import-submit');
    if (!submit) return;

    submit.textContent = 'Importar arquivo';

    if (forceDisabled || !gestaoImportSelectedFile) {
        submit.setAttribute('disabled', 'disabled');
    } else {
        submit.removeAttribute('disabled');
    }
}

function resetGestaoImportForm() {
    gestaoImportSelectedFile = null;
    const input = document.getElementById('gestao-import-file');
    if (input) input.value = '';
    document.getElementById('gestao-import-file-name')?.classList.add('hidden');
    resetGestaoImportSubmitButton(true);
    document.getElementById('gestao-import-result')?.classList.add('hidden');
}

function updateGestaoImportFileLabel(file) {
    const label = document.getElementById('gestao-import-file-name');
    const submit = document.getElementById('gestao-import-submit');
    if (!label || !submit) return;

    if (!file) {
        label.classList.add('hidden');
        label.textContent = '';
        submit.setAttribute('disabled', 'disabled');
        return;
    }

    label.textContent = file.name;
    label.classList.remove('hidden');
    submit.removeAttribute('disabled');
}

function showGestaoImportPanel() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    hideAllGestaoPanels();
    document.getElementById('gestao-import-panel')?.classList.remove('hidden');
    setGestaoNavActive('pedido');
    resetGestaoImportForm();
}

async function submitGestaoImport() {
    if (!canAccessGestao()) return;
    if (!gestaoImportSelectedFile) {
        alertAppDialog('Selecione um arquivo Excel para importar.');
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
        updateGestaoImportFileLabel(file);
        document.getElementById('gestao-import-result')?.classList.add('hidden');
    });
    document.getElementById('gestao-import-submit')?.addEventListener('click', submitGestaoImport);
}
