const APP_ERROR_SOURCES = {
    EMAIL: 'email'
};

function normalizeAppErrorMessage(error) {
    if (!error) return 'Erro desconhecido';
    if (typeof error === 'string') return error;
    return error.message || String(error);
}

function sanitizeAppErrorPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;

    try {
        const clean = { ...payload };
        delete clean.secret;
        delete clean.password;
        delete clean.token;
        delete clean.message_body;
        delete clean.message_html;
        return clean;
    } catch (_error) {
        return null;
    }
}

async function logAppError(options = {}) {
    const source = String(options.source || 'unknown').trim();
    const message = normalizeAppErrorMessage(options.message || options.error).slice(0, 4000);
    const context = options.context ? String(options.context).slice(0, 1000) : null;
    const payload = sanitizeAppErrorPayload(options.payload);
    const userId = options.userId || currentUser?.id || null;

    if (!source || !message) return;

    if (!supabaseClient) {
        console.warn('logAppError: supabaseClient indisponível', { source, message, context });
        return;
    }

    try {
        const row = {
            source,
            message,
            context,
            payload,
            userId
        };

        let result = await supabaseClient.from('AppError').insert(row);

        if (result.error?.message?.includes('AppError') || result.error?.message?.includes('does not exist')) {
            console.warn('logAppError: tabela AppError não encontrada. Execute supabase/feats/create-app-error.sql');
            return;
        }

        if (result.error) {
            console.warn('logAppError:', result.error);
        }
    } catch (error) {
        console.warn('logAppError:', error);
    }
}

window.logAppError = logAppError;
window.APP_ERROR_SOURCES = APP_ERROR_SOURCES;
