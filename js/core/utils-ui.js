function toggleModal(id, show) {
    document.getElementById(id)?.classList.toggle('hidden', !show);
}
window.toggleModal = toggleModal;
function setActionOverlayLoading(config, active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById(config.overlayId);
    const messageEl = document.getElementById(config.messageId);
    const spinner = config.spinnerId ? document.getElementById(config.spinnerId) : null;
    const successIcon = config.successId ? document.getElementById(config.successId) : null;
    const errorIcon = config.errorId ? document.getElementById(config.errorId) : null;
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');
}

function createModalOverlayConfig(prefix, options = {}) {
    const base = String(prefix).replace(/-loading$/, '');
    return {
        overlayId: `${base}-loading`,
        messageId: `${base}-loading-msg`,
        spinnerId: `${base}-loading-spinner`,
        successId: `${base}-loading-success`,
        errorId: `${base}-loading-error`,
        disableElementIds: options.disableElementIds || [],
        reenableElementIdsOnHide: options.reenableElementIdsOnHide || null,
        closeButtonSelector: options.closeButtonSelector || null,
        disableFormSelector: options.disableFormSelector || null,
        disableDatasetKey: options.disableDatasetKey || 'modalLoadingDisabled',
        onShow: options.onShow || null
    };
}

function setModalOverlayLoading(config, active, message = 'Processando...', status = 'loading') {
    const show = Boolean(active);

    if (show && typeof config.onShow === 'function') {
        config.onShow();
    }

    setActionOverlayLoading(config, active, message, status);

    (config.disableElementIds || []).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (show) el.disabled = true;
    });

    if (!show) {
        const reenableIds = config.reenableElementIdsOnHide || config.disableElementIds || [];
        reenableIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
    }

    if (config.closeButtonSelector) {
        const closeBtn = document.querySelector(config.closeButtonSelector);
        if (closeBtn) closeBtn.disabled = show;
    }

    if (config.disableFormSelector) {
        const key = config.disableDatasetKey || 'modalLoadingDisabled';
        document.querySelectorAll(config.disableFormSelector).forEach(el => {
            if (show) {
                el.dataset[key] = '1';
                el.disabled = true;
            } else if (el.dataset[key] === '1') {
                delete el.dataset[key];
                el.disabled = false;
            }
        });
    }
}

const ORDER_PROJECTS_ACTION_OVERLAY = {
    overlayId: 'order-projects-action-loading',
    messageId: 'order-projects-action-loading-msg',
    spinnerId: 'order-projects-action-loading-spinner',
    successId: 'order-projects-action-loading-success',
    errorId: 'order-projects-action-loading-error'
};

function setOrderProjectsPanelActionLoading(active, message = 'Processando...', status = 'loading') {
    setActionOverlayLoading(ORDER_PROJECTS_ACTION_OVERLAY, active, message, status);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const REFRESH_BUTTON_ICON_HTML = '<svg class="order-tab-action-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>';

function renderRefreshButtonInnerHtml() {
    return `${REFRESH_BUTTON_ICON_HTML}<span>Atualizar</span>`;
}

function truncateText(text, max = 60) {
    if (!text) return '-';
    return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatContactPhoneDisplay(value) {
    if (typeof formatArchitectPhone === 'function') return formatArchitectPhone(value);
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function showEntityDetailsModal(title, subtitle, rows) {
    const titleEl = document.getElementById('entity-details-title');
    const subtitleEl = document.getElementById('entity-details-subtitle');
    const body = document.getElementById('entity-details-body');
    if (!body) return;
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    body.innerHTML = (rows || []).map(row => `
        <div>
            <dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">${escapeHtml(row.label)}</dt>
            <dd class="text-sm text-slate-800 mt-0.5 break-words whitespace-pre-line">${escapeHtml(row.value || '—')}</dd>
        </div>
    `).join('');
    toggleModal('entity-details-modal', true);
}

async function fetchCadastroRecord(table, id, columns, fallbackColumns) {
    let { data, error } = await supabaseClient.from(table).select(columns).eq('id', id).maybeSingle();
    if (error && fallbackColumns) {
        ({ data, error } = await supabaseClient.from(table).select(fallbackColumns).eq('id', id).maybeSingle());
    }
    return { data, error };
}

function buildContactDetailRows(contacts) {
    if (!contacts?.length) {
        return [{ label: 'Contatos', value: 'Nenhum contato cadastrado' }];
    }
    return contacts.map((item, index) => {
        const title = item.isPrimary ? 'Contato principal' : `Contato ${index + 1}`;
        const parts = [item.name, formatContactPhoneDisplay(item.phone), item.email].filter(Boolean);
        return { label: title, value: parts.join('\n') || '—' };
    });
}

function buildCadastroDetailsRows(record, contacts) {
    return [
        { label: 'Nome', value: record?.name },
        { label: 'Situação', value: record?.isActive === false ? 'Inativo' : 'Ativo' },
        ...buildContactDetailRows(contacts)
    ];
}

function formatClientAddressDetailValue(record) {
    if (typeof formatAddrFullDisplay === 'function') {
        return formatAddrFullDisplay(record);
    }
    if (typeof formatGestaoAddrSummary === 'function') {
        return formatGestaoAddrSummary(record);
    }
    return [record?.street, record?.number, record?.neighborhood, record?.city, record?.state]
        .filter(Boolean)
        .join(', ');
}

async function buildClientAddressDetailRows(clientId, preferredAddrId = null) {
    if (typeof fetchGestaoClientAddrs !== 'function') {
        return [{ label: 'Endereço', value: 'Cadastro de endereço indisponível' }];
    }

    const rows = [];
    const preferredId = Number(preferredAddrId) || null;
    if (preferredId) {
        const preferred = await fetchGestaoClientAddrs(null, { addrId: preferredId });
        if (preferred) {
            const title = preferred.isPrimary ? 'Endereço do pedido (principal)' : 'Endereço do pedido';
            rows.push({ label: title, value: formatClientAddressDetailValue(preferred) || '—' });
        }
    }

    const list = await fetchGestaoClientAddrs(clientId, { includeInactive: false });
    (Array.isArray(list) ? list : []).forEach(addr => {
        if (preferredId && Number(addr.id) === preferredId) return;
        const extra = [addr.labelName, addr.nickname].filter(value => value && value !== '—').join(' · ');
        const title = addr.isPrimary
            ? 'Endereço principal'
            : (extra ? `Endereço · ${extra}` : 'Endereço');
        rows.push({ label: title, value: formatClientAddressDetailValue(addr) || '—' });
    });

    if (!rows.length) {
        return [{ label: 'Endereço', value: 'Nenhum endereço cadastrado' }];
    }
    return rows;
}

async function openClientDetailsModal(clientId, options = {}) {
    if (!clientId) {
        alertAppDialog('Selecione um cliente para ver os dados.');
        return;
    }
    const { data, error } = await fetchCadastroRecord('Client', clientId, 'id, name, isActive');
    if (error || !data) {
        alertAppDialog('Não foi possível carregar os dados do cliente.');
        return;
    }
    const ownerType = typeof CONTACT_OWNER_TYPE_CLIENT === 'string' ? CONTACT_OWNER_TYPE_CLIENT : 'client';
    const contacts = typeof fetchContacts === 'function'
        ? await fetchContacts(ownerType, clientId)
        : [];
    const addrRows = await buildClientAddressDetailRows(clientId, options.addrId);
    showEntityDetailsModal('Cliente', data.name || 'Cadastro', [
        ...buildCadastroDetailsRows(data, contacts),
        ...addrRows
    ]);
}

async function openArchitectDetailsModal(architectId) {
    if (!architectId) {
        alertAppDialog('Selecione um arquiteto para ver os dados.');
        return;
    }
    const { data, error } = await fetchCadastroRecord('Architect', architectId, 'id, name, isActive');
    if (error || !data) {
        alertAppDialog('Não foi possível carregar os dados do arquiteto.');
        return;
    }
    const ownerType = typeof CONTACT_OWNER_TYPE_ARCHITECT === 'string' ? CONTACT_OWNER_TYPE_ARCHITECT : 'architect';
    const contacts = typeof fetchContacts === 'function'
        ? await fetchContacts(ownerType, architectId)
        : [];
    showEntityDetailsModal('Arquiteto', data.name || 'Cadastro', buildCadastroDetailsRows(data, contacts));
}

function bindCollapsibleListCardToggles(root, options = {}) {
    const { defaultCollapsed = true } = options;

    root.querySelectorAll('.collapsible-list-card').forEach(card => {
        const btn = card.querySelector('.list-card-toggle');
        const body = card.querySelector('.collapsible-list-body');
        const header = card.querySelector('.collapsible-list-header');
        if (!btn || !body) return;

        const setCollapsed = (collapsed) => {
            body.classList.toggle('hidden', collapsed);
            btn.textContent = collapsed ? '▶' : '▼';
            btn.setAttribute('aria-label', collapsed ? 'Expandir' : 'Recolher');
        };

        setCollapsed(defaultCollapsed);

        const toggle = (event) => {
            if (event) event.stopPropagation();
            setCollapsed(body.classList.contains('hidden') === false);
        };

        btn.addEventListener('click', toggle);
        header?.addEventListener('click', async (event) => {
            if (event.target.closest('button:not(.list-card-toggle), a, input, select, textarea, label')) return;
            toggle(event);
        });
    });
}
