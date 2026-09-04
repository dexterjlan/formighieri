const ADDR_OWNER_TYPE_CLIENT = 'client';

let gestaoAddrEditingId = null;
let gestaoAddrListCache = [];

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

function fillGestaoAddrLabelSelect(labels, selectedId = '') {
    const select = getGestaoAddrFormEl('gestao-addr-label');
    if (!select) return;

    const activeLabels = (labels || []).filter(label => label.isActive !== false);
    select.innerHTML = ['<option value="">Selecione o label...</option>']
        .concat(activeLabels.map(label => (
            `<option value="${label.id}">${escapeHtml(label.name)}</option>`
        )))
        .join('');

    if (selectedId) select.value = String(selectedId);
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
    if (gestaoAddrEditingId) {
        ({ error } = await supabaseClient.from('addr').update(record).eq('id', gestaoAddrEditingId));
    } else {
        ({ error } = await supabaseClient.from('addr').insert({
            ...record,
            createdAt: now,
            createdById: currentUser?.id || null
        }));
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

function setGestaoAddrCepFieldValue(id, value) {
    const el = getGestaoAddrFormEl(id);
    if (el) el.value = value ?? '';
}

function clearGestaoAddrCepFields() {
    setGestaoAddrCepFieldValue('gestao-addr-street', '');
    setGestaoAddrCepFieldValue('gestao-addr-neighborhood', '');
    setGestaoAddrCepFieldValue('gestao-addr-city', '');
    setGestaoAddrCepFieldValue('gestao-addr-state', '');
}

async function lookupGestaoAddrByPostalCode() {
    const input = getGestaoAddrFormEl('gestao-addr-postal-code');
    const cep = digitsOnlyPostalCode(input?.value);
    if (cep.length !== 8) {
        clearGestaoAddrCepFields();
        return;
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) {
            clearGestaoAddrCepFields();
            alertAppDialog('Não foi possível consultar o CEP. Tente novamente.');
            return;
        }
        const data = await response.json();
        if (data?.erro) {
            clearGestaoAddrCepFields();
            alertAppDialog('CEP não encontrado.');
            return;
        }

        setGestaoAddrCepFieldValue('gestao-addr-street', data.logradouro || '');
        setGestaoAddrCepFieldValue('gestao-addr-neighborhood', data.bairro || '');
        setGestaoAddrCepFieldValue('gestao-addr-city', data.localidade || '');
        setGestaoAddrCepFieldValue('gestao-addr-state', normalizeAddrState(data.uf));
    } catch (error) {
        console.warn('lookupGestaoAddrByPostalCode:', error);
        clearGestaoAddrCepFields();
        alertAppDialog('Não foi possível consultar o CEP. Tente novamente.');
    }
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
    document.getElementById('gestao-addr-postal-code')?.addEventListener('blur', () => {
        const input = getGestaoAddrFormEl('gestao-addr-postal-code');
        if (input) input.value = formatPostalCodeDisplay(input.value);
        lookupGestaoAddrByPostalCode();
    });
    document.getElementById('gestao-addr-postal-code')?.addEventListener('input', () => {
        const input = getGestaoAddrFormEl('gestao-addr-postal-code');
        if (!input) return;
        const digits = digitsOnlyPostalCode(input.value);
        const cursorAtEnd = input.selectionStart === input.value.length;
        input.value = formatPostalCodeDisplay(digits);
        if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
        if (digits.length !== 8) {
            clearGestaoAddrCepFields();
        }
    });
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
}

window.loadGestaoAddrList = loadGestaoAddrList;
window.loadGestaoAddrPanelData = loadGestaoAddrPanelData;
window.bindGestaoAddrEvents = bindGestaoAddrEvents;
window.resetGestaoAddrForm = resetGestaoAddrForm;
