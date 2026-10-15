/** Menu mobile em grade (telas empilhadas), espelhando #app-header-nav. */

const mobileMenuStack = [{ id: 'root', title: 'Menu' }];

function getMobileMenuButtonLabel(button) {
    if (!button) return '';
    const span = button.querySelector(':scope > span');
    if (span && !span.classList.contains('app-nav-chevron')) {
        return span.textContent.trim();
    }
    return button.textContent.replace(/▼/g, '').trim();
}

function cloneMobileMenuIconMarkup(sourceButton) {
    const icon = sourceButton?.querySelector('.app-nav-icon');
    if (!icon) return '';
    return icon.outerHTML;
}

function createMobileMenuIcon(markup) {
    return `<svg class="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">${markup}</svg>`;
}

/** Paths internos do SVG — chaves: id do botão, pendencias:*, label:* */
const MOBILE_MENU_ICON_PATHS = {
    'gestao-nav-pedido': '<path d="M8 4h8a1 1 0 0 1 1 1v15H7V5a1 1 0 0 1 1-1Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    'gestao-nav-clientes': '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"/><path d="M4 20a8 8 0 0 1 16 0"/>',
    'gestao-nav-architects': '<path d="M3 21h18"/><path d="M6 21V7l6-4 6 4v14"/><path d="M10 10h4"/>',
    'gestao-nav-addr': '<path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    'gestao-nav-marceneiros': '<path d="M14 7l-3-3-3 3"/><path d="M11 4v12"/><path d="m7 21 5-4 5 4"/><path d="M5 16h14"/>',
    'gestao-nav-alterar-status-projeto': '<path d="M4 7h16v10H4z"/><path d="M9 7V4h6v3"/><path d="M8 12h8"/>',
    'gestao-nav-alterar-status-terceiros': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'gestao-nav-montadores': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="8" r="3"/><path d="M22 11l-3 3-2-2"/>',
    'gestao-nav-characteristics': '<path d="M4 7h7"/><path d="M4 12h10"/><path d="M4 17h13"/><circle cx="17" cy="7" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="14" cy="17" r="1.5"/>',
    'gestao-nav-third-party-subtypes': '<path d="M7 7h10v10H7z"/><path d="M4 4h4M16 4h4M4 20h4M16 20h4"/>',
    'gestao-nav-purchase-reasons': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'gestao-nav-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'gestao-nav-kanban': '<rect x="4" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="10" rx="1"/><rect x="15.5" y="4" width="4.5" height="13" rx="1"/>',
    'gestao-nav-cronograma-pedido': '<path d="M4 7h16v12H4z"/><path d="M4 11h16M9 7V4M15 7V4"/><path d="M8 15h3"/>',
    'gestao-nav-project-scheduling': '<path d="M4 7h16v12H4z"/><path d="M4 11h16M9 7V4M15 7V4"/>',
    'gestao-nav-montagem-programacao': '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 10h8M8 14h5"/><path d="M12 3v2"/>',
    'gestao-nav-relatorios': '<path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3M8 12h8M8 16h6"/>',
    'gestao-nav-performance': '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V11"/><path d="M12 17V7"/><path d="M16 17v-4"/>',
    'gestao-nav-comercial-meta-venda': '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16l3-4 3 2 4-6"/>',
    'gestao-nav-comercial-vendas': '<path d="M3 7h18v13H3z"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/>',
    'gestao-nav-comercial-comissao': '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
    'gestao-nav-cadastros-toggle': '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="17" cy="7" r="1.5"/><circle cx="19" cy="17" r="1.5"/>',
    'gestao-nav-comercial-financeiro-toggle': '<path d="M12 3v18"/><path d="M7 8h10M7 16h6"/><circle cx="12" cy="8" r="2"/><circle cx="12" cy="16" r="2"/>',
    'comercial-section-funnel': '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>',
    'comercial-section-commissions': '<path d="M12 3v18"/><path d="M7 8h10M7 16h6"/>',
    'performance-nav-projeto': '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/>',
    'performance-nav-montagem-externa': '<path d="M3 10h18v10H3z"/><path d="M7 10V6h10v4"/><path d="M10 14h4"/>',
    'settings-nav-geral': '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V20.5M4.9 6.4l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.2M18.3 12h2.2"/>',
    'settings-nav-activity-log': '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/><path d="M10 4V2h4v2"/>',
    'settings-nav-import-pedido': '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    'settings-nav-addr-label': '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
    'settings-nav-cadastros-toggle': '<path d="M4 7h16M4 12h10M4 17h6"/>',
    'settings-nav-calendar-event-types': '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9h16M8 3.5V6M16 3.5V6"/>',
    'settings-nav-deal-stages': '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="M8 5V3h2v2"/>',
    'settings-nav-lost-reasons': '<circle cx="12" cy="12" r="8"/><path d="M15 9l-6 6M9 9l6 6"/>',
    'settings-nav-project-status': '<path d="M4 7h16M4 12h10M4 17h13"/><circle cx="17" cy="7" r="1.5"/>',
    'settings-nav-create-detailing': '<path d="M12 3v18"/><path d="M5 10h14M5 14h10"/>',
    'settings-nav-compra-status': '<path d="M6 6h15l-1.5 9H7.5L6 6Z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    'settings-nav-usuarios': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/>',
    'btn-programacao-montagem': '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 10h8M8 14h5"/>',
    'btn-programacao-producao': '<path d="M3 10h18"/><path d="M6 10V6h12v4"/><path d="M8 14h3M13 14h3"/>',
    'pendencias-section:consultor': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/>',
    'pendencias-section:projetista': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"/>',
    'pendencias-section:gestor-comercial': '<path d="M3 7h18v13H3z"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/>',
    'pendencias-section:gestor-projetos': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'pendencias-section:gestor-fabrica': '<path d="M2 20h20"/><path d="M6 20V10l6-4 6 4v10"/><path d="M10 14h4v6h-4z"/>',
    'pendencias-section:compras': '<path d="M6 6h15l-1.5 9H7.5L6 6Z"/><path d="M6 6 5 3H2"/>',
    'pendencias:conferencia': '<path d="M5 6h14v10H8l-3 3V6Z"/>',
    'pendencias:em-revisao-comercial': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    'pendencias:aguardando-aprovacao': '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.2 2.2 4.8-5"/>',
    'pendencias:projetos-terceiros': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-4"/>',
    'pendencias:requisicoes': '<path d="M7 4h8l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M15 4v4h4"/>',
    'pendencias:aguardando-projeto-tecnico': '<path d="M4 7h16v12H4z"/><path d="M4 11h16M9 7V4M15 7V4"/>',
    'pendencias:projeto-tecnico': '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/>',
    'pendencias:em-revisao': '<path d="M5 12h14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="9"/>',
    'pendencias:em-revisao-tecnica-proj': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'pendencias:em-revisao-tecnica-revisor': '<circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/>',
    'pendencias:requisicao': '<path d="M5 6h14v10H8l-3 3V6Z"/>',
    'pendencias:nomear': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'pendencias:aguardando-ppcp': '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9h16M12 13v3M12 13h2.5"/>',
    'pendencias:implantacao': '<path d="M12 3v18"/><path d="M5 10h14"/><path d="M8 14h8"/>',
    'pendencias:detalhamento': '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    'pendencias:aguardando-medicao': '<path d="M12 3v4"/><path d="M6 7h12v12H6z"/><path d="M9 11h6"/>',
    'pendencias:aguardando-planta': '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h3"/>',
    'pendencias:conferencias': '<path d="M8 6h11M8 12h11M8 18h11"/><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    'pendencias:pendencia-por-consultor': '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16l2-3 2 2 3-4"/>',
    'pendencias:aprovar-conferencia': '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.2 2.2 4.8-5"/>',
    'pendencias:aguardando-entrega-tecnica': '<path d="M3 10h18v10H3z"/><path d="M7 10V6h10v4"/><path d="M12 14v3"/>',
    'pendencias:carga-por-projetista': '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15h3M13 11h3M16 17h2"/>',
    'pendencias:projetos-sem-projetistas': '<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M18 6l2 2"/>',
    'pendencias:terceiros-sem-projetistas': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M9 7a4 4 0 1 0 8 0"/><path d="M19 8v6"/>',
    'pendencias:aguardando-detalhamento': '<path d="M6 4h12v16H6z"/><path d="M9 8h6"/><path d="M12 12v6"/>',
    'pendencias:expedicao': '<path d="M3 10h12v8H3z"/><path d="M15 10h4l2 3v5h-6z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/>',
    'pendencias:montagem-externa': '<path d="M3 10h18v10H3z"/><path d="M7 10V6h10v4"/>',
    'pendencias:aguardando-montagem-interna': '<path d="M2 20h20"/><path d="M6 20V10l6-4 6 4v10"/>',
    'pendencias:em-montagem': '<path d="M14.7 6.3a1 1 0 0 0-1.4 0l-7 7a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4Z"/><path d="m11 9 2 2"/>',
    'pendencias:enviados-compras': '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    'pendencias:assistencias': '<path d="M12 22s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    'programacoes:projects': '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="17" cy="7" r="1.5"/>',
    'programacoes:deliveries': '<path d="M3 10h12v8H3z"/><path d="M15 10h4l2 3v5h-6z"/>',
    'label:Cadastros': '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="17" cy="7" r="1.5"/>',
    'label:Comercial Financeiro': '<path d="M12 3v18"/><path d="M7 8h10M7 16h6"/>',
    'label:Resumo': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    'label:Montagem': '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 10h8"/>',
    'label:Produção': '<path d="M3 10h18"/><path d="M6 10V6h12v4"/>',
    'label:Projetos': '<path d="M4 7h16M4 12h10M4 17h6"/>',
    'label:Entregas': '<path d="M3 10h12v8H3z"/><path d="M15 10h4l2 3v5h-6z"/>'
};

const MOBILE_MENU_DEFAULT_ICON = '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>';

function resolveMobileMenuIconHtml(button, context = {}) {
    const fromDom = cloneMobileMenuIconMarkup(button);
    if (fromDom) return fromDom;

    const id = button?.id;
    if (id && MOBILE_MENU_ICON_PATHS[id]) {
        return createMobileMenuIcon(MOBILE_MENU_ICON_PATHS[id]);
    }

    const pendenciasItem = button?.dataset?.pendenciasItem;
    if (pendenciasItem && MOBILE_MENU_ICON_PATHS[`pendencias:${pendenciasItem}`]) {
        return createMobileMenuIcon(MOBILE_MENU_ICON_PATHS[`pendencias:${pendenciasItem}`]);
    }

    const pendenciasSection = button?.dataset?.pendenciasSection;
    if (pendenciasSection && MOBILE_MENU_ICON_PATHS[`pendencias-section:${pendenciasSection}`]) {
        return createMobileMenuIcon(MOBILE_MENU_ICON_PATHS[`pendencias-section:${pendenciasSection}`]);
    }

    const programacoesSection = button?.dataset?.programacoesSection;
    if (programacoesSection && MOBILE_MENU_ICON_PATHS[`programacoes:${programacoesSection}`]) {
        return createMobileMenuIcon(MOBILE_MENU_ICON_PATHS[`programacoes:${programacoesSection}`]);
    }

    const label = getMobileMenuButtonLabel(button);
    if (label && MOBILE_MENU_ICON_PATHS[`label:${label}`]) {
        return createMobileMenuIcon(MOBILE_MENU_ICON_PATHS[`label:${label}`]);
    }

    if (context.groupIconHtml) return context.groupIconHtml;
    return createMobileMenuIcon(MOBILE_MENU_DEFAULT_ICON);
}

function collectMobileMenuLeafTiles(buttons, context = {}) {
    return buttons
        .filter(btn => btn && !btn.classList.contains('hidden') && !btn.id?.includes('toggle'))
        .map(btn => ({
            kind: 'leaf',
            label: getMobileMenuButtonLabel(btn),
            iconHtml: resolveMobileMenuIconHtml(btn, context),
            activate: () => btn.click()
        }));
}

function collectMobileMenuTilesFromNavContainer(container, context = {}) {
    if (!container) return [];

    const tiles = [];

    container.querySelectorAll(':scope > button.app-nav-item').forEach(btn => {
        if (btn.classList.contains('hidden') || btn.classList.contains('app-nav-item--branch')) return;
        tiles.push({
            kind: 'leaf',
            label: getMobileMenuButtonLabel(btn),
            iconHtml: resolveMobileMenuIconHtml(btn, context),
            activate: () => btn.click()
        });
    });

    container.querySelectorAll(':scope > .app-nav-branch').forEach(branch => {
        const branchBtn = branch.querySelector(':scope > .app-nav-item--branch');
        if (!branchBtn || branchBtn.classList.contains('hidden')) return;

        const itemButtons = [...branch.querySelectorAll(':scope > .app-nav-branch__items button.app-nav-item')]
            .filter(btn => !btn.classList.contains('hidden'));

        if (!itemButtons.length) return;

        const title = getMobileMenuButtonLabel(branchBtn);
        const branchIconHtml = resolveMobileMenuIconHtml(branchBtn, context);
        const childContext = {
            ...context,
            groupIconHtml: branchIconHtml || context.groupIconHtml
        };
        tiles.push({
            kind: 'group',
            label: title,
            iconHtml: branchIconHtml,
            children: () => collectMobileMenuLeafTiles(itemButtons, childContext)
        });
    });

    return tiles;
}

function collectMobileMenuRootTiles() {
    const nav = document.getElementById('app-header-nav');
    if (!nav) return [];

    const tiles = [];

    nav.childNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList.contains('app-nav-divider') || node.classList.contains('hidden')) return;

        if (node.matches('button.app-nav-item')) {
            tiles.push({
                kind: 'leaf',
                label: getMobileMenuButtonLabel(node),
                iconHtml: resolveMobileMenuIconHtml(node),
                activate: () => node.click()
            });
            return;
        }

        if (!node.matches('details.app-nav-group')) return;

        const summary = node.querySelector(':scope > summary.app-nav-item');
        const subNav = node.querySelector('.app-subnav nav');
        if (!summary || !subNav) return;

        const title = getMobileMenuButtonLabel(summary);
        const groupIconHtml = resolveMobileMenuIconHtml(summary);
        tiles.push({
            kind: 'group',
            label: title,
            iconHtml: groupIconHtml,
            children: () => collectMobileMenuTilesFromNavContainer(subNav, { groupIconHtml })
        });
    });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn && !logoutBtn.classList.contains('hidden')) {
        tiles.push({
            kind: 'leaf',
            label: getMobileMenuButtonLabel(logoutBtn) || 'Sair',
            iconHtml: resolveMobileMenuIconHtml(logoutBtn),
            activate: () => logoutBtn.click(),
            tone: 'quiet'
        });
    }

    return tiles;
}

function getMobileMenuCurrentTiles() {
    const frame = mobileMenuStack[mobileMenuStack.length - 1];
    if (!frame) return [];
    if (frame.id === 'root') return collectMobileMenuRootTiles();
    return typeof frame.tiles === 'function' ? frame.tiles() : (frame.tiles || []);
}

function renderMobileMenuGrid() {
    const host = document.getElementById('app-mobile-menu');
    const grid = document.getElementById('app-mobile-menu-grid');
    const titleEl = document.getElementById('app-mobile-menu-title');
    const backBtn = document.getElementById('btn-mobile-menu-stack-back');
    if (!host || !grid || !titleEl) return;

    const frame = mobileMenuStack[mobileMenuStack.length - 1];
    titleEl.textContent = frame?.title || 'Menu';

    const showBack = mobileMenuStack.length > 1;
    backBtn?.classList.toggle('hidden', !showBack);

    const tiles = getMobileMenuCurrentTiles();
    if (!tiles.length) {
        grid.innerHTML = '<p class="app-mobile-menu__empty">Nenhuma opção disponível.</p>';
        return;
    }

    grid.innerHTML = tiles.map((tile, index) => {
        const toneClass = tile.tone === 'quiet' ? ' app-mobile-menu__tile--quiet' : '';
        const chevron = tile.kind === 'group'
            ? '<span class="app-mobile-menu__chevron" aria-hidden="true">›</span>'
            : '';
        const icon = `<span class="app-mobile-menu__icon">${tile.iconHtml || createMobileMenuIcon(MOBILE_MENU_DEFAULT_ICON)}</span>`;

        return `
            <button type="button"
                class="app-mobile-menu__tile${toneClass}"
                data-mobile-menu-index="${index}"
                data-mobile-menu-kind="${tile.kind}">
                ${icon}
                <span class="app-mobile-menu__label">${escapeHtml(tile.label)}</span>
                ${chevron}
            </button>
        `;
    }).join('');

    grid.querySelectorAll('[data-mobile-menu-index]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = Number(btn.dataset.mobileMenuIndex);
            const tile = tiles[index];
            if (!tile) return;

            if (tile.kind === 'group') {
                mobileMenuStack.push({
                    id: `group-${tile.label}`,
                    title: tile.label,
                    tiles: tile.children
                });
                renderMobileMenuGrid();
                return;
            }

            if (typeof tile.activate === 'function') tile.activate();
            if (typeof closeMobileMenu === 'function') closeMobileMenu();
        });
    });
}

function resetMobileMenuStack() {
    mobileMenuStack.length = 0;
    mobileMenuStack.push({ id: 'root', title: 'Menu' });
}

window.resetMobileMenuStack = resetMobileMenuStack;

function mobileMenuStackBack() {
    if (mobileMenuStack.length <= 1) return;
    mobileMenuStack.pop();
    renderMobileMenuGrid();
}

function syncMobileMenuVisibility() {
    const host = document.getElementById('app-mobile-menu');
    const useGrid = typeof isMobileViewport === 'function' && isMobileViewport();
    if (!host) return;

    host.hidden = !useGrid;
    host.setAttribute('aria-hidden', useGrid ? 'false' : 'true');
    document.body.classList.toggle('app-mobile-grid-menu', useGrid);

    if (useGrid && document.body.classList.contains('is-mobile-menu-open')) {
        renderMobileMenuGrid();
    }
}

function openMobileMenuGrid() {
    if (typeof isMobileViewport !== 'function' || !isMobileViewport()) return;
    resetMobileMenuStack();
    renderMobileMenuGrid();
}

function refreshMobileMenuIfOpen() {
    if (!document.body.classList.contains('is-mobile-menu-open')) return;
    if (!document.body.classList.contains('app-mobile-grid-menu')) return;
    renderMobileMenuGrid();
}

function isMobileTopbarContentBackAvailable() {
    const dashboard = document.getElementById('dashboard-view');
    if (dashboard
        && !dashboard.classList.contains('hidden')
        && dashboard.classList.contains('fm-dashboard--mobile-detail')) {
        return true;
    }
    return false;
}

function syncMobileTopbarContentActions() {
    const mobile = typeof isMobileViewport === 'function' && isMobileViewport();
    const menuOpen = document.body.classList.contains('is-mobile-menu-open');
    const backBtn = document.getElementById('btn-mobile-topbar-back');
    const showContentChrome = mobile && !menuOpen;

    backBtn?.classList.toggle('hidden', !(showContentChrome && isMobileTopbarContentBackAvailable()));
}

function handleMobileTopbarContentBack() {
    if (isMobileTopbarContentBackAvailable() && typeof showDashboardMobileOrderList === 'function') {
        showDashboardMobileOrderList();
    }
}

function bindMobileMenu() {
    document.getElementById('btn-mobile-menu-close')?.addEventListener('click', () => {
        if (typeof closeMobileMenu === 'function') closeMobileMenu();
    });
    document.getElementById('btn-mobile-menu-stack-back')?.addEventListener('click', mobileMenuStackBack);
    document.getElementById('btn-mobile-topbar-back')?.addEventListener('click', handleMobileTopbarContentBack);
}

window.openMobileMenuGrid = openMobileMenuGrid;
window.refreshMobileMenuIfOpen = refreshMobileMenuIfOpen;
window.syncMobileMenuVisibility = syncMobileMenuVisibility;
window.syncMobileTopbarContentActions = syncMobileTopbarContentActions;
window.bindMobileMenu = bindMobileMenu;
