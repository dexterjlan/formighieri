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
        modified: '0',
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
        autosave: 0,
        modified: 0
    });
}

/** Limpa flag interna de alteração no embed (evita prompt “Sair do site?” ao fechar o modal). */
function partRequestDrawioAckSaved(hostId = partRequestDrawioActiveHostId) {
    partRequestDrawioPost({ action: 'status', modified: false }, hostId);
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

function partRequestDrawioDispose(hostId = partRequestDrawioActiveHostId, options = {}) {
    const clearModified = options.clearModified !== false;
    partRequestDrawioPendingLoad = null;
    if (partRequestDrawioExportResolver) {
        partRequestDrawioExportResolver = null;
    }

    const host = partRequestDrawioGetHost(hostId);
    const iframe = host?.querySelector('iframe.part-request-drawio-iframe');
    const teardown = () => {
        partRequestDrawioReady = false;
        if (iframe?.parentNode) iframe.remove();
    };

    if (iframe?.contentWindow) {
        if (clearModified) {
            partRequestDrawioAckSaved(hostId);
            // Aguarda o embed processar status antes de remover o iframe (evita beforeunload).
            requestAnimationFrame(() => requestAnimationFrame(teardown));
            return;
        }
        iframe.src = 'about:blank';
        teardown();
        return;
    }

    teardown();
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
    partRequestDrawioAckSaved();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return partRequestDrawioBuildStoragePayload(xml);
}

function partRequestDrawioEscapePrintMeta(meta = {}) {
    const pieceName = escapeHtml(String(meta.pieceName || 'Peça').trim() || '—');
    const requestIdNumber = Number(meta.requestId);
    const requestId = Number.isFinite(requestIdNumber) && requestIdNumber > 0
        ? escapeHtml(String(requestIdNumber))
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
        projectLabel: escapeHtml(String(meta.projectLabel || '—').trim() || '—'),
        projectCabinetMakerName: escapeHtml(String(meta.projectCabinetMakerName || '—').trim() || '—'),
        deliveryDueLabel: escapeHtml(String(meta.deliveryDueLabel || '—').trim() || '—'),
        trackingCode: escapeHtml(String(meta.trackingCode || '—').trim() || '—'),
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

function partRequestDrawioBuildPrintSheetHtml(meta = {}, options = {}) {
    const copyIndex = options.copyIndex != null ? Number(options.copyIndex) : null;
    const row = partRequestDrawioEscapePrintMeta(meta);
    const requestKickerSuffix = row.requestId !== '—' ? ` · Nº ${row.requestId}` : '';
    const copySuffix = Number.isFinite(copyIndex) && copyIndex > 0 ? ` · Via ${copyIndex}` : '';

    const isCompact = Number.isFinite(copyIndex) && copyIndex > 0;
    const trackingCodeRaw = typeof normalizeScannableTrackingCode === 'function'
        ? normalizeScannableTrackingCode(meta.trackingCode)
        : String(meta.trackingCode || '').trim();
    const trackingCodeAttr = trackingCodeRaw
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    const trackingBlock = isCompact && copyIndex === 1 && trackingCodeRaw
        ? `<div class="part-request-print-sheet__tracking" aria-label="Código de expedição">
            <span class="part-request-print-field__label">Código expedição (embarque / desembarque)</span>
            <svg class="part-request-print-barcode" data-barcode="${trackingCodeAttr}"></svg>
            <p class="part-request-print-sheet__tracking-code">${row.trackingCode}</p>
           </div>`
        : '';

    const fieldsHtml = isCompact
        ? [
            partRequestDrawioPrintFieldBox('Pedido', row.orderCode),
            partRequestDrawioPrintFieldBox('Cliente', row.clientName),
            partRequestDrawioPrintFieldBox('Projeto', row.projectLabel),
            partRequestDrawioPrintFieldBox('Material', row.material),
            partRequestDrawioPrintFieldBox('Esp.', row.thickness),
            partRequestDrawioPrintFieldBox('Prazo', row.deliveryDueLabel),
            partRequestDrawioPrintFieldBox('Executor', row.executorName),
            partRequestDrawioPrintFieldBox('Montador', row.montadorName)
        ].join('')
        : [
            partRequestDrawioPrintFieldBox('Cliente', row.clientName),
            partRequestDrawioPrintFieldBox('Pedido', row.orderCode),
            partRequestDrawioPrintFieldBox('Projeto', row.projectLabel),
            partRequestDrawioPrintFieldBox('Espessura', row.thickness),
            partRequestDrawioPrintFieldBox('Material', row.material),
            partRequestDrawioPrintFieldBox('Prazo de entrega', row.deliveryDueLabel),
            partRequestDrawioPrintFieldBox('Montador', row.montadorName),
            partRequestDrawioPrintFieldBox('Executor', row.executorName),
            partRequestDrawioPrintFieldBox('Criado em', row.createdLabel),
            partRequestDrawioPrintFieldBox('Solicitante', row.createdByName)
        ].join('');

    const printedAtBlock = isCompact
        ? ''
        : `<p class="part-request-print-sheet__printed-at">Impresso em: ${row.printedLabel}</p>`;
    const drawingTitle = isCompact
        ? ''
        : '<h2 class="part-request-print-sheet__drawing-title">Desenho da peça</h2>';
    const footerBlock = isCompact
        ? '<footer class="part-request-print-sheet__footer">mm (draw.io)</footer>'
        : '<footer class="part-request-print-sheet__footer">Unidades em mm no desenho (draw.io)</footer>';

    return `
        <div class="part-request-print-sheet${isCompact ? ' part-request-print-sheet--compact' : ''}">
            <header class="part-request-print-sheet__header">
                <p class="part-request-print-sheet__kicker">FGP · Peça${requestKickerSuffix}${copySuffix}</p>
                <h1 class="part-request-print-sheet__title">${row.pieceName}</h1>
                <div class="part-request-print-sheet__fields">${fieldsHtml}</div>
                ${trackingBlock}
                ${printedAtBlock}
            </header>
            <section class="part-request-print-sheet__drawing" aria-label="Desenho da peça">
                ${drawingTitle}
                <div class="part-request-print-sheet__img-wrap">
                    <img class="part-request-print-sheet__img" alt="Desenho da peça" />
                </div>
            </section>
            ${footerBlock}
        </div>
    `;
}

/** Duas vias na mesma folha A4 retrato (uma acima da outra). */
function partRequestDrawioBuildPrintPageHtml(meta = {}) {
    const firstCopy = partRequestDrawioBuildPrintSheetHtml(meta, { copyIndex: 1 });
    const secondCopy = partRequestDrawioBuildPrintSheetHtml(meta, { copyIndex: 2 });
    return `
        <div class="part-request-print-page" role="document" aria-label="Solicitação de peça — duas vias">
            <div class="part-request-print-page__copy">${firstCopy}</div>
            <div class="part-request-print-page__divider" aria-hidden="true"></div>
            <div class="part-request-print-page__copy">${secondCopy}</div>
        </div>
    `;
}

function partRequestDrawioEnsurePrintSurface() {
    let surface = document.getElementById('part-request-print-surface');
    if (!surface) {
        surface = document.createElement('div');
        surface.id = 'part-request-print-surface';
        surface.className = 'part-request-print-surface';
        surface.hidden = true;
        surface.setAttribute('aria-hidden', 'true');
        document.body.appendChild(surface);
        return surface;
    }

    // Fora de #app-root evita páginas em branco do shell na impressão do navegador.
    if (surface.parentElement !== document.body) {
        document.body.appendChild(surface);
    }
    return surface;
}

function partRequestDrawioLoadJsBarcodeScript() {
    if (typeof JsBarcode !== 'undefined') return Promise.resolve();
    if (typeof resolveExpeditionJsBarcodeScriptUrl !== 'function') return Promise.resolve();
    const url = resolveExpeditionJsBarcodeScriptUrl();
    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-part-request-jsbarcode]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('JsBarcode')), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.dataset.partRequestJsbarcode = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('JsBarcode'));
        document.head.appendChild(script);
    });
}

function partRequestDrawioApplyPrintBarcodes(surface) {
    const nodes = surface?.querySelectorAll?.('.part-request-print-barcode[data-barcode]') || [];
    if (!nodes.length || typeof JsBarcode === 'undefined') return;
    nodes.forEach(node => {
        const code = String(node.getAttribute('data-barcode') || '').trim();
        if (!code) return;
        try {
            JsBarcode(node, code, {
                format: 'CODE128',
                displayValue: false,
                margin: 4,
                width: 1.4,
                height: 44
            });
        } catch (error) {
            console.warn('partRequestDrawioApplyPrintBarcodes:', error);
        }
    });
}

function printPartRequestDrawingPage(meta = {}, imageDataUrl = '') {
    if (!imageDataUrl) {
        alertAppDialog('Não foi possível gerar a imagem para impressão.');
        return;
    }

    const surface = partRequestDrawioEnsurePrintSurface();
    surface.innerHTML = partRequestDrawioBuildPrintPageHtml(meta);
    void partRequestDrawioLoadJsBarcodeScript().catch(() => {});
    surface.hidden = false;
    surface.removeAttribute('hidden');
    surface.removeAttribute('aria-hidden');

    const images = surface.querySelectorAll('.part-request-print-sheet__img');
    const previousDocumentTitle = document.title;

    const cleanup = () => {
        document.title = previousDocumentTitle;
        document.body.classList.remove('part-request-print-active');
        surface.innerHTML = '';
        surface.hidden = true;
        surface.setAttribute('hidden', '');
        surface.setAttribute('aria-hidden', 'true');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    let printed = false;
    const triggerPrint = () => {
        if (printed) return;
        printed = true;
        partRequestDrawioApplyPrintBarcodes(surface);
        document.title = ' ';
        document.body.classList.add('part-request-print-active');
        window.print();
    };

    if (images.length) {
        let settled = 0;
        const markSettled = () => {
            settled += 1;
            if (settled >= images.length) triggerPrint();
        };
        images.forEach(img => {
            let imgSettled = false;
            const settle = () => {
                if (imgSettled) return;
                imgSettled = true;
                markSettled();
            };
            img.onerror = () => {
                alertAppDialog('Falha ao carregar imagem para impressão.');
                cleanup();
            };
            img.onload = settle;
            img.src = imageDataUrl;
            if (img.complete) settle();
        });
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
window.partRequestDrawioAckSaved = partRequestDrawioAckSaved;
window.partRequestDrawioGetDocumentPayload = partRequestDrawioGetDocumentPayload;
window.partRequestDrawioExtractXmlFromRecord = partRequestDrawioExtractXmlFromRecord;
window.partRequestDrawioExportPng = partRequestDrawioExportPng;
window.partRequestDrawioPrintWithXml = partRequestDrawioPrintWithXml;
window.printPartRequestDrawingPage = printPartRequestDrawingPage;
