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
