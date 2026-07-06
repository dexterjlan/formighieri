const PPCP_AGUARDANDO_STATUS = 'Aguardando PPCP';
const PPCP_IMPLANTACAO_STATUS = 'Implantação';
const PPCP_EM_PRODUCAO_STATUS = 'Em Produção';

async function getOrderProjectStatusIdByNamePpcp(statusName) {
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

async function getAguardandoPpcpProjectStatusId() {
    return getOrderProjectStatusIdByNamePpcp(PPCP_AGUARDANDO_STATUS);
}

async function getPpcpImplantacaoProjectStatusId() {
    return getOrderProjectStatusIdByNamePpcp(PPCP_IMPLANTACAO_STATUS);
}

async function getPpcpEmProducaoProjectStatusId() {
    return getOrderProjectStatusIdByNamePpcp(PPCP_EM_PRODUCAO_STATUS);
}

function getPpcpProjectSubtitle(project) {
    return [
        project.projectCode ? `Cód. ${project.projectCode}` : null,
        project.environmentType?.name || null
    ].filter(Boolean).join(' · ') || '—';
}

function renderPpcpAguardandoCard(project) {
    const card = document.createElement('div');
    card.className = 'flex flex-wrap items-center justify-between gap-3 p-4 border border-violet-100 rounded-xl bg-violet-50/30';
    card.dataset.projectId = String(project.id);

    card.innerHTML = `
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
            <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(getPpcpProjectSubtitle(project))}</p>
        </div>
        <button type="button" class="ppcp-implantar-btn bg-violet-700 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-violet-800 whitespace-nowrap">
            Implantar
        </button>
    `;

    return card;
}

function renderPpcpImplantacaoCard(project) {
    const card = document.createElement('div');
    card.className = 'flex flex-wrap items-center justify-between gap-3 p-4 border border-teal-100 rounded-xl bg-teal-50/30';
    card.dataset.projectId = String(project.id);

    card.innerHTML = `
        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
                <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-teal-100 text-teal-800">${escapeHtml(PPCP_IMPLANTACAO_STATUS)}</span>
            </div>
            <p class="text-xs text-slate-500">${escapeHtml(getPpcpProjectSubtitle(project))}</p>
        </div>
        <button type="button" class="ppcp-iniciar-producao-btn bg-teal-700 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-teal-800 whitespace-nowrap">
            Iniciar produção
        </button>
    `;

    return card;
}

function renderPpcpSection(title, projects, renderCard, emptyMessage) {
    const section = document.createElement('section');
    section.className = 'space-y-3';

    const heading = document.createElement('h3');
    heading.className = 'text-xs font-bold uppercase tracking-wide text-slate-500';
    heading.textContent = title;
    section.appendChild(heading);

    if (!projects.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-400 text-center py-4 bg-white rounded-xl border border-slate-100';
        empty.textContent = emptyMessage;
        section.appendChild(empty);
        return section;
    }

    projects.forEach(project => {
        section.appendChild(renderCard(project));
    });

    return section;
}

async function refreshPpcpRelatedViews(orderId) {
    await loadPpcpProjects(orderId);
    if (typeof loadFabricaProjects === 'function') {
        await loadFabricaProjects(orderId);
    }
    if (typeof loadOrderProjects === 'function') {
        await loadOrderProjects(orderId);
    }
}

async function loadPpcpProjects(orderId) {
    const list = document.getElementById('ppcp-projects-list');
    if (!list) return;

    if (!canSeeOrderPpcpTab()) {
        list.innerHTML = '';
        return;
    }

    const [aguardandoStatusId, implantacaoStatusId] = await Promise.all([
        getAguardandoPpcpProjectStatusId(),
        getPpcpImplantacaoProjectStatusId()
    ]);

    if (!aguardandoStatusId || !implantacaoStatusId) {
        list.innerHTML = `
            <p class="text-xs text-amber-700 text-center py-6 bg-white rounded-xl border border-amber-100">
                Status de PPCP não encontrados. Execute os scripts de status no Supabase ou cadastre em Gestão → Status de Projeto.
            </p>
        `;
        updateOrderTabCounts(undefined, undefined, undefined, undefined, undefined, undefined, 0);
        return;
    }

    const statusIds = [aguardandoStatusId, implantacaoStatusId];
    const { data: projects, error } = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
        .eq('orderId', orderId)
        .in('statusId', statusIds)
        .order('name', { ascending: true });

    if (error) {
        console.error('loadPpcpProjects:', error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Erro ao carregar projetos: ${escapeHtml(error.message)}</p>`;
        updateOrderTabCounts(undefined, undefined, undefined, undefined, undefined, undefined, 0);
        return;
    }

    const items = projects || [];
    const aguardandoProjects = items.filter(project =>
        Number(project.statusId) === Number(aguardandoStatusId)
        || project.projectStatus?.name === PPCP_AGUARDANDO_STATUS
    );
    const implantacaoProjects = items.filter(project =>
        Number(project.statusId) === Number(implantacaoStatusId)
        || project.projectStatus?.name === PPCP_IMPLANTACAO_STATUS
    );

    updateOrderTabCounts(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        aguardandoProjects.length + implantacaoProjects.length
    );

    list.innerHTML = '';
    list.appendChild(renderPpcpSection(
        'Aguardando PPCP',
        aguardandoProjects,
        renderPpcpAguardandoCard,
        'Nenhum projeto aguardando PPCP neste pedido.'
    ));
    list.appendChild(renderPpcpSection(
        'Em implantação',
        implantacaoProjects,
        renderPpcpImplantacaoCard,
        'Nenhum projeto em implantação neste pedido.'
    ));
}

async function implantarPpcpProject(projectId, button, projectName) {
    if (!activeOrderId || !canSeeOrderPpcpTab()) return;

    const label = projectName || 'este projeto';
    if (!confirm(`Enviar "${label}" para implantação?`)) return;

    const implantacaoStatusId = await getPpcpImplantacaoProjectStatusId();
    if (!implantacaoStatusId) {
        alert(`Status "${PPCP_IMPLANTACAO_STATUS}" não encontrado. Execute supabase/add-order-project-implantacao-status.sql no Supabase.`);
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvando...';
    button.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: implantacaoStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alert('Erro ao enviar para implantação: ' + error.message);
            return;
        }

        await refreshPpcpRelatedViews(activeOrderId);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
        button.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

async function iniciarProducaoPpcpProject(projectId, button, projectName) {
    if (!activeOrderId || !canSeeOrderPpcpTab()) return;

    const label = projectName || 'este projeto';
    if (!confirm(`Finalizar implantação e iniciar produção de "${label}"?`)) return;

    const emProducaoStatusId = await getPpcpEmProducaoProjectStatusId();
    if (!emProducaoStatusId) {
        alert(`Status "${PPCP_EM_PRODUCAO_STATUS}" não encontrado. Execute supabase/add-order-project-fabrica-status.sql no Supabase.`);
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvando...';
    button.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: emProducaoStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alert('Erro ao iniciar produção: ' + error.message);
            return;
        }

        await refreshPpcpRelatedViews(activeOrderId);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
        button.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

function bindPpcpEvents() {
    document.getElementById('ppcp-projects-list')?.addEventListener('click', (event) => {
        const implantarBtn = event.target.closest('.ppcp-implantar-btn');
        if (implantarBtn) {
            const card = implantarBtn.closest('[data-project-id]');
            const projectId = Number(card?.dataset.projectId);
            if (!projectId) return;
            const projectName = card.querySelector('.text-sm.font-semibold')?.textContent?.trim() || '';
            implantarPpcpProject(projectId, implantarBtn, projectName);
            return;
        }

        const iniciarBtn = event.target.closest('.ppcp-iniciar-producao-btn');
        if (!iniciarBtn) return;

        const card = iniciarBtn.closest('[data-project-id]');
        const projectId = Number(card?.dataset.projectId);
        if (!projectId) return;
        const projectName = card.querySelector('.text-sm.font-semibold')?.textContent?.trim() || '';
        iniciarProducaoPpcpProject(projectId, iniciarBtn, projectName);
    });
}
