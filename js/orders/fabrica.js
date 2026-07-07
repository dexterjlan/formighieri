const FABRICA_EM_PRODUCAO_STATUS = 'Em Produção';
const FABRICA_MONTAGEM_INTERNA_STATUS = 'Montagem Interna';
const FABRICA_EXPEDICAO_STATUS = 'Expedição';

let fabricaMarceneirosCache = [];
const fabricaOrderExpanded = {};

async function getOrderProjectStatusIdByName(statusName) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    return fallback?.id || null;
}

async function getEmProducaoProjectStatusId() {
    return getOrderProjectStatusIdByName(FABRICA_EM_PRODUCAO_STATUS);
}

async function getMontagemInternaProjectStatusId() {
    return getOrderProjectStatusIdByName(FABRICA_MONTAGEM_INTERNA_STATUS);
}

async function getExpedicaoProjectStatusId() {
    return getOrderProjectStatusIdByName(FABRICA_EXPEDICAO_STATUS);
}

async function loadFabricaMarceneiros() {
    if (fabricaMarceneirosCache.length) return fabricaMarceneirosCache;

    const { data, error } = await supabaseClient
        .from('Marceneiro')
        .select('id, name, sortOrder')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        console.error('loadFabricaMarceneiros:', error);
        fabricaMarceneirosCache = [];
        return [];
    }

    fabricaMarceneirosCache = data || [];
    return fabricaMarceneirosCache;
}

function getFabricaMarceneiroOptionsHtml(selectedId = null) {
    if (!fabricaMarceneirosCache.length) {
        return '<option value="">Nenhum marceneiro cadastrado</option>';
    }

    const options = ['<option value="">Selecione...</option>'];
    fabricaMarceneirosCache.forEach(marceneiro => {
        const selected = Number(selectedId) === Number(marceneiro.id) ? ' selected' : '';
        options.push(`<option value="${marceneiro.id}"${selected}>${escapeHtml(marceneiro.name)}</option>`);
    });
    return options.join('');
}

function getFabricaMarceneiroName(project) {
    if (project.marceneiro?.name) return project.marceneiro.name;
    const cached = fabricaMarceneirosCache.find(item => Number(item.id) === Number(project.marceneiroId));
    return cached?.name || '—';
}

function toFabricaInputDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function formatFabricaDisplayDate(dateStr) {
    const value = toFabricaInputDate(dateStr);
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getTodayInputDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isFabricaDateInFuture(dateStr) {
    if (!dateStr) return false;
    return dateStr > getTodayInputDate();
}

function getFabricaProjectSubtitle(project) {
    return [
        project.projectCode ? `Cód. ${project.projectCode}` : null,
        project.environmentType?.name || null
    ].filter(Boolean).join(' · ') || '—';
}

function setFabricaInicioFieldsEnabled(card, enabled) {
    const fieldsWrap = card.querySelector('.fabrica-inicio-fields');
    const marceneiroSelect = card.querySelector('.fabrica-marceneiro');
    const inicioInput = card.querySelector('.fabrica-inicio');

    fieldsWrap?.classList.toggle('opacity-50', !enabled);
    fieldsWrap?.classList.toggle('pointer-events-none', !enabled);

    if (marceneiroSelect) marceneiroSelect.disabled = !enabled;
    if (inicioInput) inicioInput.disabled = !enabled;
}

function setFabricaFimFieldsEnabled(card, enabled) {
    const fieldsWrap = card.querySelector('.fabrica-fim-fields');
    const fimInput = card.querySelector('.fabrica-fim');

    fieldsWrap?.classList.toggle('opacity-50', !enabled);
    fieldsWrap?.classList.toggle('pointer-events-none', !enabled);

    if (fimInput) fimInput.disabled = !enabled;
}

function renderFabricaEmProducaoCard(project) {
    const card = document.createElement('div');
    card.className = 'border border-orange-100 rounded-xl bg-orange-50/30 overflow-hidden';
    card.dataset.projectId = String(project.id);
    card.dataset.fabricaMode = 'inicio';

    card.innerHTML = `
        <div class="p-4 flex items-start gap-3">
            <input type="checkbox" class="fabrica-inicio-select mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 shrink-0"
                aria-label="Selecionar projeto ${escapeHtml(project.name)}">
            <div class="flex-1 min-w-0 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
                        <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(getFabricaProjectSubtitle(project))}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-orange-100 text-orange-800">${escapeHtml(FABRICA_EM_PRODUCAO_STATUS)}</span>
                </div>
                <div class="fabrica-inicio-fields opacity-50 pointer-events-none grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-2 items-end">
                    <div>
                        <label class="block text-[10px] font-semibold text-slate-500 mb-1">Marceneiro responsável</label>
                        <select class="fabrica-marceneiro w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600" disabled>
                            ${getFabricaMarceneiroOptionsHtml(project.marceneiroId)}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-semibold text-slate-500 mb-1">Início montagem interna</label>
                        <input type="date" class="fabrica-inicio w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600" disabled
                            max="${getTodayInputDate()}"
                            value="${toFabricaInputDate(project.inicioMontagemInterna)}">
                    </div>
                </div>
            </div>
        </div>
    `;

    card.querySelector('.fabrica-inicio-select')?.addEventListener('change', async function () {
        setFabricaInicioFieldsEnabled(card, this.checked);
    });

    return card;
}

function renderFabricaMontagemInternaCard(project) {
    const card = document.createElement('div');
    card.className = 'border border-amber-100 rounded-xl bg-amber-50/30 overflow-hidden';
    card.dataset.projectId = String(project.id);
    card.dataset.fabricaMode = 'fim';

    card.innerHTML = `
        <div class="p-4 flex items-start gap-3">
            <input type="checkbox" class="fabrica-fim-select mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0"
                aria-label="Registrar fim da montagem ${escapeHtml(project.name)}">
            <div class="flex-1 min-w-0 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
                        <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(getFabricaProjectSubtitle(project))}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800">${escapeHtml(FABRICA_MONTAGEM_INTERNA_STATUS)}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    <p><span class="text-slate-400">Marceneiro:</span> <span class="font-medium text-slate-800">${escapeHtml(getFabricaMarceneiroName(project))}</span></p>
                    <p><span class="text-slate-400">Início:</span> <span class="font-medium text-slate-800">${formatFabricaDisplayDate(project.inicioMontagemInterna)}</span></p>
                </div>
                <div class="fabrica-fim-fields opacity-50 pointer-events-none max-w-xs">
                    <label class="block text-[10px] font-semibold text-slate-500 mb-1">Fim montagem interna</label>
                    <input type="date" class="fabrica-fim w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600" disabled
                        max="${getTodayInputDate()}"
                        value="${toFabricaInputDate(project.fimMontagemInterna)}">
                </div>
            </div>
        </div>
    `;

    card.querySelector('.fabrica-fim-select')?.addEventListener('change', async function () {
        setFabricaFimFieldsEnabled(card, this.checked);
    });

    return card;
}

function renderFabricaProjectCard(project) {
    const statusName = project.projectStatus?.name;
    if (statusName === FABRICA_MONTAGEM_INTERNA_STATUS) {
        return renderFabricaMontagemInternaCard(project);
    }
    return renderFabricaEmProducaoCard(project);
}

function sortFabricaProjects(a, b) {
    const statusOrder = {
        [FABRICA_EM_PRODUCAO_STATUS]: 0,
        [FABRICA_MONTAGEM_INTERNA_STATUS]: 1
    };
    const orderA = statusOrder[a.projectStatus?.name] ?? 9;
    const orderB = statusOrder[b.projectStatus?.name] ?? 9;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

const FABRICA_PROJECT_SELECT = 'id, orderId, name, projectCode, marceneiroId, inicioMontagemInterna, fimMontagemInterna, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), marceneiro:Marceneiro(id, name), order:salesOrders(id, orderCode, clientName)';

function groupFabricaProjectsByOrder(projects) {
    const groupsByOrderId = {};

    projects.forEach(project => {
        const orderId = Number(project.orderId);
        if (!groupsByOrderId[orderId]) {
            groupsByOrderId[orderId] = {
                orderId,
                orderCode: project.order?.orderCode || '—',
                clientName: project.order?.clientName || '—',
                projects: []
            };
        }
        groupsByOrderId[orderId].projects.push(project);
    });

    return Object.values(groupsByOrderId)
        .map(group => ({
            ...group,
            projects: [...group.projects].sort(sortFabricaProjects)
        }))
        .sort((a, b) => String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true }));
}

function isFabricaOrderExpanded(orderId) {
    const key = String(orderId);
    if (!(key in fabricaOrderExpanded)) {
        fabricaOrderExpanded[key] = false;
    }
    return fabricaOrderExpanded[key];
}

function setFabricaOrderExpanded(orderId, expanded) {
    fabricaOrderExpanded[String(orderId)] = expanded;
}

function getFabricaOrderToggleLabel(expanded) {
    return expanded ? '▼' : '▶';
}

function applyFabricaOrderGroupCollapse(groupEl, expanded) {
    const body = groupEl.querySelector('.fabrica-order-body');
    const header = groupEl.querySelector('.fabrica-order-header');
    const toggleBtn = groupEl.querySelector('.fabrica-order-toggle');
    body?.classList.toggle('hidden', !expanded);
    header?.classList.toggle('border-b', expanded);
    header?.classList.toggle('border-orange-100', expanded);
    if (toggleBtn) {
        toggleBtn.textContent = getFabricaOrderToggleLabel(expanded);
        toggleBtn.setAttribute('aria-label', expanded ? 'Recolher pedido' : 'Expandir pedido');
    }
}

function renderFabricaOrderGroup(group) {
    const section = document.createElement('div');
    section.className = 'fabrica-order-group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm';
    section.dataset.orderId = String(group.orderId);

    const expanded = isFabricaOrderExpanded(group.orderId);
    const projectCountLabel = `${group.projects.length} projeto${group.projects.length === 1 ? '' : 's'}`;

    section.innerHTML = `
        <div class="fabrica-order-header px-4 py-3 bg-orange-50/60 flex items-start gap-2 ${expanded ? 'border-b border-orange-100' : ''}">
            <button type="button" class="fabrica-order-toggle shrink-0 mt-0.5 text-xs text-orange-800 hover:text-orange-950 font-medium w-6 h-6 rounded-md hover:bg-orange-100"
                aria-label="${expanded ? 'Recolher pedido' : 'Expandir pedido'}">${getFabricaOrderToggleLabel(expanded)}</button>
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded font-mono">${escapeHtml(group.orderCode)}</span>
                    <h4 class="text-sm font-bold text-slate-900 truncate">${escapeHtml(group.clientName)}</h4>
                </div>
                <p class="text-[10px] text-slate-500 mt-1">${projectCountLabel}</p>
            </div>
        </div>
        <div class="fabrica-order-body space-y-3 p-4 ${expanded ? '' : 'hidden'}"></div>
    `;

    const body = section.querySelector('.fabrica-order-body');
    group.projects.forEach(project => {
        body.appendChild(renderFabricaProjectCard(project));
    });

    return section;
}

async function enrichFabricaProjectsWithOrder(projects) {
    const needsEnrich = projects.some(project => !project.order?.orderCode && project.orderId);
    if (!needsEnrich) return projects;

    const orderIds = [...new Set(projects.map(project => Number(project.orderId)).filter(Boolean))];
    if (!orderIds.length) return projects;

    const { data: orders, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName')
        .in('id', orderIds);

    if (error) {
        console.error('enrichFabricaProjectsWithOrder:', error);
        return projects;
    }

    const orderById = Object.fromEntries((orders || []).map(order => [Number(order.id), order]));
    return projects.map(project => ({
        ...project,
        order: project.order?.orderCode
            ? project.order
            : (orderById[Number(project.orderId)] || project.order || null)
    }));
}

async function fetchFabricaProjects(statusIds, orderId = null) {
    let query = supabaseClient
        .from('OrderProject')
        .select(FABRICA_PROJECT_SELECT)
        .in('statusId', statusIds);

    if (orderId) {
        query = query.eq('orderId', orderId);
    }

    let result = await query.order('name', { ascending: true });

    if (result.error?.message?.includes('marceneiro') || result.error?.message?.includes('MontagemInterna') || result.error?.message?.includes('salesOrders')) {
        query = supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, projectCode, marceneiroId, inicioMontagemInterna, fimMontagemInterna, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
            .in('statusId', statusIds);

        if (orderId) {
            query = query.eq('orderId', orderId);
        }

        result = await query.order('name', { ascending: true });
    }

    return result;
}

function updateFabricaTabCount(projects, orderIdForCount) {
    const count = orderIdForCount
        ? projects.filter(project => Number(project.orderId) === Number(orderIdForCount)).length
        : projects.length;
    updateOrderTabCounts(undefined, undefined, undefined, undefined, undefined, count);
}

function updateFabricaSaveFooterVisibility(projects) {
    const needsSaveFooter = (projects || []).some(project => {
        const statusName = project.projectStatus?.name;
        return statusName === FABRICA_EM_PRODUCAO_STATUS
            || statusName === FABRICA_MONTAGEM_INTERNA_STATUS;
    });
    document.getElementById('fabrica-save-footer')?.classList.toggle('hidden', !needsSaveFooter);
}

function setFabricaSaveButtonLoading(isLoading, message = 'Salvando...') {
    const button = document.getElementById('btn-fabrica-save');
    if (!button) return;

    if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent.trim();
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? message : button.dataset.originalText;
    button.classList.toggle('opacity-60', isLoading);
    button.classList.toggle('cursor-not-allowed', isLoading);
}

function getFabricaProjectLabel(card) {
    return card.querySelector('.text-sm.font-semibold')?.textContent?.trim() || 'Projeto';
}

function collectSelectedFabricaInicioCards() {
    return Array.from(document.querySelectorAll('[data-fabrica-mode="inicio"]'))
        .filter(card => card.querySelector('.fabrica-inicio-select')?.checked);
}

function collectSelectedFabricaFimCards() {
    return Array.from(document.querySelectorAll('[data-fabrica-mode="fim"]'))
        .filter(card => card.querySelector('.fabrica-fim-select')?.checked);
}

function validateFabricaInicioCard(card) {
    const label = getFabricaProjectLabel(card);
    const marceneiroId = card.querySelector('.fabrica-marceneiro')?.value;
    const inicioMontagemInterna = card.querySelector('.fabrica-inicio')?.value;

    if (!marceneiroId) {
        return { ok: false, message: `"${label}": selecione o marceneiro responsável.` };
    }
    if (!inicioMontagemInterna) {
        return { ok: false, message: `"${label}": informe a data de início da montagem interna.` };
    }
    if (isFabricaDateInFuture(inicioMontagemInterna)) {
        return { ok: false, message: `"${label}": a data de início não pode ser no futuro.` };
    }

    return {
        ok: true,
        projectId: Number(card.dataset.projectId),
        marceneiroId: Number(marceneiroId),
        inicioMontagemInterna,
        label
    };
}

function validateFabricaFimCard(card) {
    const label = getFabricaProjectLabel(card);
    const fimMontagemInterna = card.querySelector('.fabrica-fim')?.value;

    if (!fimMontagemInterna) {
        return { ok: false, message: `"${label}": informe a data de fim da montagem interna.` };
    }
    if (isFabricaDateInFuture(fimMontagemInterna)) {
        return { ok: false, message: `"${label}": a data de fim não pode ser no futuro.` };
    }

    return {
        ok: true,
        projectId: Number(card.dataset.projectId),
        fimMontagemInterna,
        label
    };
}

async function persistFabricaInicioProject(entry, montagemInternaStatusId) {
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            marceneiroId: entry.marceneiroId,
            inicioMontagemInterna: entry.inicioMontagemInterna,
            statusId: montagemInternaStatusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', entry.projectId);

    if (error) {
        throw new Error(`"${entry.label}": ${error.message}`);
    }
}

async function persistFabricaFimProject(entry, expedicaoStatusId) {
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            fimMontagemInterna: entry.fimMontagemInterna,
            statusId: expedicaoStatusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', entry.projectId);

    if (error) {
        throw new Error(`"${entry.label}": ${error.message}`);
    }
}

async function saveAllFabricaProjects() {
    const inicioCards = collectSelectedFabricaInicioCards();
    const fimCards = collectSelectedFabricaFimCards();

    if (!inicioCards.length && !fimCards.length) {
        alertAppDialog('Marque ao menos um projeto para salvar.');
        return;
    }

    const inicioEntries = [];
    const fimEntries = [];

    for (const card of inicioCards) {
        const result = validateFabricaInicioCard(card);
        if (!result.ok) {
            alertAppDialog(result.message);
            return;
        }
        inicioEntries.push(result);
    }

    for (const card of fimCards) {
        const result = validateFabricaFimCard(card);
        if (!result.ok) {
            alertAppDialog(result.message);
            return;
        }
        fimEntries.push(result);
    }

    const [montagemInternaStatusId, expedicaoStatusId] = await Promise.all([
        inicioEntries.length ? getMontagemInternaProjectStatusId() : null,
        fimEntries.length ? getExpedicaoProjectStatusId() : null
    ]);

    if (inicioEntries.length && !montagemInternaStatusId) {
        alertAppDialog(`Status "${FABRICA_MONTAGEM_INTERNA_STATUS}" não encontrado. Cadastre em Gestão → Status de Projeto.`);
        return;
    }

    if (fimEntries.length && !expedicaoStatusId) {
        alertAppDialog(`Status "${FABRICA_EXPEDICAO_STATUS}" não encontrado. Execute supabase/create-order-project-status.sql no Supabase.`);
        return;
    }

    setFabricaSaveButtonLoading(true);

    try {
        for (const entry of inicioEntries) {
            await persistFabricaInicioProject(entry, montagemInternaStatusId);
        }
        for (const entry of fimEntries) {
            await persistFabricaFimProject(entry, expedicaoStatusId);
        }

        await loadFabricaProjects(activeOrderId);
        if (activeOrderId && typeof loadOrderProjects === 'function') {
            await loadOrderProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('marceneiroId') || error.message?.includes('MontagemInterna') || error.message?.includes('fimMontagemInterna')
            ? '\n\nExecute supabase/create-gestao-order-fields.sql e supabase/create-marceneiro.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar: ' + error.message + sqlHint);
    } finally {
        setFabricaSaveButtonLoading(false);
    }
}

async function loadFabricaProjects(orderId = null) {
    const list = document.getElementById('fabrica-projects-list');
    if (!list) return;

    if (!canSeeOrderFabricaTab()) {
        list.innerHTML = '';
        updateFabricaSaveFooterVisibility(false);
        return;
    }

    updateFabricaSaveFooterVisibility(false);
    fabricaMarceneirosCache = [];
    await loadFabricaMarceneiros();

    const [emProducaoStatusId, montagemInternaStatusId] = await Promise.all([
        getEmProducaoProjectStatusId(),
        getMontagemInternaProjectStatusId()
    ]);

    const statusIds = [emProducaoStatusId, montagemInternaStatusId].filter(Boolean);
    if (!statusIds.length) {
        list.innerHTML = `
            <p class="text-xs text-amber-700 text-center py-6 bg-white rounded-xl border border-amber-100">
                Status de fábrica não encontrados. Execute <code>supabase/create-order-project-status.sql</code> no Supabase.
            </p>
        `;
        updateFabricaTabCount([], orderId);
        return;
    }

    const result = await fetchFabricaProjects(statusIds, orderId);

    if (result.error) {
        console.error('loadFabricaProjects:', result.error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Erro ao carregar projetos: ${escapeHtml(result.error.message)}</p>`;
        updateFabricaTabCount([], orderId);
        return;
    }

    const projects = await enrichFabricaProjectsWithOrder(result.data || []);
    updateFabricaTabCount(projects, orderId);

    if (!projects.length) {
        list.innerHTML = orderId
            ? '<p class="text-xs text-slate-400 text-center py-8">Nenhum projeto deste pedido em produção ou montagem interna.</p>'
            : '<p class="text-xs text-slate-400 text-center py-8">Nenhum projeto em produção ou montagem interna.</p>';
        return;
    }

    list.innerHTML = '';

    if (orderId) {
        [...projects]
            .sort(sortFabricaProjects)
            .forEach(project => {
                list.appendChild(renderFabricaProjectCard(project));
            });
    } else {
        groupFabricaProjectsByOrder(projects).forEach(group => {
            list.appendChild(renderFabricaOrderGroup(group));
        });
    }

    updateFabricaSaveFooterVisibility(projects);
}

function bindFabricaEvents() {
    document.getElementById('fabrica-projects-list')?.addEventListener('click', async (event) => {
        const toggleBtn = event.target.closest('.fabrica-order-toggle');
        if (!toggleBtn) return;

        const group = toggleBtn.closest('.fabrica-order-group');
        const orderId = group?.dataset.orderId;
        if (!orderId) return;
        const expanded = !isFabricaOrderExpanded(orderId);
        setFabricaOrderExpanded(orderId, expanded);
        applyFabricaOrderGroupCollapse(group, expanded);
    });

    document.getElementById('btn-fabrica-save')?.addEventListener('click', saveAllFabricaProjects);
}
