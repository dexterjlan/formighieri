let environmentTypesCache = [];
let orderProjectsCache = [];
let orderProjectsExpanded = false;

async function loadEnvironmentTypes() {
    if (environmentTypesCache.length) return environmentTypesCache;

    const { data, error } = await supabaseClient
        .from('EnvironmentType')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) {
        console.error('loadEnvironmentTypes:', error);
        return [];
    }

    environmentTypesCache = data || [];
    return environmentTypesCache;
}

async function getVendidoProjectStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Vendido')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .limit(1)
        .maybeSingle();

    return fallback?.id || null;
}

async function populateEnvironmentTypeSelect() {
    const select = document.getElementById('project-environment-type');
    const types = [...(await loadEnvironmentTypes())].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    select.innerHTML = '<option value="">Selecione...</option>';

    if (!types.length) {
        select.innerHTML += '<option value="" disabled>Nenhum tipo cadastrado</option>';
        return;
    }

    types.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

async function openOrderProjectModal() {
    if (!activeOrderId) {
        alertAppDialog('Selecione um pedido primeiro.');
        return;
    }

    document.getElementById('order-project-form').reset();
    await populateEnvironmentTypeSelect();
    toggleModal('order-project-modal', true);
}

function closeOrderProjectModal() {
    toggleModal('order-project-modal', false);
}

window.openOrderProjectModal = openOrderProjectModal;
window.closeOrderProjectModal = closeOrderProjectModal;

function updateProjectsListToggle(count) {
    const btn = document.getElementById('btn-toggle-projects-list');
    const icon = document.getElementById('order-projects-toggle-icon');
    if (!btn || !icon) return;

    const hasProjects = count > 0;
    icon.classList.toggle('hidden', !hasProjects);
    icon.textContent = orderProjectsExpanded ? '▼' : '▶';
    btn.setAttribute(
        'aria-label',
        hasProjects
            ? (orderProjectsExpanded ? 'Recolher projetos' : 'Expandir projetos')
            : 'Projetos'
    );
}

function applyProjectsListCollapse() {
    const panel = document.getElementById('order-projects-panel');
    if (!panel) return;

    panel.classList.toggle('hidden', !orderProjectsExpanded || !orderProjectsCache.length);
}

function toggleOrderProjectsList() {
    if (!orderProjectsCache.length) return;
    orderProjectsExpanded = !orderProjectsExpanded;
    applyProjectsListCollapse();
    updateProjectsListToggle(orderProjectsCache.length);
}

window.toggleOrderProjectsList = toggleOrderProjectsList;

async function fetchOrderProjectsForOrder(orderId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (result.error) {
        console.error('fetchOrderProjectsForOrder:', result.error);
        return [];
    }

    return enrichOrderProjectsWithStatus(result.data || []);
}

async function enrichOrderProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichOrderProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

async function loadOrderProjects(orderId) {
    const list = document.getElementById('order-projects-list');

    const projects = await fetchOrderProjectsForOrder(orderId);
    orderProjectsCache = projects;
    orderProjectsExpanded = false;
    updateOrderTabCounts(undefined, undefined, orderProjectsCache.length);

    if (!list) return;

    if (!orderProjectsCache.length) {
        list.innerHTML = '';
        orderProjectsExpanded = false;
        applyProjectsListCollapse();
        updateProjectsListToggle(0);
        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
        return;
    }

    list.innerHTML = `
        <div class="grid grid-cols-[minmax(0,1fr)_88px_1fr] gap-2 px-2.5 py-1 text-[9px] uppercase font-semibold text-slate-400 border-b border-violet-100">
            <span>Projeto</span>
            <span>Ambiente</span>
            <span>Status</span>
        </div>
    `;

    [...orderProjectsCache]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
        .forEach(p => {
            const statusName = getOrderProjectStatusName(p);
            const statusClass = getOrderProjectStatusBadgeClass(statusName);
            const div = document.createElement('div');
            div.className = 'grid grid-cols-[minmax(0,1fr)_88px_1fr] gap-2 items-center px-2.5 py-1.5 rounded-md border border-violet-100 bg-violet-50/40';
            div.innerHTML = `
                <div class="min-w-0">
                    <span class="text-xs font-semibold text-slate-800 truncate block" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-800 whitespace-nowrap truncate" title="${escapeHtml(p.environmentType?.name || '-')}">${escapeHtml(p.environmentType?.name || '-')}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap truncate ${statusClass}" title="${escapeHtml(statusName)}">${escapeHtml(statusName)}</span>
            `;
            list.appendChild(div);
        });

    applyProjectsListCollapse();
    updateProjectsListToggle(orderProjectsCache.length);

    if (typeof refreshOrdersListSummary === 'function') {
        await refreshOrdersListSummary();
    }
}

function bindOrderProjectEvents() {
    document.getElementById('btn-toggle-projects-list')?.addEventListener('click', toggleOrderProjectsList);

    document.getElementById('order-project-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!activeOrderId) {
            alertAppDialog('Selecione um pedido primeiro.');
            return;
        }

        const name = document.getElementById('project-name').value.trim();
        const environmentTypeId = document.getElementById('project-environment-type').value;

        if (!name) {
            alertAppDialog('Informe o nome do projeto.');
            document.getElementById('project-name').focus();
            return;
        }

        if (!environmentTypeId) {
            alertAppDialog('Selecione o tipo de ambiente.');
            document.getElementById('project-environment-type').focus();
            return;
        }

        const saleValue = parseSaleValueInput(document.getElementById('project-sale-value')?.value);
        if (Number.isNaN(saleValue)) {
            alertAppDialog('Informe um valor de venda válido.');
            document.getElementById('project-sale-value')?.focus();
            return;
        }

        const statusId = await getVendidoProjectStatusId();
        if (!statusId) {
            alertAppDialog('Status "Vendido" não encontrado. Cadastre em Gestão → Status de Projeto.');
            return;
        }

        const now = new Date().toISOString();
        const payload = {
            orderId: activeOrderId,
            name,
            environmentTypeId: Number(environmentTypeId),
            statusId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        if (saleValue !== null) {
            payload.saleValue = saleValue;
        }

        const caminhoRedeAprovacao = document.getElementById('project-caminho-rede-aprovacao')?.value?.trim();
        if (caminhoRedeAprovacao) {
            payload.caminhoRedeAprovacao = caminhoRedeAprovacao;
        }

        let { error } = await supabaseClient.from('OrderProject').insert([payload]);

        if (error?.message?.includes('saleValue')) {
            delete payload.saleValue;
            ({ error } = await supabaseClient.from('OrderProject').insert([payload]));
        }

        if (error?.message?.includes('caminhoRedeAprovacao')) {
            delete payload.caminhoRedeAprovacao;
            ({ error } = await supabaseClient.from('OrderProject').insert([payload]));
        }

        if (error) {
            alertAppDialog('Erro ao salvar projeto: ' + error.message);
            return;
        }

        closeOrderProjectModal();
        document.getElementById('order-project-form').reset();
        loadOrderProjects(activeOrderId);
    });
}
