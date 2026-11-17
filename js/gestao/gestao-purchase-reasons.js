const PURCHASE_REASON_LEGACY_SYSTEM_NAME_MATCHES = new Set(['implantação', 'implantacao']);

function normalizePurchaseReasonNameForMatch(name) {
    return String(name || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function isPurchaseReasonLegacySystemName(name) {
    const normalized = normalizePurchaseReasonNameForMatch(name);
    return PURCHASE_REASON_LEGACY_SYSTEM_NAME_MATCHES.has(normalized)
        || normalized === 'implantacao';
}

function isPurchaseReasonSystemType(reason) {
    if (!reason) return false;
    if (reason.isSystem === true) return true;
    if (reason.isSystem === false) return false;
    return isPurchaseReasonLegacySystemName(reason.name);
}

function filterPurchaseReasonsForManualRequest(reasons = []) {
    return (reasons || []).filter(reason => !isPurchaseReasonSystemType(reason));
}

function findSystemPurchaseReason(reasons = []) {
    const list = reasons || [];
    const explicit = list.find(row => row.isSystem === true);
    if (explicit) return explicit;
    return list.find(isPurchaseReasonSystemType) || null;
}

async function loadGestaoPurchaseReasonsList() {
    const tbody = document.getElementById('gestao-purchase-reasons-list');
    const hint = document.getElementById('gestao-purchase-reasons-sql-hint');
    if (!tbody) return;

    let result = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, sortOrder, isActive, isSystem')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (result.error?.message?.includes('isSystem')) {
        result = await supabaseClient
            .from('PurchaseReason')
            .select('id, name, sortOrder, isActive')
            .order('sortOrder', { ascending: true })
            .order('name', { ascending: true });
    }

    const { data, error } = result;

    if (error) {
        hint?.classList.remove('hidden');
        tbody.innerHTML = '';
        return;
    }

    hint?.classList.add('hidden');

    if (!data?.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-slate-400">Nenhum motivo cadastrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const isSystem = isPurchaseReasonSystemType(row);
        return `
        <tr data-purchase-reason-id="${row.id}">
            <td class="p-3">
                <input type="number" min="0" step="1"
                    class="gestao-purchase-reason-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(row.sortOrder) || 0}">
            </td>
            <td class="p-3">
                <input type="text" required
                    class="gestao-purchase-reason-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(row.name)}">
            </td>
            <td class="p-3 text-center">
                <input type="checkbox"
                    class="gestao-purchase-reason-system h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    title="Não aparece em requisição manual de compra"
                    ${isSystem ? 'checked' : ''}>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox"
                    class="gestao-purchase-reason-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${row.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button"
                        class="gestao-save-purchase-reason text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button"
                        class="gestao-delete-purchase-reason text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

async function addGestaoPurchaseReason(event) {
    event.preventDefault();
    const nameInput = document.getElementById('gestao-purchase-reason-name');
    const sortInput = document.getElementById('gestao-purchase-reason-sort');
    const systemInput = document.getElementById('gestao-purchase-reason-is-system');
    const name = nameInput?.value?.trim();
    if (!name) return;

    const sortOrder = Number(sortInput?.value) || 0;
    const isSystem = Boolean(systemInput?.checked);

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-purchase-reasons-panel'), async () => {
        const payload = {
            name,
            sortOrder,
            isActive: true,
            isSystem,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        };

        let { error } = await supabaseClient.from('PurchaseReason').insert([payload]);

        if (error?.message?.includes('isSystem')) {
            const { isSystem: _omit, ...legacyPayload } = payload;
            ({ error } = await supabaseClient.from('PurchaseReason').insert([legacyPayload]));
        }

        if (error) {
            alertAppDialog(`${error.message} Execute os scripts em supabase/feats/ (motivos de compra) no Supabase SQL Editor.`);
            return;
        }

        if (nameInput) nameInput.value = '';
        if (sortInput) sortInput.value = '0';
        if (systemInput) systemInput.checked = false;
        await loadGestaoPurchaseReasonsList();
    });
}

async function saveGestaoPurchaseReasonRow(row) {
    if (!row) return;
    const id = Number(row.dataset.purchaseReasonId);
    if (!id) return;

    const name = row.querySelector('.gestao-purchase-reason-name')?.value?.trim();
    if (!name) {
        alertAppDialog('Informe o nome do motivo.');
        return;
    }

    const sortOrder = Number(row.querySelector('.gestao-purchase-reason-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-purchase-reason-active')?.checked);
    const isSystem = Boolean(row.querySelector('.gestao-purchase-reason-system')?.checked);

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-purchase-reasons-panel'), async () => {
        const payload = {
            name,
            sortOrder,
            isActive,
            isSystem,
            updatedById: currentUser?.id || null,
            updatedAt: new Date().toISOString()
        };

        let { error } = await supabaseClient
            .from('PurchaseReason')
            .update(payload)
            .eq('id', id);

        if (error?.message?.includes('isSystem')) {
            const { isSystem: _omit, ...legacyPayload } = payload;
            ({ error } = await supabaseClient.from('PurchaseReason').update(legacyPayload).eq('id', id));
        }

        if (error) {
            alertAppDialog(error.message);
            return;
        }

        await loadGestaoPurchaseReasonsList();
    });
}

async function deleteGestaoPurchaseReasonRow(row) {
    if (!row) return;
    const id = Number(row.dataset.purchaseReasonId);
    if (!id) return;

    const name = row.querySelector('.gestao-purchase-reason-name')?.value?.trim() || 'este motivo';

    const { count, error: countError } = await supabaseClient
        .from('Purchase')
        .select('id', { count: 'exact', head: true })
        .eq('purchaseReasonId', id);

    if (countError && !countError.message?.includes('purchaseReasonId')) {
        alertAppDialog('Erro ao verificar uso do motivo: ' + countError.message);
        return;
    }

    if ((count || 0) > 0) {
        alertAppDialog(`O motivo "${name}" está em uso por ${count} compra(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o motivo "${name}"?`, {
        title: 'Excluir motivo',
        confirmLabel: 'Excluir'
    }))) return;

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-purchase-reasons-panel'), async () => {
        const { error } = await supabaseClient
            .from('PurchaseReason')
            .delete()
            .eq('id', id);

        if (error) {
            alertAppDialog('Erro ao excluir motivo: ' + error.message);
            return;
        }

        await loadGestaoPurchaseReasonsList();
    });
}

function bindGestaoPurchaseReasonEvents() {
    document.getElementById('gestao-purchase-reason-form')?.addEventListener('submit', addGestaoPurchaseReason);
    document.getElementById('gestao-purchase-reasons-list')?.addEventListener('click', event => {
        const saveBtn = event.target.closest('.gestao-save-purchase-reason');
        if (saveBtn) {
            event.preventDefault();
            saveGestaoPurchaseReasonRow(saveBtn.closest('tr'));
            return;
        }

        const deleteBtn = event.target.closest('.gestao-delete-purchase-reason');
        if (deleteBtn) {
            event.preventDefault();
            deleteGestaoPurchaseReasonRow(deleteBtn.closest('tr'));
        }
    });
}

window.isPurchaseReasonSystemType = isPurchaseReasonSystemType;
window.filterPurchaseReasonsForManualRequest = filterPurchaseReasonsForManualRequest;
window.findSystemPurchaseReason = findSystemPurchaseReason;
window.loadGestaoPurchaseReasonsList = loadGestaoPurchaseReasonsList;
window.bindGestaoPurchaseReasonEvents = bindGestaoPurchaseReasonEvents;