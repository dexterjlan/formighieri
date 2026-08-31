/**
 * Paleta padrão do Google Calendar (24 cores).
 * Ordem igual ao seletor do Agenda: 12 + 12.
 * googleEventColor: id legado 1–11 para CalendarApp.setColor().
 */
const GOOGLE_CALENDAR_PALETTE = [
    { id: 'radicchio', label: 'Rosa-escuro', hex: '#ad1457', googleEventColor: '11' },
    { id: 'cherry-blossom', label: 'Rosa', hex: '#d81b60', googleEventColor: '4' },
    { id: 'flamingo', label: 'Coral', hex: '#e67c73', googleEventColor: '4' },
    { id: 'tomato', label: 'Vermelho', hex: '#d50000', googleEventColor: '11' },
    { id: 'tangerine', label: 'Vermelho-laranja', hex: '#f4511e', googleEventColor: '6' },
    { id: 'pumpkin', label: 'Laranja', hex: '#ef6c00', googleEventColor: '6' },
    { id: 'mango', label: 'Âmbar', hex: '#f09300', googleEventColor: '5' },
    { id: 'banana', label: 'Amarelo', hex: '#f6bf26', googleEventColor: '5' },
    { id: 'citron', label: 'Amarelo-verde', hex: '#e4c441', googleEventColor: '5' },
    { id: 'avocado', label: 'Lima', hex: '#c0ca33', googleEventColor: '2' },
    { id: 'pistachio', label: 'Verde-claro', hex: '#7cb342', googleEventColor: '10' },
    { id: 'basil', label: 'Verde', hex: '#0b8043', googleEventColor: '10' },
    { id: 'sage', label: 'Verde-água', hex: '#33b679', googleEventColor: '2' },
    { id: 'eucalyptus', label: 'Verde-azulado', hex: '#009688', googleEventColor: '7' },
    { id: 'peacock', label: 'Azul-petróleo', hex: '#039be5', googleEventColor: '7' },
    { id: 'cobalt', label: 'Azul', hex: '#4285f4', googleEventColor: '9' },
    { id: 'lavender', label: 'Lavanda', hex: '#7986cb', googleEventColor: '1' },
    { id: 'blueberry', label: 'Azul-escuro', hex: '#3f51b5', googleEventColor: '9' },
    { id: 'wisteria', label: 'Lilás', hex: '#b39ddb', googleEventColor: '1' },
    { id: 'amethyst', label: 'Roxo-claro', hex: '#9e69af', googleEventColor: '3' },
    { id: 'grape', label: 'Roxo', hex: '#8e24aa', googleEventColor: '3' },
    { id: 'cocoa', label: 'Marrom', hex: '#795548', googleEventColor: '8' },
    { id: 'graphite', label: 'Cinza-escuro', hex: '#616161', googleEventColor: '8' },
    { id: 'birch', label: 'Cinza', hex: '#a79b8e', googleEventColor: '8' }
];

const INACTIVE_USER_CALENDAR_COLOR = {
    id: 'inactive',
    label: 'Branco',
    hex: '#ffffff',
    googleEventColor: '8'
};

function isInactiveCalendarColorHex(hex) {
    return normalizeGoogleCalendarColorHex(hex) === INACTIVE_USER_CALENDAR_COLOR.hex;
}

function normalizeGoogleCalendarColorHex(value) {
    const hex = String(value || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return '';
    return hex;
}

function getGoogleCalendarPaletteColor(hex) {
    const normalized = normalizeGoogleCalendarColorHex(hex);
    if (!normalized) return null;
    return GOOGLE_CALENDAR_PALETTE.find(color => color.hex === normalized) || null;
}

function getGoogleCalendarPaletteColorByUserId(userId) {
    const id = Number(userId) || 0;
    return GOOGLE_CALENDAR_PALETTE[id % GOOGLE_CALENDAR_PALETTE.length];
}

function parseCssHex(hex) {
    const normalized = normalizeGoogleCalendarColorHex(hex);
    if (!normalized) return null;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
}

function getCalendarColorContrast(hex) {
    const rgb = parseCssHex(hex);
    if (!rgb) {
        return { fg: '#1f2937', border: '#cbd5e1' };
    }

    const toLinear = channel => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
    const fg = luminance > 0.4 ? '#1f1f1f' : '#ffffff';
    const border = luminance > 0.85
        ? 'rgb(203 213 225)'
        : `rgb(${Math.round(rgb.r * 0.78)}, ${Math.round(rgb.g * 0.78)}, ${Math.round(rgb.b * 0.78)})`;
    return { fg, border };
}

function resolveUserCalendarPaletteColor(user) {
    if (user?.isActive === false) {
        return INACTIVE_USER_CALENDAR_COLOR;
    }

    const assigned = getGoogleCalendarPaletteColor(user?.calendarColor);
    if (assigned) return assigned;

    if (isInactiveCalendarColorHex(user?.calendarColor)) {
        return INACTIVE_USER_CALENDAR_COLOR;
    }

    return getGoogleCalendarPaletteColorByUserId(user?.id);
}

function getTakenCalendarColorHexes(users, exceptUserId) {
    const taken = new Map();
    (users || []).forEach(user => {
        if (Number(user.id) === Number(exceptUserId)) return;
        if (user.isActive === false) return;

        const color = resolveUserCalendarPaletteColor(user);
        if (!color?.hex || color.id === 'inactive' || isInactiveCalendarColorHex(color.hex)) return;
        if (!taken.has(color.hex)) {
            taken.set(color.hex, user.name || 'Outro usuário');
        }
    });
    return taken;
}

function getCalendarResponsiblePaletteColor(event) {
    const user = event?.responsible
        || (typeof calendarUsersCache !== 'undefined'
            ? calendarUsersCache.find(item => Number(item.id) === Number(event?.responsibleId))
            : null);
    return resolveUserCalendarPaletteColor(user || { id: event?.responsibleId });
}

function getCalendarResponsibleColorHex(event) {
    return getCalendarResponsiblePaletteColor(event).hex;
}

function getCalendarResponsibleCssVars(event) {
    const hex = getCalendarResponsibleColorHex(event);
    const contrast = getCalendarColorContrast(hex);
    return `--cal-resp-bg:${hex};--cal-resp-fg:${contrast.fg};--cal-resp-border:${contrast.border};`;
}

function getGoogleCalendarEventColorId(event) {
    return getCalendarResponsiblePaletteColor(event).googleEventColor;
}

function renderUserCalendarColorPickerHtml(user, options = {}) {
    const disabled = Boolean(options.disabled);
    const selectedHex = resolveUserCalendarPaletteColor(user).hex;
    const takenHexes = options.takenHexes instanceof Map ? options.takenHexes : new Map();

    const swatches = GOOGLE_CALENDAR_PALETTE.map(color => {
        const isSelected = color.hex === selectedHex;
        const takenName = !isSelected && takenHexes.get(color.hex);
        const isTaken = Boolean(takenName);
        const selected = isSelected ? ' is-selected' : '';
        const takenClass = isTaken ? ' is-taken' : '';
        const title = isTaken
            ? `${color.label} (em uso por ${takenName})`
            : color.label;
        return `<button type="button"
            class="user-calendar-color-swatch${selected}${takenClass}"
            data-calendar-color="${color.hex}"
            title="${escapeHtml(title)}"
            aria-label="${escapeHtml(title)}"
            aria-pressed="${isSelected ? 'true' : 'false'}"
            style="background:${color.hex}"
            ${disabled || isTaken ? 'disabled' : ''}></button>`;
    }).join('');

    const caption = options.caption || 'Cor do calendário';

    return `
        <div class="user-calendar-color-field" data-user-id="${user.id}">
            <p class="text-[9px] font-semibold uppercase text-slate-400 mb-1">${escapeHtml(caption)}</p>
            <div class="user-calendar-color-picker" role="radiogroup" aria-label="${escapeHtml(caption)}">
                ${swatches}
            </div>
            <input type="hidden" data-calendar-color-input="${user.id}" value="${escapeHtml(selectedHex)}">
        </div>
    `;
}

function getCalendarColorInput(userId, root = document) {
    return root.querySelector(`[data-calendar-color-input="${userId}"]`);
}

function bindUserCalendarColorPicker(userId, root = document) {
    const field = root.querySelector(`.user-calendar-color-field[data-user-id="${userId}"]`);
    const picker = field?.querySelector('.user-calendar-color-picker');
    const hidden = field?.querySelector(`[data-calendar-color-input="${userId}"]`);
    if (!picker || !hidden || picker.dataset.bound === '1') return;

    picker.dataset.bound = '1';
    picker.addEventListener('click', event => {
        const swatch = event.target.closest('.user-calendar-color-swatch');
        if (!swatch || swatch.disabled) return;

        const hex = swatch.getAttribute('data-calendar-color') || '';
        hidden.value = hex;
        picker.querySelectorAll('.user-calendar-color-swatch').forEach(button => {
            const isSelected = button === swatch;
            button.classList.toggle('is-selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
    });
}
