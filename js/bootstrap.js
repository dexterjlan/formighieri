const PARTIALS = [
    'partials/login.html',
    'partials/register.html',
    'partials/main-panel.html',
    'partials/modals.html'
];

const SCRIPTS = [
    'js/config.js',
    'js/utils.js',
    'js/navigation.js',
    'js/conversations-query.js',
    'js/users-admin.js',
    'js/system-settings.js',
    'js/auth.js',
    'js/orders.js',
    'js/order-projects.js',
    'js/notifications.js',
    'js/request-activities.js',
    'js/conversations.js',
    'js/commercial-approval.js',
    'js/commercial-revision.js',
    'js/commercial-approval-query.js',
    'js/main.js'
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

        for (const src of SCRIPTS) {
            await loadScript(`${src}?v=20260723`);
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
