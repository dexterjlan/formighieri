/**
 * Integração embed diagrams.net (draw.io) — protocolo JSON (postMessage).
 */
const PART_REQUEST_DRAWIO_ORIGINS = new Set([
    'https://embed.diagrams.net',
    'https://www.diagrams.net',
    'https://app.diagrams.net'
]);

const PART_REQUEST_DRAWIO_EMPTY_XML = `
<mxfile host="app.diagrams.net" version="22.1.0">
  <diagram id="part-request-a4" name="Página-1">
    <mxGraphModel dx="1188" dy="768" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1"
      page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`.trim();

let partRequestDrawioReady = false;
let partRequestDrawioPendingLoad = null;
let partRequestDrawioExportResolver = null;
let partRequestDrawioMessageBound = false;
let partRequestDrawioActiveHostId = 'part-request-drawio-host';

function partRequestDrawioBuildEmbedUrl(readOnly = false) {
    const params = new URLSearchParams({
        embed: '1',
        proto: 'json',
        spin: '1',
        libraries: '1',
        clibs: '1',
        saveAndExit: '0',
        noSaveBtn: '1',
        noExitBtn: '1',
        lang: 'pt-br',
        ui: 'min'
    });
    if (readOnly) params.set('editable', '0');
    return `https://embed.diagrams.net/?${params.toString()}`;
}

function partRequestDrawioGetHost(hostId = partRequestDrawioActiveHostId) {
    return document.getElementById(hostId);
}

function partRequestDrawioGetIframe(hostId = partRequestDrawioActiveHostId) {
    const host = partRequestDrawioGetHost(hostId);
    if (!host) return null;
    let iframe = host.querySelector('iframe.part-request-drawio-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'part-request-drawio-iframe';
        iframe.title = 'Editor draw.io';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
        host.appendChild(iframe);
    }
    return iframe;
}

function partRequestDrawioEnsureMessageListener() {
    if (partRequestDrawioMessageBound) return;
    partRequestDrawioMessageBound = true;
    window.addEventListener('message', partRequestDrawioOnMessage);
}

function partRequestDrawioOnMessage(evt) {
    if (!PART_REQUEST_DRAWIO_ORIGINS.has(evt.origin)) return;
    if (typeof evt.data !== 'string' || !evt.data) return;

    let msg;
    try {
        msg = JSON.parse(evt.data);
    } catch {
        return;
    }

    if (msg.event === 'init') {
        partRequestDrawioReady = true;
        if (partRequestDrawioPendingLoad) {
            const pending = partRequestDrawioPendingLoad;
            partRequestDrawioPendingLoad = null;
            partRequestDrawioPostLoad(pending.xml, pending.readOnly);
        }
        return;
    }

    if (msg.event === 'export' && partRequestDrawioExportResolver) {
        partRequestDrawioExportResolver(msg);
        partRequestDrawioExportResolver = null;
        return;
    }

    if (msg.event === 'save' && partRequestDrawioExportResolver) {
        partRequestDrawioExportResolver({ event: 'export', format: 'xml', data: msg.xml, xml: msg.xml });
        partRequestDrawioExportResolver = null;
    }
}

function partRequestDrawioPost(message, hostId = partRequestDrawioActiveHostId) {
    const iframe = partRequestDrawioGetIframe(hostId);
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify(message), '*');
}

function partRequestDrawioPostLoad(xml, readOnly = false) {
    partRequestDrawioPost({
        action: 'load',
        xml: xml || PART_REQUEST_DRAWIO_EMPTY_XML,
        autosave: readOnly ? 0 : 1
    });
}

function partRequestDrawioWaitReady(timeoutMs = 25000) {
    if (partRequestDrawioReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const step = () => {
            if (partRequestDrawioReady) {
                resolve();
                return;
            }
            if (Date.now() - started > timeoutMs) {
                reject(new Error('O editor draw.io não inicializou a tempo.'));
                return;
            }
            requestAnimationFrame(step);
        };
        step();
    });
}

function partRequestDrawioWaitAfterLoad(delayMs = 600) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

function partRequestDrawioInit(options = {}) {
    const {
        xml = null,
        readOnly = false,
        hostId = 'part-request-drawio-host'
    } = options;

    partRequestDrawioEnsureMessageListener();
    partRequestDrawioActiveHostId = hostId;
    partRequestDrawioReady = false;

    const iframe = partRequestDrawioGetIframe(hostId);
    if (!iframe) return false;

    partRequestDrawioPendingLoad = {
        xml: partRequestDrawioNormalizeXml(xml) || PART_REQUEST_DRAWIO_EMPTY_XML,
        readOnly: Boolean(readOnly)
    };

    iframe.src = partRequestDrawioBuildEmbedUrl(readOnly);
    return true;
}

function partRequestDrawioDispose(hostId = partRequestDrawioActiveHostId) {
    partRequestDrawioReady = false;
    partRequestDrawioPendingLoad = null;
    if (partRequestDrawioExportResolver) {
        partRequestDrawioExportResolver = null;
    }
    const host = partRequestDrawioGetHost(hostId);
    const iframe = host?.querySelector('iframe.part-request-drawio-iframe');
    if (iframe) iframe.src = 'about:blank';
}

function partRequestDrawioRequestExport(format) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            partRequestDrawioExportResolver = null;
            reject(new Error(`Timeout ao exportar (${format}).`));
        }, 20000);

        partRequestDrawioExportResolver = msg => {
            clearTimeout(timeout);
            resolve(msg);
        };

        partRequestDrawioPost({
            action: 'export',
            format,
            scale: format === 'png' ? 2 : undefined
        });
    });
}

function partRequestDrawioExportXml(hostId = partRequestDrawioActiveHostId) {
    const previousHost = partRequestDrawioActiveHostId;
    partRequestDrawioActiveHostId = hostId;
    return partRequestDrawioRequestExport('xml').then(msg => {
        partRequestDrawioActiveHostId = previousHost;
        const xml = msg.xml || msg.data;
        if (!xml || typeof xml !== 'string') {
            throw new Error('Exportação XML vazia.');
        }
        return xml;
    }).catch(err => {
        partRequestDrawioActiveHostId = previousHost;
        throw err;
    });
}

function partRequestDrawioExportPng(hostId = partRequestDrawioActiveHostId) {
    const previousHost = partRequestDrawioActiveHostId;
    partRequestDrawioActiveHostId = hostId;
    return partRequestDrawioRequestExport('png').then(msg => {
        partRequestDrawioActiveHostId = previousHost;
        return partRequestDrawioNormalizePngData(msg.data);
    }).catch(err => {
        partRequestDrawioActiveHostId = previousHost;
        throw err;
    });
}

function partRequestDrawioNormalizePngData(data) {
    if (!data) throw new Error('Imagem não gerada.');
    const raw = String(data).trim();
    if (raw.startsWith('data:image')) return raw;
    return `data:image/png;base64,${raw}`;
}

function partRequestDrawioNormalizeXml(xml) {
    if (!xml) return null;
    const text = String(xml).trim();
    return text || null;
}

function partRequestDrawioBuildStoragePayload(xml) {
    return {
        schemaVersion: 2,
        engine: 'drawio',
        xml: partRequestDrawioNormalizeXml(xml) || PART_REQUEST_DRAWIO_EMPTY_XML
    };
}

function partRequestDrawioExtractXmlFromRecord(record) {
    const raw = record?.drawingJson;
    if (!raw) return null;
    const doc = typeof raw === 'string' ? (() => {
        try { return JSON.parse(raw); } catch { return null; }
    })() : raw;
    if (!doc || typeof doc !== 'object') return null;
    if (doc.engine === 'drawio' && doc.xml) return partRequestDrawioNormalizeXml(doc.xml);
    if (doc.xml) return partRequestDrawioNormalizeXml(doc.xml);
    return null;
}

async function partRequestDrawioGetDocumentPayload() {
    await partRequestDrawioWaitReady();
    await partRequestDrawioWaitAfterLoad(400);
    const xml = await partRequestDrawioExportXml();
    return partRequestDrawioBuildStoragePayload(xml);
}

function partRequestDrawioEscapePrintMeta(meta = {}) {
    const pieceName = escapeHtml(String(meta.pieceName || 'Peça').trim() || '—');
    const requestId = meta.requestId != null && meta.requestId !== ''
        ? escapeHtml(String(meta.requestId))
        : '—';
    return {
        pieceName,
        requestId,
        statusLabel: escapeHtml(String(meta.statusLabel || '—').trim() || '—'),
        clientName: escapeHtml(String(meta.clientName || '—').trim() || '—'),
        orderCode: escapeHtml(String(meta.orderCode || '—').trim() || '—'),
        thickness: meta.thicknessMm != null && meta.thicknessMm !== ''
            ? `${escapeHtml(String(meta.thicknessMm))} mm`
            : '—',
        material: escapeHtml(String(meta.material || '—').trim() || '—'),
        description: escapeHtml(String(meta.description || '').trim()),
        createdLabel: escapeHtml(String(meta.createdLabel || '—').trim() || '—'),
        createdByName: escapeHtml(String(meta.createdByName || '—').trim() || '—'),
        executorName: escapeHtml(String(meta.executorName || meta.cabinetMakerName || '—').trim() || '—'),
        montadorName: escapeHtml(String(meta.montadorName || '—').trim() || '—'),
        deliveryDueLabel: escapeHtml(String(meta.deliveryDueLabel || '—').trim() || '—'),
        printedLabel: escapeHtml(
            typeof formatDateTime === 'function'
                ? formatDateTime(new Date().toISOString())
                : new Date().toLocaleString('pt-BR')
        )
    };
}

function partRequestDrawioPrintFieldBox(label, value) {
    return `<div class="part-request-print-field">
        <span class="part-request-print-field__label">${label}</span>
        <span class="part-request-print-field__value">${value}</span>
    </div>`;
}

function partRequestDrawioBuildPrintSheetHtml(meta = {}) {
    const row = partRequestDrawioEscapePrintMeta(meta);
    const defectBlock = row.description
        ? `<div class="part-request-print-sheet__defect-box">
            <span class="part-request-print-field__label">Defeito e contexto</span>
            <p class="part-request-print-sheet__defect">${row.description}</p>
          </div>`
        : '';

    const fieldsHtml = [
        partRequestDrawioPrintFieldBox('Requisição Nº', row.requestId),
        partRequestDrawioPrintFieldBox('Status', row.statusLabel),
        partRequestDrawioPrintFieldBox('Cliente', row.clientName),
        partRequestDrawioPrintFieldBox('Pedido', row.orderCode),
        partRequestDrawioPrintFieldBox('Espessura', row.thickness),
        partRequestDrawioPrintFieldBox('Material', row.material),
        partRequestDrawioPrintFieldBox('Prazo de entrega', row.deliveryDueLabel),
        partRequestDrawioPrintFieldBox('Montador', row.montadorName),
        partRequestDrawioPrintFieldBox('Executor', row.executorName),
        partRequestDrawioPrintFieldBox('Criado em', row.createdLabel),
        partRequestDrawioPrintFieldBox('Solicitante', row.createdByName)
    ].join('');

    return `
        <div class="part-request-print-sheet">
            <header class="part-request-print-sheet__header">
                <p class="part-request-print-sheet__kicker">FGP · Solicitação de fabricação · Peça</p>
                <h1 class="part-request-print-sheet__title">${row.pieceName}</h1>
                <div class="part-request-print-sheet__fields">${fieldsHtml}</div>
                ${defectBlock}
                <p class="part-request-print-sheet__printed-at">Impresso em: ${row.printedLabel}</p>
            </header>
            <section aria-label="Desenho da peça">
                <h2 class="part-request-print-sheet__drawing-title">Desenho da peça</h2>
                <div class="part-request-print-sheet__img-wrap">
                    <img class="part-request-print-sheet__img" alt="Desenho da peça" />
                </div>
            </section>
            <footer class="part-request-print-sheet__footer">Unidades em mm no desenho (draw.io)</footer>
        </div>
    `;
}

function partRequestDrawioEnsurePrintSurface() {
    let surface = document.getElementById('part-request-print-surface');
    if (surface) return surface;

    surface = document.createElement('div');
    surface.id = 'part-request-print-surface';
    surface.className = 'part-request-print-surface';
    surface.hidden = true;
    surface.setAttribute('aria-hidden', 'true');
    document.body.appendChild(surface);
    return surface;
}

function printPartRequestDrawingPage(meta = {}, imageDataUrl = '') {
    if (!imageDataUrl) {
        alertAppDialog('Não foi possível gerar a imagem para impressão.');
        return;
    }

    const surface = partRequestDrawioEnsurePrintSurface();
    surface.innerHTML = partRequestDrawioBuildPrintSheetHtml(meta);
    surface.hidden = false;
    surface.removeAttribute('aria-hidden');

    const img = surface.querySelector('.part-request-print-sheet__img');
    const previousDocumentTitle = document.title;

    const cleanup = () => {
        document.title = previousDocumentTitle;
        document.body.classList.remove('part-request-print-active');
        surface.innerHTML = '';
        surface.hidden = true;
        surface.setAttribute('aria-hidden', 'true');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    let printed = false;
    const triggerPrint = () => {
        if (printed) return;
        printed = true;
        document.title = ' ';
        document.body.classList.add('part-request-print-active');
        window.print();
    };

    if (img) {
        img.onload = triggerPrint;
        img.onerror = () => {
            alertAppDialog('Falha ao carregar imagem para impressão.');
            cleanup();
        };
        img.src = imageDataUrl;
        if (img.complete) {
            requestAnimationFrame(triggerPrint);
        }
        return;
    }

    triggerPrint();
}

async function partRequestDrawioPrintWithXml(xml, meta) {
    const host = document.getElementById('part-request-print-host');
    if (!host) {
        alertAppDialog('Área de impressão indisponível.');
        return;
    }
    host.innerHTML = '<div id="part-request-drawio-print-host" class="part-request-drawio-host"></div>';

    partRequestDrawioInit({
        xml,
        readOnly: true,
        hostId: 'part-request-drawio-print-host'
    });

    try {
        await partRequestDrawioWaitReady();
        await partRequestDrawioWaitAfterLoad(900);
        const png = await partRequestDrawioExportPng('part-request-drawio-print-host');
        printPartRequestDrawingPage(meta, png);
    } catch (error) {
        alertAppDialog(`Erro ao imprimir: ${error.message}`);
    } finally {
        partRequestDrawioDispose('part-request-drawio-print-host');
        host.innerHTML = '';
        partRequestDrawioActiveHostId = 'part-request-drawio-host';
    }
}

window.partRequestDrawioInit = partRequestDrawioInit;
window.partRequestDrawioDispose = partRequestDrawioDispose;
window.partRequestDrawioGetDocumentPayload = partRequestDrawioGetDocumentPayload;
window.partRequestDrawioExtractXmlFromRecord = partRequestDrawioExtractXmlFromRecord;
window.partRequestDrawioExportPng = partRequestDrawioExportPng;
window.partRequestDrawioPrintWithXml = partRequestDrawioPrintWithXml;
window.printPartRequestDrawingPage = printPartRequestDrawingPage;
