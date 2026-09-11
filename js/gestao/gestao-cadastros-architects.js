let gestaoArchitectsCache = [];
let architectsSchemaMissing = false;
let architectPickerCache = [];
let activeArchitectPickerCallback = null;

async function loadArchitects(activeOnly = false) {
    const columns = 'id, name, isActive';
    let query = supabaseClient
        .from('Architect')
        .select(columns)
        .order('name', { ascending: true });
    if (activeOnly) query = query.eq('isActive', true);
    const { data, error } = await query;
    if (error) {
        architectsSchemaMissing = /Architect|schema cache/i.test(error.message || '');
        if (!architectsSchemaMissing) {
            console.error('loadArchitects:', error);
        }
        gestaoArchitectsCache = [];
        return [];
    }
    architectsSchemaMissing = false;
    gestaoArchitectsCache = data || [];
    return gestaoArchitectsCache;
}

async function resolveOrCreateArchitectId(name, extras = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;

    const phone = String(extras.phone || '').trim() || null;
    const email = String(extras.email || '').trim() || null;
    const contactName = String(extras.contactName || '').trim() || null;

    let { data: existingRows, error: searchErr } = await supabaseClient
        .from('Architect')
        .select('id, name')
        .ilike('name', trimmed)
        .limit(1);

    if (searchErr?.message?.includes('Architect')) return null;
    if (searchErr) {
        console.error('resolveOrCreateArchitectId search:', searchErr);
    }

    const existing = existingRows?.[0];
    if (existing?.id) {
        if (typeof upsertOwnerContact === 'function') {
            await upsertOwnerContact(
                typeof CONTACT_OWNER_TYPE_ARCHITECT === 'string' ? CONTACT_OWNER_TYPE_ARCHITECT : 'architect',
                existing.id,
                { name: contactName, phone, email }
            );
        }
        return existing.id;
    }

    const now = new Date().toISOString();
    const { data: created, error: insertErr } = await persistArchitectRecord({
        name: trimmed,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null
    });

    if (insertErr) {
        const { data: raced } = await supabaseClient
            .from('Architect')
            .select('id')
            .ilike('name', trimmed)
            .limit(1);
        if (raced?.[0]?.id) return raced[0].id;
        console.error('resolveOrCreateArchitectId insert:', insertErr);
        return null;
    }
    if (created?.id && typeof upsertOwnerContact === 'function') {
        await upsertOwnerContact(
            typeof CONTACT_OWNER_TYPE_ARCHITECT === 'string' ? CONTACT_OWNER_TYPE_ARCHITECT : 'architect',
            created.id,
            { name: contactName, phone, email }
        );
    }
    return created?.id || null;
}

async function ensureArchitectsLoaded(activeOnly = true, selectedId = null) {
    await loadArchitects(activeOnly);
    if (!selectedId || gestaoArchitectsCache.some(item => Number(item.id) === Number(selectedId))) return;
    const { data, error } = await supabaseClient
        .from('Architect')
        .select('id, name, isActive')
        .eq('id', selectedId)
        .maybeSingle();
    if (error || !data) return;
    gestaoArchitectsCache = [...gestaoArchitectsCache, data]
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' }));
}

function formatArchitectPhone(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidArchitectEmail(value) {
    const email = String(value || '').trim();
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

function validateArchitectPhoneEmail(phoneValue, emailValue) {
    const phone = formatArchitectPhone(phoneValue);
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 11) {
        return { error: 'Informe o celular no formato (00)00000-0000.' };
    }
    const email = String(emailValue || '').trim();
    if (email && !isValidArchitectEmail(email)) {
        return { error: 'Informe um e-mail válido.' };
    }
    return { phone: phone || null, email: email || null };
}

async function persistArchitectRecord(payload, architectId = null) {
    const { contactName: _contactName, phone: _phone, email: _email, ...architectPayload } = payload;
    const query = architectId
        ? supabaseClient.from('Architect').update(architectPayload).eq('id', architectId)
        : supabaseClient.from('Architect').insert(architectPayload);
    const { data, error } = await query.select('id, name, isActive').single();
    return { data, error };
}

async function persistArchitectFirstContact(architectId, fields) {
    if (!architectId || typeof upsertOwnerContact !== 'function') return { error: null };
    return upsertOwnerContact(
        typeof CONTACT_OWNER_TYPE_ARCHITECT === 'string' ? CONTACT_OWNER_TYPE_ARCHITECT : 'architect',
        architectId,
        fields
    );
}

function bindArchitectPhoneMask(input) {
    if (!input || input.dataset.phoneMaskBound === '1') return;
    input.dataset.phoneMaskBound = '1';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '14');
    input.addEventListener('input', () => {
        input.value = formatArchitectPhone(input.value);
    });
}

async function fillArchitectPickerField(fieldId, selectedId = null, fallbackName = '') {
    const nameEl = document.getElementById(fieldId);
    const idEl = document.getElementById(`${fieldId}-id`);
    if (nameEl) nameEl.value = '';
    if (idEl) idEl.value = '';
    if (!selectedId) return;

    await ensureArchitectsLoaded(false, selectedId);
    const item = (gestaoArchitectsCache || []).find(architect => Number(architect.id) === Number(selectedId));
    if (nameEl) nameEl.value = item?.name || fallbackName || '';
    if (idEl) idEl.value = String(selectedId);
}

function setArchitectPickerSelection(architect) {
    if (typeof activeArchitectPickerCallback === 'function') {
        activeArchitectPickerCallback(architect || { id: null, name: '' });
    }
    toggleModal('architect-create-modal', false);
    toggleModal('architect-picker-modal', false);
}

let architectCreateSource = 'picker';

function configureArchitectCreateModal(source = 'picker', name = '') {
    architectCreateSource = source === 'cadastro' ? 'cadastro' : 'picker';
    const fromCadastro = architectCreateSource === 'cadastro';
    const hint = document.getElementById('architect-create-hint');
    const submit = document.getElementById('architect-create-submit');
    if (hint) {
        hint.textContent = fromCadastro
            ? 'O arquiteto será criado como ativo.'
            : 'O arquiteto será criado como ativo e selecionado automaticamente';
    }
    if (submit) submit.textContent = fromCadastro ? 'Salvar' : 'Salvar e selecionar';
    const nameInput = document.getElementById('architect-create-name');
    if (nameInput) nameInput.value = name;
}

function openArchitectCreateModal(options = {}) {
    const fromCadastro = options.source === 'cadastro';
    const searchInput = document.getElementById(fromCadastro ? 'gestao-architects-filter-name' : 'architect-picker-search');
    const nameInput = document.getElementById('architect-create-name');
    const filterText = (options.name || searchInput?.value || '').trim();
    document.getElementById('architect-create-form')?.reset();
    configureArchitectCreateModal(fromCadastro ? 'cadastro' : 'picker', filterText);
    toggleModal('architect-create-modal', true);
    nameInput?.focus();
}

async function saveArchitectCreateFromPicker(event) {
    event.preventDefault();
    const name = document.getElementById('architect-create-name')?.value.trim();
    if (!name) {
        alertAppDialog('Informe o nome do arquiteto.');
        return;
    }
    const contact = validateArchitectPhoneEmail(
        document.getElementById('architect-create-phone')?.value,
        document.getElementById('architect-create-email')?.value
    );
    if (contact.error) {
        alertAppDialog(contact.error);
        return;
    }
    const now = new Date().toISOString();
    const { data, error } = await persistArchitectRecord({
        name,
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
                ? `Já existe um arquiteto com o nome "${name}".`
                : 'Erro ao cadastrar arquiteto: ' + error.message
        );
        return;
    }

    await persistArchitectFirstContact(data?.id, {
        name: document.getElementById('architect-create-contact')?.value.trim() || null,
        phone: contact.phone,
        email: contact.email
    });

    architectPickerCache = [...(architectPickerCache || []), data]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }));
    gestaoArchitectsCache = architectPickerCache;
    document.getElementById('architect-create-form')?.reset();
    if (architectCreateSource === 'cadastro') {
        toggleModal('architect-create-modal', false);
        const filterInput = document.getElementById('gestao-architects-filter-name');
        if (filterInput) filterInput.value = '';
        await loadGestaoArchitectsList();
        return;
    }
    setArchitectPickerSelection({ id: data.id, name: data.name });
}

async function openArchitectPickerModal(onSelectCallback) {
    activeArchitectPickerCallback = onSelectCallback;
    const searchInput = document.getElementById('architect-picker-search');
    const tbody = document.getElementById('architect-picker-list');
    if (searchInput) searchInput.value = '';
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="3" class="p-4 text-center text-slate-400">Carregando arquitetos ativos...</td>
        </tr>
    `;
    toggleModal('architect-picker-modal', true);

    const architects = await loadArchitects(true);
    if (architectsSchemaMissing) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-4 text-center text-amber-700">
                    Execute <code>supabase/feats/create-architect.sql</code> no Supabase SQL Editor (DEV).
                </td>
            </tr>
        `;
        architectPickerCache = [];
        return;
    }

    architectPickerCache = architects;
    renderArchitectPickerList();
    if (searchInput) {
        searchInput.oninput = () => renderArchitectPickerList();
    }
}

function renderArchitectPickerList() {
    const tbody = document.getElementById('architect-picker-list');
    const searchInput = document.getElementById('architect-picker-search');
    const filterText = (searchInput?.value || '').trim().toLowerCase();
    if (!tbody) return;

    const filtered = (architectPickerCache || []).filter(item => {
        if (!filterText) return true;
        return (item.name || '').toLowerCase().includes(filterText);
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-4 text-center text-slate-400">
                    Nenhum arquiteto ativo encontrado com o filtro informado.
                    <button type="button" class="architect-picker-create-inline mt-2 block mx-auto text-indigo-700 hover:text-indigo-900 font-medium underline">
                        Cadastrar novo arquiteto
                    </button>
                </td>
            </tr>
        `;
        tbody.querySelector('.architect-picker-create-inline')?.addEventListener('click', openArchitectCreateModal);
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2.5 font-mono text-slate-400">#${item.id}</td>
            <td class="p-2.5 font-medium text-slate-900">${escapeHtml(item.name)}</td>
            <td class="p-2.5 text-center">
                <button type="button" class="select-architect-btn px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    data-architect-id="${item.id}" data-architect-name="${escapeHtml(item.name)}">
                    Selecionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.select-architect-btn').forEach(btn => {
        btn.addEventListener('click', event => {
            setArchitectPickerSelection({
                id: Number(event.currentTarget.dataset.architectId),
                name: event.currentTarget.dataset.architectName
            });
        });
    });
}

window.openArchitectPickerModal = openArchitectPickerModal;
window.openArchitectCreateModal = openArchitectCreateModal;
window.fillArchitectPickerField = fillArchitectPickerField;

async function persistSalesOrderArchitectId(orderId, architectId) {
    if (!orderId) return;
    const normalizedOrderId = Number(orderId);
    const normalizedArchitectId = Number(architectId) || null;
    const missingHint = 'Execute supabase/feats/create-architect.sql e supabase/feats/add-sales-order-sale-date-architect-rpc.sql no Supabase SQL Editor.';

    const { data: rpcUpdated, error: rpcError } = await supabaseClient.rpc(
        'set_sales_order_architect_id',
        {
            p_order_id: normalizedOrderId,
            p_architect_id: normalizedArchitectId
        }
    );
    if (!rpcError && rpcUpdated === true) {
        if (typeof syncSalesOrderArchitectCaches === 'function') {
            syncSalesOrderArchitectCaches(normalizedOrderId, normalizedArchitectId);
        }
        return;
    }

    const payload = { architectId: normalizedArchitectId };
    let { error } = await supabaseClient.from('salesOrders').update(payload).eq('id', normalizedOrderId);
    if (error?.message?.includes('architectId') || /schema cache/i.test(error?.message || '')) {
        if (/set_sales_order_architect_id|could not find the function/i.test(String(rpcError?.message || ''))) {
            throw new Error(missingHint);
        }
        throw new Error(missingHint);
    }
    if (error) throw error;
    if (typeof syncSalesOrderArchitectCaches === 'function') {
        syncSalesOrderArchitectCaches(normalizedOrderId, normalizedArchitectId);
    }
}

window.persistSalesOrderArchitectId = persistSalesOrderArchitectId;

async function loadGestaoArchitectsList() {
    const tbody = document.getElementById('gestao-architects-list');
    if (!tbody) return;

    await loadArchitects(false);
    renderGestaoArchitectsList();
}

function getGestaoArchitectsNameFilter() {
    return (document.getElementById('gestao-architects-filter-name')?.value || '').trim().toLowerCase();
}

function renderGestaoArchitectsList() {
    const tbody = document.getElementById('gestao-architects-list');
    if (!tbody) return;

    if (architectsSchemaMissing) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-xs text-slate-400">
                    Execute <code>supabase/feats/create-architect.sql</code> no Supabase SQL Editor (DEV) para criar o cadastro de arquitetos.
                </td>
            </tr>
        `;
        return;
    }

    const filter = getGestaoArchitectsNameFilter();
    const architects = (gestaoArchitectsCache || []).filter(item => {
        if (!filter) return true;
        return String(item.name || '').toLowerCase().includes(filter);
    });

    if (!architects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-xs text-slate-400">
                    ${gestaoArchitectsCache.length
                        ? 'Nenhum arquiteto encontrado com o filtro informado.'
                        : 'Nenhum arquiteto cadastrado.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    architects.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.architectId = String(item.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="text" class="gestao-architect-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(item.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-architect-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${item.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-architect-contacts text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium">Contatos</button>
                    <button type="button" class="gestao-save-architect text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">Salvar</button>
                    <button type="button" class="gestao-delete-architect text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveGestaoArchitectRow(tr) {
    if (!canAccessGestao()) return;
    const architectId = Number(tr.dataset.architectId);
    const name = tr.querySelector('.gestao-architect-name')?.value.trim();
    if (!name) {
        alertAppDialog('Informe o nome do arquiteto.');
        return;
    }
    const { error } = await persistArchitectRecord({
        name,
        isActive: Boolean(tr.querySelector('.gestao-architect-active')?.checked),
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    }, architectId);
    if (error) {
        alertAppDialog('Erro ao salvar arquiteto: ' + error.message);
        return;
    }
}

async function deleteGestaoArchitectRow(tr) {
    if (!canAccessGestao()) return;
    const architectId = Number(tr.dataset.architectId);
    const name = tr.querySelector('.gestao-architect-name')?.value.trim() || 'o arquiteto';

    const { count: orderCount, error: orderErr } = await supabaseClient
        .from('salesOrders')
        .select('id', { count: 'exact', head: true })
        .eq('architectId', architectId);
    if (!orderErr && orderCount > 0) {
        alertAppDialog(`O arquiteto "${name}" está em ${orderCount} pedido(s). Desative-o em vez de excluir.`);
        return;
    }

    const { count: dealCount, error: dealErr } = await supabaseClient
        .from('Deal')
        .select('id', { count: 'exact', head: true })
        .eq('architectId', architectId);
    if (!dealErr && dealCount > 0) {
        alertAppDialog(`O arquiteto "${name}" está em ${dealCount} negócio(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o arquiteto "${name}"?`))) return;
    const { error } = await supabaseClient.from('Architect').delete().eq('id', architectId);
    if (error) {
        alertAppDialog('Erro ao excluir arquiteto: ' + error.message);
        return;
    }
    await loadGestaoArchitectsList();
}

function bindGestaoArchitectEvents() {
    document.getElementById('gestao-architects-add')?.addEventListener('click', () => {
        openArchitectCreateModal({ source: 'cadastro' });
    });
    document.getElementById('gestao-architects-filter-name')?.addEventListener('input', renderGestaoArchitectsList);
    document.getElementById('gestao-architects-list')?.addEventListener('click', async event => {
        const tr = event.target.closest('tr');
        if (!tr) return;
        if (event.target.closest('.gestao-architect-contacts') && typeof openContactManagerModal === 'function') {
            openContactManagerModal({
                ownerType: typeof CONTACT_OWNER_TYPE_ARCHITECT === 'string' ? CONTACT_OWNER_TYPE_ARCHITECT : 'architect',
                ownerId: Number(tr.dataset.architectId),
                ownerName: tr.querySelector('.gestao-architect-name')?.value.trim() || ''
            });
            return;
        }
        if (event.target.closest('.gestao-save-architect')) await saveGestaoArchitectRow(tr);
        if (event.target.closest('.gestao-delete-architect')) await deleteGestaoArchitectRow(tr);
    });
    document.getElementById('architect-create-form')?.addEventListener('submit', saveArchitectCreateFromPicker);
    document.getElementById('architect-picker-clear')?.addEventListener('click', () => {
        setArchitectPickerSelection({ id: null, name: '' });
    });
    bindArchitectPhoneMask(document.getElementById('architect-create-phone'));

    const openOrderArchitectPicker = () => {
        if (typeof openArchitectPickerModal !== 'function') return;
        openArchitectPickerModal(architect => {
            const input = document.getElementById('gestao-ord-architect');
            const idInput = document.getElementById('gestao-ord-architect-id');
            if (input) input.value = architect?.name || '';
            if (idInput) idInput.value = architect?.id || '';
        });
    };
    document.getElementById('gestao-ord-architect-picker-btn')?.addEventListener('click', openOrderArchitectPicker);
    document.getElementById('gestao-ord-architect')?.addEventListener('click', openOrderArchitectPicker);
    document.getElementById('gestao-ord-architect-view-btn')?.addEventListener('click', () => {
        if (typeof openArchitectDetailsModal !== 'function') return;
        openArchitectDetailsModal(document.getElementById('gestao-ord-architect-id')?.value);
    });
}
