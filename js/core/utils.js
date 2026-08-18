function formatAuthError(error) {
    if (!error) return "Erro desconhecido.";
    const message = error.message || error.msg || error.error_description;
    const code = error.code || error.status;

    if (code === 500 || code === '500') {
        return message && message !== '{}'
            ? message + " — Erro no banco ao criar perfil. Rode o SQL em supabase/rls-policies.sql."
            : "Erro no servidor ao salvar perfil (500). Rode supabase/rls-policies.sql no Supabase. Se o e-mail já existir em appUsers, vincule ou remova o registro duplicado.";
    }

    if (code === 42501 || code === '42501' || message?.includes('row-level security')) {
        return (message || 'Política RLS bloqueou a operação.')
            + " — Execute supabase/rls-policies.sql no SQL Editor do Supabase.";
    }

    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return `Erro ${code}`;
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
}
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function toInputDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function formatDisplayDate(dateStr) {
    const value = toInputDate(dateStr);
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getTodayInputDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isInputDateInFuture(dateStr) {
    if (!dateStr) return false;
    return dateStr > getTodayInputDate();
}
