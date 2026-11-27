const FUEL_STATION_ADDR_OWNER_TYPE = 'fuelStation';

const EXPEDITION_FUEL_STATION_ADDR_PREFIX = 'expedition-fuel-station';

function isExpeditionFuelingStopItem(item) {
    return String(item?.entityType || '') === 'Fueling';
}

function isExpeditionZeroVolumeRouteEntityType(entityType) {
    const key = String(entityType || '');
    return key === 'Pickup' || key === 'Fueling';
}

function expeditionFuelingSqlHint() {
    return 'Execute `supabase/feats/add-expedition-fueling-fuel-station.sql` no Supabase SQL Editor (DEV).';
}

function isExpeditionFuelingSchemaError(error) {
    const message = String(error?.message || '');
    return /FuelStation|Fueling|expeditionFueling|schema cache|relation|column/i.test(message);
}

function buildExpeditionFuelingItemLabel(metadata = {}) {
    const name = String(metadata.fuelStationName || metadata.name || '').trim();
    return name ? `Abastecimento · ${name}` : 'Abastecimento';
}

function buildExpeditionFuelingDriveFolderPath(routeId, stopLabel) {
    if (typeof buildExpeditionRouteStopDriveFolderPath === 'function') {
        return buildExpeditionRouteStopDriveFolderPath(routeId, stopLabel);
    }
    const root = typeof getDriveRootFolderName === 'function' ? getDriveRootFolderName() : 'FGP';
    return [root, 'Rotas', String(routeId || ''), String(stopLabel || 'Parada')].join(' / ');
}

const FUEL_STATION_SELECT = `id, name, addrId, isActive,
    address:addr(id, nickname, street, number, complement, neighborhood, city, state, postalCode, isPrimary)`;

async function fetchFuelStationAddrLabelId() {
    const { data, error } = await supabaseClient
        .from('addrlabel')
        .select('id')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.warn('fetchFuelStationAddrLabelId:', error);
        return null;
    }
    return data?.id ? Number(data.id) : null;
}

async function searchExpeditionFuelStations(queryText = '', limit = 30) {
    const q = String(queryText || '').trim();
    const max = Math.min(Math.max(limit, 5), 50);

    let request = supabaseClient
        .from('FuelStation')
        .select(FUEL_STATION_SELECT)
        .eq('isActive', true)
        .order('name', { ascending: true })
        .limit(max);

    if (q) {
        if (/^\d+$/.test(q)) {
            request = request.eq('id', Number(q));
        } else {
            request = request.ilike('name', `%${q}%`);
        }
    }

    const { data, error } = await request;
    if (error) {
        if (isExpeditionFuelingSchemaError(error)) {
            throw new Error(expeditionFuelingSqlHint());
        }
        throw error;
    }

    return (data || []).map(row => ({
        ...row,
        id: Number(row.id),
        address: row.address || null
    }));
}

function collectExpeditionFuelStationFormPayload() {
    const get = suffix => document.getElementById(`${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-${suffix}`)?.value;
    const name = String(get('name') || '').trim();
    const postalCode = typeof digitsOnlyPostalCode === 'function'
        ? digitsOnlyPostalCode(get('postal-code'))
        : String(get('postal-code') || '').replace(/\D/g, '');

    return {
        name,
        postalCode,
        street: String(get('street') || '').trim(),
        number: String(get('number') || '').trim() || null,
        complement: String(get('complement') || '').trim() || null,
        neighborhood: String(get('neighborhood') || '').trim() || null,
        city: String(get('city') || '').trim(),
        state: typeof normalizeAddrState === 'function'
            ? normalizeAddrState(get('state'))
            : String(get('state') || '').trim().toUpperCase().slice(0, 2)
    };
}

function validateExpeditionFuelStationPayload(payload) {
    if (!payload.name) {
        alertAppDialog('Informe o nome do posto.');
        return false;
    }
    if (String(payload.postalCode || '').length !== 8) {
        alertAppDialog('Informe um CEP válido com 8 dígitos.');
        return false;
    }
    if (!payload.street) {
        alertAppDialog('Informe o logradouro.');
        return false;
    }
    if (!payload.number) {
        alertAppDialog('Informe o número do endereço.');
        return false;
    }
    if (!payload.city) {
        alertAppDialog('Informe a cidade.');
        return false;
    }
    if (String(payload.state || '').length !== 2) {
        alertAppDialog('Informe a UF com 2 letras.');
        return false;
    }
    return true;
}

async function createExpeditionFuelStationFromForm() {
    const payload = collectExpeditionFuelStationFormPayload();
    if (!validateExpeditionFuelStationPayload(payload)) {
        return null;
    }

    const labelId = await fetchFuelStationAddrLabelId();
    if (!labelId) {
        alertAppDialog('Nenhum label de endereço ativo cadastrado. Cadastre em Gestão → Endereços.');
        return null;
    }

    const now = new Date().toISOString();
    const addrInsert = await supabaseClient
        .from('addr')
        .insert({
            ownerType: FUEL_STATION_ADDR_OWNER_TYPE,
            ownerId: 0,
            labelId,
            nickname: payload.name,
            postalCode: payload.postalCode,
            street: payload.street,
            number: payload.number,
            complement: payload.complement,
            neighborhood: payload.neighborhood,
            city: payload.city,
            state: payload.state,
            country: 'BR',
            isPrimary: true,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        })
        .select('id')
        .single();

    if (addrInsert.error) {
        if (isExpeditionFuelingSchemaError(addrInsert.error)) {
            throw new Error(expeditionFuelingSqlHint());
        }
        throw addrInsert.error;
    }

    const addrId = Number(addrInsert.data?.id);
    const stationInsert = await supabaseClient
        .from('FuelStation')
        .insert({
            name: payload.name,
            addrId,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        })
        .select(FUEL_STATION_SELECT)
        .single();

    if (stationInsert.error) {
        await supabaseClient.from('addr').delete().eq('id', addrId);
        if (isExpeditionFuelingSchemaError(stationInsert.error)) {
            throw new Error(expeditionFuelingSqlHint());
        }
        throw stationInsert.error;
    }

    const station = stationInsert.data;
    const stationId = Number(station?.id);
    await supabaseClient
        .from('addr')
        .update({ ownerId: stationId, updatedAt: now, updatedById: currentUser?.id || null })
        .eq('id', addrId);

    return { ...station, id: stationId, address: station?.address || { id: addrId, ...payload } };
}

async function resolveExpeditionFuelingContextById(fuelStationId) {
    const key = Number(fuelStationId);
    if (!key) return { ok: false, message: 'Selecione um posto.' };

    const { data: row, error } = await supabaseClient
        .from('FuelStation')
        .select(FUEL_STATION_SELECT)
        .eq('id', key)
        .eq('isActive', true)
        .maybeSingle();

    if (error) {
        if (isExpeditionFuelingSchemaError(error)) {
            return { ok: false, message: expeditionFuelingSqlHint() };
        }
        return { ok: false, message: error.message };
    }
    if (!row) return { ok: false, message: 'Posto não encontrado.' };

    const addr = typeof buildAddrSnapshotFromRecord === 'function'
        ? buildAddrSnapshotFromRecord(row.address)
        : null;
    if (!addr) return { ok: false, message: 'Posto sem endereço cadastrado.' };

    const metadata = {
        fuelStationId: key,
        fuelStationName: row.name
    };

    return {
        ok: true,
        entityType: 'Fueling',
        entityId: key,
        label: buildExpeditionFuelingItemLabel(metadata),
        addr,
        volumeCount: 0,
        metadata,
        meta: { fuelStation: row, metadata }
    };
}

async function fetchExpeditionRouteFuelingStopItems(routeId) {
    const key = Number(routeId);
    if (!key) return [];

    const stopEmbed = 'stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)';
    const stopEmbedInner = 'stop:ExpeditionRouteStop!inner(id, sortOrder, addrSnapshot, routeId)';
    const selects = [
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            pickupUnloadedBy:appUsers!pickupUnloadedById(id, name),
            ${stopEmbedInner}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            pickupUnloadedBy:appUsers!pickupUnloadedById(id, name),
            ${stopEmbed}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            ${stopEmbedInner}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            ${stopEmbed}`
    ];

    let lastError = null;
    for (const select of selects) {
        let query = supabaseClient
            .from('ExpeditionRouteStopItem')
            .select(select)
            .eq('entityType', 'Fueling');

        if (select.includes('!inner')) {
            query = query.eq('stop.routeId', key);
        } else {
            query = query.eq('routeId', key);
        }

        const result = await query.order('id', { ascending: true });
        if (!result.error) return result.data || [];
        lastError = result.error;
        if (!isExpeditionFuelingSchemaError(result.error)
            && !/relationship|pickupUnloadedBy|routeId|schema cache/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && isExpeditionFuelingSchemaError(lastError)) {
        console.warn('fetchExpeditionRouteFuelingStopItems:', lastError);
        return [];
    }
    if (lastError) throw lastError;
    return [];
}

async function markExpeditionFuelingUnloaded(stopItemId) {
    const key = Number(stopItemId);
    if (!key) throw new Error('Item de abastecimento inválido.');

    const now = new Date().toISOString();
    const result = await supabaseClient
        .from('ExpeditionRouteStopItem')
        .update({
            pickupUnloadedAt: now,
            pickupUnloadedById: currentUser?.id || null
        })
        .eq('id', key)
        .eq('entityType', 'Fueling')
        .select('id, pickupUnloadedAt, stopId')
        .single();

    if (result.error && isExpeditionFuelingSchemaError(result.error)) {
        throw new Error(expeditionFuelingSqlHint());
    }
    if (result.error) throw result.error;
    return result.data;
}

async function uploadExpeditionFuelingPhoto(file, context = {}) {
    if (!file) throw new Error('Selecione uma foto.');
    if (typeof saveDriveFileUpload !== 'function') {
        throw new Error('Upload para o Drive não está disponível.');
    }

    let uploadFile = file;
    if (typeof prepareDriveImageUploadFile === 'function') {
        uploadFile = await prepareDriveImageUploadFile(file, {
            maxBytes: typeof DRIVE_FILE_REVISION_IMAGE_MAX_BYTES !== 'undefined'
                ? DRIVE_FILE_REVISION_IMAGE_MAX_BYTES
                : (2 * 1024 * 1024)
        });
    }

    const folderKind = typeof DRIVE_FILE_FOLDER_KIND !== 'undefined'
        ? DRIVE_FILE_FOLDER_KIND.EXPEDITION_FUELING
        : 'expeditionFueling';

    if (typeof validateDriveUploadFiles === 'function') {
        const validationError = validateDriveUploadFiles([uploadFile], folderKind);
        if (validationError) {
            throw new Error(validationError);
        }
    }

    const routeId = Number(context.routeId) || 0;
    const stopId = Number(context.stopId) || 0;
    const stopLabel = context.stopLabel
        || (typeof formatExpeditionRouteStopDriveLabel === 'function'
            ? formatExpeditionRouteStopDriveLabel(context.stopSortOrder, stopId)
            : `Parada ${stopId}`);

    return saveDriveFileUpload(uploadFile, {
        folderKind,
        entityType: 'ExpeditionRouteStopItem',
        entityId: Number(context.stopItemId),
        routeId,
        expeditionRouteId: String(routeId),
        expeditionStopLabel: stopLabel,
        orderCode: String(routeId),
        projectName: stopLabel,
        folderPath: buildExpeditionFuelingDriveFolderPath(routeId, stopLabel),
        fileName: context.fileName || `abastecimento-${routeId}-${stopId}.jpg`,
        replaceByEntity: true,
        preserveOriginalFileName: false
    });
}

function renderExpedicaoWizardFuelingRegisterFormHtml() {
    const open = Boolean(expedicaoWizardState?.fuelingRegisterOpen);
    return `
        <div class="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
            <p class="text-xs font-semibold text-amber-900">Postos de combustível</p>
            <p class="text-[11px] text-slate-600 leading-snug">Selecione um posto na lista abaixo ou cadastre um novo com nome e endereço.</p>
            ${!open ? `
                <button type="button" id="expedition-wizard-fueling-toggle-register"
                    class="w-full text-sm bg-amber-700 text-white px-4 py-3 rounded-xl font-bold min-h-[44px] touch-manipulation">
                    Cadastrar novo posto
                </button>
            ` : `
                <button type="button" id="expedition-wizard-fueling-toggle-register"
                    class="w-full text-sm bg-white border border-amber-300 text-amber-900 px-4 py-2 rounded-lg font-semibold">
                    Fechar cadastro
                </button>
            `}
            <div id="expedition-wizard-fueling-register-fields" class="${open ? 'space-y-3' : 'hidden'}">
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-name">Nome do posto</label>
                    <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-name"
                        class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Ex.: Posto Shell Centro">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-postal-code">CEP</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-postal-code" inputmode="numeric"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="00000-000">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-number">Número</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-number"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Nº">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-street">Logradouro</label>
                    <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-street"
                        class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-neighborhood">Bairro</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-neighborhood"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-complement">Complemento</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-complement"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-city">Cidade</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-city"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-state">UF</label>
                        <input type="text" id="${EXPEDITION_FUEL_STATION_ADDR_PREFIX}-state" maxlength="2"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                    </div>
                </div>
                <button type="button" id="expedition-wizard-fueling-save-station"
                    class="w-full text-sm bg-amber-700 text-white px-4 py-2.5 rounded-lg font-bold">
                    Salvar posto
                </button>
            </div>
        </div>
    `;
}

function bindExpedicaoWizardFuelingRegisterForm() {
    if (typeof bindAddrPostalCodeFields === 'function') {
        bindAddrPostalCodeFields(EXPEDITION_FUEL_STATION_ADDR_PREFIX);
    }
    document.getElementById('expedition-wizard-fueling-toggle-register')?.addEventListener('click', () => {
        if (!expedicaoWizardState) return;
        expedicaoWizardState.fuelingRegisterOpen = !expedicaoWizardState.fuelingRegisterOpen;
        renderExpedicaoRouteWizard();
    });
    document.getElementById('expedition-wizard-fueling-save-station')?.addEventListener('click', () => {
        void saveExpedicaoWizardFuelStationAndRefresh();
    });
}

async function saveExpedicaoWizardFuelStationAndRefresh() {
    expedicaoRouteWizardOverlay?.setLoading(true, 'Salvando posto...');
    try {
        const station = await createExpeditionFuelStationFromForm();
        if (!station) return;
        expedicaoWizardState.fuelingStationId = Number(station.id);
        expedicaoWizardState.fuelingRegisterOpen = false;
        alertAppDialog('Posto cadastrado.');
        renderExpedicaoRouteWizard();
    } catch (error) {
        console.error('saveExpedicaoWizardFuelStationAndRefresh:', error);
        alertAppDialog(error?.message || 'Erro ao salvar posto.');
    } finally {
        expedicaoRouteWizardOverlay?.setLoading(false);
    }
}

window.isExpeditionFuelingStopItem = isExpeditionFuelingStopItem;
window.isExpeditionZeroVolumeRouteEntityType = isExpeditionZeroVolumeRouteEntityType;
window.searchExpeditionFuelStations = searchExpeditionFuelStations;
window.resolveExpeditionFuelingContextById = resolveExpeditionFuelingContextById;
window.fetchExpeditionRouteFuelingStopItems = fetchExpeditionRouteFuelingStopItems;
window.markExpeditionFuelingUnloaded = markExpeditionFuelingUnloaded;
window.uploadExpeditionFuelingPhoto = uploadExpeditionFuelingPhoto;
window.buildExpeditionFuelingItemLabel = buildExpeditionFuelingItemLabel;
window.renderExpedicaoWizardFuelingRegisterFormHtml = renderExpedicaoWizardFuelingRegisterFormHtml;
window.bindExpedicaoWizardFuelingRegisterForm = bindExpedicaoWizardFuelingRegisterForm;
window.expeditionFuelingSqlHint = expeditionFuelingSqlHint;
window.isExpeditionFuelingSchemaError = isExpeditionFuelingSchemaError;

async function fetchExpeditionFuelingStopItemsForRoutes(routeIds = []) {
    const keys = [...new Set((routeIds || []).map(id => Number(id)).filter(Boolean))];
    if (!keys.length) return [];

    const stopEmbedInner = 'stop:ExpeditionRouteStop!inner(id, routeId, sortOrder, addrSnapshot)';
    const selects = [
        `id, entityType, pickupUnloadedAt, stopId, routeId, ${stopEmbedInner}`,
        `id, entityType, pickupUnloadedAt, stopId, ${stopEmbedInner}`
    ];

    let lastError = null;
    for (const select of selects) {
        const result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .select(select)
            .eq('entityType', 'Fueling')
            .in('stop.routeId', keys);
        if (!result.error) return result.data || [];
        lastError = result.error;
        if (!/relationship|routeId|schema cache|pickupUnloaded/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && isExpeditionFuelingSchemaError(lastError)) {
        return [];
    }
    if (lastError) console.warn('fetchExpeditionFuelingStopItemsForRoutes:', lastError);
    return [];
}

window.fetchExpeditionFuelingStopItemsForRoutes = fetchExpeditionFuelingStopItemsForRoutes;