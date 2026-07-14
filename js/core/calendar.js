const CALENDAR_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CALENDAR_EVENT_TYPES = ['Medição', 'Atendimento'];
const CALENDAR_VIEW_MODES = ['month', 'week'];

let calendarViewMode = 'month';
let calendarViewAnchor = startOfMonth(new Date());
let calendarSelectedDate = toDateKey(new Date());
let calendarEventsCache = [];
let calendarUsersCache = [];
let editingCalendarEventId = null;
let calendarFilterResponsibleId = '';
let calendarFilterEventType = '';

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date) {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = normalized.getDay();
    normalized.setDate(normalized.getDate() - weekday);
    return normalized;
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

function formatCalendarMonthLabel(date) {
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCalendarWeekLabel(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    const startLabel = weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = weekEnd.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    return `${startLabel} – ${endLabel}`;
}

function formatCalendarDayLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return 'Selecione um dia';
    const label = date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCalendarShortDate(date) {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatCalendarTimeValue(timeValue) {
    if (!timeValue) return '—';
    return String(timeValue).slice(0, 5);
}

function getCalendarVisibleRange(viewMode = calendarViewMode, anchor = calendarViewAnchor) {
    if (viewMode === 'week') {
        const weekStart = startOfWeek(anchor);
        return {
            startDate: toDateKey(weekStart),
            endDate: toDateKey(addDays(weekStart, 6))
        };
    }

    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    return {
        startDate: toDateKey(new Date(year, month, 1)),
        endDate: toDateKey(new Date(year, month + 1, 0))
    };
}

function getCalendarEventTypeClass(eventType) {
    return eventType === 'Medição'
        ? 'calendar-event-chip--medicao'
        : 'calendar-event-chip--atendimento';
}

function getCalendarDayEventCardClass(eventType) {
    return eventType === 'Medição'
        ? 'calendar-day-event-card--medicao'
        : 'calendar-day-event-card--atendimento';
}

function getCalendarEventClientLabel(event) {
    if (event?.order?.clientName) return event.order.clientName;
    if (event?.clientName) return event.clientName;
    return '';
}

function getCalendarEventOrderLabel(event) {
    return event?.orderCode || event?.order?.orderCode || '';
}

function getCalendarEventResponsibleLabel(event) {
    return event?.responsible?.name || '—';
}

function getCalendarEventDisplayParts(event) {
    const parts = [getCalendarEventResponsibleLabel(event)];
    const clientLabel = getCalendarEventClientLabel(event);
    const orderLabel = getCalendarEventOrderLabel(event);

    if (clientLabel) parts.push(clientLabel);
    if (orderLabel) parts.push(`Pedido ${orderLabel}`);

    return parts;
}

function getCalendarEventTooltipRows(event) {
    const rows = [
        ['Hora', formatCalendarTimeValue(event.eventTime)],
        ['Responsável', getCalendarEventResponsibleLabel(event)]
    ];
    const clientLabel = getCalendarEventClientLabel(event);
    const orderLabel = getCalendarEventOrderLabel(event);

    if (clientLabel) rows.push(['Cliente', clientLabel]);
    if (orderLabel) rows.push(['Pedido', orderLabel]);
    if (event.description) rows.push(['Observação', event.description]);

    return rows;
}

function renderCalendarEventTooltipHtml(event) {
    const rows = getCalendarEventTooltipRows(event);
    const typeClass = event.eventType === 'Medição'
        ? 'calendar-event-tooltip--medicao'
        : 'calendar-event-tooltip--atendimento';

    return `
        <div class="calendar-event-tooltip ${typeClass}">
            <div class="calendar-event-tooltip__badge">${escapeHtml(event.eventType || '—')}</div>
            <dl class="calendar-event-tooltip__rows">
                ${rows.map(([label, value]) => `
                    <div class="calendar-event-tooltip__row">
                        <dt>${escapeHtml(label)}</dt>
                        <dd>${escapeHtml(value)}</dd>
                    </div>
                `).join('')}
            </dl>
        </div>
    `;
}

let calendarFloatingTooltipEl = null;
let calendarFloatingTooltipAnchor = null;

function ensureCalendarFloatingTooltip() {
    if (calendarFloatingTooltipEl) return calendarFloatingTooltipEl;

    calendarFloatingTooltipEl = document.createElement('div');
    calendarFloatingTooltipEl.id = 'calendar-event-floating-tooltip';
    calendarFloatingTooltipEl.className = 'calendar-event-floating-tooltip hidden';
    calendarFloatingTooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(calendarFloatingTooltipEl);
    return calendarFloatingTooltipEl;
}

function positionCalendarFloatingTooltip(anchorEl) {
    const tooltip = ensureCalendarFloatingTooltip();
    if (!anchorEl) return;

    const margin = 10;
    const rect = anchorEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + margin;
    let left = rect.left;

    if (top + tooltipRect.height > window.innerHeight - margin) {
        top = rect.top - tooltipRect.height - margin;
    }

    if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
}

function showCalendarFloatingTooltip(eventId, anchorEl) {
    const calendarEvent = calendarEventsCache.find(item => item.id === Number(eventId));
    if (!calendarEvent || !anchorEl) return;

    const tooltip = ensureCalendarFloatingTooltip();
    tooltip.innerHTML = renderCalendarEventTooltipHtml(calendarEvent);
    tooltip.classList.remove('hidden');
    calendarFloatingTooltipAnchor = anchorEl;

    requestAnimationFrame(() => {
        positionCalendarFloatingTooltip(anchorEl);
    });
}

function hideCalendarFloatingTooltip() {
    calendarFloatingTooltipEl?.classList.add('hidden');
    calendarFloatingTooltipAnchor = null;
}

function getCalendarMaxChipsForMode() {
    return calendarViewMode === 'week' ? 8 : 3;
}

async function loadCalendarUsers() {
    if (calendarUsersCache.length) return calendarUsersCache;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, role, isActive')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (error) {
        console.error('loadCalendarUsers:', error);
        return [];
    }

    calendarUsersCache = data || [];
    return calendarUsersCache;
}

async function loadCalendarEventsForVisibleRange(viewMode = calendarViewMode, anchor = calendarViewAnchor) {
    const { startDate, endDate } = getCalendarVisibleRange(viewMode, anchor);

    const { data, error } = await supabaseClient
        .from('CalendarEvent')
        .select(`
            id, eventDate, eventTime, eventType, description, orderCode, orderId, clientName, responsibleId,
            order:salesOrders(orderCode, clientName)
        `)
        .gte('eventDate', startDate)
        .lte('eventDate', endDate)
        .order('eventDate', { ascending: true })
        .order('eventTime', { ascending: true });

    if (error) {
        console.error('loadCalendarEventsForVisibleRange:', error);
        calendarEventsCache = [];
        return [];
    }

    calendarEventsCache = (data || []).map(event => ({
        ...event,
        responsible: calendarUsersCache.find(user => user.id === event.responsibleId) || null
    }));
    return calendarEventsCache;
}

function matchesCalendarFilters(event) {
    if (calendarFilterEventType && event.eventType !== calendarFilterEventType) {
        return false;
    }

    if (calendarFilterResponsibleId && String(event.responsibleId) !== String(calendarFilterResponsibleId)) {
        return false;
    }

    return true;
}

function getCalendarEventsByDate(dateKey) {
    return calendarEventsCache
        .filter(event => event.eventDate === dateKey)
        .filter(matchesCalendarFilters)
        .sort((a, b) => String(a.eventTime).localeCompare(String(b.eventTime)));
}

function renderCalendarDayCell(dateKey, options = {}) {
    const {
        dayNumber,
        shortDate = '',
        isToday = false,
        isSelected = false,
        maxChips = 3
    } = options;
    const dayEvents = getCalendarEventsByDate(dateKey);
    const chips = dayEvents.slice(0, maxChips).map(event => {
        const summary = getCalendarEventDisplayParts(event).join(' · ');
        return `
        <button type="button"
            class="calendar-event-chip ${getCalendarEventTypeClass(event.eventType)}"
            data-calendar-event-id="${event.id}"
            aria-label="${escapeHtml(getCalendarEventDisplayParts(event).join(', '))}">
            <span class="calendar-event-chip__time">${escapeHtml(formatCalendarTimeValue(event.eventTime))}</span>
            <span class="calendar-event-chip__summary">${escapeHtml(summary)}</span>
        </button>
    `;
    }).join('');
    const moreCount = dayEvents.length > maxChips ? dayEvents.length - maxChips : 0;

    return `
        <button type="button"
            class="calendar-day-cell ${isToday ? 'calendar-day-cell--today' : ''} ${isSelected ? 'is-selected' : ''}"
            data-calendar-date="${dateKey}"
            aria-label="${escapeHtml(formatCalendarDayLabel(dateKey))}">
            <span class="calendar-day-cell__number">${dayNumber}</span>
            ${shortDate ? `<span class="calendar-day-cell__date">${escapeHtml(shortDate)}</span>` : ''}
            <span class="calendar-day-cell__events">
                ${chips}
                ${moreCount ? `<span class="calendar-day-cell__more">+${moreCount}</span>` : ''}
            </span>
        </button>
    `;
}

function renderCalendarWeekdays() {
    const weekdaysEl = document.getElementById('calendar-weekdays');
    if (!weekdaysEl) return;

    weekdaysEl.innerHTML = CALENDAR_WEEKDAYS
        .map(day => `<span class="calendar-weekday">${day}</span>`)
        .join('');
}

function renderCalendarMonthGrid() {
    const gridEl = document.getElementById('calendar-month-grid');
    const periodLabelEl = document.getElementById('calendar-month-label');
    if (!gridEl || !periodLabelEl) return;

    gridEl.classList.remove('calendar-month-grid--week');
    periodLabelEl.textContent = formatCalendarMonthLabel(calendarViewAnchor);

    const year = calendarViewAnchor.getFullYear();
    const month = calendarViewAnchor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toDateKey(new Date());
    const maxChips = getCalendarMaxChipsForMode();
    const cells = [];

    for (let i = 0; i < firstWeekday; i += 1) {
        cells.push('<div class="calendar-day-cell calendar-day-cell--empty" aria-hidden="true"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = toDateKey(date);
        cells.push(renderCalendarDayCell(dateKey, {
            dayNumber: day,
            isToday: dateKey === todayKey,
            isSelected: dateKey === calendarSelectedDate,
            maxChips
        }));
    }

    gridEl.innerHTML = cells.join('');
}

function renderCalendarWeekGrid() {
    const gridEl = document.getElementById('calendar-month-grid');
    const periodLabelEl = document.getElementById('calendar-month-label');
    if (!gridEl || !periodLabelEl) return;

    const weekStart = startOfWeek(calendarViewAnchor);
    gridEl.classList.add('calendar-month-grid--week');
    periodLabelEl.textContent = formatCalendarWeekLabel(weekStart);

    const todayKey = toDateKey(new Date());
    const maxChips = getCalendarMaxChipsForMode();
    const cells = [];

    for (let offset = 0; offset < 7; offset += 1) {
        const date = addDays(weekStart, offset);
        const dateKey = toDateKey(date);
        cells.push(renderCalendarDayCell(dateKey, {
            dayNumber: date.getDate(),
            shortDate: formatCalendarShortDate(date),
            isToday: dateKey === todayKey,
            isSelected: dateKey === calendarSelectedDate,
            maxChips
        }));
    }

    gridEl.innerHTML = cells.join('');
}

function renderCalendarGrid() {
    if (calendarViewMode === 'week') {
        renderCalendarWeekGrid();
        return;
    }
    renderCalendarMonthGrid();
}

function renderCalendarDayEvents() {
    const listEl = document.getElementById('calendar-day-events-list');
    const labelEl = document.getElementById('calendar-selected-day-label');
    if (!listEl || !labelEl) return;

    labelEl.textContent = formatCalendarDayLabel(calendarSelectedDate);
    const dayEvents = getCalendarEventsByDate(calendarSelectedDate);

    if (!calendarSelectedDate) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nenhum dia selecionado.</p>';
        return;
    }

    if (!dayEvents.length) {
        const hasActiveFilters = Boolean(calendarFilterResponsibleId || calendarFilterEventType);
        listEl.innerHTML = hasActiveFilters
            ? '<p class="text-xs text-slate-400 text-center py-6">Nenhum evento neste dia com os filtros aplicados.</p>'
            : '<p class="text-xs text-slate-400 text-center py-6">Nenhum evento neste dia.</p>';
        return;
    }

    listEl.innerHTML = dayEvents.map(event => {
        const clientLabel = getCalendarEventClientLabel(event);
        const orderLabel = getCalendarEventOrderLabel(event);
        const responsibleLabel = getCalendarEventResponsibleLabel(event);
        const descriptionHtml = event.description
            ? `<p class="calendar-day-event-card__description">${escapeHtml(event.description)}</p>`
            : '';

        return `
            <button type="button"
                class="calendar-day-event-card ${getCalendarDayEventCardClass(event.eventType)}"
                data-calendar-event-id="${event.id}">
                <div class="calendar-day-event-card__top">
                    <span class="calendar-day-event-card__time">${escapeHtml(formatCalendarTimeValue(event.eventTime))}</span>
                </div>
                <p class="calendar-day-event-card__responsible">${escapeHtml(responsibleLabel)}</p>
                ${clientLabel ? `<p class="calendar-day-event-card__client">${escapeHtml(clientLabel)}</p>` : ''}
                ${orderLabel ? `<p class="calendar-day-event-card__order">Pedido ${escapeHtml(orderLabel)}</p>` : ''}
                ${descriptionHtml}
            </button>
        `;
    }).join('');
}

function syncCalendarViewModeButtons() {
    document.getElementById('btn-calendar-view-month')?.classList.toggle('is-active', calendarViewMode === 'month');
    document.getElementById('btn-calendar-view-week')?.classList.toggle('is-active', calendarViewMode === 'week');
}

async function refreshCalendarView() {
    renderCalendarWeekdays();
    syncCalendarViewModeButtons();
    await loadCalendarUsers();
    populateCalendarFilterSelects();
    await loadCalendarEventsForVisibleRange();
    renderCalendarGrid();
    renderCalendarDayEvents();
}

function populateCalendarFilterSelects() {
    const responsibleSelect = document.getElementById('calendar-filter-responsible');
    const typeSelect = document.getElementById('calendar-filter-type');

    if (typeSelect) {
        typeSelect.value = calendarFilterEventType;
    }

    if (!responsibleSelect) return;

    if (!calendarUsersCache.length) {
        responsibleSelect.innerHTML = '<option value="">Todos os responsáveis</option>';
        return;
    }

    responsibleSelect.innerHTML = [
        '<option value="">Todos os responsáveis</option>',
        ...calendarUsersCache.map(user => `
            <option value="${user.id}" ${String(user.id) === String(calendarFilterResponsibleId) ? 'selected' : ''}>
                ${escapeHtml(user.name)} (${escapeHtml(user.role || '—')})
            </option>
        `)
    ].join('');
}

function applyCalendarFilters() {
    calendarFilterResponsibleId = document.getElementById('calendar-filter-responsible')?.value || '';
    calendarFilterEventType = document.getElementById('calendar-filter-type')?.value || '';
    renderCalendarGrid();
    renderCalendarDayEvents();
}

function populateCalendarResponsibleSelect(selectedId = '') {
    const select = document.getElementById('cal-event-responsible');
    if (!select) return;

    if (!calendarUsersCache.length) {
        select.innerHTML = '<option value="">Nenhum usuário ativo</option>';
        return;
    }

    select.innerHTML = [
        '<option value="">Selecione...</option>',
        ...calendarUsersCache.map(user => `
            <option value="${user.id}" ${String(user.id) === String(selectedId) ? 'selected' : ''}>
                ${escapeHtml(user.name)} (${escapeHtml(user.role || '—')})
            </option>
        `)
    ].join('');
}

function syncCalendarClientNameField() {
    const orderCodeInput = document.getElementById('cal-event-order-code');
    const clientInput = document.getElementById('cal-event-client-name');
    const requiredMark = document.getElementById('cal-event-client-required');
    if (!orderCodeInput || !clientInput) return;

    const hasOrderCode = Boolean(orderCodeInput.value.trim());
    clientInput.disabled = hasOrderCode;
    clientInput.classList.toggle('opacity-60', hasOrderCode);
    requiredMark?.classList.toggle('hidden', hasOrderCode);

    if (hasOrderCode) {
        clientInput.removeAttribute('required');
    } else {
        clientInput.setAttribute('required', 'required');
    }
}

async function lookupCalendarOrderByCode(orderCode) {
    const trimmed = String(orderCode || '').trim();
    if (!trimmed) return null;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName')
        .eq('orderCode', trimmed)
        .maybeSingle();

    if (error) {
        console.error('lookupCalendarOrderByCode:', error);
        return null;
    }

    return data;
}

async function openCalendarEventModal(event = null, presetDate = calendarSelectedDate) {
    await loadCalendarUsers();
    populateCalendarResponsibleSelect(event?.responsibleId || event?.responsible?.id || '');

    editingCalendarEventId = event?.id || null;
    const titleEl = document.getElementById('calendar-event-modal-title');
    const deleteBtn = document.getElementById('btn-cal-event-delete');

    if (titleEl) {
        titleEl.textContent = editingCalendarEventId ? 'Editar evento' : 'Novo evento';
    }
    deleteBtn?.classList.toggle('hidden', !editingCalendarEventId);

    document.getElementById('cal-event-date').value = event?.eventDate || presetDate || toDateKey(new Date());
    document.getElementById('cal-event-time').value = formatCalendarTimeValue(event?.eventTime || '09:00');
    document.getElementById('cal-event-type').value = event?.eventType || 'Medição';
    document.getElementById('cal-event-description').value = event?.description || '';
    document.getElementById('cal-event-order-code').value = event?.orderCode || event?.order?.orderCode || '';

    const clientName = getCalendarEventClientLabel(event);
    document.getElementById('cal-event-client-name').value = clientName;

    syncCalendarClientNameField();
    toggleModal('calendar-event-modal', true);
}

async function saveCalendarEvent(event) {
    event.preventDefault();

    const eventDate = document.getElementById('cal-event-date').value;
    const eventTime = document.getElementById('cal-event-time').value;
    const eventType = document.getElementById('cal-event-type').value;
    const responsibleId = Number(document.getElementById('cal-event-responsible').value);
    const description = document.getElementById('cal-event-description').value.trim();
    const orderCode = document.getElementById('cal-event-order-code').value.trim();
    let clientName = document.getElementById('cal-event-client-name').value.trim();

    if (!eventDate || !eventTime || !eventType || !responsibleId) {
        alertAppDialog('Preencha dia, hora, tipo e responsável.');
        return;
    }

    if (!CALENDAR_EVENT_TYPES.includes(eventType)) {
        alertAppDialog('Tipo de evento inválido.');
        return;
    }

    let orderId = null;
    if (orderCode) {
        const order = await lookupCalendarOrderByCode(orderCode);
        if (!order) {
            alertAppDialog('Pedido não encontrado para o código informado.');
            return;
        }
        orderId = order.id;
        clientName = order.clientName || clientName;
    } else if (!clientName) {
        alertAppDialog('Informe o nome do cliente quando não houver código de pedido.');
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        eventDate,
        eventTime: `${eventTime}:00`,
        eventType,
        responsibleId,
        description: description || '',
        orderCode: orderCode || null,
        orderId,
        clientName: orderCode ? null : clientName,
        updatedAt: now,
        updatedById: currentUser?.id || null
    };

    const saveBtn = document.getElementById('btn-cal-event-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
    }

    try {
        if (editingCalendarEventId) {
            const { error } = await supabaseClient
                .from('CalendarEvent')
                .update(payload)
                .eq('id', editingCalendarEventId);

            if (error) throw error;
        } else {
            const insertPayload = {
                ...payload,
                createdAt: now,
                createdById: currentUser?.id || null
            };

            const { error } = await supabaseClient
                .from('CalendarEvent')
                .insert(insertPayload);

            if (error) throw error;
        }

        toggleModal('calendar-event-modal', false);
        editingCalendarEventId = null;
        calendarSelectedDate = eventDate;

        if (calendarViewMode === 'week') {
            calendarViewAnchor = startOfWeek(parseDateKey(eventDate) || new Date());
        } else {
            const selectedDate = parseDateKey(eventDate);
            if (selectedDate) {
                calendarViewAnchor = startOfMonth(selectedDate);
            }
        }

        await refreshCalendarView();
    } catch (error) {
        console.error('saveCalendarEvent:', error);
        alertAppDialog(error.message || 'Não foi possível salvar o evento.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
        }
    }
}

async function deleteCalendarEvent() {
    if (!editingCalendarEventId) return;

    const confirmed = await confirmAppDialog('Excluir este evento do calendário?');
    if (!confirmed) return;

    const deleteBtn = document.getElementById('btn-cal-event-delete');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Excluindo...';
    }

    try {
        const { error } = await supabaseClient
            .from('CalendarEvent')
            .delete()
            .eq('id', editingCalendarEventId);

        if (error) throw error;

        toggleModal('calendar-event-modal', false);
        editingCalendarEventId = null;
        await refreshCalendarView();
    } catch (error) {
        console.error('deleteCalendarEvent:', error);
        alertAppDialog(error.message || 'Não foi possível excluir o evento.');
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Excluir';
        }
    }
}

function shiftCalendarPeriod(delta) {
    if (calendarViewMode === 'week') {
        calendarViewAnchor = addDays(startOfWeek(calendarViewAnchor), delta * 7);
    } else {
        calendarViewAnchor = startOfMonth(new Date(
            calendarViewAnchor.getFullYear(),
            calendarViewAnchor.getMonth() + delta,
            1
        ));
    }
    refreshCalendarView();
}

function setCalendarViewMode(mode) {
    if (!CALENDAR_VIEW_MODES.includes(mode) || mode === calendarViewMode) return;

    calendarViewMode = mode;
    const selectedDate = parseDateKey(calendarSelectedDate) || new Date();
    calendarViewAnchor = mode === 'week'
        ? startOfWeek(selectedDate)
        : startOfMonth(selectedDate);
    refreshCalendarView();
}

function goToCalendarToday() {
    const today = new Date();
    calendarSelectedDate = toDateKey(today);
    calendarViewAnchor = calendarViewMode === 'week'
        ? startOfWeek(today)
        : startOfMonth(today);
    refreshCalendarView();
}

function showCalendar() {
    if (!canAccessCalendar()) return;

    hideCalendarFloatingTooltip();
    hideSubViews();
    document.getElementById('calendar-view')?.classList.remove('hidden');
    updateMainNavActive('calendar');
    updateAdminNav();
    if (typeof saveAppNavState === 'function') saveAppNavState({ view: 'calendar' });
    refreshCalendarView();
}

window.showCalendar = showCalendar;
window.showGoogleCalendar = showCalendar;

function bindCalendarTooltipEvents() {
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView || calendarView.dataset.tooltipBound === '1') return;

    calendarView.dataset.tooltipBound = '1';

    calendarView.addEventListener('mouseover', event => {
        const target = event.target.closest('.calendar-event-chip, .calendar-day-event-card[data-calendar-event-id]');
        if (!target?.dataset.calendarEventId) return;
        showCalendarFloatingTooltip(target.dataset.calendarEventId, target);
    });

    calendarView.addEventListener('mouseout', event => {
        const target = event.target.closest('.calendar-event-chip, .calendar-day-event-card[data-calendar-event-id]');
        if (!target) return;

        const related = event.relatedTarget;
        if (related && target.contains(related)) return;
        if (related?.closest?.('#calendar-event-floating-tooltip')) return;

        const nextTarget = related?.closest?.('.calendar-event-chip, .calendar-day-event-card[data-calendar-event-id]');
        if (nextTarget?.dataset.calendarEventId) {
            showCalendarFloatingTooltip(nextTarget.dataset.calendarEventId, nextTarget);
            return;
        }

        hideCalendarFloatingTooltip();
    });

    calendarView.addEventListener('scroll', hideCalendarFloatingTooltip, true);
    window.addEventListener('resize', hideCalendarFloatingTooltip);
    document.addEventListener('scroll', hideCalendarFloatingTooltip, true);
}

function bindCalendarEvents() {
    bindCalendarTooltipEvents();
    document.getElementById('btn-calendario')?.addEventListener('click', showCalendar);
    document.getElementById('btn-calendar-view-month')?.addEventListener('click', () => setCalendarViewMode('month'));
    document.getElementById('btn-calendar-view-week')?.addEventListener('click', () => setCalendarViewMode('week'));
    document.getElementById('btn-calendar-prev')?.addEventListener('click', () => shiftCalendarPeriod(-1));
    document.getElementById('btn-calendar-next')?.addEventListener('click', () => shiftCalendarPeriod(1));
    document.getElementById('btn-calendar-today')?.addEventListener('click', goToCalendarToday);
    document.getElementById('btn-calendar-new')?.addEventListener('click', () => openCalendarEventModal());
    document.getElementById('calendar-filter-responsible')?.addEventListener('change', applyCalendarFilters);
    document.getElementById('calendar-filter-type')?.addEventListener('change', applyCalendarFilters);

    document.getElementById('calendar-month-grid')?.addEventListener('click', event => {
        const eventBtn = event.target.closest('[data-calendar-event-id]');
        if (eventBtn) {
            hideCalendarFloatingTooltip();
            const eventId = Number(eventBtn.dataset.calendarEventId);
            const calendarEvent = calendarEventsCache.find(item => item.id === eventId);
            if (calendarEvent) {
                openCalendarEventModal(calendarEvent);
            }
            return;
        }

        const dayBtn = event.target.closest('[data-calendar-date]');
        if (!dayBtn) return;

        calendarSelectedDate = dayBtn.dataset.calendarDate;
        renderCalendarGrid();
        renderCalendarDayEvents();
    });

    document.getElementById('calendar-day-events-list')?.addEventListener('click', event => {
        const card = event.target.closest('[data-calendar-event-id]');
        if (!card) return;

        hideCalendarFloatingTooltip();
        const eventId = Number(card.dataset.calendarEventId);
        const calendarEvent = calendarEventsCache.find(item => item.id === eventId);
        if (calendarEvent) {
            openCalendarEventModal(calendarEvent);
        }
    });

    document.getElementById('calendar-event-form')?.addEventListener('submit', saveCalendarEvent);
    document.getElementById('btn-cal-event-delete')?.addEventListener('click', deleteCalendarEvent);

    document.getElementById('cal-event-order-code')?.addEventListener('input', syncCalendarClientNameField);
    document.getElementById('cal-event-order-code')?.addEventListener('blur', async () => {
        const orderCode = document.getElementById('cal-event-order-code')?.value.trim();
        if (!orderCode) return;

        const order = await lookupCalendarOrderByCode(orderCode);
        const clientInput = document.getElementById('cal-event-client-name');
        if (order && clientInput) {
            clientInput.value = order.clientName || '';
        }
        syncCalendarClientNameField();
    });
}
