const ADDR_OWNER_TYPE_CLIENT = 'client';

let gestaoAddrEditingId = null;
let gestaoAddrListCache = [];
let gestaoAddrPickerCache = [];
let gestaoAddrReturnTo = null;
let gestaoOrderSelectedAddrId = null;
let addrPickerMode = 'order';
let addrPickerClient = null;
let addrCreateSavedCallback = null;

function digitsOnlyPostalCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function formatPostalCodeDisplay(value) {
    const digits = digitsOnlyPostalCode(value);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeAddrState(value) {
    return String(value || '').trim().toUpperCase().slice(0, 2);
}

function getGestaoAddrFormEl(id) {
    return document.getElementById(id);
}

function formatGestaoAddrPickerLabel(record) {
    const title = [record.labelName, record.nickname].filter(Boolean).join(' · ');
    const summary = formatGestaoAddrSummary(record);
    const primary = record.isPrimary ? 'Principal · ' : '';
    return `${primary}${title ? `${title} · ` : ''}${summary}`.replace(/ · $/, '');
}

function getGestaoOrderFormClient() {
    return {
        id: Number(document.getElementById('gestao-ord-client-id')?.value) || null,
        name: document.getElementById('gestao-ord-client')?.value.trim() || ''
    };
}

function setGestaoOrderSelectedAddr(record) {
    gestaoOrderSelectedAddrId = record?.id ? Number(record.id) : null;
    const nameInput = document.getElementById('gestao-ord-addr');
    const idInput = document.getElementById('gestao-ord-addr-id');
    if (idInput) idInput.value = gestaoOrderSelectedAddrId ? String(gestaoOrderSelectedAddrId) : '';
    if (nameInput) nameInput.value = record ? formatGestaoAddrPickerLabel(record) : '';
}

function getGestaoOrderSelectedAddrId() {
    return Number(gestaoOrderSelectedAddrId) || Number(document.getElementById('gestao-ord-addr-id')?.value) || null;
}

function setGestaoAddrReturnHint(target = null) {
    gestaoAddrReturnTo = target || null;
    const hint = document.getElementById('gestao-addr-return-hint');
    const text = document.getElementById('gestao-addr-return-hint-text');
    const button = document.getElementById('gestao-addr-return-order');
    hint?.classList.toggle('hidden', !gestaoAddrReturnTo);
    if (gestaoAddrReturnTo === 'clients') {
        if (text) text.textContent = 'Endereços deste cliente. Você pode ver, editar e adicionar.';
        if (button) button.textContent = 'Voltar aos clientes';
        return;
    }
    if (text) text.textContent = 'Cadastre o endereço deste cliente e salve para voltar ao pedido.';
    if (button) button.textContent = 'Voltar ao pedido';
}

function setGestaoAddrReturnHintVisible(visible) {
    if (!visible) {
        setGestaoAddrReturnHint(null);
        return;
    }
    if (!gestaoAddrReturnTo) setGestaoAddrReturnHint('order');
}

function closeGestaoAddrPickerModal() {
    toggleModal('addr-picker-modal', false);
}

async function fetchGestaoClientAddrs(clientId, options = {}) {
    const addrColumns = 'id, ownerType, ownerId, labelId, nickname, postalCode, street, number, complement, neighborhood, city, state, country, notes, isPrimary, isActive';

    if (options.addrId) {
        let { data, error } = await supabaseClient
            .from('addr')
            .select(`${addrColumns}, label:addrlabel!labelId(id, name)`)
            .eq('id', Number(options.addrId))
            .maybeSingle();
        if (error && /addrlabel|relationship|embed|labelId/i.test(error.message || '')) {
            ({ data, error } = await supabaseClient.from('addr').select(addrColumns).eq('id', Number(options.addrId)).maybeSingle());
        }
        if (error || !data) return null;
        return {
            ...data,
            labelName: data.label?.name || '—'
        };
    }

    const ownerId = Number(clientId);
    if (!ownerId) return [];

    let query = supabaseClient
        .from('addr')
        .select(`${addrColumns}, label:addrlabel!labelId(id, name)`)
        .eq('ownerType', ADDR_OWNER_TYPE_CLIENT)
        .eq('ownerId', ownerId)
        .order('isPrimary', { ascending: false })
        .order('id', { ascending: false });
    if (!options.includeInactive) {
        query = query.eq('isActive', true);
    }

    let { data, error } = await query;
    if (error && /addrlabel|relationship|embed|labelId/i.test(error.message || '')) {
        query = supabaseClient
            .from('addr')
            .select(addrColumns)
            .eq('ownerType', ADDR_OWNER_TYPE_CLIENT)
            .eq('ownerId', ownerId)
            .order('isPrimary', { ascending: false })
            .order('id', { ascending: false });
        if (!options.includeInactive) query = query.eq('isActive', true);
        ({ data, error } = await query);
    }

    if (error) {
        console.warn('fetchGestaoClientAddrs:', error);
        return [];
    }

    const labels = typeof loadAddrLabels === 'function' ? await loadAddrLabels(false) : [];
    const labelById = {};
    (Array.isArray(labels) ? labels : []).forEach(label => {
        labelById[String(label.id)] = label.name;
    });

    return (data || []).map(record => ({
        ...record,
        labelName: record.label?.name || labelById[String(record.labelId)] || '—'
    }));
}

function renderGestaoAddrPickerList() {
    const tbody = document.getElementById('addr-picker-list');
    const searchInput = document.getElementById('addr-picker-search');
    const filterText = (searchInput?.value || '').trim().toLowerCase();
    if (!tbody) return;

    const filtered = (gestaoAddrPickerCache || []).filter(record => {
        if (!filterText) return true;
        const haystack = [
            record.labelName,
            record.nickname,
            record.postalCode,
            record.street,
            record.neighborhood,
            record.city,
            record.state,
            formatGestaoAddrSummary(record)
        ].join(' ').toLowerCase();
        return haystack.includes(filterText);
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="2" class="p-4 text-center text-slate-400">
                    Nenhum endereço encontrado com o filtro informado.
                    <button type="button" class="addr-picker-create-inline mt-2 block mx-auto text-indigo-700 hover:text-indigo-900 font-medium underline">
                        Cadastrar endereço
                    </button>
                </td>
            </tr>
        `;
        tbody.querySelector('.addr-picker-create-inline')?.addEventListener('click', openAddrPickerCreate);
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2.5">
                <p class="font-medium text-slate-900">${escapeHtml(record.labelName || 'Endereço')}${record.nickname ? ` · ${escapeHtml(record.nickname)}` : ''}${record.isPrimary ? ' <span class="text-indigo-700">(Principal)</span>' : ''}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(formatGestaoAddrSummary(record))}</p>
            </td>
            <td class="p-2.5 text-center">
                <button type="button" class="select-addr-btn px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    data-addr-id="${record.id}">
                    Selecionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.select-addr-btn').forEach(button => {
        button.addEventListener('click', () => {
            const record = gestaoAddrPickerCache.find(item => Number(item.id) === Number(button.dataset.addrId));
            if (!record) return;
            applyAddrPickerSelection(record);
        });
    });
}

function applyAddrPickerSelection(record) {
    if (addrPickerMode === 'calendar') {
        if (typeof setCalendarEventSelectedAddr === 'function') {
            setCalendarEventSelectedAddr(record);
        }
    } else if (addrPickerMode === 'assembly') {
        if (typeof setMontagemProgSelectedAddr === 'function') {
            setMontagemProgSelectedAddr(record);
        }
    } else {
        setGestaoOrderSelectedAddr(record);
    }
    closeGestaoAddrPickerModal();
}

function isAddrPickerStandaloneCreateMode(mode = addrPickerMode) {
    return mode === 'calendar' || mode === 'assembly';
}

function getAddrPickerMissingClientMessage(mode) {
    if (mode === 'calendar') return 'Selecione o cliente do evento primeiro.';
    if (mode === 'assembly') return 'Selecione o cliente da montagem primeiro.';
    return 'Selecione o cliente do pedido primeiro.';
}

async function openGestaoAddrCadastroFromOrder() {
    const client = getGestaoOrderFormClient();
    if (!client.id) {
        alertAppDialog('Selecione o cliente do pedido primeiro.');
        return;
    }

    closeGestaoAddrPickerModal();
    setGestaoAddrReturnHint('order');

    if (typeof showGestaoAddrPanel === 'function') {
        showGestaoAddrPanel();
    }
    await loadGestaoAddrPanelData();
    setGestaoAddrSelectedClient(client);
    setGestaoAddrFilterClient(client);
    await loadGestaoAddrList();
}

function returnToGestaoOrderFormFromAddr() {
    setGestaoAddrReturnHint(null);
    if (typeof showGestaoPedidoFormPanel === 'function') {
        showGestaoPedidoFormPanel();
    }
}

function returnFromGestaoAddrCadastro() {
    const target = gestaoAddrReturnTo;
    setGestaoAddrReturnHint(null);
    if (target === 'clients') {
        if (typeof showGestaoClientesPanel === 'function') showGestaoClientesPanel();
        return;
    }
    if (typeof showGestaoPedidoFormPanel === 'function') {
        showGestaoPedidoFormPanel();
    }
}

function clearGestaoAddrOrderReturn() {
    setGestaoAddrReturnHint(null);
}

async function openGestaoAddrCadastroFromClient(client) {
    if (!client?.id) {
        alertAppDialog('Selecione o cliente.');
        return;
    }

    setGestaoAddrReturnHint('clients');
    if (typeof showGestaoAddrPanel === 'function') {
        showGestaoAddrPanel();
    }
    await loadGestaoAddrPanelData();
    resetGestaoAddrForm();
    setGestaoAddrSelectedClient(client);
    setGestaoAddrFilterClient(client);
    await loadGestaoAddrList();
}

async function openAddrPickerForClient(client, mode = 'order') {
    if (!client?.id) {
        alertAppDialog(getAddrPickerMissingClientMessage(mode));
        return;
    }

    addrPickerMode = mode;
    addrPickerClient = {
        id: Number(client.id),
        name: client.name || ''
    };

    const tbody = document.getElementById('addr-picker-list');
    const searchInput = document.getElementById('addr-picker-search');
    const titleEl = document.getElementById('addr-picker-client-title');
    if (searchInput) searchInput.value = '';
    if (titleEl) titleEl.textContent = `Endereços ativos de ${addrPickerClient.name}`;
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="2" class="p-4 text-center text-slate-400">Carregando endereços...</td>
            </tr>
        `;
    }

    toggleModal('addr-picker-modal', true);
    const addrs = await fetchGestaoClientAddrs(addrPickerClient.id);

    if (!addrs.length) {
        closeGestaoAddrPickerModal();
        if (await confirmAppDialog(`Nenhum endereço cadastrado para "${addrPickerClient.name}". Cadastrar agora?`)) {
            await openAddrPickerCreate();
        }
        return;
    }

    gestaoAddrPickerCache = addrs;
    renderGestaoAddrPickerList();
}

async function openGestaoOrderAddrPicker() {
    await openAddrPickerForClient(getGestaoOrderFormClient(), 'order');
}

async function openCalendarEventAddrPicker() {
    const orderCode = document.getElementById('cal-event-order-code')?.value.trim();
    if (orderCode) {
        alertAppDialog('Com pedido informado, o endereço vem do pedido.');
        return;
    }

    const client = typeof getCalendarEventFormClient === 'function'
        ? getCalendarEventFormClient()
        : {
            id: Number(document.getElementById('cal-event-client-id')?.value) || null,
            name: document.getElementById('cal-event-client-name')?.value.trim() || ''
        };
    await openAddrPickerForClient(client, 'calendar');
}

async function openMontagemProgAddrPicker() {
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    if (orderCode) {
        alertAppDialog('Com pedido informado, o endereço vem do pedido.');
        return;
    }

    const client = typeof getMontagemProgFormClient === 'function'
        ? getMontagemProgFormClient()
        : {
            id: Number(document.getElementById('montagem-prog-client-id')?.value) || null,
            name: document.getElementById('montagem-prog-client-name')?.value.trim() || ''
        };
    await openAddrPickerForClient(client, 'assembly');
}

async function openAddrPickerCreate() {
    const client = addrPickerClient
        || (addrPickerMode === 'calendar' && typeof getCalendarEventFormClient === 'function'
            ? getCalendarEventFormClient()
            : null)
        || (addrPickerMode === 'assembly' && typeof getMontagemProgFormClient === 'function'
            ? getMontagemProgFormClient()
            : null)
        || (addrPickerMode === 'order' ? getGestaoOrderFormClient() : null);

    if (!client?.id) {
        alertAppDialog('Selecione o cliente primeiro.');
        return;
    }

    closeGestaoAddrPickerModal();

    if (isAddrPickerStandaloneCreateMode()) {
        const savedMode = addrPickerMode;
        await openAddrCreateModal({
            client,
            onSaved: (record) => {
                if (savedMode === 'calendar' && typeof setCalendarEventSelectedAddr === 'function') {
                    setCalendarEventSelectedAddr(record);
                    return;
                }
                if (savedMode === 'assembly' && typeof setMontagemProgSelectedAddr === 'function') {
                    setMontagemProgSelectedAddr(record);
                }
            }
        });
        return;
    }

    await openGestaoAddrCadastroFromOrder();
}

async function loadGestaoOrderAddrField(order) {
    const addrId = Number(order?.addrId) || null;
    if (!addrId) {
        setGestaoOrderSelectedAddr(null);
        return;
    }
    const record = await fetchGestaoClientAddrs(null, { addrId });
    setGestaoOrderSelectedAddr(record);
}

function getGestaoAddrSelectedClient() {
    return {
        id: Number(getGestaoAddrFormEl('gestao-addr-client-id')?.value) || null,
        name: getGestaoAddrFormEl('gestao-addr-client')?.value.trim() || ''
    };
}

function setGestaoAddrSelectedClient(client) {
    const idInput = getGestaoAddrFormEl('gestao-addr-client-id');
    const nameInput = getGestaoAddrFormEl('gestao-addr-client');
    if (idInput) idInput.value = client?.id ? String(client.id) : '';
    if (nameInput) nameInput.value = client?.name || '';
}

function setGestaoAddrFilterClient(client) {
    const idInput = getGestaoAddrFormEl('gestao-addr-filter-client');
    const nameInput = getGestaoAddrFormEl('gestao-addr-filter-client-name');
    if (idInput) idInput.value = client?.id ? String(client.id) : '';
    if (nameInput) nameInput.value = client?.name || '';
}

function openGestaoAddrClientPicker(onSelect) {
    if (typeof openClientePickerModal !== 'function') {
        alertAppDialog('Busca de cliente indisponível.');
        return;
    }
    openClientePickerModal(onSelect);
}

function fillAddrLabelSelect(selectEl, labels, selectedId = '') {
    if (!selectEl) return;

    const activeLabels = (labels || []).filter(label => label.isActive !== false);
    selectEl.innerHTML = ['<option value="">Selecione o label...</option>']
        .concat(activeLabels.map(label => (
            `<option value="${label.id}">${escapeHtml(label.name)}</option>`
        )))
        .join('');

    if (selectedId) selectEl.value = String(selectedId);
}

function fillGestaoAddrLabelSelect(labels, selectedId = '') {
    fillAddrLabelSelect(getGestaoAddrFormEl('gestao-addr-label'), labels, selectedId);
}

function resetGestaoAddrForm() {
    gestaoAddrEditingId = null;
    const form = getGestaoAddrFormEl('gestao-addr-form');
    form?.reset();
    const country = getGestaoAddrFormEl('gestao-addr-country');
    if (country) country.value = 'BR';
    const active = getGestaoAddrFormEl('gestao-addr-active');
    if (active) active.checked = true;
    const submit = getGestaoAddrFormEl('gestao-addr-submit');
    if (submit) submit.textContent = 'Adicionar';
    getGestaoAddrFormEl('gestao-addr-cancel')?.classList.add('hidden');
    const editingInput = getGestaoAddrFormEl('gestao-addr-editing-id');
    if (editingInput) editingInput.value = '';
}

function collectGestaoAddrFormPayload() {
    const clientId = Number(getGestaoAddrFormEl('gestao-addr-client-id')?.value);
    const labelId = Number(getGestaoAddrFormEl('gestao-addr-label')?.value);
    const postalCode = digitsOnlyPostalCode(getGestaoAddrFormEl('gestao-addr-postal-code')?.value);
    const street = getGestaoAddrFormEl('gestao-addr-street')?.value.trim();
    const city = getGestaoAddrFormEl('gestao-addr-city')?.value.trim();
    const state = normalizeAddrState(getGestaoAddrFormEl('gestao-addr-state')?.value);

    return {
        clientId,
        payload: {
            ownerType: ADDR_OWNER_TYPE_CLIENT,
            ownerId: clientId,
            labelId,
            nickname: getGestaoAddrFormEl('gestao-addr-nickname')?.value.trim() || null,
            postalCode,
            street,
            number: getGestaoAddrFormEl('gestao-addr-number')?.value.trim() || null,
            complement: getGestaoAddrFormEl('gestao-addr-complement')?.value.trim() || null,
            neighborhood: getGestaoAddrFormEl('gestao-addr-neighborhood')?.value.trim() || null,
            city,
            state,
            country: (getGestaoAddrFormEl('gestao-addr-country')?.value.trim() || 'BR').toUpperCase(),
            notes: getGestaoAddrFormEl('gestao-addr-notes')?.value.trim() || null,
            isPrimary: Boolean(getGestaoAddrFormEl('gestao-addr-primary')?.checked),
            isActive: Boolean(getGestaoAddrFormEl('gestao-addr-active')?.checked)
        }
    };
}

function validateGestaoAddrPayload(clientId, payload) {
    if (!clientId) {
        alertAppDialog('Selecione o cliente.');
        return false;
    }
    if (!payload.labelId) {
        alertAppDialog('Selecione o label do endereço.');
        return false;
    }
    if (payload.postalCode.length !== 8) {
        alertAppDialog('Informe um CEP válido com 8 dígitos.');
        return false;
    }
    if (!payload.street) {
        alertAppDialog('Informe o logradouro.');
        return false;
    }
    if (!payload.city) {
        alertAppDialog('Informe a cidade.');
        return false;
    }
    if (payload.state.length !== 2) {
        alertAppDialog('Informe a UF com 2 letras.');
        return false;
    }
    return true;
}

function fillGestaoAddrForm(record) {
    gestaoAddrEditingId = Number(record.id) || null;
    const editingInput = getGestaoAddrFormEl('gestao-addr-editing-id');
    if (editingInput) editingInput.value = String(gestaoAddrEditingId || '');

    setGestaoAddrSelectedClient({
        id: record.ownerId || null,
        name: record.clientName || ''
    });
    const labelSelect = getGestaoAddrFormEl('gestao-addr-label');
    if (labelSelect) {
        if (record.labelId && ![...labelSelect.options].some(option => option.value === String(record.labelId))) {
            labelSelect.insertAdjacentHTML('beforeend', `<option value="${record.labelId}">${escapeHtml(record.labelName || 'Label')}</option>`);
        }
        labelSelect.value = String(record.labelId || '');
    }

    const setValue = (id, value) => {
        const el = getGestaoAddrFormEl(id);
        if (el) el.value = value ?? '';
    };
    const setChecked = (id, checked) => {
        const el = getGestaoAddrFormEl(id);
        if (el) el.checked = Boolean(checked);
    };

    setValue('gestao-addr-nickname', record.nickname || '');
    setValue('gestao-addr-postal-code', formatPostalCodeDisplay(record.postalCode));
    setValue('gestao-addr-street', record.street || '');
    setValue('gestao-addr-number', record.number || '');
    setValue('gestao-addr-complement', record.complement || '');
    setValue('gestao-addr-neighborhood', record.neighborhood || '');
    setValue('gestao-addr-city', record.city || '');
    setValue('gestao-addr-state', record.state || '');
    setValue('gestao-addr-country', record.country || 'BR');
    setValue('gestao-addr-notes', record.notes || '');
    setChecked('gestao-addr-primary', record.isPrimary);
    setChecked('gestao-addr-active', record.isActive !== false);

    const submit = getGestaoAddrFormEl('gestao-addr-submit');
    if (submit) submit.textContent = 'Salvar';
    getGestaoAddrFormEl('gestao-addr-cancel')?.classList.remove('hidden');
}

function formatGestaoAddrSummary(record) {
    const parts = [
        formatPostalCodeDisplay(record.postalCode),
        record.street,
        record.number,
        record.neighborhood,
        record.city,
        record.state
    ].filter(Boolean);
    return parts.join(' · ');
}

function formatAddrFullDisplay(record) {
    if (!record) return '';

    const lines = [];
    const headerParts = [record.labelName, record.nickname].filter(Boolean);
    if (headerParts.length) lines.push(headerParts.join(' · '));
    if (record.isPrimary) lines.push('Principal');

    const streetLine = [record.street, record.number].filter(Boolean).join(', ');
    if (streetLine) lines.push(streetLine);
    if (record.complement) lines.push(record.complement);
    if (record.neighborhood) lines.push(record.neighborhood);

    const cityLine = [record.city, record.state].filter(Boolean).join(' - ');
    if (cityLine) lines.push(cityLine);

    const postal = formatPostalCodeDisplay(record.postalCode);
    if (postal) lines.push(postal);

    if (record.notes) lines.push(record.notes);
    return lines.join('\n');
}

function applyAddrFieldHoverTitle(input, record) {
    if (!input) return;
    const text = formatAddrFullDisplay(record);
    if (text) {
        input.title = text;
    } else {
        input.removeAttribute('title');
    }
}

function renderGestaoAddrList(rows) {
    const tbody = document.getElementById('gestao-addr-list');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="p-6 text-center text-xs text-slate-400">
                    Nenhum endereço cadastrado.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(record => {
        const clientName = record.clientName || '—';
        const labelName = record.labelName || '—';
        const nickname = record.nickname || '—';
                const isActive = record.isActive !== false;
                const toggleLabel = isActive ? 'Desativar' : 'Ativar';
                const toggleClass = isActive
                    ? 'gestao-addr-toggle-active text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium'
                    : 'gestao-addr-toggle-active text-xs bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2.5 py-1 rounded-lg font-medium';
                return `
            <tr data-addr-id="${record.id}">
                <td class="p-3 text-xs text-slate-700">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(labelName)}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(nickname)}</td>
                <td class="p-3 text-xs font-mono text-slate-600 whitespace-nowrap">${escapeHtml(formatPostalCodeDisplay(record.postalCode))}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(formatGestaoAddrSummary(record))}</td>
                <td class="p-3 text-center text-[10px] font-semibold ${record.isPrimary ? 'text-indigo-800' : 'text-slate-400'}">${record.isPrimary ? 'Sim' : '—'}</td>
                <td class="p-3 text-center text-[10px] font-semibold ${isActive ? 'text-emerald-700' : 'text-slate-400'}">${isActive ? 'Ativo' : 'Inativo'}</td>
                <td class="p-3">
                    <div class="flex flex-wrap gap-1.5">
                        <button type="button" class="gestao-addr-edit text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                            Editar
                        </button>
                        <button type="button" class="${toggleClass}">
                            ${toggleLabel}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function ensureGestaoAddrLookups() {
    const labels = typeof loadAddrLabels === 'function'
        ? await loadAddrLabels(true)
        : await supabaseClient.from('addrlabel').select('id, name, isActive, sortOrder').eq('isActive', true).order('sortOrder');

    const labelRows = Array.isArray(labels) ? labels : (labels?.data || []);
    fillGestaoAddrLabelSelect(labelRows);
    return { labels: labelRows };
}

async function loadGestaoAddrList() {
    const tbody = document.getElementById('gestao-addr-list');
    const filterClientId = Number(getGestaoAddrFormEl('gestao-addr-filter-client')?.value) || null;

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="p-6 text-center text-xs text-slate-400">Carregando endereços...</td>
            </tr>
        `;
    }

    const addrColumns = 'id, ownerType, ownerId, labelId, nickname, postalCode, street, number, complement, neighborhood, city, state, country, notes, isPrimary, isActive';
    const buildAddrQuery = (select) => {
        let query = supabaseClient
            .from('addr')
            .select(select)
            .eq('ownerType', ADDR_OWNER_TYPE_CLIENT)
            .order('isPrimary', { ascending: false })
            .order('id', { ascending: false });
        if (filterClientId) {
            query = query.eq('ownerId', filterClientId);
        }
        return query;
    };

    let { data, error } = await buildAddrQuery(`${addrColumns}, label:addrlabel!labelId(id, name)`);
    if (error && /addrlabel|relationship|embed|labelId/i.test(error.message || '')) {
        ({ data, error } = await buildAddrQuery(addrColumns));
    }

    if (error) {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="p-6 text-center text-xs text-amber-700">
                        ${error.message?.includes('addr')
                            ? 'Execute <code>supabase/feats/create-addr.sql</code> no Supabase SQL Editor.'
                            : escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
        gestaoAddrListCache = [];
        return [];
    }

    const [{ data: allClients }, labels] = await Promise.all([
        supabaseClient.from('Client').select('id, name'),
        typeof loadAddrLabels === 'function'
            ? loadAddrLabels(false)
            : supabaseClient.from('addrlabel').select('id, name')
    ]);
    const clientById = {};
    (allClients || []).forEach(client => {
        clientById[String(client.id)] = client.name;
    });
    const labelRows = Array.isArray(labels) ? labels : (labels?.data || []);
    const labelById = {};
    labelRows.forEach(label => {
        labelById[String(label.id)] = label.name;
    });

    gestaoAddrListCache = (data || []).map(record => ({
        ...record,
        clientName: clientById[String(record.ownerId)] || '—',
        labelName: record.label?.name || labelById[String(record.labelId)] || '—'
    }));

    renderGestaoAddrList(gestaoAddrListCache);
    return gestaoAddrListCache;
}

async function unsetOtherPrimaryAddrs(clientId, exceptId = null) {
    let query = supabaseClient
        .from('addr')
        .update({
            isPrimary: false,
            updatedAt: new Date().toISOString(),
            updatedById: currentUser?.id || null
        })
        .eq('ownerType', ADDR_OWNER_TYPE_CLIENT)
        .eq('ownerId', clientId)
        .eq('isPrimary', true);

    if (exceptId) {
        query = query.neq('id', exceptId);
    }

    const { error } = await query;
    if (error) {
        console.warn('unsetOtherPrimaryAddrs:', error);
    }
}

async function saveGestaoAddr(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const { clientId, payload } = collectGestaoAddrFormPayload();
    if (!validateGestaoAddrPayload(clientId, payload)) return;

    const now = new Date().toISOString();
    const record = {
        ...payload,
        updatedAt: now,
        updatedById: currentUser?.id || null
    };

    if (record.isPrimary) {
        await unsetOtherPrimaryAddrs(clientId, gestaoAddrEditingId);
    }

    let error;
    let savedId = gestaoAddrEditingId;
    if (gestaoAddrEditingId) {
        ({ error } = await supabaseClient.from('addr').update(record).eq('id', gestaoAddrEditingId));
    } else {
        const insertResult = await supabaseClient.from('addr').insert({
            ...record,
            createdAt: now,
            createdById: currentUser?.id || null
        }).select('id').single();
        error = insertResult.error;
        savedId = insertResult.data?.id || null;
    }

    if (error) {
        if (error.message?.includes('addr_one_primary') || error.code === '23505' && /primary/i.test(error.message || '')) {
            alertAppDialog('Este cliente já possui um endereço principal ativo. Desmarque o outro ou este.');
            return;
        }
        alertAppDialog('Erro ao salvar endereço: ' + error.message);
        return;
    }

    const selectedClient = getGestaoAddrSelectedClient();
    resetGestaoAddrForm();
    if (selectedClient.id) {
        setGestaoAddrSelectedClient(selectedClient);
    }
    await loadGestaoAddrList();

    if (gestaoAddrReturnTo === 'order' && savedId) {
        const savedRecord = gestaoAddrListCache.find(item => Number(item.id) === Number(savedId))
            || await fetchGestaoClientAddrs(null, { addrId: savedId });
        if (savedRecord) {
            setGestaoOrderSelectedAddr(savedRecord);
        }
        returnToGestaoOrderFormFromAddr();
    }
}

async function editGestaoAddrRow(addrId) {
    const record = gestaoAddrListCache.find(item => Number(item.id) === Number(addrId));
    if (!record) {
        alertAppDialog('Endereço não encontrado na lista. Atualize e tente de novo.');
        return;
    }
    fillGestaoAddrForm(record);
    getGestaoAddrFormEl('gestao-addr-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleGestaoAddrActive(addrId) {
    if (!canAccessGestao()) return;

    const record = gestaoAddrListCache.find(item => Number(item.id) === Number(addrId));
    if (!record) {
        alertAppDialog('Endereço não encontrado na lista. Atualize e tente de novo.');
        return;
    }

    const label = `${record.clientName} · ${record.labelName}${record.nickname ? ` (${record.nickname})` : ''}`;
    const willActivate = record.isActive === false;
    const confirmMessage = willActivate
        ? `Ativar o endereço "${label}"?`
        : `Desativar o endereço "${label}"?`;

    if (!(await confirmAppDialog(confirmMessage))) return;

    const payload = {
        isActive: willActivate,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    };
    if (!willActivate) {
        payload.isPrimary = false;
    }

    const { error } = await supabaseClient.from('addr').update(payload).eq('id', addrId);
    if (error) {
        alertAppDialog('Erro ao atualizar o endereço: ' + error.message);
        return;
    }

    if (Number(gestaoAddrEditingId) === Number(addrId)) {
        const active = getGestaoAddrFormEl('gestao-addr-active');
        if (active) active.checked = willActivate;
        const primary = getGestaoAddrFormEl('gestao-addr-primary');
        if (primary && !willActivate) primary.checked = false;
    }
    await loadGestaoAddrList();
}

async function persistClientAddrInsert(clientId, payload) {
    if (payload.isPrimary) {
        await unsetOtherPrimaryAddrs(clientId, null);
    }

    const now = new Date().toISOString();
    return supabaseClient.from('addr').insert({
        ...payload,
        createdAt: now,
        createdById: currentUser?.id || null,
        updatedAt: now,
        updatedById: currentUser?.id || null
    }).select('id').single();
}

function getAddrFieldEl(prefix, suffix) {
    return document.getElementById(`${prefix}-${suffix}`);
}

function resetAddrCreateForm() {
    document.getElementById('addr-create-form')?.reset();
    const country = document.getElementById('addr-create-country');
    if (country) country.value = 'BR';
}

function collectAddrCreateFormPayload() {
    const clientId = Number(document.getElementById('addr-create-client-id')?.value);
    const labelId = Number(document.getElementById('addr-create-label')?.value);
    const postalCode = digitsOnlyPostalCode(document.getElementById('addr-create-postal-code')?.value);
    const street = document.getElementById('addr-create-street')?.value.trim();
    const city = document.getElementById('addr-create-city')?.value.trim();
    const state = normalizeAddrState(document.getElementById('addr-create-state')?.value);

    return {
        clientId,
        payload: {
            ownerType: ADDR_OWNER_TYPE_CLIENT,
            ownerId: clientId,
            labelId,
            nickname: document.getElementById('addr-create-nickname')?.value.trim() || null,
            postalCode,
            street,
            number: document.getElementById('addr-create-number')?.value.trim() || null,
            complement: document.getElementById('addr-create-complement')?.value.trim() || null,
            neighborhood: document.getElementById('addr-create-neighborhood')?.value.trim() || null,
            city,
            state,
            country: (document.getElementById('addr-create-country')?.value.trim() || 'BR').toUpperCase(),
            notes: document.getElementById('addr-create-notes')?.value.trim() || null,
            isPrimary: Boolean(document.getElementById('addr-create-primary')?.checked),
            isActive: true
        }
    };
}

async function openAddrCreateModal(options = {}) {
    const client = options.client;
    if (!client?.id) {
        alertAppDialog('Selecione o cliente primeiro.');
        return;
    }

    addrCreateSavedCallback = typeof options.onSaved === 'function' ? options.onSaved : null;
    resetAddrCreateForm();

    const idInput = document.getElementById('addr-create-client-id');
    const nameInput = document.getElementById('addr-create-client');
    if (idInput) idInput.value = String(client.id);
    if (nameInput) nameInput.value = client.name || '';

    let labels = [];
    try {
        if (typeof loadAddrLabels === 'function') {
            const loaded = await loadAddrLabels(true);
            if (Array.isArray(loaded)) labels = loaded;
        }
    } catch (error) {
        console.warn('loadAddrLabels:', error);
    }
    if (!labels.length) {
        const { data } = await supabaseClient
            .from('addrlabel')
            .select('id, name, isActive, sortOrder')
            .eq('isActive', true)
            .order('sortOrder');
        labels = data || [];
    }
    fillAddrLabelSelect(document.getElementById('addr-create-label'), labels, '');
    toggleModal('addr-create-modal', true);
}

function closeAddrCreateModal() {
    toggleModal('addr-create-modal', false);
    addrCreateSavedCallback = null;
}

async function saveAddrCreateForm(event) {
    event.preventDefault();

    const { clientId, payload } = collectAddrCreateFormPayload();
    if (!validateGestaoAddrPayload(clientId, payload)) return;

    const saveBtn = document.getElementById('btn-addr-create-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
    }

    try {
        const insertResult = await persistClientAddrInsert(clientId, payload);
        if (insertResult.error) {
            if (insertResult.error.message?.includes('addr_one_primary')
                || (insertResult.error.code === '23505' && /primary/i.test(insertResult.error.message || ''))) {
                alertAppDialog('Este cliente já possui um endereço principal ativo. Desmarque o outro ou este.');
                return;
            }
            alertAppDialog('Erro ao salvar endereço: ' + insertResult.error.message);
            return;
        }

        const savedId = insertResult.data?.id || null;
        const record = savedId ? await fetchGestaoClientAddrs(null, { addrId: savedId }) : null;
        const callback = addrCreateSavedCallback;
        closeAddrCreateModal();
        if (record && typeof callback === 'function') {
            callback(record);
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar endereço';
        }
    }
}

function setGestaoAddrCepFieldValue(id, value) {
    const el = getGestaoAddrFormEl(id);
    if (el) el.value = value ?? '';
}

function clearAddrCepFields(prefix) {
    ['street', 'neighborhood', 'city', 'state'].forEach(suffix => {
        const el = getAddrFieldEl(prefix, suffix);
        if (el) el.value = '';
    });
}

function clearGestaoAddrCepFields() {
    clearAddrCepFields('gestao-addr');
}

async function lookupAddrByPostalCode(prefix) {
    const input = getAddrFieldEl(prefix, 'postal-code');
    const cep = digitsOnlyPostalCode(input?.value);
    if (cep.length !== 8) {
        clearAddrCepFields(prefix);
        return;
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) {
            clearAddrCepFields(prefix);
            alertAppDialog('Não foi possível consultar o CEP. Tente novamente.');
            return;
        }
        const data = await response.json();
        if (data?.erro) {
            clearAddrCepFields(prefix);
            alertAppDialog('CEP não encontrado.');
            return;
        }

        const street = getAddrFieldEl(prefix, 'street');
        const neighborhood = getAddrFieldEl(prefix, 'neighborhood');
        const city = getAddrFieldEl(prefix, 'city');
        const state = getAddrFieldEl(prefix, 'state');
        if (street) street.value = data.logradouro || '';
        if (neighborhood) neighborhood.value = data.bairro || '';
        if (city) city.value = data.localidade || '';
        if (state) state.value = normalizeAddrState(data.uf);
    } catch (error) {
        console.warn('lookupAddrByPostalCode:', error);
        clearAddrCepFields(prefix);
        alertAppDialog('Não foi possível consultar o CEP. Tente novamente.');
    }
}

async function lookupGestaoAddrByPostalCode() {
    await lookupAddrByPostalCode('gestao-addr');
}

function bindAddrPostalCodeFields(prefix) {
    const input = getAddrFieldEl(prefix, 'postal-code');
    if (!input || input.dataset.addrCepBound === '1') return;
    input.dataset.addrCepBound = '1';

    input.addEventListener('blur', () => {
        input.value = formatPostalCodeDisplay(input.value);
        lookupAddrByPostalCode(prefix);
    });
    input.addEventListener('input', () => {
        const digits = digitsOnlyPostalCode(input.value);
        const cursorAtEnd = input.selectionStart === input.value.length;
        input.value = formatPostalCodeDisplay(digits);
        if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
        if (digits.length !== 8) {
            clearAddrCepFields(prefix);
        }
    });
}

async function loadGestaoAddrPanelData() {
    await ensureGestaoAddrLookups();
    await loadGestaoAddrList();
}

function bindGestaoAddrEvents() {
    document.getElementById('gestao-addr-form')?.addEventListener('submit', saveGestaoAddr);
    document.getElementById('gestao-addr-cancel')?.addEventListener('click', () => {
        const selectedClient = getGestaoAddrSelectedClient();
        resetGestaoAddrForm();
        if (selectedClient.id) {
            setGestaoAddrSelectedClient(selectedClient);
        }
    });
    const triggerAddrClientPicker = () => {
        openGestaoAddrClientPicker(cliente => {
            setGestaoAddrSelectedClient({ id: cliente.id, name: cliente.name });
        });
    };
    document.getElementById('gestao-addr-client-picker')?.addEventListener('click', triggerAddrClientPicker);
    document.getElementById('gestao-addr-client')?.addEventListener('click', triggerAddrClientPicker);

    const triggerAddrFilterClientPicker = () => {
        openGestaoAddrClientPicker(cliente => {
            setGestaoAddrFilterClient({ id: cliente.id, name: cliente.name });
            loadGestaoAddrList();
        });
    };
    document.getElementById('gestao-addr-filter-client-picker')?.addEventListener('click', triggerAddrFilterClientPicker);
    document.getElementById('gestao-addr-filter-client-name')?.addEventListener('click', triggerAddrFilterClientPicker);
    document.getElementById('gestao-addr-filter-client-clear')?.addEventListener('click', () => {
        setGestaoAddrFilterClient(null);
        loadGestaoAddrList();
    });
    bindAddrPostalCodeFields('gestao-addr');
    bindAddrPostalCodeFields('addr-create');
    document.getElementById('gestao-addr-list')?.addEventListener('click', event => {
        const editBtn = event.target.closest('.gestao-addr-edit');
        if (editBtn) {
            editGestaoAddrRow(Number(editBtn.closest('tr')?.dataset.addrId));
            return;
        }
        const toggleBtn = event.target.closest('.gestao-addr-toggle-active');
        if (toggleBtn) {
            toggleGestaoAddrActive(Number(toggleBtn.closest('tr')?.dataset.addrId));
        }
    });

    const triggerOrderAddrPicker = () => {
        openGestaoOrderAddrPicker();
    };
    document.getElementById('gestao-ord-addr-picker-btn')?.addEventListener('click', triggerOrderAddrPicker);
    document.getElementById('gestao-ord-addr')?.addEventListener('click', triggerOrderAddrPicker);
    document.getElementById('addr-picker-search')?.addEventListener('input', renderGestaoAddrPickerList);
    document.getElementById('addr-picker-create')?.addEventListener('click', openAddrPickerCreate);
    document.getElementById('btn-addr-picker-close')?.addEventListener('click', closeGestaoAddrPickerModal);
    document.getElementById('btn-addr-picker-close-x')?.addEventListener('click', closeGestaoAddrPickerModal);
    document.getElementById('gestao-addr-return-order')?.addEventListener('click', returnFromGestaoAddrCadastro);
    document.getElementById('addr-create-form')?.addEventListener('submit', saveAddrCreateForm);
    document.getElementById('btn-addr-create-cancel')?.addEventListener('click', closeAddrCreateModal);
    document.getElementById('btn-addr-create-close-x')?.addEventListener('click', closeAddrCreateModal);
}

window.loadGestaoAddrList = loadGestaoAddrList;
window.loadGestaoAddrPanelData = loadGestaoAddrPanelData;
window.bindGestaoAddrEvents = bindGestaoAddrEvents;
window.resetGestaoAddrForm = resetGestaoAddrForm;
window.openGestaoOrderAddrPicker = openGestaoOrderAddrPicker;
window.openCalendarEventAddrPicker = openCalendarEventAddrPicker;
window.openMontagemProgAddrPicker = openMontagemProgAddrPicker;
window.openAddrCreateModal = openAddrCreateModal;
window.fetchGestaoClientAddrs = fetchGestaoClientAddrs;
window.formatGestaoAddrPickerLabel = formatGestaoAddrPickerLabel;
window.formatAddrFullDisplay = formatAddrFullDisplay;
window.applyAddrFieldHoverTitle = applyAddrFieldHoverTitle;
window.loadGestaoOrderAddrField = loadGestaoOrderAddrField;
window.setGestaoOrderSelectedAddr = setGestaoOrderSelectedAddr;
window.getGestaoOrderSelectedAddrId = getGestaoOrderSelectedAddrId;
window.returnToGestaoOrderFormFromAddr = returnToGestaoOrderFormFromAddr;
window.returnFromGestaoAddrCadastro = returnFromGestaoAddrCadastro;
window.clearGestaoAddrOrderReturn = clearGestaoAddrOrderReturn;
window.openGestaoAddrCadastroFromClient = openGestaoAddrCadastroFromClient;
