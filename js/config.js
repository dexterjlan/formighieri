const SUPABASE_URL = "https://phpcrboxtduethlqvkot.supabase.co";
const SUPABASE_KEY = "sb_publishable_x1-G_DEEt_PxLwRou-J3dg_KKuFwEj-";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const NOTIFICATIONS_ENABLED = true;
const NOTIFICATION_TEST_MODE = true;
const NOTIFICATION_TEST_EMAIL = 'dexterjl@gmail.com';
const NOTIFICATION_FROM_EMAIL = 'formighieri.notificacoes@gmail.com';
const NOTIFICATION_FROM_NAME = 'Formighieri Notificações';

// Google Apps Script — envia pelo Gmail formighieri.notificacoes@gmail.com
// Cole o script de google-apps-script/FormighieriNotificacoes.gs e publique como Web App
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRGNzgQ-f66UoGN0ynMm4krUViWjKxuqKzh8hT5mE8HOmW-9VlJufJcmZx7ItysgY/exec';
const NOTIFICATION_SCRIPT_SECRET = 'Hanna@2020';

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
let enterAppInProgress = null;
