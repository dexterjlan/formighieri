const REQUEST_TYPE_PROJECT = 'project';
const REQUEST_TYPE_DETAILING = 'detailing';

function getRequestType(conv) {
    return conv?.requestType === REQUEST_TYPE_DETAILING
        ? REQUEST_TYPE_DETAILING
        : REQUEST_TYPE_PROJECT;
}

function isDetailingRequest(conv) {
    return getRequestType(conv) === REQUEST_TYPE_DETAILING;
}

function isProjectRequest(conv) {
    return !isDetailingRequest(conv);
}

function formatRequestType(requestType) {
    return requestType === REQUEST_TYPE_DETAILING ? 'Detalhamento' : 'Projeto';
}

function getRequestTypeBadgeHtml(conv) {
    const type = getRequestType(conv);
    const label = formatRequestType(type);
    const badgeClass = typeof getRequestTypeBadgeClass === 'function'
        ? getRequestTypeBadgeClass(type)
        : 'bg-slate-100 text-slate-600';
    return `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${badgeClass}">${escapeHtml(label)}</span>`;
}

function canEditConsultorResponse() {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Consultor';
}

function canEditProjetistaResponse(conv) {
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista' && conv?.designerId === currentUser.id;
}
function isOrderConsultorForRequest(conv) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;
    const order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(item => Number(item.id) === Number(conv?.orderId))
        : null;
    return isCurrentUserOrderConsultor(
        getOrderConsultantNameFromRecord(order) || getOrderConsultantName(conv?.orderId),
        order?.consultantUserId || getOrderConsultantUserId(conv?.orderId)
    );
}

function normalizeRequestStatus(conv) {
    const status = conv?.status;
    if (status === 'Aberto') {
        return conv?.requestProfile === 'Consultor'
            ? 'Aguardando Projetista'
            : 'Aguardando Consultor';
    }
    return status;
}

function getInitialRequestStatus(requestProfile) {
    return requestProfile === 'Consultor'
        ? 'Aguardando Projetista'
        : 'Aguardando Consultor';
}

function isRequestClosed(conv) {
    return normalizeRequestStatus(conv) === 'Encerrado';
}

function isRequestOpen(conv) {
    return !isRequestClosed(conv);
}

function isRequestWaitingConsultor(conv) {
    return normalizeRequestStatus(conv) === 'Aguardando Consultor';
}

function isRequestWaitingProjetista(conv) {
    return normalizeRequestStatus(conv) === 'Aguardando Projetista';
}

const ORDER_REQUEST_FROM_CONFERENCE_TEXT = 'Requisição criada a partir da conferência.';

function isRequestFromConference(conv) {
    if (!conv) return false;
    if (conv.fromConference === 'Y' || conv.fromConference === true) return true;
    return conv.designerRequest === ORDER_REQUEST_FROM_CONFERENCE_TEXT;
}

function getRequestOverdueDays() {
    const days = Number(
        systemSettingsCache?.requestOverdueDays ?? SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays
    );
    return Number.isFinite(days) && days > 0 ? days : SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays;
}

function getApprovalOverdueDays() {
    const days = Number(
        systemSettingsCache?.approvalOverdueDays ?? SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays
    );
    return Number.isFinite(days) && days > 0 ? days : SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays;
}

function getDaysOpenSince(dateStr) {
    if (!dateStr) return 0;
    const created = new Date(dateStr);
    if (Number.isNaN(created.getTime())) return 0;
    return (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
}

function isRequestOverdue(conv) {
    if (isRequestClosed(conv)) return false;
    return getDaysOpenSince(conv?.createdAt) > getRequestOverdueDays();
}

function isApprovalOverdue(approval) {
    if (isCommercialApprovalApproved(approval)) return false;
    return getDaysOpenSince(getCommercialApprovalReferenceDate(approval)) > getApprovalOverdueDays();
}

function getRequestHighlightBgHex(conv) {
    if (isRequestClosed(conv)) {
        return '#bbf7d0';
    }
    if (isRequestOverdue(conv)) {
        return '#fecaca';
    }
    return '#fde68a';
}

function getRequestHighlightBgClass(conv) {
    if (isRequestClosed(conv)) {
        return 'bg-emerald-100 border-emerald-200';
    }
    if (isRequestOverdue(conv)) {
        return 'bg-red-100 border-red-200';
    }
    return 'bg-amber-100 border-amber-200';
}

function sortOrderRequests(convs) {
    return [...convs].sort((a, b) => {
        const aOpen = isRequestOpen(a);
        const bOpen = isRequestOpen(b);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;

        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });
}

function isCommercialApprovalApproved(approval) {
    const status = getApprovalStatusLabel(
        approval?.status || (approval?.approved ? 'Aprovado' : 'Aguardando Aprovação')
    );
    return status === 'Aprovado';
}

function getCommercialApprovalReferenceDate(approval) {
    return approval?.createdAt || approval?.updatedAt || null;
}

function getCommercialApprovalHighlightBgHex(approval) {
    if (isCommercialApprovalApproved(approval)) {
        return '#bbf7d0';
    }
    if (isApprovalOverdue(approval)) {
        return '#fecaca';
    }
    return '#fde68a';
}

function getCommercialApprovalHighlightBgClass(approval) {
    if (isCommercialApprovalApproved(approval)) {
        return 'bg-emerald-100 border-emerald-200';
    }
    if (isApprovalOverdue(approval)) {
        return 'bg-red-100 border-red-200';
    }
    return 'bg-amber-100 border-amber-200';
}

function getRequestResponseSummary(conv) {
    const parts = [];
    if (conv?.commercialResponse) parts.push(`Consultor: ${conv.commercialResponse}`);
    if (conv?.designerResponse) parts.push(`Projetista: ${conv.designerResponse}`);
    return parts.length ? parts.join(' | ') : '-';
}

function getResponseDisplayDate(conv) {
    if (conv.responseAt) return conv.responseAt;
    if (conv.commercialResponse || conv.designerResponse) return conv.updatedAt;
    return null;
}
function formatRequestProfile(profile) {
    return profile || '—';
}

function updateConvRequestLabel(profile) {
    const label = document.getElementById('conv-request-label');
    if (!label) return;
    if (profile === 'Consultor') {
        label.textContent = 'Solicitação do Consultor';
    } else if (profile === 'Projetista') {
        label.textContent = 'Solicitação do Projetista';
    } else {
        label.textContent = 'Solicitação';
    }
}

function setupConvProfileFields(isEdit, conv) {
    const adminWrap = document.getElementById('conv-profile-wrap');
    const profileSelect = document.getElementById('conv-profile');
    const readOnlyWrap = document.getElementById('conv-profile-readonly-wrap');
    const readOnlyLabel = document.getElementById('conv-profile-readonly-label');
    const canSeeProfile = canSeeRequestProfileField();

    adminWrap.classList.add('hidden');
    readOnlyWrap.classList.add('hidden');
    profileSelect.required = false;
    profileSelect.onchange = null;

    if (isEdit) {
        if (canSeeProfile) {
            readOnlyWrap.classList.remove('hidden');
            readOnlyLabel.textContent = formatRequestProfile(conv?.requestProfile);
        }
        updateConvRequestLabel(conv?.requestProfile);
        return;
    }

    const forceProjetista = typeof isConvModalDetailingContext === 'function'
        && isConvModalDetailingContext();

    if (forceProjetista) {
        if (canSeeProfile) {
            readOnlyWrap.classList.remove('hidden');
            readOnlyLabel.textContent = formatRequestProfile('Projetista');
        }
        updateConvRequestLabel('Projetista');
        return;
    }

    if (currentUser.role === 'Admin') {
        adminWrap.classList.remove('hidden');
        profileSelect.required = true;
        profileSelect.value = '';
        updateConvRequestLabel('');
        profileSelect.onchange = () => {
            updateConvRequestLabel(profileSelect.value);
            if (typeof applyConvDesignerFromSelectedProject === 'function') {
                applyConvDesignerFromSelectedProject();
            }
        };
        return;
    }

    updateConvRequestLabel(currentUser.role);
}

function getRequestProfileForCreate() {
    if (typeof isConvModalDetailingContext === 'function' && isConvModalDetailingContext()) {
        return 'Projetista';
    }
    if (currentUser.role === 'Admin') {
        return document.getElementById('conv-profile').value.trim();
    }
    if (currentUser.role === 'Consultor' || currentUser.role === 'Projetista') {
        return currentUser.role;
    }
    return '';
}
