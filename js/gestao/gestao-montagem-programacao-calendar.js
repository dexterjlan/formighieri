function getMontagemProgPlacement(prog, weekStartKey) {
    const weekStart = montagemProgParseDateKey(weekStartKey);
    const weekEnd = montagemProgAddDays(weekStart, 6);
    const progStart = montagemProgParseDateKey(prog.startDate);
    const progEnd = montagemProgParseDateKey(prog.endDate);
    if (!weekStart || !weekEnd || !progStart || !progEnd) return null;

    if (progEnd < weekStart || progStart > weekEnd) return null;

    const visibleStart = progStart < weekStart ? weekStart : progStart;
    const visibleEnd = progEnd > weekEnd ? weekEnd : progEnd;
    const startCol = montagemProgDaysBetween(weekStart, visibleStart) + 1;
    const span = montagemProgDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span, visibleStartKey: montagemProgToDateKey(visibleStart), visibleEndKey: montagemProgToDateKey(visibleEnd) };
}

function montagemProgPlacementsOverlap(a, b) {
    if (!a || !b) return false;
    const aEnd = a.startCol + a.span;
    const bEnd = b.startCol + b.span;
    return a.startCol < bEnd && b.startCol < aEnd;
}

function getMontagemProgCrewKey(prog) {
    const keys = getMontagemProgCrewMembers(prog)
        .map(member => `${member.type}:${member.id}`)
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    if (!keys.length) return 'none';
    return keys.join('+');
}

function getMontagemProgCrewColorIndex(crewKey) {
    let hash = 0;
    for (let index = 0; index < crewKey.length; index += 1) {
        hash = ((hash << 5) - hash) + crewKey.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash) % MONTAGEM_PROG_CREW_PALETTE.length;
}

function getMontagemProgCrewColors(crewKey) {
    return MONTAGEM_PROG_CREW_PALETTE[getMontagemProgCrewColorIndex(crewKey)];
}

function getMontagemProgCrewBarStyle(crewKey) {
    const colors = getMontagemProgCrewColors(crewKey);
    return `--montagem-prog-bar-from: ${colors.from}; --montagem-prog-bar-to: ${colors.to};`;
}

function getMontagemProgSoloCrewKey(workerType, workerId) {
    return `${workerType}:${Number(workerId)}`;
}

function montagemProgLaneHasPlacementOverlap(lane, placement) {
    return lane.some(item => montagemProgPlacementsOverlap(item.placement, placement));
}

function assignMontagemProgLanes(programacoes, weekStartKey) {
    const sorted = [...programacoes].sort((left, right) =>
        String(left.startDate).localeCompare(String(right.startDate))
        || Number(left.id) - Number(right.id)
    );

    const lanes = [];

    sorted.forEach(prog => {
        const placement = getMontagemProgPlacement(prog, weekStartKey);
        if (!placement) return;

        const crewKey = getMontagemProgCrewKey(prog);

        let targetLane = lanes.find(lane =>
            lane.some(item => getMontagemProgCrewKey(item.prog) === crewKey)
            && !montagemProgLaneHasPlacementOverlap(lane, placement)
        );

        if (!targetLane) {
            targetLane = lanes.find(lane => !montagemProgLaneHasPlacementOverlap(lane, placement));
        }

        if (!targetLane) {
            targetLane = [];
            lanes.push(targetLane);
        }

        targetLane.push({ prog, placement });
    });

    lanes.sort((left, right) => {
        const leftKey = left.length ? getMontagemProgCrewKey(left[0].prog) : 'zzz';
        const rightKey = right.length ? getMontagemProgCrewKey(right[0].prog) : 'zzz';
        if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);

        const leftStart = left[0]?.placement?.startCol || 0;
        const rightStart = right[0]?.placement?.startCol || 0;
        return leftStart - rightStart;
    });

    while (lanes.length < MONTAGEM_PROG_MIN_LANES) {
        lanes.push([]);
    }

    return lanes;
}

function buildMontagemProgConflictMap(programacoes) {
    const conflictsByProgId = new Map();
    const assignmentsByDateWorker = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const crewMembers = getMontagemProgCrewMembers(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            crewMembers.forEach(member => {
                const key = `${dateKey}:${member.type}:${member.id}`;
                if (!assignmentsByDateWorker.has(key)) assignmentsByDateWorker.set(key, []);
                assignmentsByDateWorker.get(key).push(prog.id);
            });
        }
    });

    assignmentsByDateWorker.forEach(ids => {
        if (ids.length < 2) return;
        ids.forEach(id => {
            if (!conflictsByProgId.has(id)) conflictsByProgId.set(id, new Set());
            ids.forEach(otherId => {
                if (otherId !== id) conflictsByProgId.get(id).add(otherId);
            });
        });
    });

    return conflictsByProgId;
}

function buildMontagemProgConflictDetails(programacoes) {
    const assignmentsByDateWorker = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const crewMembers = getMontagemProgCrewMembers(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            crewMembers.forEach(member => {
                const key = `${dateKey}:${member.type}:${member.id}`;
                if (!assignmentsByDateWorker.has(key)) assignmentsByDateWorker.set(key, new Set());
                assignmentsByDateWorker.get(key).add(prog.id);
            });
        }
    });

    const details = [];

    assignmentsByDateWorker.forEach((progIds, key) => {
        if (progIds.size < 2) return;

        const [dateKey, workerType, workerId] = key.split(':');
        const date = montagemProgParseDateKey(dateKey);
        const dateLabel = date
            ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
            : dateKey;
        const workerName = workerType === 'marceneiro'
            ? getMontagemProgMarceneiroName(workerId)
            : getMontagemProgMontadorName(workerId);
        const summaries = [...progIds]
            .map(id => {
                const prog = programacoes.find(item => Number(item.id) === Number(id));
                return prog ? getMontagemProgBarSummary(prog) : `Montagem #${id}`;
            })
            .join(' · ');

        details.push({
            sortKey: `${dateKey}:${workerName}`,
            text: `${workerName} em ${dateLabel}: ${summaries}`
        });
    });

    return details
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
        .map(item => item.text);
}

function renderMontagemProgWorkerFilter() {
    const select = document.getElementById('montagem-prog-montador-filter');
    if (!select) return;

    const montadores = getMontagemProgSelectableMontadores();
    const marceneiros = getMontagemProgSelectableMarceneiros();
    const currentValue = getMontagemProgWorkerFilterKey(montagemProgWorkerFilter);

    select.innerHTML = `
        <option value="">Todos</option>
        ${montadores.length ? `
            <optgroup label="Montadores">
                ${montadores.map(montador => `
                    <option value="montador:${montador.id}">${escapeHtml(montador.name)}</option>
                `).join('')}
            </optgroup>
        ` : ''}
        ${marceneiros.length ? `
            <optgroup label="Marceneiros">
                ${marceneiros.map(marceneiro => `
                    <option value="marceneiro:${marceneiro.id}">${escapeHtml(marceneiro.name)}</option>
                `).join('')}
            </optgroup>
        ` : ''}
    `;

    select.value = currentValue;
    if (!select.value) montagemProgWorkerFilter = null;
}

function renderMontagemProgPaletteItem(workerType, worker) {
    const filterKey = getMontagemProgWorkerFilterKey(montagemProgWorkerFilter);
    const workerKey = getMontagemProgWorkerFilterKey({ type: workerType, id: worker.id });
    const isFiltered = filterKey && workerKey === filterKey;
    const crewStyle = getMontagemProgCrewBarStyle(getMontagemProgSoloCrewKey(workerType, worker.id));
    const itemClass = workerType === 'marceneiro'
        ? 'montagem-prog-palette-item montagem-prog-palette-item--marceneiro'
        : 'montagem-prog-palette-item';

    return `
        <div class="${itemClass} ${isFiltered ? 'montagem-prog-palette-item--filtered' : ''}"
            draggable="true"
            data-worker-type="${workerType}"
            data-worker-id="${worker.id}"
            title="Arraste para a semana">
            <span class="montagem-prog-palette-item__color" style="${crewStyle}" aria-hidden="true"></span>
            <span class="montagem-prog-palette-item__grip" aria-hidden="true">⠿</span>
            <span>${escapeHtml(worker.name)}</span>
        </div>
    `;
}

function bindMontagemProgPaletteItems(palette) {
    palette.querySelectorAll('.montagem-prog-palette-item').forEach(item => {
        item.addEventListener('dragstart', event => {
            if (isMontagemProgramacaoReadOnly()) {
                event.preventDefault();
                return;
            }

            montagemProgDragWorker = {
                type: item.dataset.workerType,
                id: Number(item.dataset.workerId)
            };
            if (event.dataTransfer) {
                event.dataTransfer.setData('text/plain', getMontagemProgWorkerFilterKey(montagemProgDragWorker));
                event.dataTransfer.setData('application/x-montagem-worker-type', montagemProgDragWorker.type);
                event.dataTransfer.setData('application/x-montagem-worker-id', String(montagemProgDragWorker.id));
                event.dataTransfer.effectAllowed = 'copy';
            }
            item.classList.add('is-dragging');
            document.body.classList.add('montagem-prog-dragging');
        });
        item.addEventListener('dragend', () => {
            montagemProgDragWorker = null;
            item.classList.remove('is-dragging');
            document.body.classList.remove('montagem-prog-dragging');
            document.querySelectorAll('.montagem-prog-day-slot.is-drop-target, .montagem-prog-bar.is-drop-target, .montagem-prog-lane.is-drop-target')
                .forEach(element => element.classList.remove('is-drop-target'));
        });
        item.addEventListener('dblclick', () => {
            if (isMontagemProgramacaoReadOnly()) return;
            openMontagemProgModal(null, getMontagemProgWeekStartKey(), {
                type: item.dataset.workerType,
                id: Number(item.dataset.workerId)
            });
        });
    });
}

function renderMontagemProgPalette() {
    const palette = document.getElementById('montagem-prog-palette');
    if (!palette) return;

    const montadores = getMontagemProgSelectableMontadores();
    const marceneiros = getMontagemProgSelectableMarceneiros();

    if (!montadores.length && !marceneiros.length) {
        palette.innerHTML = '<p class="text-[11px] text-amber-700">Cadastre montadores ou marceneiros ativos em Gestão.</p>';
        return;
    }

    const sections = [];

    if (montadores.length) {
        sections.push(`
            <p class="montagem-prog-palette-section-label">Montadores</p>
            <div class="space-y-1.5">
                ${montadores.map(montador => renderMontagemProgPaletteItem('montador', montador)).join('')}
            </div>
        `);
    }

    if (marceneiros.length) {
        sections.push(`
            <p class="montagem-prog-palette-section-label ${montadores.length ? 'mt-3' : ''}">Marceneiros</p>
            <div class="space-y-1.5">
                ${marceneiros.map(marceneiro => renderMontagemProgPaletteItem('marceneiro', marceneiro)).join('')}
            </div>
        `);
    }

    palette.innerHTML = sections.join('');
    bindMontagemProgPaletteItems(palette);
}

function renderMontagemProgConflicts(conflictMap) {
    const banner = document.getElementById('montagem-prog-conflicts');
    if (!banner) return;

    if (!conflictMap.size) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }

    const details = buildMontagemProgConflictDetails(montagemProgCache);
    const visibleDetails = details.slice(0, 4);
    const remaining = details.length - visibleDetails.length;

    banner.classList.remove('hidden');
    banner.innerHTML = `
        <p class="font-semibold">Atenção: ${conflictMap.size} montagem(ns) com possível conflito de agenda.</p>
        <ul class="montagem-prog-conflicts-list">
            ${visibleDetails.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
            ${remaining > 0 ? `<li>+ ${remaining} outro(s) conflito(s)</li>` : ''}
        </ul>
    `;
}

function renderMontagemProgWeekGrid() {
    hideMontagemProgFloatingTooltip();

    const grid = document.getElementById('montagem-prog-week-grid');
    if (!grid) return;

    const weekStartKey = getMontagemProgWeekStartKey();
    const weekDateKeys = getMontagemProgWeekDateKeys();
    const visibleProgramacoes = getMontagemProgVisibleProgramacoes();
    const conflictMap = buildMontagemProgConflictMap(montagemProgCache);
    const lanes = assignMontagemProgLanes(visibleProgramacoes, weekStartKey);

    renderMontagemProgConflicts(conflictMap);

    const monthGroups = buildMontagemProgMonthGroups(weekDateKeys);
    const monthHeadersHtml = monthGroups.map(group => `
        <div class="montagem-prog-month-header montagem-prog-month-header--grouped ${group.isWeekendGroup ? 'montagem-prog-month-header--weekend' : ''}"
            style="grid-column: ${group.startCol} / span ${group.span};">
            ${escapeHtml(group.monthLabel)}
        </div>
    `).join('');

    const headersHtml = weekDateKeys.map((dateKey, index) => {
        const isWeekend = index >= 5;
        return `
            <div class="montagem-prog-day-header ${isWeekend ? 'montagem-prog-day-header--weekend' : ''}">
                <span class="montagem-prog-day-header__weekday">${MONTAGEM_PROG_WEEKDAYS[index]}</span>
                <span class="montagem-prog-day-header__date">${formatMontagemProgDayHeader(dateKey)}</span>
            </div>
        `;
    }).join('');

    const lanesHtml = lanes.map((laneItems, laneIndex) => {
        const slotsHtml = weekDateKeys.map((dateKey, index) => {
            const column = index + 1;
            return `
            <div class="montagem-prog-day-slot ${index >= 5 ? 'montagem-prog-day-slot--weekend' : ''}"
                style="grid-column: ${column};"
                data-date="${dateKey}"
                data-lane="${laneIndex}"></div>
        `;
        }).join('');

        const barsHtml = laneItems.map(({ prog, placement }) => {
            const crewKey = getMontagemProgCrewKey(prog);
            const hasConflict = conflictMap.has(prog.id);
            const barClass = [
                'montagem-prog-bar',
                'montagem-prog-bar--crew',
                hasConflict ? 'montagem-prog-bar--conflict' : ''
            ].filter(Boolean).join(' ');

            return `
                <div class="${barClass}"
                    data-programacao-id="${prog.id}"
                    style="${getMontagemProgCrewBarStyle(crewKey)} grid-row: 1; grid-column: ${placement.startCol} / span ${placement.span};">
                    <button type="button" class="montagem-prog-bar-resize montagem-prog-bar-resize--start"
                        data-programacao-id="${prog.id}"
                        data-edge="start"
                        aria-label="Ajustar início"></button>
                    <button type="button" class="montagem-prog-bar-body" data-programacao-id="${prog.id}">
                        <span class="montagem-prog-bar-montadores">${escapeHtml(getMontagemProgPrimaryCrewLabel(prog))}</span>
                        <span class="montagem-prog-bar-meta">${escapeHtml(getMontagemProgBarClientLabel(prog))}</span>
                    </button>
                    <button type="button" class="montagem-prog-bar-resize montagem-prog-bar-resize--end"
                        data-programacao-id="${prog.id}"
                        data-edge="end"
                        aria-label="Ajustar fim"></button>
                </div>
            `;
        }).join('');

        return `
            <div class="montagem-prog-lane" data-lane="${laneIndex}">
                ${slotsHtml}
                ${barsHtml}
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        <div class="montagem-prog-month-headers">${monthHeadersHtml}</div>
        <div class="montagem-prog-day-headers">${headersHtml}</div>
        <div class="montagem-prog-lanes">${lanesHtml}</div>
    `;

    const emptyState = document.getElementById('montagem-prog-empty-filter');
    if (montagemProgWorkerFilter && !visibleProgramacoes.length) {
        if (!emptyState) {
            const message = document.createElement('p');
            message.id = 'montagem-prog-empty-filter';
            message.className = 'montagem-prog-empty-filter text-xs text-slate-400 text-center py-4';
            message.textContent = 'Nenhuma montagem para o responsável selecionado nesta semana.';
            grid.insertAdjacentElement('afterend', message);
        }
    } else {
        emptyState?.remove();
    }

    bindMontagemProgWeekInteractions(grid);
}

function getMontagemProgDragWorkerFromEvent(event) {
    const type = event.dataTransfer?.getData('application/x-montagem-worker-type')
        || montagemProgDragWorker?.type;
    const id = Number(
        event.dataTransfer?.getData('application/x-montagem-worker-id')
        || montagemProgDragWorker?.id
    );

    if (type && id && (type === 'montador' || type === 'marceneiro')) {
        return { type, id };
    }

    const legacyMontadorId = Number(
        event.dataTransfer?.getData('application/x-montagem-montador-id')
        || event.dataTransfer?.getData('text/plain')
    );
    if (legacyMontadorId) {
        return { type: 'montador', id: legacyMontadorId };
    }

    return null;
}

function clearMontagemProgDropTargets(grid) {
    grid?.querySelectorAll('.montagem-prog-day-slot.is-drop-target, .montagem-prog-bar.is-drop-target, .montagem-prog-lane.is-drop-target')
        .forEach(element => element.classList.remove('is-drop-target'));
}

function updateMontagemProgDropTargetHighlight(event, grid) {
    clearMontagemProgDropTargets(grid);

    const bar = event.target.closest('.montagem-prog-bar');
    if (bar) {
        bar.classList.add('is-drop-target');
        return;
    }

    const slot = getMontagemProgDropTargetSlot(event.clientX, event.clientY, grid);
    if (slot) {
        slot.classList.add('is-drop-target');
        return;
    }

    const lane = getMontagemProgLaneFromPointer(event.clientY, grid);
    lane?.classList.add('is-drop-target');
}

async function handleMontagemProgCalendarDrop(event, grid) {
    if (isMontagemProgramacaoReadOnly()) return;

    event.preventDefault();
    event.stopPropagation();
    clearMontagemProgDropTargets(grid);

    const worker = getMontagemProgDragWorkerFromEvent(event);
    if (!worker) return;

    const bar = event.target.closest('.montagem-prog-bar');
    if (bar) {
        await createMontagemProgFromDrop(worker, null, Number(bar.dataset.programacaoId));
        return;
    }

    const slot = getMontagemProgDropTargetSlot(event.clientX, event.clientY, grid);
    const dateKey = slot?.dataset.date || getMontagemProgDateKeyFromPointer(event.clientX, grid);
    if (!dateKey) return;

    await createMontagemProgFromDrop(worker, dateKey);
}

function bindMontagemProgWeekInteractions(grid) {
    if (grid.dataset.interactionsBound === '1') return;
    grid.dataset.interactionsBound = '1';

    const allowDrop = event => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    grid.addEventListener('dragover', event => {
        if (!montagemProgDragWorker && !event.dataTransfer?.types?.length) return;
        allowDrop(event);
        updateMontagemProgDropTargetHighlight(event, grid);
    });

    grid.addEventListener('dragleave', event => {
        const related = event.relatedTarget;
        if (related && grid.contains(related)) return;
        clearMontagemProgDropTargets(grid);
    });

    grid.addEventListener('drop', event => {
        handleMontagemProgCalendarDrop(event, grid);
    });

    grid.addEventListener('click', event => {
        if (isMontagemProgramacaoReadOnly()) return;

        const slot = event.target.closest('.montagem-prog-day-slot');
        if (slot?.dataset.date) {
            openMontagemProgModal(null, slot.dataset.date);
            return;
        }
    });

    grid.addEventListener('pointerdown', event => {
        if (isMontagemProgramacaoReadOnly()) return;

        const handle = event.target.closest('.montagem-prog-bar-resize');
        if (handle) {
            event.preventDefault();
            event.stopPropagation();
            startMontagemProgResize(handle, event);
            return;
        }

        const barBody = event.target.closest('.montagem-prog-bar-body');
        if (barBody) {
            event.preventDefault();
            event.stopPropagation();
            startMontagemProgMoveBar(barBody, event);
            return;
        }
    });

    document.getElementById('montagem-prog-week-grid')?.closest('.montagem-prog-calendar')?.addEventListener('dragover', event => {
        if (!montagemProgDragWorker && !event.dataTransfer?.types?.length) return;
        allowDrop(event);
    });

    document.getElementById('montagem-prog-week-grid')?.closest('.montagem-prog-calendar')?.addEventListener('drop', event => {
        const gridEl = document.getElementById('montagem-prog-week-grid');
        if (!gridEl || gridEl.contains(event.target)) return;
        handleMontagemProgCalendarDrop(event, gridEl);
    });
}

function getMontagemProgDateKeyFromPointer(clientX, grid) {
    const weekDateKeys = getMontagemProgWeekDateKeys();
    const slot = getMontagemProgDropTargetSlot(clientX, Number.NaN, grid);
    if (slot?.dataset.date) return slot.dataset.date;

    const headers = grid?.querySelectorAll('.montagem-prog-day-header') || [];
    if (!headers.length) return null;

    for (let index = 0; index < headers.length; index += 1) {
        const rect = headers[index].getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
            return weekDateKeys[index] || null;
        }
    }

    let closestIndex = 0;
    let closestDistance = Infinity;

    headers.forEach((header, index) => {
        const rect = header.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const distance = Math.abs(clientX - center);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return weekDateKeys[closestIndex] || null;
}

function getMontagemProgDateFromPointer(clientX, grid) {
    return getMontagemProgDateKeyFromPointer(clientX, grid);
}

function getMontagemProgDropTargetSlot(clientX, clientY, grid) {
    const slots = grid?.querySelectorAll('.montagem-prog-day-slot') || [];
    let targetSlot = null;

    slots.forEach(slot => {
        const rect = slot.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right) return;
        if (Number.isFinite(clientY) && (clientY < rect.top || clientY > rect.bottom)) return;
        if (!targetSlot || rect.top >= targetSlot.getBoundingClientRect().top) {
            targetSlot = slot;
        }
    });

    return targetSlot;
}

function getMontagemProgLaneFromPointer(clientY, grid) {
    const lanes = grid?.querySelectorAll('.montagem-prog-lane') || [];
    if (!lanes.length || !Number.isFinite(clientY)) return null;

    for (let index = 0; index < lanes.length; index += 1) {
        const rect = lanes[index].getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
            return lanes[index];
        }
    }

    let closestLane = lanes[0];
    let closestDistance = Infinity;

    lanes.forEach(lane => {
        const rect = lane.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(clientY - center);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestLane = lane;
        }
    });

    return closestLane;
}

function startMontagemProgResize(handle, event) {
    if (isMontagemProgramacaoReadOnly()) return;

    const programacaoId = Number(handle.dataset.programacaoId);
    const edge = handle.dataset.edge;
    const prog = montagemProgCache.find(item => Number(item.id) === programacaoId);
    if (!prog) return;

    montagemProgResizeState = {
        programacaoId,
        edge,
        originalStartDate: prog.startDate,
        originalEndDate: prog.endDate,
        previewDate: edge === 'start' ? prog.startDate : prog.endDate
    };

    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('montagem-prog-resizing');

    const onPointerMove = moveEvent => {
        const grid = document.getElementById('montagem-prog-week-grid');
        const dateKey = getMontagemProgDateFromPointer(moveEvent.clientX, grid);
        if (!dateKey || !montagemProgResizeState) return;
        montagemProgResizeState.previewDate = dateKey;
        updateMontagemProgResizePreview();
    };

    const onPointerUp = async upEvent => {
        handle.releasePointerCapture(upEvent.pointerId);
        document.body.classList.remove('montagem-prog-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        if (!montagemProgResizeState) return;

        const { programacaoId: id, edge: resizeEdge, originalStartDate, originalEndDate, previewDate } = montagemProgResizeState;
        montagemProgResizeState = null;

        let nextStartDate = originalStartDate;
        let nextEndDate = originalEndDate;

        if (resizeEdge === 'start') nextStartDate = previewDate;
        if (resizeEdge === 'end') nextEndDate = previewDate;

        if (nextStartDate > nextEndDate) {
            if (resizeEdge === 'start') nextEndDate = nextStartDate;
            else nextStartDate = nextEndDate;
        }

        if (nextStartDate === originalStartDate && nextEndDate === originalEndDate) {
            await loadMontagemProgramacaoView();
            return;
        }

        await updateMontagemProgDates(id, nextStartDate, nextEndDate);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

function updateMontagemProgResizePreview() {
    if (!montagemProgResizeState) return;

    const prog = montagemProgCache.find(item => Number(item.id) === montagemProgResizeState.programacaoId);
    if (!prog) return;

    const previewProg = {
        ...prog,
        startDate: montagemProgResizeState.edge === 'start'
            ? montagemProgResizeState.previewDate
            : prog.startDate,
        endDate: montagemProgResizeState.edge === 'end'
            ? montagemProgResizeState.previewDate
            : prog.endDate
    };

    if (previewProg.startDate > previewProg.endDate) {
        if (montagemProgResizeState.edge === 'start') previewProg.endDate = previewProg.startDate;
        else previewProg.startDate = previewProg.endDate;
    }

    const index = montagemProgCache.findIndex(item => Number(item.id) === Number(prog.id));
    if (index >= 0) {
        montagemProgCache[index] = previewProg;
        renderMontagemProgWeekGrid();
    }
}

let montagemProgMoveState = null;

function startMontagemProgMoveBar(button, event) {
    if (isMontagemProgramacaoReadOnly()) return;

    const programacaoId = Number(button.dataset.programacaoId);
    const prog = montagemProgCache.find(item => Number(item.id) === programacaoId);
    if (!prog) return;

    const startDt = new Date(prog.startDate + 'T00:00:00');
    const endDt = new Date(prog.endDate + 'T00:00:00');
    const durationDays = Math.max(1, Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1);

    const startX = event.clientX;
    const startY = event.clientY;
    let isDragging = false;

    montagemProgMoveState = {
        programacaoId,
        durationDays,
        originalStartDate: prog.startDate,
        originalEndDate: prog.endDate,
        previewStartDate: prog.startDate,
        previewEndDate: prog.endDate
    };

    try {
        button.setPointerCapture(event.pointerId);
    } catch (_) {}

    const onPointerMove = moveEvent => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        if (!isDragging && (deltaX > 4 || deltaY > 4)) {
            isDragging = true;
            document.body.classList.add('montagem-prog-resizing');
        }

        if (!isDragging || !montagemProgMoveState) return;

        const grid = document.getElementById('montagem-prog-week-grid');
        const targetDateKey = getMontagemProgDateFromPointer(moveEvent.clientX, grid);
        if (!targetDateKey) return;

        const newStart = new Date(targetDateKey + 'T00:00:00');
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + (durationDays - 1));

        const previewStartStr = toDateKey(newStart);
        const previewEndStr = toDateKey(newEnd);

        if (montagemProgMoveState.previewStartDate !== previewStartStr) {
            montagemProgMoveState.previewStartDate = previewStartStr;
            montagemProgMoveState.previewEndDate = previewEndStr;
            updateMontagemProgMovePreview();
        }
    };

    const onPointerUp = async upEvent => {
        try {
            button.releasePointerCapture(upEvent.pointerId);
        } catch (_) {}

        document.body.classList.remove('montagem-prog-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        if (!isDragging) {
            openMontagemProgModal(prog);
            montagemProgMoveState = null;
            return;
        }

        if (!montagemProgMoveState) return;

        const { programacaoId: id, originalStartDate, originalEndDate, previewStartDate, previewEndDate } = montagemProgMoveState;
        montagemProgMoveState = null;

        if (previewStartDate === originalStartDate && previewEndDate === originalEndDate) {
            await loadMontagemProgramacaoView();
            return;
        }

        await updateMontagemProgDates(id, previewStartDate, previewEndDate);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

