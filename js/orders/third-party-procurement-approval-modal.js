let thirdPartyProcurementApprovalModalResolver = null;
let thirdPartyProcurementApprovalModalContext = null;
let thirdPartyProcurementApprovalModalEventsBound = false;

const THIRD_PARTY_PROCUREMENT_APPROVAL_MODAL_OVERLAY = typeof createModalOverlayConfig === 'function'
    ? createModalOverlayConfig('third-party-procurement-approval-modal', {
        disableElementIds: [
            'btn-confirm-third-party-procurement-approval',
            'btn-cancel-third-party-procurement-approval',
            'btn-close-third-party-procurement-approval'
        ],
        closeButtonSelector: '#btn-close-third-party-procurement-approval'
    })
    : null;

function setThirdPartyProcurementApprovalModalLoading(active, message = 'Processando...', status = 'loading') {
    if (!THIRD_PARTY_PROCUREMENT_APPROVAL_MODAL_OVERLAY
        || typeof setModalOverlayLoading !== 'function') {
        return;
    }
    setModalOverlayLoading(
        THIRD_PARTY_PROCUREMENT_APPROVAL_MODAL_OVERLAY,
        active,
        message,
        status
    );
}

function waitThirdPartyProcurementApprovalModalStatus(ms = 1200) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function closeThirdPartyProcurementApprovalModal(confirmed = false) {
    setThirdPartyProcurementApprovalModalLoading(false);
    toggleModal('third-party-procurement-approval-modal', false);
    const resolver = thirdPartyProcurementApprovalModalResolver;
    thirdPartyProcurementApprovalModalResolver = null;
    thirdPartyProcurementApprovalModalContext = null;
    if (resolver) {
        resolver(Boolean(confirmed));
    }
}

function renderThirdPartyProcurementApprovalModalList(subtypes = [], existingSubtypeIds = new Set()) {
    const list = document.getElementById('third-party-procurement-approval-list');
    if (!list) return;

    if (!subtypes.length) {
        list.innerHTML = '<p class="text-xs text-slate-400">Nenhum subtipo de terceiros para exibir neste ambiente.</p>';
        return;
    }

    const existingNames = subtypes
        .filter(subtype => existingSubtypeIds.has(Number(subtype.id)))
        .map(subtype => subtype.name)
        .filter(Boolean);

    const existingSummary = existingNames.length
        ? `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ${existingNames.length === 1
        ? `O subtipo <strong>${escapeHtml(existingNames[0])}</strong> já possui projeto neste ambiente.`
        : `Os subtipos <strong>${escapeHtml(existingNames.join(', '))}</strong> já possuem projeto neste ambiente.`}
        </p>`
        : '';

    const hasCreatableWithCharacteristic = subtypes.some(subtype => {
        const subtypeId = Number(subtype.id);
        const requiresCommercial = typeof isThirdPartySubtypeCommercialApprovalRequired === 'function'
            && isThirdPartySubtypeCommercialApprovalRequired(subtype);
        return requiresCommercial && !existingSubtypeIds.has(subtypeId);
    });

    const commercialNotice = hasCreatableWithCharacteristic
        ? `<p class="text-xs text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-3">
            Subtipos com característica associada (ex.: Serralheria, Estofado) seguem aprovação pelo consultor comercial após a criação.
        </p>`
        : '';

    const itemsHtml = subtypes.map(subtype => {
        const subtypeId = Number(subtype.id);
        const exists = existingSubtypeIds.has(subtypeId);
        const requiresCommercial = typeof isThirdPartySubtypeCommercialApprovalRequired === 'function'
            && isThirdPartySubtypeCommercialApprovalRequired(subtype);

        if (exists) {
            const existsHint = requiresCommercial
                ? 'Já existe · fluxo com consultor'
                : 'Já existe';
            return `
                <li class="flex items-start gap-3 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50/80">
                    <span class="mt-0.5 text-slate-400" aria-hidden="true">✓</span>
                    <div class="min-w-0 flex-1">
                        <span class="text-sm font-medium text-slate-700">${escapeHtml(subtype.name || 'Subtipo')}</span>
                        <span class="block text-[10px] text-slate-500 mt-0.5">${escapeHtml(existsHint)}</span>
                    </div>
                </li>
            `;
        }

        const createHint = requiresCommercial
            ? 'Criar projeto · aprovação pelo consultor comercial'
            : 'Criar projeto de terceiros';

        return `
            <li class="flex items-start gap-3 border border-slate-200 rounded-lg px-3 py-2.5 bg-white">
                <input type="checkbox"
                    class="third-party-procurement-subtype-check mt-1 rounded border-slate-300 text-violet-700 focus:ring-violet-500"
                    value="${subtypeId}"
                    id="third-party-procurement-subtype-${subtypeId}">
                <label for="third-party-procurement-subtype-${subtypeId}" class="min-w-0 flex-1 cursor-pointer">
                    <span class="text-sm font-medium text-slate-800">${escapeHtml(subtype.name || 'Subtipo')}</span>
                    <span class="block text-[10px] text-slate-500 mt-0.5">${escapeHtml(createHint)}</span>
                </label>
            </li>
        `;
    }).filter(Boolean).join('');

    list.innerHTML = `${commercialNotice}${existingSummary}<ul class="space-y-2">${itemsHtml}</ul>`;
}

function getSelectedThirdPartyProcurementSubtypeIds() {
    const modal = document.getElementById('third-party-procurement-approval-modal');
    const root = modal || document;
    return [...root.querySelectorAll('.third-party-procurement-subtype-check:checked')]
        .map(input => Number(input.value))
        .filter(Boolean);
}

async function openThirdPartyProcurementApprovalModal(options = {}) {
    const {
        orderId,
        orderProjectId,
        designerId,
        projectName = 'Projeto'
    } = options;

    toggleModal('third-party-procurement-approval-modal', true);
    setThirdPartyProcurementApprovalModalLoading(true, 'Carregando subtipos de terceiros...');

    let selection;
    try {
        selection = typeof fetchThirdPartyProcurementSubtypeSelection === 'function'
            ? await fetchThirdPartyProcurementSubtypeSelection(orderProjectId)
            : { subtypes: [], existingProjects: [], existingSubtypeIds: new Set() };
    } catch (error) {
        setThirdPartyProcurementApprovalModalLoading(
            true,
            error.message || 'Erro ao carregar subtipos.',
            'error'
        );
        await waitThirdPartyProcurementApprovalModalStatus();
        setThirdPartyProcurementApprovalModalLoading(false);
        toggleModal('third-party-procurement-approval-modal', false);
        alertAppDialog(error.message || 'Erro ao carregar subtipos de terceiros.');
        return false;
    }

    const hasModalContent = selection.subtypes.length > 0
        || (selection.existingProjects?.length > 0);

    if (!hasModalContent) {
        setThirdPartyProcurementApprovalModalLoading(false);
        toggleModal('third-party-procurement-approval-modal', false);
        return true;
    }

    return new Promise(resolve => {
        thirdPartyProcurementApprovalModalResolver = resolve;
        thirdPartyProcurementApprovalModalContext = {
            orderId: Number(orderId),
            orderProjectId: Number(orderProjectId),
            designerId: Number(designerId) || null,
            projectName
        };

        const title = document.getElementById('third-party-procurement-approval-title');
        const subtitle = document.getElementById('third-party-procurement-approval-subtitle');
        if (title) {
            title.textContent = 'Projetos de terceiros';
        }
        if (subtitle) {
            subtitle.textContent = `Ambiente: ${projectName}. Escolha os subtipos para criar antes de enviar à aprovação comercial.`;
        }

        renderThirdPartyProcurementApprovalModalList(
            selection.subtypes,
            selection.existingSubtypeIds
        );

        setThirdPartyProcurementApprovalModalLoading(false);
    });
}

async function confirmThirdPartyProcurementApprovalModal() {
    const ctx = thirdPartyProcurementApprovalModalContext;
    if (!ctx?.orderProjectId) {
        closeThirdPartyProcurementApprovalModal(false);
        return;
    }

    const selectedSubtypeIds = [...new Set(getSelectedThirdPartyProcurementSubtypeIds())];

    try {
        if (selectedSubtypeIds.length) {
            if (typeof createThirdPartyProjectsForSelectedSubtypes !== 'function') {
                throw new Error('Não foi possível criar os projetos de terceiros selecionados.');
            }
            setThirdPartyProcurementApprovalModalLoading(true, 'Criando projetos de terceiros...');
            const result = await createThirdPartyProjectsForSelectedSubtypes({
                orderId: ctx.orderId,
                orderProjectId: ctx.orderProjectId,
                designerId: ctx.designerId,
                thirdPartySubtypeIds: selectedSubtypeIds,
                onProgress: message => {
                    if (message) {
                        setThirdPartyProcurementApprovalModalLoading(true, message);
                    }
                }
            });
            if (result.created?.length) {
                setThirdPartyProcurementApprovalModalLoading(
                    true,
                    `${result.created.length} projeto(s) criado(s).`,
                    'success'
                );
                await waitThirdPartyProcurementApprovalModalStatus(800);
                if (typeof showThirdPartyProjectsCreatedModal === 'function') {
                    showThirdPartyProjectsCreatedModal(result.created);
                }
            } else {
                setThirdPartyProcurementApprovalModalLoading(true, 'Nenhum projeto novo para criar.');
                await waitThirdPartyProcurementApprovalModalStatus(600);
            }
        } else {
            setThirdPartyProcurementApprovalModalLoading(true, 'Preparando envio para aprovação...');
            await waitThirdPartyProcurementApprovalModalStatus(400);
        }
        setThirdPartyProcurementApprovalModalLoading(false);
        closeThirdPartyProcurementApprovalModal(true);
    } catch (error) {
        const message = error.message || 'Erro ao criar projetos de terceiros.';
        setThirdPartyProcurementApprovalModalLoading(true, message, 'error');
        await waitThirdPartyProcurementApprovalModalStatus(1600);
        setThirdPartyProcurementApprovalModalLoading(false);
        alertAppDialog(message);
    }
}

async function runThirdPartyProcurementGateBeforeCommercialApproval(project) {
    if (!project?.id) {
        return false;
    }

    const selection = typeof fetchThirdPartyProcurementSubtypeSelection === 'function'
        ? await fetchThirdPartyProcurementSubtypeSelection(project.id)
        : { subtypes: [] };

    const hasModalContent = selection.subtypes.length > 0
        || selection.existingProjects.length > 0;

    if (!hasModalContent) {
        return confirmAppDialog(
            'O projeto será enviado para análise do consultor do pedido.',
            {
                title: `Enviar "${project.name || 'Projeto'}" para aprovação?`,
                confirmLabel: 'Enviar para aprovação'
            }
        );
    }

    if (typeof openThirdPartyProcurementApprovalModal !== 'function') {
        return true;
    }

    const confirmed = await openThirdPartyProcurementApprovalModal({
        orderId: project.orderId,
        orderProjectId: project.id,
        designerId: project.designerId,
        projectName: project.name || 'Projeto'
    });

    return Boolean(confirmed);
}

function bindThirdPartyProcurementApprovalModalEvents() {
    if (thirdPartyProcurementApprovalModalEventsBound) return;
    thirdPartyProcurementApprovalModalEventsBound = true;

    document.getElementById('btn-close-third-party-procurement-approval')?.addEventListener('click', () => {
        closeThirdPartyProcurementApprovalModal(false);
    });
    document.getElementById('btn-cancel-third-party-procurement-approval')?.addEventListener('click', () => {
        closeThirdPartyProcurementApprovalModal(false);
    });
    document.getElementById('btn-confirm-third-party-procurement-approval')?.addEventListener('click', () => {
        confirmThirdPartyProcurementApprovalModal();
    });
}

window.runThirdPartyProcurementGateBeforeCommercialApproval = runThirdPartyProcurementGateBeforeCommercialApproval;
window.bindThirdPartyProcurementApprovalModalEvents = bindThirdPartyProcurementApprovalModalEvents;
