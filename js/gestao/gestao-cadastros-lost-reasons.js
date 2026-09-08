let gestaoLostReasonsCache = [];
let lostReasonsSchemaMissing = false;
let pendingLoseDealId = null;

async function loadDealLostReasons(activeOnly = false) {
    let query = supabaseClient
        .from('DealLostReason')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });
    if (activeOnly) query = query.eq('isActive', true);
    const { data, error } = await query;
    if (error) {
        lostReasonsSchemaMissing = /DealLostReason|schema cache/i.test(error.message || '');
        if (!lostReasonsSchemaMissing) {
            console.error('loadDealLostReasons:', error);
        }
        gestaoLostReasonsCache = [];
        return [];
    }
    lostReasonsSchemaMissing = false;
    gestaoLostReasonsCache = data || [];
    return gestaoLostReasonsCache;
}

async function createDealLostReason(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { error: 'Informe o motivo da perda.' };

    const { data: existingRows } = await supabaseClient
        .from('DealLostReason')
        .select('id, name, sortOrder, isActive')
        .ilike('name', trimmed)
        .limit(1);
    const existing = existingRows?.[0];
    if (existing?.id) {
        if (existing.isActive === false) {
            await supabaseClient.from('DealLostReason').update({
                isActive: true,
                updatedAt: new Date().toISOString(),
                updatedById: currentUser?.id || null
            }).eq('id', existing.id);
            existing.isActive = true;
        }
        return { data: existing };
    }

    const now = new Date().toISOString();
    const maxSort = (gestaoLostReasonsCache || []).reduce(
        (max, item) => Math.max(max, Number(item.sortOrder) || 0),
        0
    );
    const { data, error } = await supabaseClient
        .from('DealLostReason')
        .insert({
            name: trimmed,
            sortOrder: maxSort + 10,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        })
        .select('id, name, sortOrder, isActive')
        .single();

    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        if (isDuplicate) {
            await loadDealLostReasons(false);
            const raced = (gestaoLostReasonsCache || []).find(item =>
                String(item.name || '').trim().toLowerCase() === trimmed.toLowerCase()
            );
            if (raced?.id) return { data: raced };
        }
        return {
            error: isDuplicate
                ? `Já existe o motivo "${trimmed}".`
                : 'Erro ao cadastrar motivo: ' + error.message
        };
    }
    return { data };
}

function renderDealLostReasonChoices(selectedId = null) {
    const box = document.getElementById('deal-lost-reason-list');
    if (!box) return;

    if (lostReasonsSchemaMissing) {
        box.innerHTML = `
            <p class="text-xs text-amber-700">
                Execute <code>supabase/feats/create-deal-lost-reason.sql</code> no Supabase SQL Editor (DEV).
                Enquanto isso, descreva o motivo abaixo.
            </p>
            <input type="text" id="deal-lost-reason-fallback"
                placeholder="Ex.: Preço muito elevado"
                class="mt-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-600">
        `;
        document.getElementById('deal-lost-reason-create-form')?.classList.add('hidden');
        return;
    }

    document.getElementById('deal-lost-reason-create-form')?.classList.remove('hidden');
    const active = (gestaoLostReasonsCache || []).filter(item => item.isActive !== false);
    if (!active.length) {
        box.innerHTML = '<p class="text-xs text-slate-400">Nenhum motivo ativo. Cadastre um abaixo.</p>';
        return;
    }

    const checkedId = selectedId || active[0].id;
    box.innerHTML = active.map(item => `
        <label class="flex items-start gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input type="radio" name="deal-lost-reason" value="${item.id}" class="mt-0.5"
                ${Number(item.id) === Number(checkedId) ? 'checked' : ''}>
            <span class="text-sm text-slate-800">${escapeHtml(item.name)}</span>
        </label>
    `).join('');
}

async function openDealLostReasonModal(dealId) {
    pendingLoseDealId = dealId;
    const createInput = document.getElementById('deal-lost-reason-create-name');
    if (createInput) createInput.value = '';
    const box = document.getElementById('deal-lost-reason-list');
    if (box) {
        box.innerHTML = '<p class="text-xs text-slate-400">Carregando motivos...</p>';
    }
    toggleModal('deal-lost-reason-modal', true);
    await loadDealLostReasons(true);
    renderDealLostReasonChoices();
}

async function saveDealLostReasonFromModal(event) {
    event.preventDefault();
    const name = document.getElementById('deal-lost-reason-create-name')?.value.trim();
    if (!name) {
        alertAppDialog('Informe o novo motivo da perda.');
        return;
    }
    const result = await createDealLostReason(name);
    if (result.error) {
        alertAppDialog(result.error);
        return;
    }
    document.getElementById('deal-lost-reason-create-name').value = '';
    await loadDealLostReasons(true);
    renderDealLostReasonChoices(result.data.id);
}

function getSelectedDealLostReasonName() {
    const fallback = document.getElementById('deal-lost-reason-fallback');
    if (fallback) return fallback.value.trim();
    const selected = document.querySelector('#deal-lost-reason-list input[name="deal-lost-reason"]:checked');
    if (!selected) return '';
    const item = (gestaoLostReasonsCache || []).find(reason => Number(reason.id) === Number(selected.value));
    return item?.name || '';
}

async function loadGestaoLostReasonsList() {
    const tbody = document.getElementById('gestao-lost-reasons-list');
    if (!tbody) return;

    const reasons = await loadDealLostReasons(false);
    if (!reasons.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs ${lostReasonsSchemaMissing ? 'text-amber-700' : 'text-slate-400'}">
                    ${lostReasonsSchemaMissing
                        ? 'Execute <code>supabase/feats/create-deal-lost-reason.sql</code> no Supabase SQL Editor (DEV).'
                        : 'Nenhum motivo cadastrado.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    reasons.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.reasonId = String(item.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-lost-reason-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(item.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-lost-reason-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(item.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-lost-reason-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${item.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-lost-reason text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">Salvar</button>
                    <button type="button" class="gestao-delete-lost-reason text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addGestaoLostReason(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;
    const name = document.getElementById('gestao-new-lost-reason-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-lost-reason-sort')?.value);
    if (!name) {
        alertAppDialog('Informe o motivo da perda.');
        return;
    }
    const now = new Date().toISOString();
    const { error } = await supabaseClient.from('DealLostReason').insert({
        name,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null
    });
    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        alertAppDialog(
            isDuplicate
                ? `Já existe o motivo "${name}".`
                : 'Erro ao adicionar motivo: ' + error.message
        );
        return;
    }
    document.getElementById('gestao-new-lost-reason-form')?.reset();
    await loadGestaoLostReasonsList();
}

async function saveGestaoLostReasonRow(tr) {
    if (!canAccessGestao()) return;
    const reasonId = Number(tr.dataset.reasonId);
    const name = tr.querySelector('.gestao-lost-reason-name')?.value.trim();
    const sortOrder = Number(tr.querySelector('.gestao-lost-reason-sort')?.value) || 0;
    const isActive = Boolean(tr.querySelector('.gestao-lost-reason-active')?.checked);
    if (!name) {
        alertAppDialog('Informe o motivo da perda.');
        return;
    }
    const { error } = await supabaseClient.from('DealLostReason').update({
        name,
        sortOrder,
        isActive,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    }).eq('id', reasonId);
    if (error) {
        alertAppDialog('Erro ao salvar motivo: ' + error.message);
        return;
    }
}

async function deleteGestaoLostReasonRow(tr) {
    if (!canAccessGestao()) return;
    const reasonId = Number(tr.dataset.reasonId);
    const name = tr.querySelector('.gestao-lost-reason-name')?.value.trim() || 'o motivo';
    const { count, error: countErr } = await supabaseClient
        .from('Deal')
        .select('id', { count: 'exact', head: true })
        .eq('lostReason', name);
    if (!countErr && count > 0) {
        alertAppDialog(`O motivo "${name}" está em ${count} negócio(s) perdido(s). Desative-o em vez de excluir.`);
        return;
    }
    if (!(await confirmAppDialog(`Excluir o motivo "${name}"?`))) return;
    const { error } = await supabaseClient.from('DealLostReason').delete().eq('id', reasonId);
    if (error) {
        alertAppDialog('Erro ao excluir motivo: ' + error.message);
        return;
    }
    await loadGestaoLostReasonsList();
}

function bindGestaoLostReasonsEvents() {
    document.getElementById('gestao-new-lost-reason-form')?.addEventListener('submit', addGestaoLostReason);
    document.getElementById('gestao-lost-reasons-list')?.addEventListener('click', async event => {
        const tr = event.target.closest('tr');
        if (!tr) return;
        if (event.target.closest('.gestao-save-lost-reason')) await saveGestaoLostReasonRow(tr);
        if (event.target.closest('.gestao-delete-lost-reason')) await deleteGestaoLostReasonRow(tr);
    });
    document.getElementById('deal-lost-reason-create-form')?.addEventListener('submit', saveDealLostReasonFromModal);
}

window.openDealLostReasonModal = openDealLostReasonModal;
window.getSelectedDealLostReasonName = getSelectedDealLostReasonName;
window.loadDealLostReasons = loadDealLostReasons;
