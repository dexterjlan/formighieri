let activeThirdPartyProjectObservationId = null;

function canEditThirdPartyProjectObservation() {
    return Boolean(currentUser);
}

async function openThirdPartyProjectObservationModal(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) return;

    let project = null;
    if (typeof fetchThirdPartyProjectById === 'function') {
        project = await fetchThirdPartyProjectById(projectId);
    }
    if (!project) {
        project = orderThirdPartyProjectsCache?.find(item => Number(item.id) === projectId)
            || pendenciasThirdPartyProjectsCache?.find(item => Number(item.id) === projectId);
    }
    if (!project) {
        alertAppDialog('Projeto de terceiros não encontrado.');
        return;
    }

    activeThirdPartyProjectObservationId = projectId;

    const titleEl = document.getElementById('third-party-project-observation-title');
    const subtitleEl = document.getElementById('third-party-project-observation-subtitle');
    const inputEl = document.getElementById('third-party-project-observation-input');
    const saveBtn = document.getElementById('btn-save-third-party-project-observation');

    if (titleEl) {
        titleEl.textContent = typeof getThirdPartyProjectLabel === 'function'
            ? getThirdPartyProjectLabel(project)
            : 'Observação do projeto';
    }
    if (subtitleEl) {
        const orderCode = project.order?.orderCode || '—';
        const clientName = typeof getOrderClientName === 'function'
            ? (getOrderClientName(project.order) || '—')
            : '—';
        subtitleEl.textContent = `Pedido ${orderCode} · ${clientName}`;
    }
    if (inputEl) {
        inputEl.value = project.projectObservation || '';
        inputEl.disabled = !canEditThirdPartyProjectObservation();
    }
    if (saveBtn) {
        saveBtn.classList.toggle('hidden', !canEditThirdPartyProjectObservation());
    }

    toggleModal('third-party-project-observation-modal', true);
    inputEl?.focus();
}

function closeThirdPartyProjectObservationModal() {
    activeThirdPartyProjectObservationId = null;
    toggleModal('third-party-project-observation-modal', false);
}

async function saveThirdPartyProjectObservationFromModal() {
    const projectId = Number(activeThirdPartyProjectObservationId);
    if (!projectId) return;

    const inputEl = document.getElementById('third-party-project-observation-input');
    const value = inputEl?.value ?? '';

    if (typeof setThirdPartyProjectActionLoading === 'function') {
        setThirdPartyProjectActionLoading(true, 'Salvando observação...');
    }

    try {
        await saveThirdPartyProjectObservation(projectId, value);

        const patch = { projectObservation: String(value || '').trim() || null };
        const orderCache = orderThirdPartyProjectsCache?.find(item => Number(item.id) === projectId);
        if (orderCache) Object.assign(orderCache, patch);
        const pendenciasCache = pendenciasThirdPartyProjectsCache?.find(item => Number(item.id) === projectId);
        if (pendenciasCache) Object.assign(pendenciasCache, patch);

        if (typeof refreshThirdPartyProjectViews === 'function') {
            await refreshThirdPartyProjectViews();
        }
        if (typeof activeCompraRecord !== 'undefined'
            && activeCompraRecord
            && Number(activeCompraRecord.thirdPartyProjectId) === projectId) {
            activeCompraRecord.projectObservation = patch.projectObservation || '';
            if (typeof populateCompraForm === 'function') {
                populateCompraForm(activeCompraRecord);
            }
        }

        closeThirdPartyProjectObservationModal();
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível salvar a observação.');
    } finally {
        if (typeof setThirdPartyProjectActionLoading === 'function') {
            setThirdPartyProjectActionLoading(false);
        }
    }
}

function bindThirdPartyProjectObservationEvents() {
    document.getElementById('btn-close-third-party-project-observation')?.addEventListener('click', closeThirdPartyProjectObservationModal);
    document.getElementById('btn-close-third-party-project-observation-footer')?.addEventListener('click', closeThirdPartyProjectObservationModal);
    document.getElementById('btn-cancel-third-party-project-observation')?.addEventListener('click', closeThirdPartyProjectObservationModal);
    document.getElementById('btn-save-third-party-project-observation')?.addEventListener('click', saveThirdPartyProjectObservationFromModal);
}

window.openThirdPartyProjectObservationModal = openThirdPartyProjectObservationModal;
