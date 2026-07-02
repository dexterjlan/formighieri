const SUPABASE_URL = "https://phpcrboxtduethlqvkot.supabase.co";
const SUPABASE_KEY = "sb_publishable_x1-G_DEEt_PxLwRou-J3dg_KKuFwEj-";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let activeOrderId = null;
let editingConversationId = null;
let conversationsCache = [];
let editingCommercialApprovalId = null;
let commercialApprovalsCache = [];
let enterAppInProgress = null;
