function isAdmin() {
    return currentUser?.role === 'Admin';
}

function normalizeAppUserProfile(profile) {
    if (!profile) return profile;
    return {
        ...profile,
        isActive: profile.isActive !== false,
        isConferenceReviewer: Boolean(profile.isConferenceReviewer),
        isCommercialManager: Boolean(profile.isCommercialManager),
        isProjectsManager: Boolean(profile.isProjectsManager),
        isPpcp: Boolean(profile.isPpcp),
        isFactoryManager: Boolean(profile.isFactoryManager),
        isDetailing: Boolean(profile.isDetailing),
        isReviewer: Boolean(profile.isReviewer ?? profile.isProjectLeader)
    };
}

function isConferente(user = currentUser) {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return Boolean(user.isConferenceReviewer);
}

function isGestorComercial(user = currentUser) {
    return (user?.role === 'Admin' || user?.role === 'Consultor') && Boolean(user?.isCommercialManager);
}

function isGestorProjetos(user = currentUser) {
    return (user?.role === 'Admin' || user?.role === 'Projetista') && Boolean(user?.isProjectsManager);
}

function isPpcp(user = currentUser) {
    return user?.role === 'Projetista' && Boolean(user?.isPpcp);
}

function isReviewer(user = currentUser) {
    return user?.role === 'Projetista' && Boolean(user?.isReviewer ?? user?.isProjectLeader);
}

function isDetalhamento(user = currentUser) {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return user.role === 'Projetista' && Boolean(user.isDetailing);
}

function isGestorFabrica(user = currentUser) {
    return user?.role === 'Marceneiro' && Boolean(user?.isFactoryManager);
}

function canSeeRequestProfileField(user = currentUser) {
    return user?.role === 'Admin'
        || isGestorComercial(user)
        || isGestorProjetos(user);
}

function syncRequestProfileColumnVisibility() {
    const show = canSeeRequestProfileField();
    document.querySelectorAll('.conv-query-profile-col').forEach(el => {
        el.classList.toggle('hidden', !show);
    });
}

function isMarceneiro(user = currentUser) {
    return user?.role === 'Marceneiro';
}

function isCompras(user = currentUser) {
    return user?.role === 'Compras';
}

function canSeePendenciasComprasMenu(user = currentUser) {
    return isAdmin() || isCompras(user);
}

function canActPendenciasCompras(user = currentUser) {
    return isCompras(user);
}

function canSeeOrderComprasTab(user = currentUser) {
    if (!user) return false;
    return isAdmin()
        || isCompras(user)
        || isGestorComercial(user)
        || isGestorFabrica(user);
}

function canSeeCompraModal(user = currentUser) {
    return canSeeOrderComprasTab(user);
}

function canActCompraModal(user = currentUser) {
    return isCompras(user);
}

function canSeeQueryNav(user = currentUser) {
    if (typeof QUERY_NAV_ENABLED !== 'undefined' && !QUERY_NAV_ENABLED) return false;
    return !isMarceneiro(user) && !isCompras(user);
}

function canAccessGestao(user = currentUser) {
    return user?.role === 'Admin'
        || isGestorComercial(user)
        || isGestorProjetos(user)
        || isGestorFabrica(user);
}

function canAccessMontagemProgramacao(user = currentUser) {
    return isAdmin(user) || isGestorProjetos(user);
}

function canViewProjectScheduling(user = currentUser) {
    return Boolean(user);
}

function canEditProjectScheduling(user = currentUser) {
    return canAccessGestao(user);
}

function canViewProgramacaoMontagem(user = currentUser) {
    return Boolean(user);
}

function canEditProgramacaoMontagem(user = currentUser) {
    return canAccessMontagemProgramacao(user);
}

function canAccessCalendar(user = currentUser) {
    if (!user) return false;
    return isAdmin(user)
        || user.role === 'Consultor'
        || isConferente(user)
        || isGestorComercial(user)
        || isGestorProjetos(user)
        || isGestorFabrica(user);
}

function canAccessGoogleCalendar(user = currentUser) {
    return canAccessCalendar(user);
}

function canSeeOrderMedicaoTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || isConferente(user) || isGestorComercial(user);
}

function canSeeOrderPpcpTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || isPpcp(user);
}

function canSeeOrderNomearTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || user.role === 'Projetista';
}

const ORDER_DETAIL_TAB_RESPONSIBLE_LABELS = {
    requests: 'Consultor, Projetista ou Admin',
    anteprojeto: 'Conferente ou Admin',
    medicao: 'Conferente ou Admin',
    fabrica: 'Gestor de Fábrica ou Admin',
    compras: 'Equipe de Compras'
};

function getOrderDetailTabResponsibleLabel(tabKey) {
    return ORDER_DETAIL_TAB_RESPONSIBLE_LABELS[tabKey] || 'o responsável';
}

function canActOrderDetailTab(tabKey, user = currentUser) {
    if (!user) return false;
    if (isAdmin(user)) return true;

    switch (tabKey) {
        case 'requests':
            return user.role === 'Consultor' || user.role === 'Projetista';
        case 'anteprojeto':
        case 'medicao':
            return isConferente(user) || isGestorComercial(user);
        case 'fabrica':
            return isGestorFabrica(user);
        case 'compras':
            return isCompras(user);
        default:
            return false;
    }
}

function canActOrderProjectNomear(project, user = currentUser) {
    if (!user || !project) return false;
    return user.role === 'Projetista'
        && Number(project.designerId) === Number(user.id);
}

function canCreateAsAdminOrConferente() {
    return isAdmin() || isConferente();
}
