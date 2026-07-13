function resolveFormighieriAppEnv() {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('env') || localStorage.getItem('formighieri-env');
    if (forced === 'dev' || forced === 'prod') {
        return forced;
    }

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'dev';
    }

    return 'prod';
}

function getFormighieriEnvConfig(env = resolveFormighieriAppEnv()) {
    return env === 'prod'
        ? (window.FORMIGHIERI_CONFIG_PROD || {})
        : (window.FORMIGHIERI_CONFIG_DEV || {});
}

const FORMIGHIERI_APP_ENV = resolveFormighieriAppEnv();
const FORMIGHIERI_ENV_CONFIG = getFormighieriEnvConfig(FORMIGHIERI_APP_ENV);

const SUPABASE_URL = FORMIGHIERI_ENV_CONFIG.SUPABASE_URL || '';
const SUPABASE_KEY = FORMIGHIERI_ENV_CONFIG.SUPABASE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('SUBSTITUA')) {
    console.error(
        `[Formighieri] Configuração Supabase incompleta para o ambiente "${FORMIGHIERI_APP_ENV}". ` +
        `Atualize js/core/config.${FORMIGHIERI_APP_ENV}.js`
    );
}

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const NOTIFICATIONS_ENABLED = true;
const NOTIFICATION_TEST_MODE = FORMIGHIERI_ENV_CONFIG.NOTIFICATION_TEST_MODE !== false;
const NOTIFICATION_TEST_EMAIL = FORMIGHIERI_ENV_CONFIG.NOTIFICATION_TEST_EMAIL || '';
const NOTIFICATION_FROM_EMAIL = 'formighieri.notificacoes@gmail.com';
const NOTIFICATION_FROM_NAME = 'FGP - Formighieri';

// URL pública do app (para imagens em e-mails). Se vazio, usa window.location.origin no navegador.
const APP_PUBLIC_URL = 'https://dexterjlan.github.io/formighieri';

// Google Apps Script — envia pelo Gmail formighieri.notificacoes@gmail.com
// Cole o script de google-apps-script/FormighieriNotificacoes.gs e publique como Web App
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwP1IkfR8OfsYRQEq3IGB_VF_XSGnTQkN5WAjngfTCNGHohp4IcEd4fzaxb3a_o72A/exec';
const NOTIFICATION_SCRIPT_SECRET = 'Hanna@2020';

const SYSTEM_SETTINGS_DEFAULTS = {
    approvalOverdueDays: 5,
    requestOverdueDays: 5
};

let currentUser = null;
let activeOrderId = null;
let editingConversationId = null;
let conversationsCache = [];
let editingCommercialApprovalId = null;
let commercialApprovalsCache = [];
let editingRevisionId = null;
let currentRevisionApprovalId = null;
let revisionActivityRowCounter = 0;
let revisionModalViewOnly = false;
let requestActivityRowCounter = 0;
let systemSettingsCache = null;
let enterAppInProgress = null;

window.FORMIGHIERI_APP_ENV = FORMIGHIERI_APP_ENV;
