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
        roomAlias: '#formighieri_moveis:matrix.org'
    },
    {
        key: 'revisions',
        label: 'Revisões',
        roomAlias: '#formighieri_revisoes:matrix.org'
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

const MATRIX_COMMERCIAL_ROOM_ALIAS = getMatrixRoomAlias('commercial');
const MATRIX_PROJECTS_ROOM_ALIAS = getMatrixRoomAlias('projects');
const MATRIX_DETAILING_ROOM_ALIAS = getMatrixRoomAlias('detailing');
const MATRIX_FURNITURE_ROOM_ALIAS = getMatrixRoomAlias('furniture');
const MATRIX_REVISIONS_ROOM_ALIAS = getMatrixRoomAlias('revisions');

window.MATRIX_ROOM_DEFINITIONS = MATRIX_ROOM_DEFINITIONS;
window.MATRIX_ROOMS_BY_KEY = MATRIX_ROOMS_BY_KEY;
window.getMatrixRoomDefinition = getMatrixRoomDefinition;
window.getMatrixRoomAlias = getMatrixRoomAlias;
window.getMatrixRoomLabel = getMatrixRoomLabel;
window.MATRIX_COMMERCIAL_ROOM_ALIAS = MATRIX_COMMERCIAL_ROOM_ALIAS;
window.MATRIX_PROJECTS_ROOM_ALIAS = MATRIX_PROJECTS_ROOM_ALIAS;
window.MATRIX_DETAILING_ROOM_ALIAS = MATRIX_DETAILING_ROOM_ALIAS;
window.MATRIX_FURNITURE_ROOM_ALIAS = MATRIX_FURNITURE_ROOM_ALIAS;
window.MATRIX_REVISIONS_ROOM_ALIAS = MATRIX_REVISIONS_ROOM_ALIAS;
