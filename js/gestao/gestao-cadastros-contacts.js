// Cadastro de contatos (nome, celular, telefone fixo, e-mail) de cliente e arquiteto.
const CONTACT_OWNER_TYPE_CLIENT = 'client';
const CONTACT_OWNER_TYPE_ARCHITECT = 'architect';
const CONTACT_COLUMNS = 'id, ownerType, ownerId, name, phone, landlinePhone, email, isPrimary, isActive, sortOrder';
const CONTACT_COLUMNS_LEGACY = 'id, ownerType, ownerId, name, phone, email, isPrimary, isActive, sortOrder';

let contactManagerOwner = { type: null, id: null, name: '' };

function formatContactMobilePhone(value) {
    if (typeof formatArchitectPhone === 'function') return formatArchitectPhone(value);
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatContactLandlinePhone(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
}

function formatContactPhone(value) {
    return formatContactMobilePhone(value);
}

function validateContactFields({ phone, landlinePhone, email } = {}) {
    const mobile = formatContactMobilePhone(phone);
    const mobileDigits = mobile.replace(/\D/g, '');
    if (mobileDigits.length > 0 && mobileDigits.length !== 11) {
        return { error: 'Informe o celular no formato (00)00000-0000.' };
    }

    const landline = formatContactLandlinePhone(landlinePhone);
    const landlineDigits = landline.replace(/\D/g, '');
    if (landlineDigits.length > 0 && landlineDigits.length !== 10) {
        return { error: 'Informe o telefone fixo no formato (00)0000-0000.' };
    }

    const normalizedEmail = String(email || '').trim();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
        return { error: 'Informe um e-mail válido.' };
    }

    return {
        phone: mobile || null,
        landlinePhone: landline || null,
        email: normalizedEmail || null
    };
}

function validateContactPhoneEmail(phoneValue, emailValue, landlinePhoneValue = null) {
    return validateContactFields({
        phone: phoneValue,
        landlinePhone: landlinePhoneValue,
        email: emailValue
    });
}

function contactPhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function isMissingContactLandlineColumnError(error) {
    const message = String(error?.message || '');
    return /landlinePhone|schema cache/i.test(message);
}

async function fetchContacts(ownerType, ownerId, options = {}) {
    const id = Number(ownerId);
    if (!ownerType || !id) return [];

    const buildQuery = (columns) => {
        let query = supabaseClient
            .from('Contact')
            .select(columns)
            .eq('ownerType', ownerType)
            .eq('ownerId', id)
            .order('isPrimary', { ascending: false })
            .order('sortOrder', { ascending: true })
            .order('id', { ascending: true });
        if (!options.includeInactive) {
            query = query.eq('isActive', true);
        }
        return query;
    };

    let { data, error } = await buildQuery(CONTACT_COLUMNS);
    if (error && isMissingContactLandlineColumnError(error)) {
        ({ data, error } = await buildQuery(CONTACT_COLUMNS_LEGACY));
    }

    if (error) {
        if (!/Contact|schema cache/i.test(error.message || '')) {
            console.error('fetchContacts:', error);
        }
        return [];
    }
    return (data || []).map(item => ({ ...item, landlinePhone: item.landlinePhone || null }));
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
        landlinePhone: payload.landlinePhone || null,
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

    const runPersist = (body, columns) => {
        const query = contactId
            ? supabaseClient.from('Contact').update(body).eq('id', Number(contactId))
            : supabaseClient.from('Contact').insert(body);
        return query.select(columns).single();
    };

    let { data, error } = await runPersist(record, CONTACT_COLUMNS);
    if (error && isMissingContactLandlineColumnError(error)) {
        const { landlinePhone: _landlinePhone, ...legacyRecord } = record;
        ({ data, error } = await runPersist(legacyRecord, CONTACT_COLUMNS_LEGACY));
    }
    return { data, error };
}

async function deleteContact(contactId) {
    const { error } = await supabaseClient.from('Contact').delete().eq('id', Number(contactId));
    return { error };
}

async function upsertOwnerContact(ownerType, ownerId, fields = {}) {
    const id = Number(ownerId);
    const name = String(fields.name || fields.contactName || '').trim();
    const validated = validateContactFields({
        phone: fields.phone,
        landlinePhone: fields.landlinePhone,
        email: fields.email
    });
    if (validated.error) return { error: { message: validated.error } };
    const phone = validated.phone;
    const landlinePhone = validated.landlinePhone;
    const email = validated.email;
    if (!id || (!name && !phone && !landlinePhone && !email)) return { data: null, error: null };

    const existing = await fetchContacts(ownerType, id, { includeInactive: true });
    const phoneDigits = contactPhoneDigits(phone);
    const landlineDigits = contactPhoneDigits(landlinePhone);
    const match = existing.find(item => {
        if (phoneDigits && contactPhoneDigits(item.phone) === phoneDigits) return true;
        if (landlineDigits && contactPhoneDigits(item.landlinePhone) === landlineDigits) return true;
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
            landlinePhone: match.landlinePhone || null,
            email: match.email,
            isPrimary: match.isPrimary,
            isActive: match.isActive !== false,
            sortOrder: match.sortOrder
        };
        if (name && !String(match.name || '').trim()) patch.name = name;
        if (phone && !match.phone) patch.phone = phone;
        if (landlinePhone && !match.landlinePhone) patch.landlinePhone = landlinePhone;
        if (email && !match.email) patch.email = email;
        const changed = patch.name !== match.name
            || patch.phone !== match.phone
            || patch.landlinePhone !== (match.landlinePhone || null)
            || patch.email !== match.email;
        if (!changed) return { data: match, error: null };
        return persistContact(patch, match.id);
    }

    return persistContact({
        ownerType,
        ownerId: id,
        name: name || 'Contato',
        phone,
        landlinePhone,
        email,
        isPrimary: existing.length === 0,
        isActive: true
    });
}

function readContactFormFields(root, nameSelector, phoneSelector, landlinePhoneSelector, emailSelector, primarySelector) {
    const name = root.querySelector?.(nameSelector)?.value.trim()
        || document.getElementById(nameSelector.replace('#', ''))?.value.trim()
        || '';
    const phoneEl = root.querySelector?.(phoneSelector) || document.getElementById(phoneSelector.replace('#', ''));
    const landlineEl = root.querySelector?.(landlinePhoneSelector)
        || document.getElementById(landlinePhoneSelector.replace('#', ''));
    const emailEl = root.querySelector?.(emailSelector) || document.getElementById(emailSelector.replace('#', ''));
    const primaryEl = primarySelector
        ? (root.querySelector?.(primarySelector) || document.getElementById(primarySelector.replace('#', '')))
        : null;
    const validated = validateContactFields({
        phone: phoneEl?.value,
        landlinePhone: landlineEl?.value,
        email: emailEl?.value
    });
    return {
        name,
        isPrimary: Boolean(primaryEl?.checked),
        ...validated
    };
}

function bindContactMobilePhoneMask(input) {
    if (typeof bindArchitectPhoneMask === 'function') {
        bindArchitectPhoneMask(input);
        return;
    }
    if (!input || input.dataset.phoneMaskBound === '1') return;
    input.dataset.phoneMaskBound = '1';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '14');
    input.addEventListener('input', () => {
        input.value = formatContactMobilePhone(input.value);
    });
}

function bindContactLandlinePhoneMask(input) {
    if (!input || input.dataset.landlinePhoneMaskBound === '1') return;
    input.dataset.landlinePhoneMaskBound = '1';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '13');
    input.addEventListener('input', () => {
        input.value = formatContactLandlinePhone(input.value);
    });
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
        : 'Inclua celular, telefone fixo, e-mail e a pessoa de contato.';
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
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" class="contact-row-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    placeholder="Contato" value="${escapeHtml(item.name || '')}">
                <input type="text" class="contact-row-mobile w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    inputmode="numeric" maxlength="14" placeholder="Celular (00)00000-0000"
                    value="${escapeHtml(formatContactMobilePhone(item.phone))}">
                <input type="text" class="contact-row-landline w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    inputmode="numeric" maxlength="13" placeholder="Fixo (00)0000-0000"
                    value="${escapeHtml(formatContactLandlinePhone(item.landlinePhone))}">
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

    list.querySelectorAll('.contact-row-mobile').forEach(bindContactMobilePhoneMask);
    list.querySelectorAll('.contact-row-landline').forEach(bindContactLandlinePhoneMask);
}

async function addContactFromManager(event) {
    event.preventDefault();
    const fields = readContactFormFields(
        document,
        '#contact-manager-new-name',
        '#contact-manager-new-phone',
        '#contact-manager-new-landline-phone',
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
        landlinePhone: fields.landlinePhone,
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
    const validated = validateContactFields({
        phone: card.querySelector('.contact-row-mobile')?.value,
        landlinePhone: card.querySelector('.contact-row-landline')?.value,
        email: card.querySelector('.contact-row-email')?.value
    });
    if (validated.error) {
        alertAppDialog(validated.error);
        return;
    }
    const { error } = await persistContact({
        ownerType: contactManagerOwner.type,
        ownerId: contactManagerOwner.id,
        name,
        phone: validated.phone,
        landlinePhone: validated.landlinePhone,
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
    bindContactMobilePhoneMask(document.getElementById('contact-manager-new-phone'));
    bindContactLandlinePhoneMask(document.getElementById('contact-manager-new-landline-phone'));
    bindContactMobilePhoneMask(document.getElementById('cliente-create-phone'));
    bindContactLandlinePhoneMask(document.getElementById('cliente-create-landline-phone'));
}

window.CONTACT_OWNER_TYPE_CLIENT = CONTACT_OWNER_TYPE_CLIENT;
window.CONTACT_OWNER_TYPE_ARCHITECT = CONTACT_OWNER_TYPE_ARCHITECT;
window.fetchContacts = fetchContacts;
window.persistContact = persistContact;
window.deleteContact = deleteContact;
window.upsertOwnerContact = upsertOwnerContact;
window.openContactManagerModal = openContactManagerModal;
window.bindGestaoContactEvents = bindGestaoContactEvents;
window.validateContactFields = validateContactFields;
window.validateContactPhoneEmail = validateContactPhoneEmail;
window.formatContactLandlinePhone = formatContactLandlinePhone;
window.bindContactLandlinePhoneMask = bindContactLandlinePhoneMask;
