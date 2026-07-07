let appDialogResolver = null;

const APP_DIALOG_VARIANTS = {
    confirm: {
        icon: '?',
        iconBg: 'bg-slate-100 text-slate-600',
        confirmClass: 'bg-slate-900 hover:bg-slate-800'
    },
    warning: {
        icon: '!',
        iconBg: 'bg-amber-100 text-amber-700',
        confirmClass: 'bg-amber-600 hover:bg-amber-700'
    },
    danger: {
        icon: '!',
        iconBg: 'bg-red-100 text-red-600',
        confirmClass: 'bg-red-600 hover:bg-red-700'
    },
    success: {
        icon: '✓',
        iconBg: 'bg-emerald-100 text-emerald-700',
        confirmClass: 'bg-emerald-700 hover:bg-emerald-800'
    },
    info: {
        icon: 'i',
        iconBg: 'bg-blue-100 text-blue-700',
        confirmClass: 'bg-slate-900 hover:bg-slate-800'
    },
    error: {
        icon: '!',
        iconBg: 'bg-red-100 text-red-600',
        confirmClass: 'bg-red-600 hover:bg-red-700'
    }
};

function applyAppDialogVariant(variant) {
    const config = APP_DIALOG_VARIANTS[variant] || APP_DIALOG_VARIANTS.confirm;
    const iconWrap = document.getElementById('app-dialog-icon-wrap');
    const icon = document.getElementById('app-dialog-icon');
    const confirmBtn = document.getElementById('btn-app-dialog-confirm');

    if (iconWrap && icon) {
        iconWrap.classList.remove('hidden');
        icon.className = `w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${config.iconBg}`;
        icon.textContent = config.icon;
    }

    if (confirmBtn) {
        confirmBtn.className = `flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${config.confirmClass}`;
    }
}

function closeAppDialog(result) {
    const modal = document.getElementById('app-dialog-modal');
    if (modal) modal.classList.add('hidden');

    document.removeEventListener('keydown', handleAppDialogKeydown);

    if (appDialogResolver) {
        const resolve = appDialogResolver;
        appDialogResolver = null;
        resolve(result);
    }
}

function handleAppDialogKeydown(event) {
    if (!appDialogResolver) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeAppDialog(false);
        return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        closeAppDialog(true);
    }
}

function showAppDialog(options = {}) {
    const {
        title = 'Confirmação',
        message = '',
        confirmLabel = 'Confirmar',
        cancelLabel = 'Cancelar',
        variant = 'confirm',
        showCancel = true,
        showIcon = true,
        focusCancel = variant === 'danger'
    } = options;

    return new Promise(resolve => {
        const modal = document.getElementById('app-dialog-modal');
        const titleEl = document.getElementById('app-dialog-title');
        const messageEl = document.getElementById('app-dialog-message');
        const cancelBtn = document.getElementById('btn-app-dialog-cancel');
        const confirmBtn = document.getElementById('btn-app-dialog-confirm');
        const iconWrap = document.getElementById('app-dialog-icon-wrap');

        if (!modal || !titleEl || !messageEl || !cancelBtn || !confirmBtn) {
            resolve(false);
            return;
        }

        appDialogResolver = resolve;

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmLabel;
        cancelBtn.textContent = cancelLabel;

        cancelBtn.classList.toggle('hidden', !showCancel);
        confirmBtn.classList.toggle('flex-1', showCancel);
        confirmBtn.classList.toggle('w-full', !showCancel);

        if (iconWrap) {
            iconWrap.classList.toggle('hidden', !showIcon);
        }

        applyAppDialogVariant(variant);

        modal.classList.remove('hidden');
        document.addEventListener('keydown', handleAppDialogKeydown);

        if (showCancel) {
            (focusCancel ? cancelBtn : confirmBtn).focus();
        } else {
            confirmBtn.focus();
        }
    });
}

function confirmAppDialog(message, options = {}) {
    return showAppDialog({
        title: options.title || 'Confirmação',
        message,
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        variant: options.variant || 'confirm',
        showCancel: true,
        showIcon: options.showIcon !== false,
        ...options
    }).then(result => result === true);
}

function inferAlertDialogOptions(message, options = {}) {
    if (options.variant) return options;

    const text = String(message);
    if (/^Erro\b/i.test(text) || /Erro ao|falhou|inválid/i.test(text)) {
        return { ...options, variant: 'error', title: options.title || 'Erro' };
    }
    if (/salv[ao] com sucesso|criada!|atualizado com sucesso|salva\.?$/i.test(text)) {
        return { ...options, variant: 'success', title: options.title || 'Sucesso' };
    }
    if (/sem permissão|não tem permissão|não pode|Somente /i.test(text)) {
        return { ...options, variant: 'warning', title: options.title || 'Aviso' };
    }
    return options;
}

function alertAppDialog(message, options = {}) {
    const resolved = inferAlertDialogOptions(message, options);
    return showAppDialog({
        title: resolved.title || 'Aviso',
        message,
        confirmLabel: resolved.confirmLabel || 'OK',
        variant: resolved.variant || 'info',
        showCancel: false,
        showIcon: resolved.showIcon !== false,
        ...resolved
    });
}

function bindAppDialogEvents() {
    const cancelBtn = document.getElementById('btn-app-dialog-cancel');
    const confirmBtn = document.getElementById('btn-app-dialog-confirm');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeAppDialog(false));
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => closeAppDialog(true));
    }
}

window.showAppDialog = showAppDialog;
window.confirmAppDialog = confirmAppDialog;
window.alertAppDialog = alertAppDialog;
window.bindAppDialogEvents = bindAppDialogEvents;
