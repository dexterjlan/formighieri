const APP_DATE_LOCALE = 'pt-BR';

function capitalizePtLocaleLabel(label) {
    if (!label) return label;
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function addDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeekSunday(date) {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = normalized.getDay();
    normalized.setDate(normalized.getDate() - weekday);
    return normalized;
}

function startOfWeekMonday(date) {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = normalized.getDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    normalized.setDate(normalized.getDate() + diff);
    return normalized;
}

function daysBetween(startDate, endDate) {
    const ms = endDate.getTime() - startDate.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatAppMonthYearLabel(date) {
    const label = date.toLocaleDateString(APP_DATE_LOCALE, { month: 'long', year: 'numeric' });
    return capitalizePtLocaleLabel(label);
}

function formatAppMonthLabel(date) {
    const label = date.toLocaleDateString(APP_DATE_LOCALE, { month: 'long' });
    return capitalizePtLocaleLabel(label);
}

function formatAppWeekRangeLabel(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    const startLabel = weekStart.toLocaleDateString(APP_DATE_LOCALE, { day: '2-digit', month: 'short' });
    const endLabel = weekEnd.toLocaleDateString(APP_DATE_LOCALE, {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    return `${startLabel} – ${endLabel}`;
}

function formatAppShortDate(date) {
    return date.toLocaleDateString(APP_DATE_LOCALE, { day: '2-digit', month: 'short' });
}

function formatAppDayMonth(dateOrKey) {
    const date = typeof dateOrKey === 'string' ? parseDateKey(dateOrKey) : dateOrKey;
    if (!date) return '—';
    return date.toLocaleDateString(APP_DATE_LOCALE, { day: '2-digit', month: '2-digit' });
}

function formatAppLongDayLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return 'Selecione um dia';
    const label = date.toLocaleDateString(APP_DATE_LOCALE, {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    return capitalizePtLocaleLabel(label);
}
