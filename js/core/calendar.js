function mountGoogleCalendarFrame() {
    const iframe = document.getElementById('google-calendar-iframe');
    const frameWrap = document.getElementById('calendar-view-frame-wrap');
    const emptyState = document.getElementById('calendar-view-empty');
    const externalLink = document.getElementById('calendar-open-external-link');
    const embedUrl = typeof GOOGLE_CALENDAR_EMBED_URL === 'string' ? GOOGLE_CALENDAR_EMBED_URL.trim() : '';

    if (!iframe || !frameWrap || !emptyState) return;

    if (!embedUrl) {
        iframe.removeAttribute('src');
        frameWrap.classList.add('hidden');
        emptyState.classList.remove('hidden');
        externalLink?.classList.add('hidden');
        return;
    }

    if (iframe.src !== embedUrl) {
        iframe.src = embedUrl;
    }

    frameWrap.classList.remove('hidden');
    emptyState.classList.add('hidden');

    if (externalLink && typeof GOOGLE_CALENDAR_PUBLIC_URL === 'string' && GOOGLE_CALENDAR_PUBLIC_URL.trim()) {
        externalLink.href = GOOGLE_CALENDAR_PUBLIC_URL.trim();
        externalLink.classList.remove('hidden');
    } else {
        externalLink?.classList.add('hidden');
    }
}

function showGoogleCalendar() {
    if (!canAccessGoogleCalendar()) return;

    hideSubViews();
    document.getElementById('calendar-view')?.classList.remove('hidden');
    mountGoogleCalendarFrame();
    updateMainNavActive('calendar');
    updateAdminNav();
}

window.showGoogleCalendar = showGoogleCalendar;

function bindCalendarEvents() {
    document.getElementById('btn-calendario')?.addEventListener('click', showGoogleCalendar);
}
