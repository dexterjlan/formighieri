let appDialogResolver = null;
let appDialogValidate = null;

const APP_DIALOG_VARIANTS = {
    confirm: {
        icon: '?',
        iconBg: 'fm-dialog-icon fm-dialog-icon--neutral',
        confirmClass: 'fm-btn fm-btn--primary fm-btn--block'
    },
    warning: {
        icon: '!',
        iconBg: 'fm-dialog-icon fm-dialog-icon--warning',
        confirmClass: 'fm-btn fm-btn--primary fm-btn--block'
    },
    danger: {
        icon: '!',
        iconBg: 'fm-dialog-icon fm-dialog-icon--danger',
        confirmClass: 'fm-btn fm-btn--danger fm-btn--block'
    },
    success: {
        icon: '✓',
        iconBg: 'fm-dialog-icon fm-dialog-icon--success',
        confirmClass: 'fm-btn fm-btn--primary fm-btn--block'
    },
    info: {
        icon: 'i',
        iconBg: 'fm-dialog-icon fm-dialog-icon--neutral',
        confirmClass: 'fm-btn fm-btn--primary fm-btn--block'
    },
    error: {
        icon: '!',
        iconBg: 'fm-dialog-icon fm-dialog-icon--danger',
        confirmClass: 'fm-btn fm-btn--danger fm-btn--block'
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
            icon.className = config.iconBg;
            icon.textContent = config.icon;
        }
    }

    if (confirmBtn) {
        confirmBtn.className = config.confirmClass;
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

function readAppDialogCheckboxSelection() {
    const listEl = document.getElementById('app-dialog-checkbox-list');
    if (!listEl || listEl.classList.contains('hidden')) return null;
    return [...listEl.querySelectorAll('input[type="checkbox"]:checked')]
        .map(input => input.value);
}

function resetAppDialogCheckboxList() {
    const listEl = document.getElementById('app-dialog-checkbox-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.classList.add('hidden');
}

function closeAppDialog(result) {
    const modal = document.getElementById('app-dialog-modal');
    const inputEl = document.getElementById('app-dialog-input');
    const checkboxSelection = readAppDialogCheckboxSelection();

    if (result === true && checkboxSelection) {
        if (typeof appDialogValidate === 'function' && !appDialogValidate(checkboxSelection)) {
            return;
        }
    }

    if (modal) modal.classList.add('hidden');

    document.getElementById('app-dialog-icon-wrap')?.classList.add('hidden');
    document.removeEventListener('keydown', handleAppDialogKeydown);

    let resolved = result;
    if (result === true && checkboxSelection) {
        resolved = checkboxSelection;
    } else if (result === true && inputEl && !inputEl.classList.contains('hidden')) {
        resolved = inputEl.value;
    }

    if (inputEl) {
        inputEl.value = '';
        inputEl.classList.add('hidden');
    }

    resetAppDialogCheckboxList();
    appDialogValidate = null;

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
        confirmClass = '',
        focusCancel = variant === 'danger',
        checkboxItems = null,
        validate = null
    } = options;

    return new Promise(resolve => {
        const modal = document.getElementById('app-dialog-modal');
        const titleEl = document.getElementById('app-dialog-title');
        const messageEl = document.getElementById('app-dialog-message');
        const inputEl = document.getElementById('app-dialog-input');
        const checkboxListEl = document.getElementById('app-dialog-checkbox-list');
        const cancelBtn = document.getElementById('btn-app-dialog-cancel');
        const confirmBtn = document.getElementById('btn-app-dialog-confirm');
        const iconWrap = document.getElementById('app-dialog-icon-wrap');

        if (!modal || !titleEl || !messageEl || !cancelBtn || !confirmBtn) {
            resolve(false);
            return;
        }

        appDialogResolver = resolve;
        appDialogValidate = typeof validate === 'function' ? validate : null;

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

        resetAppDialogCheckboxList();
        if (checkboxListEl && Array.isArray(checkboxItems) && checkboxItems.length) {
            checkboxListEl.classList.remove('hidden');
            checkboxListEl.innerHTML = checkboxItems.map(item => {
                const id = String(item.id);
                const label = String(item.label || id);
                const checked = item.checked !== false;
                return `
                    <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                            value="${escapeHtml(id)}" ${checked ? 'checked' : ''}>
                        <span>${escapeHtml(label)}</span>
                    </label>
                `;
            }).join('');
        }

        if (iconWrap) {
            iconWrap.classList.toggle('hidden', !showIcon);
        }

        applyAppDialogVariant(variant, showIcon);
        if (confirmClass) confirmBtn.className = confirmClass;

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

function selectCheckboxAppDialog(message, checkboxItems, options = {}) {
    return showAppDialog({
        title: options.title || 'Seleção',
        message,
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        variant: options.variant || 'confirm',
        showCancel: true,
        checkboxItems,
        validate: (selectedValues) => {
            if (selectedValues.length) return true;
            alertAppDialog(options.emptyMessage || 'Selecione ao menos um item.');
            return false;
        }
    }).then(result => {
        if (result === false || result == null) return null;
        return Array.isArray(result) ? result : null;
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
window.selectCheckboxAppDialog = selectCheckboxAppDialog;
window.bindAppDialogEvents = bindAppDialogEvents;
