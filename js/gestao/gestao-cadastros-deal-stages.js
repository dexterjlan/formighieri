let gestaoDealStagesCache = [];

async function loadGestaoDealStagesList() {
    const tbody = document.getElementById('gestao-deal-stages-list');
    if (!tbody) return;

    const { data, error } = await supabaseClient
        .from('DealStage')
        .select('id, name, sortOrder, outcome, isActive')
        .eq('outcome', 'open')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    ${escapeHtml(error.message)}. Execute <code>supabase/feats/create-commercial-funnel.sql</code>.
                </td>
            </tr>
        `;
        return;
    }

    gestaoDealStagesCache = data || [];
    if (!gestaoDealStagesCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-slate-400">Nenhum estágio cadastrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    gestaoDealStagesCache.forEach(stage => {
        const tr = document.createElement('tr');
        tr.dataset.stageId = String(stage.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-deal-stage-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(stage.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-deal-stage-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(stage.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-deal-stage-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${stage.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-deal-stage text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">Salvar</button>
                    <button type="button" class="gestao-delete-deal-stage text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addGestaoDealStage(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;
    const name = document.getElementById('gestao-new-deal-stage-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-deal-stage-sort')?.value) || 0;
    if (!name) {
        alertAppDialog('Informe o nome do estágio.');
        return;
    }
    const now = new Date().toISOString();
    const { error } = await supabaseClient.from('DealStage').insert({
        name,
        sortOrder,
        outcome: 'open',
        isActive: true,
        updatedAt: now,
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null
    });
    if (error) {
        alertAppDialog('Erro ao adicionar estágio: ' + error.message);
        return;
    }
    document.getElementById('gestao-new-deal-stage-form')?.reset();
    await loadGestaoDealStagesList();
}

async function saveGestaoDealStageRow(tr) {
    if (!canAccessGestao()) return;
    const stageId = Number(tr.dataset.stageId);
    const name = tr.querySelector('.gestao-deal-stage-name')?.value.trim();
    const sortOrder = Number(tr.querySelector('.gestao-deal-stage-sort')?.value) || 0;
    const isActive = Boolean(tr.querySelector('.gestao-deal-stage-active')?.checked);
    if (!name) {
        alertAppDialog('Informe o nome do estágio.');
        return;
    }
    const { error } = await supabaseClient.from('DealStage').update({
        name,
        sortOrder,
        isActive,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    }).eq('id', stageId);
    if (error) {
        alertAppDialog('Erro ao salvar estágio: ' + error.message);
        return;
    }
}

async function deleteGestaoDealStageRow(tr) {
    if (!canAccessGestao()) return;
    const stageId = Number(tr.dataset.stageId);
    const name = tr.querySelector('.gestao-deal-stage-name')?.value.trim() || 'o estágio';
    const { count } = await supabaseClient
        .from('Deal')
        .select('id', { count: 'exact', head: true })
        .eq('stageId', stageId);
    if (count > 0) {
        alertAppDialog(`O estágio "${name}" possui negócios. Desative-o em vez de excluir.`);
        return;
    }
    if (!(await confirmAppDialog(`Excluir o estágio "${name}"?`))) return;
    const { error } = await supabaseClient.from('DealStage').delete().eq('id', stageId);
    if (error) {
        alertAppDialog('Erro ao excluir estágio: ' + error.message);
        return;
    }
    await loadGestaoDealStagesList();
}

function bindGestaoDealStagesEvents() {
    document.getElementById('gestao-new-deal-stage-form')?.addEventListener('submit', addGestaoDealStage);
    document.getElementById('gestao-deal-stages-list')?.addEventListener('click', async event => {
        const tr = event.target.closest('tr');
        if (!tr) return;
        if (event.target.closest('.gestao-save-deal-stage')) await saveGestaoDealStageRow(tr);
        if (event.target.closest('.gestao-delete-deal-stage')) await deleteGestaoDealStageRow(tr);
    });
}
