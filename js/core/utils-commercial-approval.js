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
function getApprovalStatusLabel(status) {
    return status || 'Aguardando Aprovação';
}

function getCommercialApprovalProjectName(approval) {
    return approval?.orderProject?.name || '';
}
