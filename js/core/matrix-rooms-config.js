/**
 * Salas oficiais Element/Matrix do Formighieri.
 * Chaves em inglês (código); labels em português (UI).
 */
const MATRIX_ROOM_DEFINITIONS = [
    {
        key: 'commercial',
        label: 'Comercial',
        roomAlias: '#formighieri_comercial:matrix.org'
    },
    {
        key: 'projects',
        label: 'Projetos',
        roomAlias: '#formighieri_projetos:matrix.org'
    },
    {
        key: 'detailing',
        label: 'Detalhamento',
        roomAlias: '#formighieri_detalhamento:matrix.org'
    },
    {
        key: 'furniture',
        label: 'Móveis',
        roomAlias: '#formighieri_moveis:matrix.org',
        /** O bot do FGP não deve publicar nesta sala (uso legado / referência apenas). */
        botPostingDisabled: true
    },
    {
        key: 'revisions',
        label: 'Revisões',
        roomAlias: '#formighieri_revisoes:matrix.org'
    },
    {
        key: 'routes',
        label: 'Rotas',
        roomAlias: '#formighieri_rotas:matrix.org'
    },
    {
        key: 'externalAssemblyInspection',
        label: 'Vistoria',
        roomAlias: '#formighieri_vistoria:matrix.org'
    }
];

const MATRIX_ROOMS_BY_KEY = Object.fromEntries(
    MATRIX_ROOM_DEFINITIONS.map(definition => [definition.key, definition])
);

function getMatrixRoomDefinition(roomKey) {
    const key = String(roomKey || '').trim();
    if (!key) return null;
    return MATRIX_ROOMS_BY_KEY[key] || null;
}

function getMatrixRoomAlias(roomKey) {
    return getMatrixRoomDefinition(roomKey)?.roomAlias || '';
}

function getMatrixRoomLabel(roomKey) {
    return getMatrixRoomDefinition(roomKey)?.label || '';
}

function isMatrixFurnitureRoomAlias(roomIdOrAlias) {
    const value = String(roomIdOrAlias || '').trim().toLowerCase();
    if (!value) return false;
    const furnitureAlias = String(getMatrixRoomAlias('furniture') || '').trim().toLowerCase();
    if (furnitureAlias && value === furnitureAlias) return true;
    return value.includes('formighieri_moveis');
}

/** Bloqueia envio automático do FGP para a sala Móveis (compras/WPS usam DM). */
function isMatrixRoomPostingBlockedForBot(roomIdOrAlias) {
    if (isMatrixFurnitureRoomAlias(roomIdOrAlias)) return true;
    const definition = typeof MATRIX_ROOM_DEFINITIONS !== 'undefined'
        ? MATRIX_ROOM_DEFINITIONS.find(
            item => String(item.roomAlias || '').trim().toLowerCase() === String(roomIdOrAlias || '').trim().toLowerCase()
        )
        : null;
    return Boolean(definition?.botPostingDisabled);
}

const MATRIX_COMMERCIAL_ROOM_ALIAS = getMatrixRoomAlias('commercial');
const MATRIX_PROJECTS_ROOM_ALIAS = getMatrixRoomAlias('projects');
const MATRIX_DETAILING_ROOM_ALIAS = getMatrixRoomAlias('detailing');
const MATRIX_FURNITURE_ROOM_ALIAS = getMatrixRoomAlias('furniture');
const MATRIX_REVISIONS_ROOM_ALIAS = getMatrixRoomAlias('revisions');
const MATRIX_ROUTES_ROOM_ALIAS = getMatrixRoomAlias('routes');

window.MATRIX_ROOM_DEFINITIONS = MATRIX_ROOM_DEFINITIONS;
window.MATRIX_ROOMS_BY_KEY = MATRIX_ROOMS_BY_KEY;
window.getMatrixRoomDefinition = getMatrixRoomDefinition;
window.getMatrixRoomAlias = getMatrixRoomAlias;
window.getMatrixRoomLabel = getMatrixRoomLabel;
window.isMatrixFurnitureRoomAlias = isMatrixFurnitureRoomAlias;
window.isMatrixRoomPostingBlockedForBot = isMatrixRoomPostingBlockedForBot;
window.MATRIX_COMMERCIAL_ROOM_ALIAS = MATRIX_COMMERCIAL_ROOM_ALIAS;
window.MATRIX_PROJECTS_ROOM_ALIAS = MATRIX_PROJECTS_ROOM_ALIAS;
window.MATRIX_DETAILING_ROOM_ALIAS = MATRIX_DETAILING_ROOM_ALIAS;
window.MATRIX_FURNITURE_ROOM_ALIAS = MATRIX_FURNITURE_ROOM_ALIAS;
window.MATRIX_REVISIONS_ROOM_ALIAS = MATRIX_REVISIONS_ROOM_ALIAS;
window.MATRIX_ROUTES_ROOM_ALIAS = MATRIX_ROUTES_ROOM_ALIAS;
