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

function applyAppDialogVariant(variant, showIcon = false) {
    const config = APP_DIALOG_VARIANTS[variant] || APP_DIALOG_VARIANTS.confirm;
    const iconWrap = document.getElementById('app-dialog-icon-wrap');
    const icon = document.getElementById('app-dialog-icon');
    const confirmBtn = document.getElementById('btn-app-dialog-confirm');

    if (iconWrap && icon) {
        iconWrap.classList.toggle('hidden', !showIcon);
        if (showIcon) {
            icon.className = `w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${config.iconBg}`;
            icon.textContent = config.icon;
        }
    }

    if (confirmBtn) {
        confirmBtn.className = `flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${config.confirmClass}`;
    }
}

function handleAppDialogKeydown(event) {
    if (!appDialogResolver) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeAppDialog(false);
        return;
    }

    const inputEl = document.getElementById('app-dialog-input');
    const inputVisible = inputEl && !inputEl.classList.contains('hidden');
    if (inputVisible) return;

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        closeAppDialog(true);
    }
}

function closeAppDialog(result) {
    const modal = document.getElementById('app-dialog-modal');
    const inputEl = document.getElementById('app-dialog-input');
    if (modal) modal.classList.add('hidden');

    document.getElementById('app-dialog-icon-wrap')?.classList.add('hidden');
    document.removeEventListener('keydown', handleAppDialogKeydown);

    let resolved = result;
    if (result === true && inputEl && !inputEl.classList.contains('hidden')) {
        resolved = inputEl.value;
    }

    if (inputEl) {
        inputEl.value = '';
        inputEl.classList.add('hidden');
    }

    if (appDialogResolver) {
        const resolve = appDialogResolver;
        appDialogResolver = null;
        resolve(resolved);
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
        showIcon = false,
        showInput = false,
        inputPlaceholder = '',
        inputValue = '',
        focusCancel = variant === 'danger'
    } = options;

    return new Promise(resolve => {
        const modal = document.getElementById('app-dialog-modal');
        const titleEl = document.getElementById('app-dialog-title');
        const messageEl = document.getElementById('app-dialog-message');
        const inputEl = document.getElementById('app-dialog-input');
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

        if (inputEl) {
            inputEl.classList.toggle('hidden', !showInput);
            inputEl.placeholder = inputPlaceholder;
            inputEl.value = inputValue || '';
        }

        if (iconWrap) {
            iconWrap.classList.toggle('hidden', !showIcon);
        }

        applyAppDialogVariant(variant, showIcon);

        modal.classList.remove('hidden');
        document.addEventListener('keydown', handleAppDialogKeydown);

        if (showInput && inputEl) {
            inputEl.focus();
            return;
        }

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
        showIcon: false,
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
        showIcon: false,
        ...resolved
    });
}

function promptAppDialog(message, options = {}) {
    return showAppDialog({
        ...options,
        title: options.title || 'Observação',
        message,
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        variant: options.variant || 'confirm',
        showCancel: true,
        showIcon: false,
        showInput: true,
        inputPlaceholder: options.placeholder || options.inputPlaceholder || 'Descreva o motivo...',
        inputValue: options.value || options.inputValue || ''
    }).then(result => {
        if (result === false || result == null) return null;
        return String(result);
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
window.promptAppDialog = promptAppDialog;
window.bindAppDialogEvents = bindAppDialogEvents;
