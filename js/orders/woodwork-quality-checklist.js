const WOODWORK_CHECKLIST_STATUS_DRAFT = 'draft';
const WOODWORK_CHECKLIST_STATUS_COMPLETED = 'completed';
const WOODWORK_CHECKLIST_MONTAGEM_STATUS = 'Montagem Interna';

let woodworkChecklistEditorState = null;

const woodworkChecklistEditorOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('woodwork-checklist-editor-modal', {
        closeButtonSelector: '#btn-close-woodwork-checklist-editor',
        disableFormSelector: '#woodwork-checklist-editor-modal button.woodwork-checklist-answer-btn, #woodwork-checklist-editor-modal textarea, #woodwork-checklist-editor-modal #btn-woodwork-checklist-print, #woodwork-checklist-editor-modal #btn-woodwork-checklist-save, #woodwork-checklist-editor-modal #btn-woodwork-checklist-complete'
    })
    : null;

function canManageWoodworkQualityChecklist() {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    return typeof canActPendenciasGestorFabrica === 'function' && canActPendenciasGestorFabrica();
}

function isWoodworkChecklistTablesMissingError(error) {
    const message = String(error?.message || error || '');
    return /WoodworkQualityChecklist/i.test(message)
        && /could not find|does not exist|schema cache|não encontr/i.test(message);
}

function canOpenWoodworkQualityChecklistForProject(project) {
    if (!canManageWoodworkQualityChecklist() || !project) return false;
    const statusName = typeof getOrderProjectStatusName === 'function'
        ? getOrderProjectStatusName(project)
        : (project?.projectStatus?.name || '');
    return statusName === WOODWORK_CHECKLIST_MONTAGEM_STATUS;
}

function getWoodworkChecklistResponsibleName(checklist = {}) {
    const fromEmbed = checklist.createdBy?.name;
    if (fromEmbed) return fromEmbed;
    if (
        checklist.createdById
        && currentUser?.id === checklist.createdById
        && currentUser?.name
    ) {
        return currentUser.name;
    }
    return '—';
}

function formatWoodworkChecklistDateLabel(dateStr) {
    if (!dateStr) return '—';
    if (typeof formatDisplayDate === 'function') return formatDisplayDate(dateStr);
    const part = String(dateStr).split('T')[0];
    const [y, m, d] = part.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return part;
}

async function fetchWoodworkChecklistsForProject(orderProjectId) {
    const { data, error } = await supabaseClient
        .from('WoodworkQualityChecklist')
        .select('id, orderProjectId, versionNumber, status, completedAt, createdAt, updatedAt')
        .eq('orderProjectId', Number(orderProjectId))
        .order('versionNumber', { ascending: false });

    if (error) throw error;
    return data || [];
}

async function hasCompletedWoodworkQualityChecklist(orderProjectId) {
    try {
        const rows = await fetchWoodworkChecklistsForProject(orderProjectId);
        return rows.some(row => row.status === WOODWORK_CHECKLIST_STATUS_COMPLETED);
    } catch (error) {
        if (isWoodworkChecklistTablesMissingError(error)) return false;
        console.warn('hasCompletedWoodworkQualityChecklist:', error);
        return false;
    }
}

async function warnIfWoodworkQualityChecklistIncomplete(orderProjectId, projectLabel = 'este projeto') {
    const completed = await hasCompletedWoodworkQualityChecklist(orderProjectId);
    if (completed) return true;

    return confirmAppDialog(
        `O projeto "${projectLabel}" não possui checklist de qualidade concluído. Deseja finalizar a montagem interna mesmo assim?`,
        {
            title: 'Checklist pendente',
            confirmLabel: 'Finalizar mesmo assim',
            cancelLabel: 'Voltar',
            variant: 'warning'
        }
    );
}

async function fetchOrderProjectForWoodworkChecklist(orderProjectId) {
    const orderEmbed = typeof getOrderSalesOrderEmbed === 'function'
        ? getOrderSalesOrderEmbed('clientDeliveryDate')
        : 'order:salesOrders(id, orderCode, clientId, clientDeliveryDate, client:Client(name))';

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, name, projectCode, cabinetMakerId,
            internalAssemblyStartDate, internalAssemblyEndDate, deliveryDate,
            ${orderEmbed},
            projectStatus:OrderProjectStatus(id, name)
        `)
        .eq('id', Number(orderProjectId))
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (typeof enrichProjectMarceneiro === 'function') {
        return await enrichProjectMarceneiro(data);
    }
    return data;
}

function getWoodworkChecklistDisplayDate(checklist = {}) {
    if (checklist.status === WOODWORK_CHECKLIST_STATUS_COMPLETED && checklist.completedAt) {
        return String(checklist.completedAt).split('T')[0];
    }
    if (typeof getLocalIsoDate === 'function') {
        return getLocalIsoDate();
    }
    return new Date().toISOString().split('T')[0];
}

async function resolveWoodworkChecklistHeaderContext(checklist = {}) {
    const projectId = Number(checklist.orderProjectId || checklist.orderProject?.id);
    let project = checklist.orderProject || null;

    if (projectId) {
        const needsFetch = !project?.name || !project?.order;
        if (needsFetch) {
            project = await fetchOrderProjectForWoodworkChecklist(projectId);
        } else if (typeof enrichProjectMarceneiro === 'function') {
            project = await enrichProjectMarceneiro(project);
        }
    }

    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project?.order)
        : (project?.order?.client?.name || '—');
    const cabinetMakerName = (typeof getMarceneiroNameFromProject === 'function'
        ? getMarceneiroNameFromProject(project)
        : null) || '—';

    return {
        orderClientLine: `${orderCode} — ${clientName}`,
        environmentName: project?.name || '—',
        checklistResponsibleName: getWoodworkChecklistResponsibleName(checklist),
        cabinetMakerName,
        checklistDateLabel: formatWoodworkChecklistDateLabel(getWoodworkChecklistDisplayDate(checklist))
    };
}

function renderWoodworkChecklistHeaderInForm(context = {}) {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || '—';
    };
    setText('woodwork-checklist-header-order-client', context.orderClientLine);
    setText('woodwork-checklist-header-environment', context.environmentName);
    setText('woodwork-checklist-header-cabinet-maker', context.cabinetMakerName);
    setText('woodwork-checklist-header-date', context.checklistDateLabel);
}

async function fetchActiveWoodworkChecklistCatalogItems() {
    if (typeof loadWoodworkQualityChecklistItems === 'function') {
        const { data, error } = await loadWoodworkQualityChecklistItems(true);
        if (error) throw error;
        return data;
    }

    const { data, error } = await supabaseClient
        .from('WoodworkQualityChecklistItem')
        .select('id, name, sortOrder, isActive')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function getNextWoodworkChecklistVersionNumber(orderProjectId) {
    const rows = await fetchWoodworkChecklistsForProject(orderProjectId);
    const max = rows.reduce((acc, row) => Math.max(acc, Number(row.versionNumber) || 0), 0);
    return max + 1;
}

async function createWoodworkQualityChecklistVersion(orderProjectId) {
    const project = await fetchOrderProjectForWoodworkChecklist(orderProjectId);
    if (!project) throw new Error('Projeto não encontrado.');

    const catalogItems = await fetchActiveWoodworkChecklistCatalogItems();
    if (!catalogItems.length) {
        throw new Error('Nenhum item ativo no cadastro do checklist. Cadastre em Configurações → Cadastros.');
    }

    const versionNumber = await getNextWoodworkChecklistVersionNumber(orderProjectId);
    const now = new Date().toISOString();

    const { data: created, error } = await supabaseClient
        .from('WoodworkQualityChecklist')
        .insert({
            orderProjectId: Number(orderProjectId),
            versionNumber,
            status: WOODWORK_CHECKLIST_STATUS_DRAFT,
            createdById: currentUser?.id || null,
            createdAt: now,
            updatedAt: now
        })
        .select('id')
        .single();

    if (error) throw error;

    const lines = catalogItems.map((item, index) => ({
        checklistId: created.id,
        catalogItemId: item.id,
        sortOrder: Number(item.sortOrder) || (index + 1),
        label: item.name
    }));

    const { error: linesError } = await supabaseClient
        .from('WoodworkQualityChecklistLine')
        .insert(lines);

    if (linesError) throw linesError;

    return created.id;
}

async function openWoodworkQualityChecklistEntryFlow(orderProjectId) {
    if (!canManageWoodworkQualityChecklist()) {
        alertAppDialog('Sem permissão para o checklist de qualidade.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const projectId = Number(orderProjectId);
    if (!projectId) return;

    try {
        const project = await fetchOrderProjectForWoodworkChecklist(projectId);
        if (!canOpenWoodworkQualityChecklistForProject(project)) {
            alertAppDialog('O checklist só pode ser preenchido com o projeto em Montagem Interna.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        const checklists = await fetchWoodworkChecklistsForProject(projectId);
        const draft = checklists.find(row => row.status === WOODWORK_CHECKLIST_STATUS_DRAFT);
        if (draft) {
            await openWoodworkQualityChecklistEditor(draft.id);
            return;
        }

        const latestCompleted = checklists.find(row => row.status === WOODWORK_CHECKLIST_STATUS_COMPLETED);
        if (latestCompleted) {
            const choice = await confirmAppDialog(
                'Já existe um checklist concluído para este projeto. Você pode visualizar a última versão ou criar uma nova.',
                {
                    title: 'Checklist concluído',
                    confirmLabel: 'Criar novo',
                    alternateLabel: 'Ver concluído',
                    cancelLabel: 'Cancelar',
                    variant: 'confirm'
                }
            );
            if (choice === 'alternate') {
                await openWoodworkQualityChecklistEditor(latestCompleted.id);
                return;
            }
            if (!choice) return;
        }

        const checklistId = await createWoodworkQualityChecklistVersion(projectId);
        await openWoodworkQualityChecklistEditor(checklistId);
    } catch (error) {
        const hint = isWoodworkChecklistTablesMissingError(error)
            ? '\n\nExecute supabase/feats/create-woodwork-quality-checklist.sql no Supabase SQL Editor (DEV).'
            : '';
        alertAppDialog(`Erro ao abrir checklist: ${error.message}${hint}`);
    }
}

async function fetchWoodworkChecklistDetail(checklistId) {
    const { data: checklist, error } = await supabaseClient
        .from('WoodworkQualityChecklist')
        .select(`
            *,
            createdBy:appUsers!createdById(id, name),
            orderProject:OrderProject(
                id, orderId, name, projectCode, cabinetMakerId,
                order:salesOrders(id, orderCode, client:Client(name))
            )
        `)
        .eq('id', Number(checklistId))
        .maybeSingle();

    if (error) throw error;
    if (!checklist) throw new Error('Checklist não encontrado.');

    const { data: lines, error: linesError } = await supabaseClient
        .from('WoodworkQualityChecklistLine')
        .select('id, sortOrder, label, answer, catalogItemId')
        .eq('checklistId', Number(checklistId))
        .order('sortOrder', { ascending: true });

    if (linesError) throw linesError;

    return { checklist, lines: lines || [] };
}

function renderWoodworkChecklistAnswerButtons(lineId, answer, readOnly) {
    const options = [
        { value: 'ok', label: 'Ok' },
        { value: 'no', label: 'Não' },
        { value: 'na', label: 'N/A' }
    ];
    return `<div class="woodwork-checklist-answers" data-line-id="${Number(lineId)}" role="group" aria-label="Resposta do item">
        ${options.map(opt => {
            const active = answer === opt.value;
            const disabled = readOnly ? 'disabled' : '';
            return `<button type="button"
                class="woodwork-checklist-answer-btn${active ? ' is-active' : ''}"
                data-answer="${opt.value}" ${disabled}>${escapeHtml(opt.label)}</button>`;
        }).join('')}
    </div>`;
}

function bindWoodworkChecklistAnswerButtons(root, onChange) {
    root?.querySelectorAll('.woodwork-checklist-answer-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            const group = button.closest('.woodwork-checklist-answers');
            const lineId = Number(group?.dataset.lineId);
            const answer = button.dataset.answer;
            group?.querySelectorAll('.woodwork-checklist-answer-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn === button);
            });
            if (lineId && onChange) onChange(lineId, answer);
        });
    });
}

async function fillWoodworkChecklistEditorForm(detail) {
    const { checklist, lines } = detail;
    const readOnly = checklist.status === WOODWORK_CHECKLIST_STATUS_COMPLETED;

    const subtitleEl = document.getElementById('woodwork-checklist-editor-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = `Versão ${checklist.versionNumber}${readOnly ? ' · Concluído' : ' · Em andamento'}`;
    }

    const headerContext = await resolveWoodworkChecklistHeaderContext(checklist);
    if (woodworkChecklistEditorState) {
        woodworkChecklistEditorState.headerContext = headerContext;
    }
    renderWoodworkChecklistHeaderInForm(headerContext);

    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setVal('woodwork-checklist-third-party-notes', checklist.thirdPartyTestedNotes || '');
    setVal('woodwork-checklist-machining-notes', checklist.machiningRefusalNotes || '');
    setVal('woodwork-checklist-project-notes', checklist.projectNotes || '');

    ['woodwork-checklist-third-party-notes', 'woodwork-checklist-machining-notes', 'woodwork-checklist-project-notes']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = readOnly;
        });

    const listEl = document.getElementById('woodwork-checklist-items-list');
    if (!listEl) return;

    listEl.innerHTML = lines.map((line, index) => `
        <li class="woodwork-checklist-item" data-line-id="${Number(line.id)}">
            <p class="woodwork-checklist-item__label">
                <span class="woodwork-checklist-item__num">${index + 1}.</span>
                ${escapeHtml(line.label || '')}
            </p>
            ${renderWoodworkChecklistAnswerButtons(line.id, line.answer, readOnly)}
        </li>
    `).join('');

    bindWoodworkChecklistAnswerButtons(listEl, readOnly ? null : (lineId, answer) => {
        if (!woodworkChecklistEditorState?.lines) return;
        const row = woodworkChecklistEditorState.lines.find(item => Number(item.id) === Number(lineId));
        if (row) row.answer = answer;
    });

    document.getElementById('btn-woodwork-checklist-complete')?.classList.toggle('hidden', readOnly);
    document.getElementById('btn-woodwork-checklist-save')?.classList.toggle('hidden', readOnly);
    document.getElementById('btn-woodwork-checklist-print')?.classList.remove('hidden');
}

async function openWoodworkQualityChecklistEditor(checklistId) {
    try {
        const detail = await fetchWoodworkChecklistDetail(checklistId);
        woodworkChecklistEditorState = {
            checklistId: Number(checklistId),
            checklist: detail.checklist,
            lines: detail.lines.map(line => ({ ...line }))
        };
        await fillWoodworkChecklistEditorForm(detail);
        toggleModal('woodwork-checklist-editor-modal', true);
    } catch (error) {
        alertAppDialog('Erro ao carregar checklist: ' + error.message);
    }
}

function collectWoodworkChecklistNotesPayload() {
    return {
        thirdPartyTestedNotes: document.getElementById('woodwork-checklist-third-party-notes')?.value.trim() || null,
        machiningRefusalNotes: document.getElementById('woodwork-checklist-machining-notes')?.value.trim() || null,
        projectNotes: document.getElementById('woodwork-checklist-project-notes')?.value.trim() || null,
        updatedAt: new Date().toISOString()
    };
}

async function saveWoodworkQualityChecklistDraft() {
    if (!woodworkChecklistEditorState?.checklistId) return;
    if (woodworkChecklistEditorState.checklist?.status === WOODWORK_CHECKLIST_STATUS_COMPLETED) return;

    const notesPayload = collectWoodworkChecklistNotesPayload();
    const { error: notesError } = await supabaseClient
        .from('WoodworkQualityChecklist')
        .update(notesPayload)
        .eq('id', woodworkChecklistEditorState.checklistId);

    if (notesError) throw notesError;

    for (const line of woodworkChecklistEditorState.lines) {
        const { error } = await supabaseClient
            .from('WoodworkQualityChecklistLine')
            .update({ answer: line.answer || null })
            .eq('id', line.id);
        if (error) throw error;
    }
}

async function completeWoodworkQualityChecklist() {
    if (!woodworkChecklistEditorState?.checklistId) return;

    const unanswered = woodworkChecklistEditorState.lines.filter(line => !line.answer);
    if (unanswered.length) {
        alertAppDialog(`Responda todos os itens antes de concluir (${unanswered.length} pendente(s)).`, { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Concluir este checklist? Após concluir, não será possível alterar as respostas.'))) {
        return;
    }

    if (!woodworkChecklistEditorOverlay) return;

    await woodworkChecklistEditorOverlay.runAction({
        loadingMessage: 'Concluindo checklist...',
        successMessage: 'Checklist concluído com sucesso!',
        formatError: (error) => `Erro ao concluir: ${error.message}`,
        task: async () => {
            await saveWoodworkQualityChecklistDraft();
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('WoodworkQualityChecklist')
                .update({
                    status: WOODWORK_CHECKLIST_STATUS_COMPLETED,
                    completedAt: now,
                    completedById: currentUser?.id || null,
                    updatedAt: now
                })
                .eq('id', woodworkChecklistEditorState.checklistId);

            if (error) throw error;
        },
        onSuccess: () => {
            toggleModal('woodwork-checklist-editor-modal', false);
            woodworkChecklistEditorState = null;
        }
    });
}

function woodworkChecklistAnswerPrintLabel(answer) {
    if (answer === 'ok') return 'Ok';
    if (answer === 'no') return 'Não';
    if (answer === 'na') return 'N/A';
    return '';
}

function buildWoodworkChecklistPrintHtml(detail, headerContext = {}) {
    const { checklist, lines } = detail;
    const orderClientLine = headerContext.orderClientLine || '—';
    const environmentName = headerContext.environmentName || '—';
    const checklistResponsibleName = headerContext.checklistResponsibleName
        || getWoodworkChecklistResponsibleName(checklist);
    const cabinetMakerName = headerContext.cabinetMakerName || '—';
    const checklistDateLabel = headerContext.checklistDateLabel
        || formatWoodworkChecklistDateLabel(getWoodworkChecklistDisplayDate(checklist));

    const itemsHtml = lines.map((line, index) => `
        <tr>
            <td class="num">${index + 1}</td>
            <td class="label">${escapeHtml(line.label || '')}</td>
            <td class="answer">${escapeHtml(woodworkChecklistAnswerPrintLabel(line.answer))}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Checklist Marcenaria — ${escapeHtml(orderClientLine)}</title>
<style>
@page { margin: 12mm; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
.header img { height: 44px; width: auto; object-fit: contain; }
.header h1 { font-size: 14px; margin: 0; text-align: center; flex: 1; text-transform: uppercase; letter-spacing: 0.04em; }
.meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.meta td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
.meta .k { width: 22%; font-weight: 700; background: #f8fafc; }
.items { width: 100%; border-collapse: collapse; }
.items th, .items td { border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top; }
.items th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
.items .num { width: 28px; text-align: center; }
.items .answer { width: 56px; text-align: center; font-weight: 700; }
.notes { margin-top: 12px; }
.notes h2 { font-size: 11px; margin: 0 0 6px; text-transform: uppercase; }
.notes .box { border: 1px solid #cbd5e1; padding: 8px; min-height: 48px; margin-bottom: 8px; white-space: pre-wrap; }
.signatures { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.signatures .box { border: 1px solid #cbd5e1; padding: 8px; min-height: 64px; }
.signatures .title { font-weight: 700; font-size: 10px; margin-bottom: 24px; }
.footer-meta { margin-top: 8px; font-size: 10px; color: #475569; }
</style>
</head>
<body>
<div class="header">
  <img src="${escapeHtml(new URL('images/logo.jpg', window.location.href).href)}" alt="Formighieri">
  <h1>Check list para conferência de marcenaria</h1>
  <img src="${escapeHtml(new URL('images/fgp_logo.png', window.location.href).href)}" alt="FGP">
</div>
<table class="meta">
  <tr><td class="k">Pedido — Cliente</td><td colspan="3">${escapeHtml(orderClientLine)}</td></tr>
  <tr><td class="k">Ambiente</td><td colspan="3">${escapeHtml(environmentName)}</td></tr>
  <tr><td class="k">Responsável checklist</td><td colspan="3">${escapeHtml(checklistResponsibleName)}</td></tr>
  <tr><td class="k">Marceneiro responsável</td><td colspan="3">${escapeHtml(cabinetMakerName)}</td></tr>
  <tr><td class="k">Data do checklist</td><td colspan="3">${escapeHtml(checklistDateLabel)} · Versão ${Number(checklist.versionNumber) || '—'}</td></tr>
</table>
<table class="items">
  <thead><tr><th>#</th><th>Itens de verificação</th><th>Ok / Não / N/A</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="notes">
  <h2>Todos os terceiros testados? Quais?</h2>
  <div class="box">${escapeHtml(checklist.thirdPartyTestedNotes || '')}</div>
  <h2>Recusas de usinagem pelo Sr Edson e motivo</h2>
  <div class="box">${escapeHtml(checklist.machiningRefusalNotes || '')}</div>
  <h2>Apontamentos sobre projeto</h2>
  <div class="box">${escapeHtml(checklist.projectNotes || '')}</div>
</div>
<div class="signatures">
  <div class="box"><div class="title">Aprovação qualidade — assinatura do conferente</div>
    <div>Data: ____/____/________</div></div>
  <div class="box"><div class="title">Aprovação expedição — assinatura do conferente</div>
    <div>Data: ____/____/________</div></div>
</div>
<p class="footer-meta">Impresso em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
</body>
</html>`;
}

function openWoodworkChecklistPrintWindow() {
    const printWin = window.open('about:blank', '_blank');
    if (!printWin) return null;
    try {
        printWin.document.open();
        printWin.document.write(
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impressão</title></head>'
            + '<body style="font-family:Arial,sans-serif;padding:24px;color:#334155;">Preparando impressão...</body></html>'
        );
        printWin.document.close();
    } catch (_) {
        /* janela pode estar em estado inicial */
    }
    return printWin;
}

function triggerWoodworkChecklistPrint(printWin) {
    if (!printWin || printWin.closed) return;
    const runPrint = () => {
        try {
            printWin.focus();
            printWin.print();
        } catch (_) {
            /* ignorar bloqueio do navegador */
        }
    };
    if (printWin.document?.readyState === 'complete') {
        setTimeout(runPrint, 300);
        return;
    }
    printWin.addEventListener('load', () => setTimeout(runPrint, 300), { once: true });
}

async function printWoodworkQualityChecklist(checklistId, printWin = null) {
    let ownedPrintWindow = printWin;
    try {
        const detail = await fetchWoodworkChecklistDetail(checklistId);
        const headerContext = await resolveWoodworkChecklistHeaderContext(detail.checklist);
        const html = buildWoodworkChecklistPrintHtml(detail, headerContext);

        if (!ownedPrintWindow || ownedPrintWindow.closed) {
            ownedPrintWindow = openWoodworkChecklistPrintWindow();
        }
        if (!ownedPrintWindow) {
            alertAppDialog('Permita pop-ups para imprimir o checklist.');
            return;
        }

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        ownedPrintWindow.location.href = blobUrl;
        triggerWoodworkChecklistPrint(ownedPrintWindow);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
        if (ownedPrintWindow && !ownedPrintWindow.closed) {
            try {
                ownedPrintWindow.close();
            } catch (_) {
                /* ignorar */
            }
        }
        alertAppDialog('Erro ao imprimir: ' + error.message);
    }
}

async function openWoodworkQualityChecklistVersionsModal(orderProjectId) {
    const projectId = Number(orderProjectId);
    if (!projectId) return;

    try {
        const project = await fetchOrderProjectForWoodworkChecklist(projectId);
        const rows = await fetchWoodworkChecklistsForProject(projectId);
        const titleEl = document.getElementById('woodwork-checklist-versions-title');
        const listEl = document.getElementById('woodwork-checklist-versions-list');

        if (titleEl) {
            const code = project?.order?.orderCode || '—';
            const name = project?.name || 'Projeto';
            titleEl.textContent = `Checklists — ${code} · ${name}`;
        }

        if (!listEl) return;

        if (!rows.length) {
            listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhum checklist registrado para este projeto.</p>';
        } else {
            listEl.innerHTML = rows.map(row => {
                const statusLabel = row.status === WOODWORK_CHECKLIST_STATUS_COMPLETED ? 'Concluído' : 'Rascunho';
                const statusClass = row.status === WOODWORK_CHECKLIST_STATUS_COMPLETED
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900';
                const completed = row.completedAt
                    ? formatWoodworkChecklistDateLabel(row.completedAt)
                    : '—';
                return `
                    <button type="button"
                        class="woodwork-checklist-version-row w-full text-left px-4 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 flex flex-wrap items-center justify-between gap-2"
                        data-checklist-id="${Number(row.id)}">
                        <span class="font-semibold text-sm text-slate-900">Versão ${Number(row.versionNumber)}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${statusLabel}</span>
                        <span class="text-xs text-slate-500 w-full">Conclusão: ${escapeHtml(completed)}</span>
                    </button>
                `;
            }).join('');

            listEl.querySelectorAll('.woodwork-checklist-version-row').forEach(button => {
                button.addEventListener('click', async () => {
                    toggleModal('woodwork-checklist-versions-modal', false);
                    await openWoodworkQualityChecklistEditor(Number(button.dataset.checklistId));
                });
            });
        }

        listEl.dataset.orderProjectId = String(projectId);
        toggleModal('woodwork-checklist-versions-modal', true);
    } catch (error) {
        alertAppDialog('Erro ao carregar versões: ' + error.message);
    }
}

function bindWoodworkQualityChecklistEvents() {
    document.getElementById('btn-close-woodwork-checklist-editor')
        ?.addEventListener('click', () => {
            woodworkChecklistEditorOverlay?.setLoading(false);
            woodworkChecklistEditorState = null;
            toggleModal('woodwork-checklist-editor-modal', false);
        });
    document.getElementById('btn-woodwork-checklist-save')
        ?.addEventListener('click', async () => {
            if (!woodworkChecklistEditorState?.checklistId || !woodworkChecklistEditorOverlay) return;
            await woodworkChecklistEditorOverlay.runAction({
                loadingMessage: 'Salvando checklist...',
                successMessage: 'Checklist salvo!',
                formatError: (error) => `Erro ao salvar: ${error.message}`,
                task: () => saveWoodworkQualityChecklistDraft()
            });
        });
    document.getElementById('btn-woodwork-checklist-complete')
        ?.addEventListener('click', () => {
            void completeWoodworkQualityChecklist();
        });
    document.getElementById('btn-woodwork-checklist-print')
        ?.addEventListener('click', () => {
            const checklistId = woodworkChecklistEditorState?.checklistId;
            if (!checklistId) return;
            const printWin = openWoodworkChecklistPrintWindow();
            void printWoodworkQualityChecklist(checklistId, printWin);
        });
    document.getElementById('btn-close-woodwork-checklist-versions')
        ?.addEventListener('click', () => toggleModal('woodwork-checklist-versions-modal', false));
    document.getElementById('btn-project-view-woodwork-checklists')
        ?.addEventListener('click', () => {
            const projectId = Number(
                orderProjectViewContext?.orderProjectId
                || orderProjectViewContext?.projectId
                || orderProjectViewContext?.id
            );
            if (projectId) void openWoodworkQualityChecklistVersionsModal(projectId);
        });
}

bindWoodworkQualityChecklistEvents();

window.canManageWoodworkQualityChecklist = canManageWoodworkQualityChecklist;
window.canOpenWoodworkQualityChecklistForProject = canOpenWoodworkQualityChecklistForProject;
window.openWoodworkQualityChecklistEntryFlow = openWoodworkQualityChecklistEntryFlow;
window.openWoodworkQualityChecklistVersionsModal = openWoodworkQualityChecklistVersionsModal;
window.warnIfWoodworkQualityChecklistIncomplete = warnIfWoodworkQualityChecklistIncomplete;
window.hasCompletedWoodworkQualityChecklist = hasCompletedWoodworkQualityChecklist;
