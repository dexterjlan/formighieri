const SALES_ORDER_CLIENT_REL = 'client:Client(id, name, isActive)';
const SALES_ORDER_CONSULTANT_REL = 'consultor:appUsers!consultantUserId(id, name)';
const SALES_ORDER_RELATIONS_SELECT = `${SALES_ORDER_CLIENT_REL}, ${SALES_ORDER_CONSULTANT_REL}`;
const SALES_ORDER_EMBED_MINIMAL = 'id, orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name)';

const ORDER_PROJECT_STATUS_EMBED = 'projectStatus:OrderProjectStatus(id, name)';
const ORDER_PROJECT_DESIGNER_EMBED = 'designer:appUsers!OrderProject_designerId_fkey(id, name)';
const ORDER_PROJECT_CABINET_MAKER_EMBED = 'cabinetMaker:CabinetMaker(id, name)';
const ORDER_PROJECT_MINIMAL_EMBED = 'orderProject:OrderProject(id, name, projectCode)';

function getSalesOrderEmbedSelect(extraFields = '') {
    const base = extraFields ? `${extraFields}, ` : '';
    return `${base}${SALES_ORDER_RELATIONS_SELECT}`;
}

function getSalesOrderMinimalEmbedSelect(extraFields = '') {
    if (!extraFields) return SALES_ORDER_EMBED_MINIMAL;
    return `${extraFields}, ${SALES_ORDER_EMBED_MINIMAL}`;
}

function getOrderSalesOrderEmbed(extraFields = '') {
    return `order:salesOrders(${getSalesOrderMinimalEmbedSelect(extraFields)})`;
}

function getPendenciasProjectSelect(options = {}) {
    const {
        includeStatus = true,
        includeDesigner = true,
        includeAwaitingConstructionNote = true
    } = options;

    const fields = [
        'id',
        'orderId',
        'projectCode',
        'name',
        'designerId',
        'statusId',
        'deliveryDate',
        'deliveryPhaseId',
        'technicalProjectForecastStartDate',
        'technicalProjectForecastEndDate'
    ];

    if (includeAwaitingConstructionNote) {
        fields.push('awaitingConstructionNote');
    }

    const embeds = [getOrderSalesOrderEmbed()];
    if (includeDesigner) embeds.push(ORDER_PROJECT_DESIGNER_EMBED);
    if (includeStatus) embeds.push(ORDER_PROJECT_STATUS_EMBED);

    return `${fields.join(', ')},\n    ${embeds.join(',\n    ')}`;
}

function getPendenciasFabricaProjectSelect(options = {}) {
    const { includeStatus = true, includeCabinetMaker = true } = options;

    const fields = [
        'id',
        'orderId',
        'projectCode',
        'name',
        'statusId',
        'deliveryDate',
        'cabinetMakerId',
        'internalAssemblyStartDate',
        'internalAssemblyEndDate'
    ];

    const embeds = [getOrderSalesOrderEmbed()];
    if (includeStatus) embeds.push(ORDER_PROJECT_STATUS_EMBED);
    if (includeCabinetMaker) embeds.push(ORDER_PROJECT_CABINET_MAKER_EMBED);

    return `${fields.join(', ')},\n    ${embeds.join(',\n    ')}`;
}
