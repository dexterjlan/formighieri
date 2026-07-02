function formatAuthError(error) {
    if (!error) return "Erro desconhecido.";
    const message = error.message || error.msg || error.error_description;
    const code = error.code || error.status;

    if (code === 500 || code === '500') {
        return message && message !== '{}'
            ? message + " — Erro no banco ao criar perfil. Rode o SQL atualizado em supabase/rls-policies.sql."
            : "Erro no servidor ao salvar perfil (500). Rode o SQL atualizado no Supabase. Se o e-mail já existir em appUsers, vincule ou remova o registro duplicado.";
    }

    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return `Erro ${code}`;
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
}

function toggleModal(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
}
window.toggleModal = toggleModal;

function canEditConsultorResponse() {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Consultor';
}

function getResponseDisplayDate(conv) {
    return conv.responseAt || (conv.commercialResponse ? conv.updatedAt : null);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function truncateText(text, max = 60) {
    if (!text) return '-';
    return text.length > max ? text.slice(0, max) + '…' : text;
}

function isAdmin() {
    return currentUser?.role === 'Admin';
}

function formatRequestProfile(profile) {
    return profile || '—';
}

function getRequestProfileBadgeClass(profile) {
    if (profile === 'Projetista') return 'bg-sky-100 text-sky-800';
    if (profile === 'Consultor') return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-600';
}

function updateConvRequestLabel(profile) {
    const label = document.getElementById('conv-request-label');
    if (!label) return;
    if (profile === 'Consultor') {
        label.textContent = 'Solicitação do Consultor';
    } else if (profile === 'Projetista') {
        label.textContent = 'Solicitação Técnica';
    } else {
        label.textContent = 'Solicitação';
    }
}

function setupConvProfileFields(isEdit, conv) {
    const adminWrap = document.getElementById('conv-profile-wrap');
    const autoWrap = document.getElementById('conv-creator-profile-wrap');
    const autoLabel = document.getElementById('conv-creator-profile-label');
    const profileSelect = document.getElementById('conv-profile');
    const readOnlyWrap = document.getElementById('conv-profile-readonly-wrap');
    const readOnlyLabel = document.getElementById('conv-profile-readonly-label');

    adminWrap.classList.add('hidden');
    autoWrap.classList.add('hidden');
    readOnlyWrap.classList.add('hidden');
    profileSelect.required = false;
    profileSelect.onchange = null;

    if (isEdit) {
        readOnlyWrap.classList.remove('hidden');
        readOnlyLabel.textContent = formatRequestProfile(conv?.requestProfile);
        updateConvRequestLabel(conv?.requestProfile);
        return;
    }

    if (currentUser.role === 'Admin') {
        adminWrap.classList.remove('hidden');
        profileSelect.required = true;
        profileSelect.value = '';
        updateConvRequestLabel('');
        profileSelect.onchange = () => updateConvRequestLabel(profileSelect.value);
        return;
    }

    autoWrap.classList.remove('hidden');
    autoLabel.textContent = currentUser.role;
    updateConvRequestLabel(currentUser.role);
}

function getRequestProfileForCreate() {
    if (currentUser.role === 'Admin') {
        return document.getElementById('conv-profile').value.trim();
    }
    if (currentUser.role === 'Consultor' || currentUser.role === 'Projetista') {
        return currentUser.role;
    }
    return '';
}
