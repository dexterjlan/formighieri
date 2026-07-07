const PARTIALS = [
    'partials/login.html',
    'partials/register.html',
    'partials/main-panel.html',
    'partials/modals.html'
];

const SCRIPTS = [
    'js/core/config.js',
    'js/core/utils.js',
    'js/core/dialog.js',
    'js/core/navigation.js',
    'js/core/welcome.js',
    'js/conversations/conversations-query.js',
    'js/admin/users-admin.js',
    'js/gestao/gestao.js',
    'js/gestao/gestao-orders.js',
    'js/gestao/gestao-import.js',
    'js/gestao/gestao-kanban.js',
    'js/gestao/gestao-cadastros.js',
    'js/gestao/gestao-relatorios.js',
    'js/gestao/gestao-performance.js',
    'js/orders/nomear.js',
    'js/orders/compras.js',
    'js/orders/implantacao.js',
    'js/pendencias/pendencias-core.js',
    'js/pendencias/pendencias-projetista.js',
    'js/pendencias/pendencias-operacional.js',
    'js/pendencias/pendencias-comercial.js',
    'js/pendencias/pendencias-compras.js',
    'js/pendencias/pendencias-overview.js',
    'js/admin/system-settings.js',
    'js/core/auth.js',
    'js/orders/orders.js',
    'js/orders/order-projects.js',
    'js/orders/anteprojeto.js',
    'js/orders/mediciao.js',
    'js/orders/fabrica.js',
    'js/orders/ppcp.js',
    'js/core/notifications.js',
    'js/conversations/request-activities.js',
    'js/conversations/conversations.js',
    'js/commercial/commercial-approval.js',
    'js/commercial/commercial-revision.js',
    'js/commercial/commercial-approval-query.js',
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
        const htmlParts = await Promise.all(
            PARTIALS.map(url =>
                fetch(url).then(response => {
                    if (!response.ok) throw new Error(`Falha ao carregar ${url}`);
                    return response.text();
                })
            )
        );

        mount.innerHTML = htmlParts.join('\n');
        await loadAppVersion();

        for (const src of SCRIPTS) {
            await loadScript(`${src}?v=20260925`);
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
