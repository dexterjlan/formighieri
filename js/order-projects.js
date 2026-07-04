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
        alert('Selecione um pedido primeiro.');
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
    if (!btn) return;

    if (!count) {
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');
    btn.textContent = orderProjectsExpanded ? 'Recolher' : 'Expandir';
}

function applyProjectsListCollapse() {
    const panel = document.getElementById('order-projects-panel');
    if (!panel) return;

    panel.classList.toggle('hidden', !orderProjectsExpanded || !orderProjectsCache.length);
}

function toggleOrderProjectsList() {
    orderProjectsExpanded = !orderProjectsExpanded;
    applyProjectsListCollapse();
    updateProjectsListToggle(orderProjectsCache.length);
}

window.toggleOrderProjectsList = toggleOrderProjectsList;

async function fetchOrderProjectsForOrder(orderId) {
    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name)')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    if (error) {
        console.error('fetchOrderProjectsForOrder:', error);
        return [];
    }

    return data || [];
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
        return;
    }

    list.innerHTML = '';

    [...orderProjectsCache]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
        .forEach(p => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-violet-100 bg-violet-50/40';
        div.innerHTML = `
            <span class="text-xs font-semibold text-slate-800 truncate" title="${p.name}">${p.name}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-800 whitespace-nowrap shrink-0">${p.environmentType?.name || '-'}</span>
        `;
        list.appendChild(div);
    });

    applyProjectsListCollapse();
    updateProjectsListToggle(orderProjectsCache.length);
}

function bindOrderProjectEvents() {
    document.getElementById('btn-toggle-projects-list')?.addEventListener('click', toggleOrderProjectsList);

    document.getElementById('order-project-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!activeOrderId) {
            alert('Selecione um pedido primeiro.');
            return;
        }

        const name = document.getElementById('project-name').value.trim();
        const environmentTypeId = document.getElementById('project-environment-type').value;

        if (!name) {
            alert('Informe o nome do projeto.');
            document.getElementById('project-name').focus();
            return;
        }

        if (!environmentTypeId) {
            alert('Selecione o tipo de ambiente.');
            document.getElementById('project-environment-type').focus();
            return;
        }

        const statusId = await getVendidoProjectStatusId();
        if (!statusId) {
            alert('Status "Vendido" não encontrado. Cadastre em Gestão → Status de Projeto.');
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

        const { error } = await supabaseClient.from('OrderProject').insert([payload]);

        if (error) {
            alert('Erro ao salvar projeto: ' + error.message);
            return;
        }

        closeOrderProjectModal();
        document.getElementById('order-project-form').reset();
        loadOrderProjects(activeOrderId);
    });
}
