function openImageAttachmentLightbox(url, fileName = 'Imagem') {
    if (!url) {
        alertAppDialog('Não foi possível abrir a imagem.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'conv-attachment-lightbox';
    overlay.innerHTML = `
        <button type="button" class="conv-attachment-lightbox__close" aria-label="Fechar">×</button>
        <img src="${url}" alt="${escapeHtml(fileName)}" class="conv-attachment-lightbox__image">
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('.conv-attachment-lightbox__close')) {
            close();
        }
    });
    document.addEventListener('keydown', function onKeydown(event) {
        if (event.key === 'Escape') {
            close();
            document.removeEventListener('keydown', onKeydown);
        }
    });

    document.body.appendChild(overlay);
}
