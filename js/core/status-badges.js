const ORDER_PROJECT_STATUS_BADGE_CLASSES = {
    'Aguardando Aprovação': 'bg-amber-100 text-amber-800',
    'Em Revisão Comercial Cons.': 'bg-sky-100 text-sky-800',
    'Em Revisão Comercial Proj.': 'bg-sky-100 text-sky-800',
    'Em Revisão Comercial': 'bg-sky-100 text-sky-800',
    'Em Revisão Técnica': 'bg-sky-100 text-sky-800',
    'Em Revisão Técnica Revisor': 'bg-teal-100 text-teal-800',
    'Em Revisão Técnica Proj.': 'bg-cyan-100 text-cyan-800',
    'Em Revisão': 'bg-sky-100 text-sky-800',
    'Em revisão': 'bg-sky-100 text-sky-800',
    'Projeto Técnico': 'bg-violet-100 text-violet-800',
    'Aguardando Projeto Técnico': 'bg-indigo-100 text-indigo-800',
    'Vendido': 'bg-emerald-100 text-emerald-800',
    'Aguardando Obra': 'bg-orange-100 text-orange-800',
    'Aguardando Medição': 'bg-cyan-100 text-cyan-800',
    'Conferência Realizada': 'bg-teal-100 text-teal-800',
    'Conferência Enviada': 'bg-sky-100 text-sky-800',
    'Medição Realizada': 'bg-teal-100 text-teal-800',
    'Planta Levantada': 'bg-lime-100 text-lime-800',
    'Nomear': 'bg-purple-100 text-purple-800',
    'Aguardando PPCP': 'bg-fuchsia-100 text-fuchsia-800',
    'Implantação': 'bg-teal-100 text-teal-800',
    'Detalhamento': 'bg-indigo-100 text-indigo-800',
    'Aguardando Detalhamento': 'bg-indigo-100 text-indigo-800',
    'Em Produção': 'bg-orange-100 text-orange-800',
    'Montagem Interna': 'bg-amber-100 text-amber-800',
    'Montagem Externa': 'bg-purple-100 text-purple-800',
    'Aguardando Entrega Técnica': 'bg-sky-100 text-sky-800',
    'Entregue': 'bg-emerald-100 text-emerald-800',
    'Expedição': 'bg-slate-200 text-slate-800',
    'Projeto Substituído': 'bg-rose-100 text-rose-800'
};

const APPROVAL_STATUS_BADGE_CLASSES = {
    'Aprovado': 'bg-emerald-100 text-emerald-800',
    'Em revisão': 'bg-sky-100 text-sky-800'
};

const REQUEST_STATUS_BADGE_CLASSES = {
    'Encerrado': 'bg-slate-100 text-slate-600',
    'Aguardando Consultor': 'bg-amber-100 text-amber-800',
    'Aguardando Projetista': 'bg-sky-100 text-sky-800'
};

const REQUEST_PROFILE_BADGE_CLASSES = {
    'Projetista': 'bg-sky-100 text-sky-800',
    'Consultor': 'bg-amber-100 text-amber-800'
};

const DETALHAMENTO_STATUS_BADGE_CLASSES = {
    'Pronto': 'bg-emerald-100 text-emerald-800',
    'Detalhamento': 'bg-violet-100 text-violet-800'
};

const IMPLANTACAO_STATUS_BADGE_CLASSES = {
    'Enviado para Produção': 'bg-violet-100 text-violet-800',
    'Encerrado': 'bg-slate-200 text-slate-700'
};

const THIRD_PARTY_PROJECT_STATUS_BADGE_CLASSES = {
    Open: 'bg-slate-100 text-slate-700',
    Sent: 'bg-sky-100 text-sky-800',
    InReview: 'bg-amber-100 text-amber-800',
    Approved: 'bg-emerald-100 text-emerald-800'
};

const PURCHASE_STATUS_BADGE_CLASSES = {
    'Aberto': 'bg-amber-100 text-amber-800',
    'Orçado': 'bg-sky-100 text-sky-800',
    'Aguardando Entrega': 'bg-violet-100 text-violet-800',
    'Ag. Lib. de Medição - Obra': 'bg-orange-100 text-orange-800',
    'Ag. Lib. de Medição - Fábrica': 'bg-cyan-100 text-cyan-800',
    'Fechado': 'bg-slate-200 text-slate-700'
};

function getStatusBadgeClass(statusName, classMap, fallback = 'bg-slate-100 text-slate-700') {
    if (!statusName || statusName === '—') return 'bg-slate-100 text-slate-600';
    return classMap[statusName] || fallback;
}

function getOrderProjectStatusBadgeClass(statusName) {
    return getStatusBadgeClass(statusName, ORDER_PROJECT_STATUS_BADGE_CLASSES);
}

function getPendenciasProjectStatusBadgeClass(statusName) {
    return getOrderProjectStatusBadgeClass(statusName);
}

function getApprovalStatusBadgeClass(status) {
    return getStatusBadgeClass(status, APPROVAL_STATUS_BADGE_CLASSES, 'bg-amber-100 text-amber-800');
}

function getRequestStatusBadgeClass(status) {
    const normalized = status === 'Aberto' ? 'Aguardando Consultor' : status;
    return getStatusBadgeClass(normalized, REQUEST_STATUS_BADGE_CLASSES, 'bg-amber-100 text-amber-800');
}

function getRequestProfileBadgeClass(profile) {
    return getStatusBadgeClass(profile, REQUEST_PROFILE_BADGE_CLASSES, 'bg-slate-100 text-slate-600');
}

function getDetalhamentoStatusBadgeClass(status) {
    return getStatusBadgeClass(status, DETALHAMENTO_STATUS_BADGE_CLASSES, 'bg-amber-100 text-amber-800');
}

function getImplantacaoStatusBadgeClass(status) {
    return getStatusBadgeClass(status, IMPLANTACAO_STATUS_BADGE_CLASSES, 'bg-teal-100 text-teal-800');
}

function getThirdPartyProjectStatusBadgeClass(status) {
    return getStatusBadgeClass(status, THIRD_PARTY_PROJECT_STATUS_BADGE_CLASSES, 'bg-slate-100 text-slate-700');
}

function getCompraStatusBadgeClass(status) {
    return getStatusBadgeClass(status, PURCHASE_STATUS_BADGE_CLASSES);
}
