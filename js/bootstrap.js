const APP_CACHE_VERSION = '0.0.100';

const PARTIALS = [
    'partials/login.html',
    'partials/register.html',
    'partials/main-panel.html',
    'partials/modals.html'
];

const SCRIPTS = [
    'js/core/config.dev.js',
    'js/core/config.prod.js',
    'js/core/config.js',
    'js/core/postgrest-embeds.js',
    'js/core/date-format.js',
    'js/core/status-badges.js',
    'js/core/query-filters.js',
    'js/core/utils-ui.js',
    'js/core/utils-order-consultant.js',
    'js/core/utils-conversation-permissions.js',
    'js/core/utils-commercial-approval.js',
    'js/core/utils-sales-order.js',
    'js/core/utils-permissions.js',
    'js/core/utils-order-project.js',
    'js/core/order-project-status-forecast.js',
    'js/core/revision-core.js',
    'js/core/utils.js',
    'js/core/cabinet-maker.js',
    'js/core/attachment-lightbox.js',
    'js/core/dialog.js',
    'js/core/order-code-picker.js',
    'js/core/navigation.js',
    'js/core/responsive.js',
    'js/core/calendar.js',
    'js/core/calendar-google-sync.js',
    'js/core/welcome.js',
    'js/conversations/conversations-query.js',
    'js/admin/users-admin.js',
    'js/gestao/gestao.js',
    'js/gestao/gestao-project-view.js',
    'js/gestao/gestao-phases.js',
    'js/gestao/gestao-orders.js',
    'js/gestao/gestao-import.js',
    'js/gestao/gestao-kanban.js',
    'js/gestao/gestao-order-schedule.js',
    'js/gestao/gestao-project-scheduling.js',
    'js/gestao/gestao-cadastros-status-people.js',
    'js/gestao/gestao-cadastros-catalog.js',
    'js/gestao/gestao-cadastros-purchase-types.js',
    'js/gestao/gestao-cadastros-calendar-types.js',
    'js/gestao/gestao-alterar-status-projeto.js',
    'js/gestao/gestao-dashboard.js',
    'js/gestao/gestao-relatorios.js',
    'js/gestao/gestao-programacao-producao.js',
    'js/gestao/gestao-performance.js',
    'js/gestao/gestao-montagem-programacao-shared.js',
    'js/gestao/gestao-montagem-programacao-data.js',
    'js/gestao/gestao-montagem-programacao-calendar.js',
    'js/gestao/gestao-montagem-programacao-form.js',
    'js/gestao/gestao-montagem-programacao-shell.js',
    'js/orders/nomear.js',
    'js/orders/projeto-tecnico.js',
    'js/orders/purchase.js',
    'js/orders/implementation.js',
    'js/orders/detailing.js',
    'js/pendencias/pendencias-core.js',
    'js/pendencias/pendencias-designer-technical-project.js',
    'js/pendencias/pendencias-third-party.js',
    'js/pendencias/pendencias-projetista-flows.js',
    'js/pendencias/pendencias-revisor.js',
    'js/pendencias/pendencias-designer-measurement.js',
    'js/pendencias/pendencias-operacional.js',
    'js/pendencias/pendencias-detailing.js',
    'js/pendencias/pendencias-gestor-expedicao.js',
    'js/pendencias/pendencias-gestor-montagem-externa.js',
    'js/pendencias/pendencias-comercial.js',
    'js/pendencias/pendencias-gestor-entrega-tecnica.js',
    'js/pendencias/pendencias-purchases.js',
    'js/pendencias/pendencias-overview.js',
    'js/pesquisas/pesquisas-core.js',
    'js/pesquisas/pesquisas-revisions-query.js',
    'js/pesquisas/pesquisas-requests-query.js',
    'js/pesquisas/pesquisas-purchases-query.js',
    'js/admin/system-settings.js',
    'js/admin/import-pedido-settings.js',
    'js/core/auth.js',
    'js/orders/orders.js',
    'js/orders/order-projects.js',
    'js/orders/project-characteristics.js',
    'js/orders/third-party-project.js',
    'js/orders/third-party-project-revision-attachments.js',
    'js/orders/third-party-project-revision.js',
    'js/orders/third-party-project-tab.js',
    'js/orders/preliminary-design.js',
    'js/orders/preliminary-design-structure.js',
    'js/orders/preliminary-design-modal-core.js',
    'js/orders/preliminary-design-modal-return.js',
    'js/orders/preliminary-design-modal-persist.js',
    'js/orders/preliminary-design-modal-approve.js',
    'js/orders/preliminary-design-conference-requests.js',
    'js/orders/preliminary-design-tab.js',
    'js/orders/preliminary-design-exports.js',
    'js/orders/measurement.js',
    'js/orders/order-project-montagem.js',
    'js/orders/order-project-entrega.js',
    'js/orders/ppcp.js',
    'js/orders/project-reviewer.js',
    'js/orders/technical-reviewer-revision.js',
    'js/orders/order-project-actions.js',
    'js/core/notifications-templates.js',
    'js/core/notifications-recipients.js',
    'js/core/notifications-project-status-rules.js',
    'js/core/notifications-dispatch.js',
    'js/conversations/request-activities.js',
    'js/conversations/request-attachments.js',
    'js/conversations/conversations.js',
    'js/commercial/commercial-approval.js',
    'js/commercial/project-workflow.js',
    'js/commercial/commercial-revision.js',
    'js/commercial/revision-activity-attachments.js',
    'js/commercial/commercial-approval-query.js',
    'js/orders/order-export.js',
    'js/core/main.js'
];

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
        document.body.appendChild(script);
    });
}

async function loadAppVersion() {
    const el = document.getElementById('app-version');
    if (!el) return;

    try {
        const response = await fetch(`VERSION?${Date.now()}`);
        if (!response.ok) return;

        const version = (await response.text()).trim();
        if (version) {
            el.textContent = ` v${version}`;
        }
    } catch (error) {
        console.warn('loadAppVersion:', error);
    }
}

async function bootstrap() {
    const mount = document.getElementById('app-root');

    try {
        const partialsVersion = APP_CACHE_VERSION;
        const htmlParts = await Promise.all(
            PARTIALS.map(url =>
                fetch(`${url}?v=${partialsVersion}`).then(response => {
                    if (!response.ok) throw new Error(`Falha ao carregar ${url}`);
                    return response.text();
                })
            )
        );

        mount.innerHTML = htmlParts.join('\n');
        await loadAppVersion();

        for (const src of SCRIPTS) {
            await loadScript(`${src}?v=${APP_CACHE_VERSION}`);
        }

        initAppEvents();
    } catch (error) {
        console.error('bootstrap:', error);
        mount.innerHTML = `
            <div class="min-h-screen flex items-center justify-center p-6">
                <div class="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center space-y-2">
                    <p class="text-sm font-semibold text-red-700">Erro ao carregar a aplicação</p>
                    <p class="text-xs text-slate-500">${error.message}</p>
                    <p class="text-xs text-slate-400">Execute com um servidor local, por exemplo: <code>npx serve .</code></p>
                </div>
            </div>
        `;
    }
}

bootstrap();
