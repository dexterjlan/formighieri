const REQUISICOES_CONSTRUCTION_COPY = {
    parts: {
        title: 'Peça',
        text: 'Em construção'
    },
    assistance: {
        title: 'Assistência',
        text: 'Em construção'
    }
};

function renderRequisicoesConstruction(sectionId) {
    const content = document.getElementById('requisicoes-content');
    const copy = REQUISICOES_CONSTRUCTION_COPY[sectionId];
    if (!content || !copy) return;

    content.innerHTML = `
        <section class="requisicoes-construction">
            <div class="requisicoes-construction__card">
                <h2>${escapeHtml(copy.title)}</h2>
                <p>${escapeHtml(copy.text)}</p>
            </div>
        </section>
    `;
}

window.renderRequisicoesConstruction = renderRequisicoesConstruction;
