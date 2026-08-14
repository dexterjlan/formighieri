const CALENDAR_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CALENDAR_VIEW_MODES = ['month', 'week'];

let calendarViewMode = 'month';
let calendarViewAnchor = startOfMonth(new Date());
let calendarSelectedDate = toDateKey(new Date());
let calendarEventsCache = [];
let calendarUsersCache = [];
let calendarEventTypesCache = [];
let editingCalendarEventId = null;
let calendarFilterResponsibleId = '';
let calendarFilterEventTypeId = '';

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

function slugifyCalendarEventTypeName(typeName) {
    return String(typeName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evento';
}

function getCalendarEventTypeName(event) {
    return event?.eventType?.name || '';
}

function getCalendarEventTypeClass(event) {
    const slug = slugifyCalendarEventTypeName(getCalendarEventTypeName(event));
    return `calendar-event-chip--${slug}`;
}

function getCalendarDayEventCardClass(event) {
    const slug = slugifyCalendarEventTypeName(getCalendarEventTypeName(event));
    return `calendar-day-event-card--${slug}`;
}

function getCalendarEventTooltipClass(event) {
    const slug = slugifyCalendarEventTypeName(getCalendarEventTypeName(event));
    return `calendar-event-tooltip--${slug}`;
}

function getCalendarEventClientLabel(event) {
    if (event?.order) return getOrderClientName(event.order);
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
    const typeClass = getCalendarEventTooltipClass(event);
    const typeName = getCalendarEventTypeName(event);

    return `
        <div class="calendar-event-tooltip ${typeClass}">
            <div class="calendar-event-tooltip__badge">${escapeHtml(typeName || '—')}</div>
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

async function loadCalendarEventTypes() {
    const { data, error } = await supabaseClient
        .from('CalendarEventType')
        .select('id, name, isActive, clientRequired, orderRequired, sortOrder')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        console.error('loadCalendarEventTypes:', error);
        calendarEventTypesCache = [];
        return [];
    }

    calendarEventTypesCache = data || [];
    return calendarEventTypesCache;
}

function getCalendarEventTypeById(typeId) {
    return calendarEventTypesCache.find(type => String(type.id) === String(typeId)) || null;
}

function populateCalendarEventTypeSelects(selectedId = '') {
    const modalSelect = document.getElementById('cal-event-type');
    const filterSelect = document.getElementById('calendar-filter-type');

    if (modalSelect) {
        if (!calendarEventTypesCache.length) {
            modalSelect.innerHTML = '<option value="">Nenhum tipo disponível</option>';
        } else {
            modalSelect.innerHTML = calendarEventTypesCache.map(type => `
                <option value="${type.id}" ${String(type.id) === String(selectedId) ? 'selected' : ''}>
                    ${escapeHtml(type.name)}
                </option>
            `).join('');
        }
    }

    if (filterSelect) {
        filterSelect.innerHTML = [
            '<option value="">Todos</option>',
            ...calendarEventTypesCache.map(type => `
                <option value="${type.id}" ${String(type.id) === String(calendarFilterEventTypeId) ? 'selected' : ''}>
                    ${escapeHtml(type.name)}
                </option>
            `)
        ].join('');
    }
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
            id, eventDate, eventTime, eventTypeId, description, orderCode, orderId, clientName, responsibleId,
            eventType:CalendarEventType(id, name, clientRequired, orderRequired),
            order:salesOrders(orderCode, clientId, consultantUserId, cliente:Cliente(nome), consultor:appUsers!consultantUserId(name))
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
    if (calendarFilterEventTypeId && String(event.eventTypeId) !== String(calendarFilterEventTypeId)) {
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
            class="calendar-event-chip ${getCalendarEventTypeClass(event)}"
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
        const hasActiveFilters = Boolean(calendarFilterResponsibleId || calendarFilterEventTypeId);
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
                class="calendar-day-event-card ${getCalendarDayEventCardClass(event)}"
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
    await loadCalendarEventTypes();
    populateCalendarEventTypeSelects();
    populateCalendarFilterSelects();
    await loadCalendarEventsForVisibleRange();
    renderCalendarGrid();
    renderCalendarDayEvents();
}

function populateCalendarFilterSelects() {
    const responsibleSelect = document.getElementById('calendar-filter-responsible');

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
    calendarFilterEventTypeId = document.getElementById('calendar-filter-type')?.value || '';
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

function syncCalendarEventTypeRequirements() {
    const typeId = document.getElementById('cal-event-type')?.value;
    const selectedType = getCalendarEventTypeById(typeId);
    const orderCode = document.getElementById('cal-event-order-code')?.value.trim();
    const clientRequired = Boolean(selectedType?.clientRequired);
    const orderRequired = Boolean(selectedType?.orderRequired);

    document.getElementById('cal-event-client-required')?.classList.toggle('hidden', !clientRequired);
    document.getElementById('cal-event-order-required')?.classList.toggle('hidden', !orderRequired);

    const clientBtn = document.getElementById('btn-cal-event-client-picker');
    if (clientBtn) {
        clientBtn.disabled = Boolean(orderCode);
    }
}

function syncCalendarClientNameField() {
    syncCalendarEventTypeRequirements();
}

async function lookupCalendarOrderByCode(orderCode) {
    const trimmed = String(orderCode || '').trim();
    if (!trimmed) return null;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select(getSalesOrderMinimalEmbedSelect())
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
    await loadCalendarEventTypes();
    populateCalendarEventTypeSelects(event?.eventTypeId || event?.eventType?.id || calendarEventTypesCache[0]?.id || '');

    let responsibleId = event?.responsibleId || event?.responsible?.id || '';
    if (!event && currentUser?.id) {
        const currentUserInList = calendarUsersCache.some(user => String(user.id) === String(currentUser.id));
        if (currentUserInList) {
            responsibleId = currentUser.id;
        }
    }
    populateCalendarResponsibleSelect(responsibleId);

    editingCalendarEventId = event?.id || null;
    const titleEl = document.getElementById('calendar-event-modal-title');
    const deleteBtn = document.getElementById('btn-cal-event-delete');

    if (titleEl) {
        titleEl.textContent = editingCalendarEventId ? 'Editar evento' : 'Novo evento';
    }
    deleteBtn?.classList.toggle('hidden', !editingCalendarEventId);

    document.getElementById('cal-event-date').value = event?.eventDate || presetDate || toDateKey(new Date());
    document.getElementById('cal-event-time').value = formatCalendarTimeValue(event?.eventTime || '09:00');
    document.getElementById('cal-event-description').value = event?.description || '';
    document.getElementById('cal-event-order-code').value = event?.orderCode || event?.order?.orderCode || '';

    const clientName = getCalendarEventClientLabel(event);
    document.getElementById('cal-event-client-name').value = clientName;
    document.getElementById('cal-event-client-id').value = '';

    syncCalendarClientNameField();
    toggleModal('calendar-event-modal', true);
}

async function saveCalendarEvent(event) {
    event.preventDefault();

    const eventDate = document.getElementById('cal-event-date').value;
    const eventTime = document.getElementById('cal-event-time').value;
    const eventTypeId = Number(document.getElementById('cal-event-type').value);
    const responsibleId = Number(document.getElementById('cal-event-responsible').value);
    const description = document.getElementById('cal-event-description').value.trim();
    const orderCode = document.getElementById('cal-event-order-code').value.trim();
    let clientName = document.getElementById('cal-event-client-name').value.trim();
    const selectedType = getCalendarEventTypeById(eventTypeId);

    if (!eventDate || !eventTime || !eventTypeId || !responsibleId) {
        alertAppDialog('Preencha dia, hora, tipo e responsável.');
        return;
    }

    if (!selectedType) {
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
        clientName = getOrderClientName(order) || clientName;
    } else if (selectedType.orderRequired) {
        alertAppDialog('Informe o código do pedido para este tipo de evento.');
        return;
    }

    if (selectedType.clientRequired && !clientName) {
        alertAppDialog('Informe o cliente para este tipo de evento.');
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        eventDate,
        eventTime: `${eventTime}:00`,
        eventTypeId,
        responsibleId,
        description: description || '',
        orderCode: orderCode || null,
        orderId,
        clientName: orderCode ? null : (clientName || null),
        updatedAt: now,
        updatedById: currentUser?.id || null
    };

    const saveBtn = document.getElementById('btn-cal-event-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
    }

    try {
        let savedEventId = editingCalendarEventId;

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

            const { data: created, error } = await supabaseClient
                .from('CalendarEvent')
                .insert(insertPayload)
                .select('id')
                .single();

            if (error) throw error;
            savedEventId = created?.id || null;
        }

        if (savedEventId && typeof syncCalendarEventToGoogle === 'function') {
            syncCalendarEventToGoogle(savedEventId);
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
        const eventToDelete = calendarEventsCache.find(item => Number(item.id) === Number(editingCalendarEventId))
            || await (typeof fetchCalendarEventForGoogleSync === 'function'
                ? fetchCalendarEventForGoogleSync(editingCalendarEventId)
                : null);

        if (typeof deleteCalendarEventFromGoogle === 'function') {
            await deleteCalendarEventFromGoogle({
                id: editingCalendarEventId,
                googleCalendarEventId: eventToDelete?.googleCalendarEventId || ''
            });
        }

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

function getCalendarFilteredEvents() {
    return calendarEventsCache
        .filter(matchesCalendarFilters)
        .sort((left, right) => String(left.eventDate).localeCompare(String(right.eventDate))
            || String(left.eventTime).localeCompare(String(right.eventTime)));
}

function escapeIcsText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function foldIcsLine(line) {
    const maxLength = 75;
    if (line.length <= maxLength) return line;

    let result = line.slice(0, maxLength);
    let rest = line.slice(maxLength);

    while (rest.length) {
        result += `\r\n ${rest.slice(0, maxLength - 1)}`;
        rest = rest.slice(maxLength - 1);
    }

    return result;
}

function formatIcsUtcStamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildCalendarIcsDateTime(dateKey, timeValue) {
    const timeParts = String(timeValue || '09:00:00').split(':');
    const hours = String(Number(timeParts[0]) || 9).padStart(2, '0');
    const minutes = String(Number(timeParts[1]) || 0).padStart(2, '0');
    return `${String(dateKey || '').replace(/-/g, '')}T${hours}${minutes}00`;
}

function buildCalendarIcsEndDateTime(dateKey, timeValue, durationMinutes = 60) {
    const date = parseDateKey(dateKey);
    if (!date) return buildCalendarIcsDateTime(dateKey, timeValue);

    const timeParts = String(timeValue || '09:00:00').split(':');
    let hours = Number(timeParts[0]) || 9;
    let minutes = Number(timeParts[1]) || 0;
    minutes += durationMinutes;
    hours += Math.floor(minutes / 60);
    minutes %= 60;

    const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0);
    const pad = value => String(value).padStart(2, '0');
    return `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
}

function buildCalendarIcsEventSummary(event) {
    const parts = [getCalendarEventTypeName(event) || 'Evento'];
    const clientLabel = getCalendarEventClientLabel(event);
    const orderLabel = getCalendarEventOrderLabel(event);

    if (clientLabel) parts.push(clientLabel);
    else if (orderLabel) parts.push(`Pedido ${orderLabel}`);

    return parts.join(' - ');
}

function buildCalendarIcsEventDescription(event) {
    const lines = [
        `Responsável: ${getCalendarEventResponsibleLabel(event)}`
    ];
    const clientLabel = getCalendarEventClientLabel(event);
    const orderLabel = getCalendarEventOrderLabel(event);

    if (clientLabel) lines.push(`Cliente: ${clientLabel}`);
    if (orderLabel) lines.push(`Pedido: ${orderLabel}`);
    if (event.description) lines.push(`Observação: ${event.description}`);

    return lines.join('\n');
}

function buildCalendarIcsEventLines(event) {
    const dtStart = buildCalendarIcsDateTime(event.eventDate, event.eventTime);
    const dtEnd = buildCalendarIcsEndDateTime(event.eventDate, event.eventTime);
    const uid = `fgp-calendar-event-${event.id}@formighieri`;

    return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatIcsUtcStamp()}`,
        `DTSTART;TZID=America/Sao_Paulo:${dtStart}`,
        `DTEND;TZID=America/Sao_Paulo:${dtEnd}`,
        `SUMMARY:${escapeIcsText(buildCalendarIcsEventSummary(event))}`,
        `DESCRIPTION:${escapeIcsText(buildCalendarIcsEventDescription(event))}`,
        'END:VEVENT'
    ];
}

function buildCalendarIcsDocument(events) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Formighieri//FGP Calendario//PT',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:FGP Calendário',
        'BEGIN:VTIMEZONE',
        'TZID:America/Sao_Paulo',
        'END:VTIMEZONE'
    ];

    events.forEach(event => {
        lines.push(...buildCalendarIcsEventLines(event));
    });

    lines.push('END:VCALENDAR');
    return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function slugifyCalendarExportLabel(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'export';
}

function getCalendarExportFilename() {
    const { startDate } = getCalendarVisibleRange();
    const periodLabel = calendarViewMode === 'week' ? 'semana' : 'mes';
    let responsibleSlug = 'todos';

    if (calendarFilterResponsibleId) {
        const user = calendarUsersCache.find(item => String(item.id) === String(calendarFilterResponsibleId));
        responsibleSlug = slugifyCalendarExportLabel(user?.name || calendarFilterResponsibleId);
    }

    let typeSlug = '';
    if (calendarFilterEventTypeId) {
        const type = getCalendarEventTypeById(calendarFilterEventTypeId);
        typeSlug = `-${slugifyCalendarExportLabel(type?.name || calendarFilterEventTypeId)}`;
    }

    return `fgp-calendario-${periodLabel}-${startDate}-${responsibleSlug}${typeSlug}.ics`;
}

function downloadCalendarIcsFile(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function exportCalendarToIcs() {
    if (!canAccessCalendar()) return;

    const events = getCalendarFilteredEvents();
    if (!events.length) {
        alertAppDialog(
            'Nenhum evento no período visível com os filtros aplicados.',
            { variant: 'warning', title: 'Aviso' }
        );
        return;
    }

    if (!calendarFilterResponsibleId) {
        const confirmed = await confirmAppDialog(
            'Nenhum responsável selecionado no filtro. Deseja exportar os eventos de todos os responsáveis deste período?'
        );
        if (!confirmed) return;
    }

    const content = buildCalendarIcsDocument(events);
    downloadCalendarIcsFile(content, getCalendarExportFilename());

    const responsibleName = calendarFilterResponsibleId
        ? (calendarUsersCache.find(item => String(item.id) === String(calendarFilterResponsibleId))?.name || 'responsável')
        : 'todos os responsáveis';

    alertAppDialog(
        `${events.length} evento(s) exportado(s) para ${responsibleName}.\n\nNo Google Calendar: Configurações → Importar e exportar → Importar → selecione o arquivo .ics.`,
        { variant: 'success', title: 'Arquivo .ics gerado' }
    );
}

function showCalendar() {
    if (!canAccessCalendar()) return;

    hideCalendarFloatingTooltip();
    hideSubViews();
    document.getElementById('calendar-view')?.classList.remove('hidden');
    updateMainNavActive('calendar');
    updateAdminNav();
    if (typeof updateCalendarGoogleSyncControls === 'function') {
        updateCalendarGoogleSyncControls();
    }
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
    document.getElementById('btn-calendar-export-ics')?.addEventListener('click', exportCalendarToIcs);
    document.getElementById('btn-calendar-sync-google')?.addEventListener('click', () => {
        if (typeof syncAllCalendarEventsToGoogle === 'function') {
            syncAllCalendarEventsToGoogle();
        }
    });
    document.getElementById('calendar-filter-responsible')?.addEventListener('change', applyCalendarFilters);
    document.getElementById('calendar-filter-type')?.addEventListener('change', applyCalendarFilters);
    document.getElementById('cal-event-type')?.addEventListener('change', syncCalendarEventTypeRequirements);

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

    const triggerCalendarClientPicker = () => {
        const orderCode = document.getElementById('cal-event-order-code')?.value.trim();
        if (orderCode) return;
        if (typeof openClientePickerModal === 'function') {
            openClientePickerModal(cliente => {
                const input = document.getElementById('cal-event-client-name');
                const idInput = document.getElementById('cal-event-client-id');
                if (input) input.value = cliente.nome;
                if (idInput) idInput.value = cliente.id;
            });
        }
    };
    document.getElementById('btn-cal-event-client-picker')?.addEventListener('click', triggerCalendarClientPicker);
    document.getElementById('cal-event-client-name')?.addEventListener('click', triggerCalendarClientPicker);

    document.getElementById('cal-event-order-code')?.addEventListener('input', async function () {
        syncCalendarClientNameField();
        const orderCode = this.value.trim();
        if (orderCode) {
            const order = await lookupCalendarOrderByCode(orderCode);
            const clientInput = document.getElementById('cal-event-client-name');
            if (order && clientInput) {
                clientInput.value = getOrderClientName(order) || '';
            }
        }
    });
    document.getElementById('cal-event-order-code')?.addEventListener('blur', async () => {
        const orderCode = document.getElementById('cal-event-order-code')?.value.trim();
        if (orderCode) {
            const order = await lookupCalendarOrderByCode(orderCode);
            const clientInput = document.getElementById('cal-event-client-name');
            if (order && clientInput) {
                clientInput.value = getOrderClientName(order) || '';
            }
        }
        syncCalendarClientNameField();
    });
}
