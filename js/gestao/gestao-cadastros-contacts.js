// Cadastro de contatos (nome, telefone, e-mail) de cliente e arquiteto.
const CONTACT_OWNER_TYPE_CLIENT = 'client';
const CONTACT_OWNER_TYPE_ARCHITECT = 'architect';
const CONTACT_COLUMNS = 'id, ownerType, ownerId, name, phone, email, isPrimary, isActive, sortOrder';

let contactManagerOwner = { type: null, id: null, name: '' };

function formatContactPhone(value) {
    if (typeof formatArchitectPhone === 'function') return formatArchitectPhone(value);
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validateContactPhoneEmail(phoneValue, emailValue) {
    if (typeof validateArchitectPhoneEmail === 'function') {
        return validateArchitectPhoneEmail(phoneValue, emailValue);
    }
    const phone = formatContactPhone(phoneValue);
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 11) {
        return { error: 'Informe o telefone no formato (00)00000-0000.' };
    }
    const email = String(emailValue || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
        return { error: 'Informe um e-mail válido.' };
    }
    return { phone: phone || null, email: email || null };
}

function contactPhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

async function fetchContacts(ownerType, ownerId, options = {}) {
    const id = Number(ownerId);
    if (!ownerType || !id) return [];

    let query = supabaseClient
        .from('Contact')
        .select(CONTACT_COLUMNS)
        .eq('ownerType', ownerType)
        .eq('ownerId', id)
        .order('isPrimary', { ascending: false })
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });
    if (!options.includeInactive) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;
    if (error) {
        if (!/Contact|schema cache/i.test(error.message || '')) {
            console.error('fetchContacts:', error);
        }
        return [];
    }
    return data || [];
}

async function clearOtherPrimaryContacts(ownerType, ownerId, keepId = null) {
    let query = supabaseClient
        .from('Contact')
        .update({ isPrimary: false, updatedAt: new Date().toISOString() })
        .eq('ownerType', ownerType)
        .eq('ownerId', Number(ownerId))
        .eq('isPrimary', true);
    if (keepId) query = query.neq('id', Number(keepId));
    await query;
}

async function persistContact(payload, contactId = null) {
    const now = new Date().toISOString();
    const record = {
        ownerType: payload.ownerType,
        ownerId: Number(payload.ownerId),
        name: String(payload.name || '').trim(),
        phone: payload.phone || null,
        email: payload.email || null,
        isPrimary: payload.isPrimary === true,
        isActive: payload.isActive !== false,
        sortOrder: Number(payload.sortOrder) || 0,
        updatedAt: now,
        updatedById: currentUser?.id || null
    };
    if (!contactId) {
        record.createdAt = now;
        record.createdById = currentUser?.id || null;
    }

    if (record.isPrimary) {
        await clearOtherPrimaryContacts(record.ownerType, record.ownerId, contactId);
    }

    const query = contactId
        ? supabaseClient.from('Contact').update(record).eq('id', Number(contactId))
        : supabaseClient.from('Contact').insert(record);
    const { data, error } = await query.select(CONTACT_COLUMNS).single();
    return { data, error };
}

async function deleteContact(contactId) {
    const { error } = await supabaseClient.from('Contact').delete().eq('id', Number(contactId));
    return { error };
}

async function upsertOwnerContact(ownerType, ownerId, fields = {}) {
    const id = Number(ownerId);
    const name = String(fields.name || fields.contactName || '').trim();
    const validated = validateContactPhoneEmail(fields.phone, fields.email);
    if (validated.error) return { error: { message: validated.error } };
    const phone = validated.phone;
    const email = validated.email;
    if (!id || (!name && !phone && !email)) return { data: null, error: null };

    const existing = await fetchContacts(ownerType, id, { includeInactive: true });
    const phoneDigits = contactPhoneDigits(phone);
    const match = existing.find(item => {
        if (phoneDigits && contactPhoneDigits(item.phone) === phoneDigits) return true;
        if (email && String(item.email || '').trim().toLowerCase() === email.toLowerCase()) return true;
        if (name && String(item.name || '').trim().toLowerCase() === name.toLowerCase()) return true;
        return false;
    });

    if (match) {
        const patch = {
            ownerType,
            ownerId: id,
            name: match.name,
            phone: match.phone,
            email: match.email,
            isPrimary: match.isPrimary,
            isActive: match.isActive !== false,
            sortOrder: match.sortOrder
        };
        if (name && !String(match.name || '').trim()) patch.name = name;
        if (phone && !match.phone) patch.phone = phone;
        if (email && !match.email) patch.email = email;
        const changed = patch.name !== match.name || patch.phone !== match.phone || patch.email !== match.email;
        if (!changed) return { data: match, error: null };
        return persistContact(patch, match.id);
    }

    return persistContact({
        ownerType,
        ownerId: id,
        name: name || 'Contato',
        phone,
        email,
        isPrimary: existing.length === 0,
        isActive: true
    });
}

function readContactFormFields(root, nameSelector, phoneSelector, emailSelector, primarySelector) {
    const name = root.querySelector?.(nameSelector)?.value.trim()
        || document.getElementById(nameSelector.replace('#', ''))?.value.trim()
        || '';
    const phoneEl = root.querySelector?.(phoneSelector) || document.getElementById(phoneSelector.replace('#', ''));
    const emailEl = root.querySelector?.(emailSelector) || document.getElementById(emailSelector.replace('#', ''));
    const primaryEl = primarySelector
        ? (root.querySelector?.(primarySelector) || document.getElementById(primarySelector.replace('#', '')))
        : null;
    const validated = validateContactPhoneEmail(phoneEl?.value, emailEl?.value);
    return {
        name,
        isPrimary: Boolean(primaryEl?.checked),
        ...validated
    };
}

async function openContactManagerModal({ ownerType, ownerId, ownerName } = {}) {
    const id = Number(ownerId);
    if (!ownerType || !id) {
        alertAppDialog('Selecione um cadastro para gerenciar os contatos.');
        return;
    }
    contactManagerOwner = { type: ownerType, id, name: ownerName || '' };
    const title = document.getElementById('contact-manager-title');
    const subtitle = document.getElementById('contact-manager-subtitle');
    if (title) title.textContent = 'Contatos';
    if (subtitle) subtitle.textContent = contactManagerOwner.name
        ? `Cadastro de ${contactManagerOwner.name}`
        : 'Inclua telefone, e-mail e a pessoa de contato.';
    if (!document.getElementById('contact-manager-modal')) {
        alertAppDialog('Não foi possível abrir os contatos. Recarregue a página.');
        return;
    }
    document.getElementById('contact-manager-new-form')?.reset();
    const primaryCheck = document.getElementById('contact-manager-new-primary');
    if (primaryCheck) primaryCheck.checked = false;
    toggleModal('contact-manager-modal', true);
    await renderContactManagerList();
}

async function renderContactManagerList() {
    const list = document.getElementById('contact-manager-list');
    if (!list) return;
    const contacts = await fetchContacts(contactManagerOwner.type, contactManagerOwner.id, { includeInactive: true });
    const primaryCheck = document.getElementById('contact-manager-new-primary');
    if (primaryCheck && !contacts.some(item => item.isPrimary)) {
        primaryCheck.checked = true;
    }

    if (!contacts.length) {
        list.innerHTML = `
            <p class="text-xs text-slate-400 text-center py-4">Nenhum contato cadastrado.</p>
        `;
        return;
    }

    list.innerHTML = contacts.map(item => `
        <div class="border border-slate-200 rounded-xl p-3 space-y-2" data-contact-id="${item.id}">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" class="contact-row-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    placeholder="Contato" value="${escapeHtml(item.name || '')}">
                <input type="text" class="contact-row-phone w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    inputmode="numeric" maxlength="14" placeholder="(00)00000-0000"
                    value="${escapeHtml(formatContactPhone(item.phone))}">
                <input type="email" class="contact-row-email w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    placeholder="email@dominio.com" value="${escapeHtml(item.email || '')}">
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" class="contact-row-primary h-4 w-4 rounded border-slate-300 text-indigo-600"
                        ${item.isPrimary ? 'checked' : ''}>
                    Principal
                </label>
                <div class="flex gap-1.5">
                    <button type="button" class="contact-row-save text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">Salvar</button>
                    <button type="button" class="contact-row-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">Excluir</button>
                </div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.contact-row-phone').forEach(input => {
        if (typeof bindArchitectPhoneMask === 'function') bindArchitectPhoneMask(input);
    });
}

async function addContactFromManager(event) {
    event.preventDefault();
    const fields = readContactFormFields(
        document,
        '#contact-manager-new-name',
        '#contact-manager-new-phone',
        '#contact-manager-new-email',
        '#contact-manager-new-primary'
    );
    if (fields.error) {
        alertAppDialog(fields.error);
        return;
    }
    if (!fields.name) {
        alertAppDialog('Informe o nome do contato.');
        document.getElementById('contact-manager-new-name')?.focus();
        return;
    }
    const { error } = await persistContact({
        ownerType: contactManagerOwner.type,
        ownerId: contactManagerOwner.id,
        name: fields.name,
        phone: fields.phone,
        email: fields.email,
        isPrimary: fields.isPrimary
    });
    if (error) {
        alertAppDialog('Erro ao adicionar contato: ' + error.message);
        return;
    }
    document.getElementById('contact-manager-new-form')?.reset();
    await renderContactManagerList();
}

async function saveContactManagerRow(card) {
    const contactId = Number(card.dataset.contactId);
    const name = card.querySelector('.contact-row-name')?.value.trim();
    if (!name) {
        alertAppDialog('Informe o nome do contato.');
        return;
    }
    const validated = validateContactPhoneEmail(
        card.querySelector('.contact-row-phone')?.value,
        card.querySelector('.contact-row-email')?.value
    );
    if (validated.error) {
        alertAppDialog(validated.error);
        return;
    }
    const { error } = await persistContact({
        ownerType: contactManagerOwner.type,
        ownerId: contactManagerOwner.id,
        name,
        phone: validated.phone,
        email: validated.email,
        isPrimary: Boolean(card.querySelector('.contact-row-primary')?.checked)
    }, contactId);
    if (error) {
        alertAppDialog('Erro ao salvar contato: ' + error.message);
        return;
    }
    await renderContactManagerList();
}

async function deleteContactManagerRow(card) {
    const name = card.querySelector('.contact-row-name')?.value.trim() || 'o contato';
    if (!(await confirmAppDialog(`Excluir o contato "${name}"?`))) return;
    const { error } = await deleteContact(card.dataset.contactId);
    if (error) {
        alertAppDialog('Erro ao excluir contato: ' + error.message);
        return;
    }
    await renderContactManagerList();
}

function bindGestaoContactEvents() {
    document.getElementById('contact-manager-new-form')?.addEventListener('submit', addContactFromManager);
    document.getElementById('contact-manager-list')?.addEventListener('click', async event => {
        const card = event.target.closest('[data-contact-id]');
        if (!card) return;
        if (event.target.closest('.contact-row-save')) await saveContactManagerRow(card);
        if (event.target.closest('.contact-row-delete')) await deleteContactManagerRow(card);
    });
    if (typeof bindArchitectPhoneMask === 'function') {
        bindArchitectPhoneMask(document.getElementById('contact-manager-new-phone'));
        bindArchitectPhoneMask(document.getElementById('cliente-create-phone'));
    }
}

window.CONTACT_OWNER_TYPE_CLIENT = CONTACT_OWNER_TYPE_CLIENT;
window.CONTACT_OWNER_TYPE_ARCHITECT = CONTACT_OWNER_TYPE_ARCHITECT;
window.fetchContacts = fetchContacts;
window.persistContact = persistContact;
window.deleteContact = deleteContact;
window.upsertOwnerContact = upsertOwnerContact;
window.openContactManagerModal = openContactManagerModal;
window.bindGestaoContactEvents = bindGestaoContactEvents;
window.validateContactPhoneEmail = validateContactPhoneEmail;
