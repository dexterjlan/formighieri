async function loadGestaoPurchaseReasonsList() {
    const list = document.getElementById('gestao-purchase-reasons-list');
    const hint = document.getElementById('gestao-purchase-reasons-sql-hint');
    if (!list) return;

    const { data, error } = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        hint?.classList.remove('hidden');
        list.innerHTML = '';
        return;
    }

    hint?.classList.add('hidden');
    if (!data?.length) {
        list.innerHTML = '<p class="text-xs text-slate-400">Nenhum motivo cadastrado.</p>';
        return;
    }

    list.innerHTML = data.map(reason => `
        <div class="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
            <span class="text-sm text-slate-800">${escapeHtml(reason.name)}</span>
            <button type="button" class="text-xs px-2 py-1 rounded-lg ${reason.isActive ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}" data-purchase-reason-toggle="${reason.id}" data-active="${reason.isActive ? '1' : '0'}">
                ${reason.isActive ? 'Ativo' : 'Inativo'}
            </button>
        </div>
    `).join('');
}

async function addGestaoPurchaseReason(event) {
    event.preventDefault();
    const input = document.getElementById('gestao-purchase-reason-name');
    const name = input?.value?.trim();
    if (!name) return;

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-purchase-reasons-panel'), async () => {
        const { error } = await supabaseClient.from('PurchaseReason').insert([{
            name,
            sortOrder: 0,
            isActive: true,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        }]);

        if (error) {
            alertAppDialog(`${error.message} Execute supabase/feats/add-purchase-request-reasons.sql no Supabase SQL Editor.`);
            return;
        }

        if (input) input.value = '';
        await loadGestaoPurchaseReasonsList();
    });
}

function bindGestaoPurchaseReasonEvents() {
    document.getElementById('gestao-purchase-reason-form')?.addEventListener('submit', addGestaoPurchaseReason);
    document.getElementById('gestao-purchase-reasons-list')?.addEventListener('click', async event => {
        const button = event.target.closest('[data-purchase-reason-toggle]');
        if (!button) return;
        const active = button.dataset.active === '1';
        const { error } = await supabaseClient
            .from('PurchaseReason')
            .update({ isActive: !active, updatedById: currentUser?.id || null, updatedAt: new Date().toISOString() })
            .eq('id', Number(button.dataset.purchaseReasonToggle));
        if (error) {
            alertAppDialog(error.message);
            return;
        }
        await loadGestaoPurchaseReasonsList();
    });
}

window.loadGestaoPurchaseReasonsList = loadGestaoPurchaseReasonsList;
window.bindGestaoPurchaseReasonEvents = bindGestaoPurchaseReasonEvents;
