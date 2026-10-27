/**
 * Envio padronizado de mensagens para salas Matrix (Element).
 * Reutilize MatrixRoomNotifier em outros módulos (revisões, projetos, etc.).
 */
class MatrixRoomNotifier {
    constructor(roomIdOrAlias) {
        this.roomIdOrAlias = String(roomIdOrAlias || '').trim();
    }

    /**
     * @param {Array<{ matrixUserId?: string, name?: string }>} mentionTargets
     */
    collectMentionUserIds(mentionTargets = []) {
        if (typeof normalizeMatrixMentionUserIds === 'function') {
            return normalizeMatrixMentionUserIds(
                (mentionTargets || []).map(target => target?.matrixUserId)
            );
        }
        return [...new Set(
            (mentionTargets || [])
                .map(target => String(target?.matrixUserId || '').trim())
                .filter(id => id.startsWith('@') && id.includes(':'))
        )];
    }

    formatMessageWithMentions(lines, mentionTargets = []) {
        const body = (Array.isArray(lines) ? lines : [String(lines || '')])
            .map(line => String(line || '').trim())
            .filter(Boolean)
            .join('\n');

        const mentionIds = this.collectMentionUserIds(mentionTargets);

        if (!mentionIds.length) {
            return { message: body, mentionUserIds: [] };
        }

        return {
            message: `${mentionIds.join(' ')}\n\n${body}`,
            mentionUserIds: mentionIds
        };
    }

    isConfigured() {
        return typeof isMatrixMessagingConfigured === 'function' && isMatrixMessagingConfigured();
    }

    /**
     * @param {string|string[]} linesOrText
     * @param {{ mentionTargets?: Array<{ matrixUserId?: string, name?: string }> }} options
     */
    async send(linesOrText, options = {}) {
        if (!this.roomIdOrAlias) {
            throw new Error('Sala Matrix não configurada.');
        }

        const { message, mentionUserIds } = this.formatMessageWithMentions(
            linesOrText,
            options.mentionTargets
        );
        if (!message.trim()) {
            return null;
        }

        if (!this.isConfigured()) {
            console.info('MatrixRoomNotifier: Matrix não configurado — mensagem não enviada.');
            return null;
        }

        if (typeof sendMatrixMessage !== 'function') {
            console.warn('MatrixRoomNotifier: sendMatrixMessage indisponível.');
            return null;
        }

        return sendMatrixMessage({
            targetType: 'room',
            roomId: this.roomIdOrAlias,
            message,
            mentionTargets: options.mentionTargets,
            mentionUserIds
        });
    }

    /** Não bloqueia o fluxo da UI; erros vão para o console. */
    notify(linesOrText, options = {}) {
        this.send(linesOrText, options).catch(error => {
            console.warn('MatrixRoomNotifier.notify:', error);
        });
    }
}

window.MatrixRoomNotifier = MatrixRoomNotifier;
