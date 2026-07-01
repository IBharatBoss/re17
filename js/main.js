// js/main.js
import { compressImage } from './utils/compressor.js';
import { uploadImages } from './api/storageAdapter.js';
import { fetchProperties, fetchLeads, fetchGlobalSettings, saveProperty, updateProperty, deleteProperty, updateGlobalSettings, updateLeadStatus, deleteLead, fetchSecureSettings } from './api/databaseAdapter.js';
import { FIREBASE_CONFIG } from './config.js';

// Initialize Firebase (v8 compat)
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}

// --- Shared Utility: Confetti Cannon ---
function fireConfetti() {
    if (typeof confetti !== 'function') return;
    const duration = 2000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 40, spread: 360, ticks: 80, zIndex: 10000 };
    const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 250 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
    }, 150);
}

document.addEventListener('DOMContentLoaded', () => {
    // --- AUTHENTICATION ---
    const loginOverlay = document.getElementById('login-overlay');
    const appShell = document.getElementById('app-shell');
    const authError = document.getElementById('auth-error');

    // Global Pagination State
    let allDbProperties = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 20;
    const logoutBtn = document.getElementById('logout-btn');
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

    // Email Login form elements
    const emailLoginForm = document.getElementById('email-login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const emailSignInBtn = document.getElementById('email-signin-btn');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const eyeIcon = document.getElementById('eye-icon');

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            loginOverlay.style.display = 'none';
            appShell.style.display = 'flex';
            authError.style.display = 'none';
            initDashboard();
        } else {
            loginOverlay.style.display = 'flex';
            appShell.style.display = 'none';
            sessionStorage.clear();
            const addPropNav = document.querySelector('.nav-item[data-target="sec-add-property"]');
            if (addPropNav) addPropNav.click(); // Reset to default tab for next login
        }
    });

    // Password visibility toggle
    if (togglePasswordBtn && eyeIcon && loginPasswordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            if (loginPasswordInput.type === 'password') {
                loginPasswordInput.type = 'text';
                eyeIcon.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                `;
            } else {
                loginPasswordInput.type = 'password';
                eyeIcon.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
        });
    }

    const logoutModal = document.getElementById('logout-modal');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

    const showLogoutModal = () => {
        if (logoutModal) logoutModal.classList.add('active');
    };
    const hideLogoutModal = () => {
        if (logoutModal) logoutModal.classList.remove('active');
    };

    if (logoutBtn) logoutBtn.addEventListener('click', showLogoutModal);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', showLogoutModal);
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', hideLogoutModal);

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            hideLogoutModal();
            firebase.auth().signOut();
        });
    }

    // --- Premium Delete Modal ---
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const deleteTargetInput = document.getElementById('delete-target-id');

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.classList.remove('active');
            deleteTargetInput.value = '';
        });
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            const id = deleteTargetInput.value;
            if (!id) return;
            try {
                confirmDeleteBtn.innerText = 'Deleting...';
                await deleteProperty(id);
                showToast('Property deleted.', 'success');
                deleteModal.classList.remove('active');

                // close edit modal if open
                const editModal = document.getElementById('edit-modal');
                if (editModal && editModal.classList.contains('active')) {
                    editModal.classList.remove('active');
                }

                await handleTabLazyLoad('sec-live-db', true);
            } catch (error) {
                console.error(error);
                showToast('Delete failed.', 'error');
            } finally {
                confirmDeleteBtn.innerText = 'Delete';
            }
        });
    }

    // --- Image Lightbox ---
    const imageLightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeLightboxBtn = document.getElementById('close-lightbox');

    window.openLightbox = (src) => {
        if (!imageLightbox || !lightboxImg) return;
        lightboxImg.classList.remove('loaded');

        lightboxImg.onload = () => {
            lightboxImg.classList.add('loaded');
        };

        lightboxImg.src = src;
        imageLightbox.classList.add('active');
    };

    const closeLightbox = () => {
        if (!imageLightbox || !lightboxImg) return;
        imageLightbox.classList.remove('active');
        setTimeout(() => {
            lightboxImg.src = '';
            lightboxImg.classList.remove('loaded');
        }, 400); // Wait for transition
    };

    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', closeLightbox);
    }
    if (imageLightbox) {
        imageLightbox.addEventListener('click', (e) => {
            if (e.target === imageLightbox) {
                closeLightbox();
            }
        });
    }

    // Email sign in submission
    const authLoader = document.getElementById('auth-loader');
    if (emailLoginForm) {
        emailLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = loginEmailInput.value.trim();
            const password = loginPasswordInput.value;

            emailSignInBtn.disabled = true;
            emailSignInBtn.style.display = 'none';
            if (authLoader) authLoader.classList.add('active');
            authError.style.display = 'none';

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(() => {
                    emailSignInBtn.disabled = false;
                    emailSignInBtn.style.display = '';
                    if (authLoader) authLoader.classList.remove('active');
                    emailLoginForm.reset();
                    fireConfetti();
                })
                .catch((error) => {
                    console.error("Email Auth Error: ", error);
                    authError.innerText = error.message;
                    authError.style.display = 'block';
                    emailSignInBtn.disabled = false;
                    emailSignInBtn.style.display = '';
                    if (authLoader) authLoader.classList.remove('active');
                });
        });
    }

    // --- STATE MANAGEMENT & INIT ---
    async function initDashboard() {
        // Just reset to default tab and fetch global settings (for logo)
        const addPropNav = document.querySelector('.nav-item[data-target="sec-add-property"]');
        if (addPropNav) addPropNav.click();

        try {
            const settings = await fetchGlobalSettings();
            applyGlobalSettings(settings);

            // Fetch separate secure settings for Gemini API
            const secureSettings = await fetchSecureSettings();
            if (secureSettings) {
                // Handle nested ai_config if it exists in the new structure
                const aiData = secureSettings.ai_config ? secureSettings.ai_config : secureSettings;
                sessionStorage.setItem('ai_config', JSON.stringify(aiData));
            }
        } catch (e) {
            console.error('Failed to load branding or AI config', e);
        }
    }

    let syncCooldownTime = 0;
    let syncCooldownInterval = null;
    const syncBtn = document.getElementById('force-sync-btn');

    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            if (syncCooldownTime > 0) return;

            const activeNav = document.querySelector('.nav-item.active');
            if (activeNav) {
                const targetId = activeNav.getAttribute('data-target');
                if (targetId === 'sec-add-property') {
                    showToast("No data to sync on this tab.", "info");
                    return;
                }

                if (targetId) {
                    // Sync the data
                    await handleTabLazyLoad(targetId, true);

                    // Set 30 second cooldown
                    syncCooldownTime = 30;
                    syncBtn.disabled = true;
                    syncBtn.style.opacity = '0.5';
                    syncBtn.style.cursor = 'not-allowed';
                    syncBtn.innerHTML = `Cooldown (${syncCooldownTime}s)`;

                    syncCooldownInterval = setInterval(() => {
                        syncCooldownTime--;
                        if (syncCooldownTime <= 0) {
                            clearInterval(syncCooldownInterval);
                            syncBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Refresh`;
                            syncBtn.disabled = false;
                            syncBtn.style.opacity = '1';
                            syncBtn.style.cursor = 'pointer';
                        } else {
                            syncBtn.innerHTML = `Cooldown (${syncCooldownTime}s)`;
                        }
                    }, 1000);
                }
            }
        });
    }

    function updateSyncTime() {
        const now = new Date();
        document.getElementById('last-sync-time').innerText = `Last synced: ${now.toLocaleTimeString()}`;
    }

    // --- LOGO & BRANDING ---
    function applyGlobalSettings(settings) {
        const logoImg = document.getElementById('brand-logo');
        if (settings.branding && settings.branding.logo_url) {
            // Set error handler dynamically before setting src to handle failures (e.g. if local server is offline)
            logoImg.onerror = () => {
                logoImg.onerror = null;
                logoImg.src = window.PLACEHOLDER_LOGO;
            };
            logoImg.src = settings.branding.logo_url;
        } else {
            logoImg.src = window.PLACEHOLDER_LOGO;
        }
    }

    // --- TAB SWITCHING & LAZY LOADING ---
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', async () => {
            // Ignore if it's a modal trigger
            if (item.id === 'mobile-logout-btn' || item.id === 'logout-btn') return;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            viewSections.forEach(sec => {
                sec.classList.remove('active');
            });

            const targetId = item.getAttribute('data-target');
            if (targetId) {
                document.getElementById(targetId).classList.add('active');
                await handleTabLazyLoad(targetId);
            }
        });
    });

    // --- Skeleton Generators ---
    function showCardSkeletons() {
        const grid = document.getElementById('properties-grid');
        grid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            grid.innerHTML += `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text short"></div><div class="skeleton-text"></div><div class="skeleton-text tiny"></div></div>`;
        }
    }

    function showLeadSkeletons() {
        const tbody = document.getElementById('leads-tbody');
        tbody.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            tbody.innerHTML += `<tr class="skeleton-row"><td><div class="skeleton-bar w60"></div></td><td><div class="skeleton-bar w40"></div></td><td><div class="skeleton-bar w80"></div></td><td><div class="skeleton-bar w30"></div></td><td><div class="skeleton-bar w40"></div></td></tr>`;
        }
    }

    // --- Stats Panel ---
    function updateStatsPanel(properties) {
        const entries = Object.values(properties || {});
        const total = entries.length;
        const active = entries.filter(p => p.status === 'active').length;
        const sold = entries.filter(p => p.status === 'sold').length;

        animateCounter('stat-total', total);
        animateCounter('stat-active', active);
        animateCounter('stat-sold', sold);

        // Leads count from sessionStorage if available
        const leadsRaw = sessionStorage.getItem('leadsData');
        if (leadsRaw) {
            const leadsCount = Object.keys(JSON.parse(leadsRaw)).length;
            animateCounter('stat-leads', leadsCount);
        }
    }

    function animateCounter(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (target === 0) { el.textContent = '0'; return; }
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 30));
        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = current;
        }, 25);
    }

    async function handleTabLazyLoad(targetId, force = false) {
        try {
            if (targetId === 'sec-live-db') {
                let data = sessionStorage.getItem('propertiesData');
                if (force || !data) {
                    showCardSkeletons();
                    showToast("Syncing Database...", "success");
                    const properties = await fetchProperties();
                    sessionStorage.setItem('propertiesData', JSON.stringify(properties));
                    renderProperties(properties);
                    updateStatsPanel(properties);
                    updateSyncTime();
                } else {
                    const parsed = JSON.parse(data);
                    renderProperties(parsed);
                    updateStatsPanel(parsed);
                }
            } else if (targetId === 'sec-leads') {
                let data = sessionStorage.getItem('leadsData');
                if (force || !data) {
                    showLeadSkeletons();
                    showToast("Syncing Leads...", "success");
                    const leads = await fetchLeads();
                    sessionStorage.setItem('leadsData', JSON.stringify(leads));
                    renderLeads(leads);
                    updateSyncTime();
                    // Also update leads stat if stats panel visible
                    animateCounter('stat-leads', Object.keys(leads).length);
                } else {
                    renderLeads(JSON.parse(data));
                }
            } else if (targetId === 'sec-global-settings') {
                let data = sessionStorage.getItem('settingsData');
                if (force || !data) {
                    showToast("Syncing Settings...", "success");
                    const settings = await fetchGlobalSettings();
                    sessionStorage.setItem('settingsData', JSON.stringify(settings));
                    populateSettingsForm(settings);
                    applyGlobalSettings(settings);
                    updateSyncTime();
                } else {
                    const settings = JSON.parse(data);
                    populateSettingsForm(settings);
                    applyGlobalSettings(settings);
                }
            }
        } catch (error) {
            console.error('Lazy Load Error:', error);
            showToast('Failed to load tab data.', 'error');
        }
    }

    // --- DYNAMIC FIELD RENDERING ---
    const UNIT_OPTIONS = `
        <option value="sq ft">Sq Ft</option>
        <option value="sq yd">Sq Yd</option>
        <option value="acre">Acre</option>
        <option value="hectare">Hectare</option>
        <option value="bigha">Bigha</option>
        <option value="sq m">Sq M</option>
    `;
    const PRICE_UNIT_OPTIONS = `
        <option value="Total">Total</option>
        <option value="per sq ft">Per Sq Ft</option>
        <option value="per sq yd">Per Sq Yd</option>
        <option value="per acre">Per Acre</option>
        <option value="per hectare">Per Hectare</option>
        <option value="per bigha">Per Bigha</option>
        <option value="per sq m">Per Sq M</option>
    `;

    const SUB_CATEGORIES = {
        Residential: ['Villa', 'Apartment', 'House', 'Farmhouse'],
        Commercial: ['Shop', 'Office', 'Showroom', 'Hotel'],
        Industrial: ['Factory', 'Warehouse', 'Shed'],
        Land: ['Agricultural', 'Residential Plot', 'Commercial Plot']
    };

    function renderDynamicFields(category, prefix, existingData = {}) {
        const container = document.getElementById(prefix === 'prop' ? 'dynamic-fields' : 'edit-dynamic-fields');
        const subCats = SUB_CATEGORIES[category] || [];
        const spec = existingData.spec || {};
        const price = existingData.price || {};
        const priceMode = price.mode || 'call_to_know';

        let html = '';

        // Sub-category (optional for all)
        html += `<div class="form-grid">
            <div class="form-group">
                <label>Sub Category <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <select id="${prefix}-sub-category" class="saas-select">
                    <option value="">— None —</option>
                    ${subCats.map(s => `<option value="${s}" ${existingData.sub_category === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    Title
                    <button type="button" id="${prefix}-ai-assist-btn" class="ai-assist-btn" title="AI Description Generator">
                        <svg class="ai-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle;">
                            <path d="M12 2L14.85 8.15L21 11L14.85 13.85L12 20L9.15 13.85L3 11L9.15 8.15L12 2Z"/>
                            <path d="M19 15L20.25 17.75L23 19L20.25 20.25L19 23L17.75 20.25L15 19L17.75 17.75L19 15Z" opacity="0.8"/>
                            <path d="M6 4L7 6.25L9.25 7.25L7 8.25L6 10.5L5 8.25L2.75 7.25L5 6.25L6 4Z" opacity="0.6"/>
                        </svg>
                        <span>AI Assist</span>
                    </button>
                </label>
                <input type="text" id="${prefix}-title" class="saas-input" placeholder="Property title" value="${existingData.title || ''}" required>
            </div>
        </div>`;

        // Description (optional for all categories)
        html += `<div class="form-grid full">
            <div class="form-group">
                <label>Description <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <textarea id="${prefix}-description" class="saas-input" placeholder="Property description..." rows="3">${existingData.description || ''}</textarea>
            </div>
        </div>`;

        // Price Mode
        html += `<div class="form-grid">
            <div class="form-group">
                <label>Price</label>
                <select id="${prefix}-price-mode" class="saas-select" onchange="document.getElementById('${prefix}-price-amount-group').style.display = this.value === 'amount' ? 'flex' : 'none';">
                    <option value="call_to_know" ${priceMode === 'call_to_know' ? 'selected' : ''}>Call to Know</option>
                    <option value="amount" ${priceMode === 'amount' ? 'selected' : ''}>Amount</option>
                </select>
            </div>
            <div class="form-group" id="${prefix}-price-amount-group" style="display: ${priceMode === 'amount' ? 'flex' : 'none'};">
                <label>Amount</label>
                <div class="input-with-unit">
                    <input type="number" id="${prefix}-price-value" class="saas-input" min="0" value="${price.value || ''}" placeholder="e.g. 10000">
                    <select id="${prefix}-price-unit" class="saas-select">${PRICE_UNIT_OPTIONS.replace(`value="${price.unit || 'Total'}"`, `value="${price.unit || 'Total'}" selected`)}</select>
                </div>
            </div>
        </div>`;

        // Area (all categories)
        html += `<div class="form-grid">
            <div class="form-group">
                <label>Area <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <div class="input-with-unit">
                    <input type="number" id="${prefix}-area" class="saas-input" min="0" value="${spec.area?.value || ''}" placeholder="e.g. 1000">
                    <select id="${prefix}-area-unit" class="saas-select">${UNIT_OPTIONS.replace(`value="${spec.area?.unit || 'sq ft'}"`, `value="${spec.area?.unit || 'sq ft'}" selected`)}</select>
                </div>
            </div>`;

        // Category-specific fields
        if (category === 'Residential') {
            html += `
            <div class="form-group">
                <label>Bedrooms <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <input type="number" id="${prefix}-bedrooms" class="saas-input" min="0" value="${spec.bedrooms || ''}">
            </div>
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label>Bathrooms <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <input type="number" id="${prefix}-bathrooms" class="saas-input" min="0" value="${spec.bathrooms || ''}">
            </div>
            <div class="form-group">
                <label>Parking <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <select id="${prefix}-parking" class="saas-select">
                    <option value="">— Select —</option>
                    <option value="yes" ${spec.parking === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${spec.parking === 'no' ? 'selected' : ''}>No</option>
                </select>
            </div>
        </div>`;
        } else if (category === 'Commercial') {
            html += `
            <div class="form-group">
                <label>Floor Number <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <input type="number" id="${prefix}-floor" class="saas-input" min="0" value="${spec.floor || ''}">
            </div>
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label>Parking <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <select id="${prefix}-parking" class="saas-select">
                    <option value="">— Select —</option>
                    <option value="yes" ${spec.parking === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${spec.parking === 'no' ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div class="form-group">
                <label>Washroom <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <select id="${prefix}-washroom" class="saas-select">
                    <option value="">— Select —</option>
                    <option value="yes" ${spec.washroom === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${spec.washroom === 'no' ? 'selected' : ''}>No</option>
                </select>
            </div>
        </div>`;
        } else if (category === 'Industrial') {
            html += `</div>`;
        } else if (category === 'Land') {
            html += `
            <div class="form-group">
                <label>Road Access <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <select id="${prefix}-road-access" class="saas-select">
                    <option value="">— Select —</option>
                    <option value="yes" ${spec.road_access === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${spec.road_access === 'no' ? 'selected' : ''}>No</option>
                </select>
            </div>
        </div>`;
        }

        // Location (optional, all categories)
        html += `<div class="form-grid full">
            <div class="form-group">
                <label>Location <span style="color:var(--ink-faint);font-size:0.75rem;">(optional)</span></label>
                <input type="text" id="${prefix}-location" class="saas-input" placeholder="e.g. Mumbai, Maharashtra" value="${existingData.location || ''}">
            </div>
        </div>`;

        container.innerHTML = html;
        if (typeof setupAIAssist === 'function') setupAIAssist(prefix);
    }

    function collectDynamicData(prefix) {
        const category = document.getElementById(`${prefix}-category`).value;
        const priceMode = document.getElementById(`${prefix}-price-mode`).value;

        const data = {
            title: document.getElementById(`${prefix}-title`)?.value?.trim() || '',
            category: category,
            sub_category: document.getElementById(`${prefix}-sub-category`)?.value || '',
            status: document.getElementById(`${prefix}-status`).value,
            featured: document.getElementById(`${prefix}-featured`).checked,
            location: document.getElementById(`${prefix}-location`)?.value?.trim() || '',
            price: { mode: priceMode },
            spec: {}
        };

        // Description (optional for all)
        data.description = document.getElementById(`${prefix}-description`)?.value?.trim() || '';

        // Price
        if (priceMode === 'amount') {
            data.price.value = parseFloat(document.getElementById(`${prefix}-price-value`)?.value) || 0;
            data.price.unit = document.getElementById(`${prefix}-price-unit`)?.value || 'Total';
        }

        // Area
        const areaVal = parseFloat(document.getElementById(`${prefix}-area`)?.value) || 0;
        const areaUnit = document.getElementById(`${prefix}-area-unit`)?.value || 'sq ft';
        if (areaVal > 0) data.spec.area = { value: areaVal, unit: areaUnit };

        // Category-specific specs
        if (category === 'Residential') {
            const bed = parseInt(document.getElementById(`${prefix}-bedrooms`)?.value) || 0;
            const bath = parseInt(document.getElementById(`${prefix}-bathrooms`)?.value) || 0;
            const parking = document.getElementById(`${prefix}-parking`)?.value || '';
            if (bed > 0) data.spec.bedrooms = bed;
            if (bath > 0) data.spec.bathrooms = bath;
            if (parking) data.spec.parking = parking;
        } else if (category === 'Commercial') {
            const floor = parseInt(document.getElementById(`${prefix}-floor`)?.value) || 0;
            const parking = document.getElementById(`${prefix}-parking`)?.value || '';
            const washroom = document.getElementById(`${prefix}-washroom`)?.value || '';
            if (floor > 0) data.spec.floor = floor;
            if (parking) data.spec.parking = parking;
            if (washroom) data.spec.washroom = washroom;
        } else if (category === 'Land') {
            const roadAccess = document.getElementById(`${prefix}-road-access`)?.value || '';
            if (roadAccess) data.spec.road_access = roadAccess;
        }

        // Clean up: remove empty strings and empty objects before saving
        for (const key of Object.keys(data)) {
            if (data[key] === '') delete data[key];
            if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key]) && Object.keys(data[key]).length === 0) delete data[key];
        }

        return data;
    }

    // --- ADD PROPERTY ---
    const propertyForm = document.getElementById('property-form');
    const imageInput = document.getElementById('images');
    const previewContainer = document.getElementById('image-preview-container');
    const uploadTrigger = document.getElementById('upload-zone-trigger');
    const categorySelect = document.getElementById('prop-category');
    const imageRequiredWarning = document.getElementById('image-required-warning');

    // Render initial dynamic fields
    renderDynamicFields('Residential', 'prop');

    categorySelect.addEventListener('change', (e) => {
        renderDynamicFields(e.target.value, 'prop');
    });

    uploadTrigger.addEventListener('click', (e) => {
        if (e.target !== imageInput && e.target.tagName !== 'IMG') {
            imageInput.click();
        }
    });

    imageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).slice(0, 5);
        previewContainer.innerHTML = '';

        // Hide warning instantly if at least one image is selected
        if (files.length > 0 && imageRequiredWarning) {
            imageRequiredWarning.style.display = 'none';
        }

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-img';
                img.addEventListener('click', (ev) => {
                    ev.stopPropagation(); // prevent triggering file input
                    if (window.openLightbox) window.openLightbox(img.src);
                });
                previewContainer.appendChild(img);
            }
            reader.readAsDataURL(file);
        });
    });

    propertyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        const rawFiles = imageInput.files;

        if (rawFiles.length === 0) {
            if (imageRequiredWarning) {
                imageRequiredWarning.style.display = 'flex';
            }
            showToast('Please select at least 1 image.', 'error');
            return;
        }

        // Title validation
        const titleInput = document.getElementById('prop-title');
        if (!titleInput || !titleInput.value.trim()) {
            showToast('Please enter a property title.', 'error');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerText = "Compressing Images...";
            const warningText = document.getElementById('upload-warning-text');
            if (warningText) warningText.style.display = 'block';

            // 1. Client-Side Compression
            const filesToProcess = Array.from(rawFiles).slice(0, 5);
            const compressionPromises = filesToProcess.map(file => compressImage(file));
            const compressedBlobs = await Promise.all(compressionPromises);

            submitBtn.innerText = "Uploading... 0%";

            // 2. Upload via XMLHttpRequest with live progress
            const uploadedImageUrls = await uploadImages(compressedBlobs, (percentage) => {
                submitBtn.innerText = `Uploading... ${percentage}%`;
            });

            // Map simple strings to objects as per schema
            const finalImages = uploadedImageUrls.map(url => ({
                url: url,
                public_id: 'auto_gen'
            }));

            submitBtn.innerText = "Saving Data...";

            const newProp = collectDynamicData('prop');
            newProp.images = finalImages;
            newProp.created_at = new Date().toLocaleDateString('en-IN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                timeZone: 'Asia/Kolkata'
            }).replace(/\//g, '-');

            await saveProperty(newProp);
            showToast('Property published successfully!', 'success');

            // Confetti celebration
            fireConfetti();

            propertyForm.reset();
            previewContainer.innerHTML = '';
            if (imageRequiredWarning) {
                imageRequiredWarning.style.display = 'none';
            }
            renderDynamicFields('Residential', 'prop');

        } catch (error) {
            console.error(error);
            showToast('Error publishing property.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Publish Property";
            const warningText = document.getElementById('upload-warning-text');
            if (warningText) warningText.style.display = 'none';
        }
    });

    // --- LIVE DB & EDITING ---
    function renderProperties(propertiesObj) {
        allDbProperties = Object.entries(propertiesObj).map(([id, data]) => ({ id, ...data }));

        // Sort by date asc (oldest first)
        allDbProperties.sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            const dA = a.created_at.split('-');
            const dB = b.created_at.split('-');
            return new Date(`${dA[2]}-${dA[1]}-${dA[0]}`) - new Date(`${dB[2]}-${dB[1]}-${dB[0]}`);
        });

        currentPage = 1;
        renderPaginatedGrid();
    }

    function renderPaginatedGrid() {
        const grid = document.getElementById('properties-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginated = allDbProperties.slice(startIndex, endIndex);

        if (paginated.length === 0) {
            grid.innerHTML = '<p style="color:var(--ink-faint)">No properties found.</p>';
            renderPaginationControls(allDbProperties.length);
            return;
        }

        paginated.forEach(prop => {
            const card = document.createElement('div');
            card.className = 'property-card';

            const badgeClass = prop.status === 'active' ? 'status-active' : (prop.status === 'hidden' ? 'status-hidden' : 'status-sold');
            const badgeText = prop.status || 'Unknown';

            // strict Image Logic: Use images[0] and inject transform
            let thumbnailUrl = window.PLACEHOLDER_IMAGE;
            let fullImgUrl = window.PLACEHOLDER_IMAGE;
            if (prop.images && prop.images.length > 0) {
                let imgObj = prop.images[0];
                let rawUrl = typeof imgObj === 'string' ? imgObj : imgObj.url;
                if (rawUrl) {
                    // Check if it's a broken demo URL or mock local relative webp to avoid console 404s
                    const isBrokenDemo = rawUrl.includes('res.cloudinary.com/demo/');
                    const isLocalMock = rawUrl.endsWith('.webp') && !rawUrl.startsWith('http') && !rawUrl.startsWith('data:');

                    if (isBrokenDemo || isLocalMock) {
                        thumbnailUrl = window.PLACEHOLDER_IMAGE;
                        fullImgUrl = window.PLACEHOLDER_IMAGE;
                    } else if (rawUrl.includes('/upload/')) {
                        // EXTREME COMPRESSION for card view (30-50kb max limit)
                        thumbnailUrl = rawUrl.replace('/upload/', '/upload/c_scale,w_400,q_auto:low,f_auto/');
                        fullImgUrl = rawUrl; // Full resolution for lightbox
                    } else {
                        thumbnailUrl = rawUrl;
                        fullImgUrl = rawUrl;
                    }
                }
            }

            // Area display
            let areaHtml = '';
            if (prop.spec?.area) {
                areaHtml = `<span style="font-size:0.85rem; color:var(--ink-soft); font-weight: 500;">📐 ${prop.spec.area.value} ${prop.spec.area.unit}</span>`;
            }

            let catString = prop.category;
            if (prop.sub_category) catString += ` — ${prop.sub_category}`;

            card.innerHTML = `
                <div class="img-wrapper" style="--card-bg-image: url('${thumbnailUrl}')">
                    <img src="${thumbnailUrl}" loading="lazy" class="card-main-img" onerror="this.onerror=null; this.src=window.PLACEHOLDER_IMAGE;">
                </div>
                <div class="card-action-stripe">
                    <div class="stripe-left">
                        <span class="status-dot dot-${prop.status}" title="${badgeText}"></span>
                    </div>
                    <div class="stripe-right">
                        <button class="card-action-btn eye-card-btn" title="View Full Image">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button class="card-action-btn edit-card-btn" data-id="${prop.id}" title="Edit Property">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="card-action-btn delete-card-btn" data-id="${prop.id}" title="Delete Property">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <div class="card-content-top">
                        <span class="cat-tag">${catString}</span>
                        <h3>${prop.title || 'Untitled'}</h3>
                    </div>
                    <div class="prop-specs" style="border:none; margin-bottom:0; padding-bottom:0;">
                        ${areaHtml}
                        ${prop.location ? `<span style="font-size:0.85rem; color:var(--ink-soft); font-weight: 500;">📍 ${prop.location}</span>` : ''}
                    </div>
                </div>
            `;

            // Wire up the edit button
            const editBtn = card.querySelector('.edit-card-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card click
                openEditModal(prop.id, prop);
            });

            // Wire up the delete button
            const deleteBtn = card.querySelector('.delete-card-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card click
                const targetId = deleteBtn.getAttribute('data-id');
                const delModal = document.getElementById('delete-modal');
                document.getElementById('delete-target-id').value = targetId;
                if (delModal) delModal.classList.add('active');
            });

            // Wire up image wrapper and eye button click for lightbox
            const imgWrapper = card.querySelector('.img-wrapper');
            const eyeBtn = card.querySelector('.eye-card-btn');

            const openImage = (e) => {
                e.stopPropagation();
                if (window.openLightbox) window.openLightbox(fullImgUrl);
            };

            imgWrapper.addEventListener('click', openImage);
            eyeBtn.addEventListener('click', openImage);

            // Card click to view details (Edit Modal)
            card.addEventListener('click', () => {
                openEditModal(prop.id, prop);
            });

            grid.appendChild(card);
        });

        renderPaginationControls(allDbProperties.length);
    }

    function renderPaginationControls(totalItems) {
        const container = document.getElementById('pagination-controls');
        if (!container) return;
        container.innerHTML = '';

        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;

        // Previous Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '&laquo;';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPaginatedGrid();
                document.getElementById('sec-live-db').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        container.appendChild(prevBtn);

        // Page Numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                const btn = document.createElement('button');
                btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
                btn.innerText = i;
                btn.addEventListener('click', () => {
                    currentPage = i;
                    renderPaginatedGrid();
                    document.getElementById('sec-live-db').scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                container.appendChild(btn);
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                const dots = document.createElement('span');
                dots.className = 'page-dots';
                dots.innerText = '...';
                container.appendChild(dots);
            }
        }

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '&raquo;';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderPaginatedGrid();
                document.getElementById('sec-live-db').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        container.appendChild(nextBtn);
    }

    // Modal Logic
    const modal = document.getElementById('edit-modal');
    const closeBtn = document.getElementById('close-modal');
    const editCategorySelect = document.getElementById('edit-category');

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    editCategorySelect.addEventListener('change', (e) => {
        // Re-render dynamic fields but keep just the category change, no existing data
        renderDynamicFields(e.target.value, 'edit');
    });

    function openEditModal(id, data) {
        document.getElementById('edit-id').value = id;
        document.getElementById('edit-category').value = data.category || 'Residential';
        document.getElementById('edit-status').value = data.status || 'active';
        document.getElementById('edit-featured').checked = data.featured || false;

        // Render dynamic fields with existing data
        renderDynamicFields(data.category || 'Residential', 'edit', data);

        // Render images
        const editImageContainer = document.getElementById('edit-image-preview-container');
        editImageContainer.innerHTML = '';
        if (data.images && data.images.length > 0) {
            data.images.forEach(imgObj => {
                let src = typeof imgObj === 'string' ? imgObj : imgObj.url;
                if (!src) return;

                const isBrokenDemo = src.includes('res.cloudinary.com/demo/');
                const isLocalMock = src.endsWith('.webp') && !src.startsWith('http') && !src.startsWith('data:');

                let previewSrc = src;
                let fullSrc = src;

                if (isBrokenDemo || isLocalMock) {
                    previewSrc = window.PLACEHOLDER_IMAGE;
                    fullSrc = window.PLACEHOLDER_IMAGE;
                } else if (src.includes('/upload/')) {
                    // EXTREME COMPRESSION for edit menu thumbnails (30-50kb max limit)
                    previewSrc = src.replace('/upload/', '/upload/c_scale,w_200,q_auto:low,f_auto/');
                    fullSrc = src; // Full resolution for lightbox
                }

                const img = document.createElement('img');
                img.src = previewSrc;
                img.className = 'preview-img';
                img.onerror = () => {
                    img.onerror = null;
                    img.src = window.PLACEHOLDER_IMAGE;
                };
                img.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (window.openLightbox) window.openLightbox(fullSrc);
                });
                editImageContainer.appendChild(img);
            });
        } else {
            editImageContainer.innerHTML = '<p style="color:var(--ink-faint); font-size:0.85rem; width:100%; text-align:center;">No images found for this property.</p>';
        }

        modal.classList.add('active');
    }

    document.getElementById('edit-property-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const btn = document.getElementById('save-edit-btn');

        const cachedData = JSON.parse(sessionStorage.getItem('propertiesData') || '{}');
        const existingImages = cachedData[id]?.images || [];

        const updatedData = collectDynamicData('edit');
        updatedData.images = existingImages;

        try {
            btn.innerText = 'Saving...';
            await updateProperty(id, updatedData);
            showToast('Property updated.', 'success');

            // Confetti celebration
            fireConfetti();

            modal.classList.remove('active');
            await handleTabLazyLoad('sec-live-db', true);
        } catch (error) {
            console.error(error);
            showToast('Update failed.', 'error');
        } finally {
            btn.innerText = 'Save Changes';
        }
    });

    document.getElementById('delete-prop-btn').addEventListener('click', () => {
        const id = document.getElementById('edit-id').value;
        const delModal = document.getElementById('delete-modal');
        document.getElementById('delete-target-id').value = id;
        if (delModal) delModal.classList.add('active');
    });

    // --- LIVE DB SEARCH & FILTER ---
    const dbSearchInput = document.getElementById('db-search');
    const filterToggleBtn = document.getElementById('filter-toggle-btn');
    const filterPanel = document.getElementById('filter-panel');
    const searchSuggestions = document.getElementById('search-suggestions');

    // Typewriter
    const searchPlaceholderWords = ['Residential', 'Jaipur', 'Shastri Nagar'];
    let placeholderWordIdx = 0;
    let placeholderCharIdx = 0;
    let isDeleting = false;
    let typeSpeed = 100;

    function typeEffect() {
        if (!dbSearchInput) return;
        const currentWord = searchPlaceholderWords[placeholderWordIdx];
        if (isDeleting) {
            dbSearchInput.placeholder = currentWord.substring(0, placeholderCharIdx - 1);
            placeholderCharIdx--;
            typeSpeed = 50;
        } else {
            dbSearchInput.placeholder = currentWord.substring(0, placeholderCharIdx + 1);
            placeholderCharIdx++;
            typeSpeed = 150;
        }

        dbSearchInput.classList.add('typewriter-placeholder');

        if (!isDeleting && placeholderCharIdx === currentWord.length) {
            typeSpeed = 1500;
            isDeleting = true;
        } else if (isDeleting && placeholderCharIdx === 0) {
            isDeleting = false;
            placeholderWordIdx = (placeholderWordIdx + 1) % searchPlaceholderWords.length;
            typeSpeed = 500;
        }

        setTimeout(typeEffect, typeSpeed);
    }
    if (dbSearchInput) setTimeout(typeEffect, 1000);

    // Hardcoded Suggestions
    const SEARCH_SUGGESTIONS = [
        'Residential', 'Commercial', 'Industrial', 'Land',
        'Villa', 'Apartment', 'House', 'Farmhouse',
        'Shop', 'Office', 'Showroom', 'Hotel',
        'Factory', 'Warehouse', 'Shed',
        'Agricultural', 'Residential Plot', 'Commercial Plot',
        'Jaipur', 'Shastri Nagar', 'Vaishali Nagar', 'Malviya Nagar', 'Mansarovar'
    ];

    if (dbSearchInput) {
        dbSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toLowerCase();
            searchSuggestions.innerHTML = '';
            if (val.length < 1) {
                searchSuggestions.classList.remove('active');
                applyFiltersAndSearch();
                return;
            }

            const matches = SEARCH_SUGGESTIONS.filter(item => item.toLowerCase().includes(val)).slice(0, 5);
            if (matches.length > 0) {
                matches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';

                    const lowerMatch = match.toLowerCase();
                    if (['residential', 'commercial', 'industrial', 'land'].includes(lowerMatch)) {
                        div.innerHTML = `<span class="suggestion-category">Category</span>${match}`;
                    } else if (['jaipur', 'shastri nagar', 'vaishali nagar', 'malviya nagar', 'mansarovar'].includes(lowerMatch)) {
                        div.innerHTML = `<span class="suggestion-category">Location</span>${match}`;
                    } else {
                        div.innerHTML = `<span class="suggestion-category">Sub-Category</span>${match}`;
                    }

                    div.addEventListener('click', () => {
                        dbSearchInput.value = match;
                        searchSuggestions.classList.remove('active');
                        applyFiltersAndSearch();
                    });
                    searchSuggestions.appendChild(div);
                });
                searchSuggestions.classList.add('active');
            } else {
                searchSuggestions.classList.remove('active');
            }

            applyFiltersAndSearch();
        });
    }

    document.addEventListener('click', (e) => {
        if (dbSearchInput && searchSuggestions) {
            if (e.target !== dbSearchInput && e.target !== searchSuggestions && !searchSuggestions.contains(e.target)) {
                searchSuggestions.classList.remove('active');
            }
        }
    });

    // Filters
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    const filterCat = document.getElementById('filter-category');
    const filterSubCat = document.getElementById('filter-sub-category');
    const filterStatus = document.getElementById('filter-status');
    const filterDateFrom = document.getElementById('filter-date-from');
    const filterDateTo = document.getElementById('filter-date-to');

    // Reuse shared SUB_CATEGORIES constant (defined in Dynamic Fields section)

    if (filterCat) {
        filterCat.addEventListener('change', (e) => {
            const cat = e.target.value;
            filterSubCat.innerHTML = '<option value="">Any</option>';
            if (!cat) return;
            const subcats = SUB_CATEGORIES[cat] || [];
            subcats.forEach(sc => {
                filterSubCat.innerHTML += `<option value="${sc}">${sc}</option>`;
            });
        });
    }

    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', () => {
            filterPanel.classList.toggle('active');
            filterToggleBtn.classList.toggle('active');
        });
    }

    function applyFiltersAndSearch() {
        const query = dbSearchInput.value.toLowerCase().trim();
        const cat = filterCat.value;
        const subCat = filterSubCat.value;
        const status = filterStatus.value;
        const dFrom = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
        const dTo = filterDateTo.value ? new Date(filterDateTo.value) : null;

        const rawData = sessionStorage.getItem('propertiesData');
        if (!rawData) return;
        const properties = JSON.parse(rawData);

        const filtered = {};
        for (const [id, prop] of Object.entries(properties)) {
            // Search Query
            if (query) {
                const searchStr = `${prop.title} ${prop.category} ${prop.sub_category} ${prop.status} ${prop.location}`.toLowerCase();
                if (!searchStr.includes(query)) continue;
            }

            // Filters
            if (cat && prop.category !== cat) continue;
            if (subCat && prop.sub_category !== subCat) continue;
            if (status && prop.status !== status) continue;

            // Date Filter (created_at format: DD-MM-YYYY)
            if (dFrom || dTo) {
                if (!prop.created_at) continue;
                const parts = prop.created_at.split('-');
                if (parts.length === 3) {
                    const pDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
                    if (dFrom && pDate < dFrom) continue;
                    if (dTo && pDate > dTo) continue;
                } else {
                    continue;
                }
            }

            filtered[id] = prop;
        }

        renderProperties(filtered);
    }

    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFiltersAndSearch);
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            filterCat.value = '';
            filterSubCat.innerHTML = '<option value="">Any</option>';
            filterStatus.value = '';
            filterDateFrom.value = '';
            filterDateTo.value = '';
            dbSearchInput.value = '';
            applyFiltersAndSearch();
        });
    }

    // --- LEADS ---
    function renderLeads(leadsObj) {
        const tbody = document.getElementById('leads-tbody');
        tbody.innerHTML = '';

        const leads = Object.entries(leadsObj).map(([id, data]) => ({ id, ...data }));
        leads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No leads found.</td></tr>';
            return;
        }

        leads.forEach(lead => {
            const tr = document.createElement('tr');
            const dateStr = new Date(lead.timestamp).toLocaleDateString();

            tr.innerHTML = `
                <td><strong>${lead.client_name}</strong></td>
                <td><a href="tel:${lead.client_phone}" style="color:var(--ink); font-weight:600; text-decoration:none;">${lead.client_phone}</a></td>
                <td style="color:var(--ink-faint);">${dateStr}</td>
                <td>
                    <select class="lead-status-select" data-id="${lead.id}">
                        <option value="new" ${lead.lead_status === 'new' ? 'selected' : ''}>New</option>
                        <option value="contacted" ${lead.lead_status === 'contacted' ? 'selected' : ''}>Contacted</option>
                        <option value="deal_closed" ${lead.lead_status === 'deal_closed' ? 'selected' : ''}>Deal Closed</option>
                        <option value="junk" ${lead.lead_status === 'junk' ? 'selected' : ''}>Junk</option>
                    </select>
                </td>
                <td>
                    <button class="btn-delete-lead" data-id="${lead.id}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Delete Lead">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.lead-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const newStatus = e.target.value;
                try {
                    await updateLeadStatus(id, newStatus);
                    showToast('Lead status updated.', 'success');
                    const cached = JSON.parse(sessionStorage.getItem('dashboardData'));
                    cached.leads[id].lead_status = newStatus;
                    sessionStorage.setItem('dashboardData', JSON.stringify(cached));
                } catch (error) {
                    console.error(error);
                    showToast('Failed to update lead.', 'error');
                }
            });
        });

        document.querySelectorAll('.btn-delete-lead').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm("Are you sure you want to delete this lead?")) {
                    try {
                        await deleteLead(id);
                        showToast('Lead deleted.', 'success');

                        const data = sessionStorage.getItem('leadsData');
                        if (data) {
                            const leadsObj = JSON.parse(data);
                            delete leadsObj[id];
                            sessionStorage.setItem('leadsData', JSON.stringify(leadsObj));

                            const statsCached = JSON.parse(sessionStorage.getItem('dashboardData'));
                            if (statsCached && statsCached.leads && statsCached.leads[id]) {
                                delete statsCached.leads[id];
                                sessionStorage.setItem('dashboardData', JSON.stringify(statsCached));
                            }

                            animateCounter('stat-leads', Object.keys(leadsObj).length);
                            renderLeads(leadsObj);
                        }
                    } catch (error) {
                        console.error(error);
                        showToast('Failed to delete lead.', 'error');
                    }
                }
            });
        });
    }

    // --- GLOBAL SETTINGS ---
    function updateSettingsPreview(inputId, imgId) {
        const input = document.getElementById(inputId);
        const img = document.getElementById(imgId);
        if (!input || !img) return;

        let src = input.value.trim();
        if (src) {
            img.src = src;
            img.style.display = 'block';
            img.onerror = () => { img.src = window.PLACEHOLDER_IMAGE; };
        } else {
            img.style.display = 'none';
        }
    }

    // Attach real-time input listeners
    document.getElementById('set-logo').addEventListener('input', () => updateSettingsPreview('set-logo', 'logo-preview'));
    document.getElementById('set-hero').addEventListener('input', () => updateSettingsPreview('set-hero', 'hero-preview'));

    function populateSettingsForm(settings) {
        document.getElementById('set-maintenance').checked = settings.maintenance_mode || false;

        if (settings.branding) {
            document.getElementById('set-logo').value = settings.branding.logo_url || '';
        }
        if (settings.hero_banner) {
            document.getElementById('set-hero').value = settings.hero_banner.images_links || '';
        }
        if (settings.contact_info) {
            document.getElementById('set-whatsapp').value = settings.contact_info.whatsapp_number || '';
            document.getElementById('set-email').value = settings.contact_info.support_email || '';
            document.getElementById('set-address').value = settings.contact_info.office_address || '';
        }
        if (settings.social_links) {
            document.getElementById('set-instagram').value = settings.social_links.instagram || '';
            document.getElementById('set-facebook').value = settings.social_links.facebook || '';
            document.getElementById('set-youtube').value = settings.social_links.youtube || '';
        }

        // Init previews
        updateSettingsPreview('set-logo', 'logo-preview');
        updateSettingsPreview('set-hero', 'hero-preview');
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-settings-btn');

        const newSettings = {
            maintenance_mode: document.getElementById('set-maintenance').checked,
            branding: {
                logo_url: document.getElementById('set-logo').value.trim()
            },
            hero_banner: {
                images_links: document.getElementById('set-hero').value.trim()
            },
            contact_info: {
                whatsapp_number: document.getElementById('set-whatsapp').value.trim(),
                support_email: document.getElementById('set-email').value.trim(),
                office_address: document.getElementById('set-address').value.trim()
            },
            social_links: {
                instagram: document.getElementById('set-instagram').value.trim(),
                facebook: document.getElementById('set-facebook').value.trim(),
                youtube: document.getElementById('set-youtube').value.trim()
            }
        };

        try {
            btn.innerText = 'Deploying...';
            await updateGlobalSettings(newSettings);
            showToast('Settings deployed successfully!', 'success');
            applyGlobalSettings(newSettings);

            // Correctly update settingsData cache instead of the old dashboardData
            sessionStorage.setItem('settingsData', JSON.stringify(newSettings));

        } catch (error) {
            console.error(error);
            showToast('Failed to deploy settings.', 'error');
        } finally {
            btn.innerText = 'Deploy Settings';
        }
    });
});

// Toast System
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Minimalist monochrome icon check
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.3s forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Network Offline/Online Detection ---
const offlineBar = document.getElementById('offline-bar');

window.addEventListener('offline', () => {
    if (offlineBar) {
        offlineBar.style.display = 'flex';
        // Trigger reflow before adding active class for animation
        offlineBar.offsetHeight;
        offlineBar.classList.add('active');
    }
});

window.addEventListener('online', () => {
    if (offlineBar) {
        offlineBar.classList.remove('active');
        setTimeout(() => { offlineBar.style.display = 'none'; }, 400);
    }
    showToast('Back online! Connection restored.', 'success');
});

// ============================================================================
// SMART AI SYSTEM INTEGRATION
// ============================================================================

function checkAILimits() {
    const configStr = sessionStorage.getItem('ai_config');
    if (!configStr) {
        showToast("AI Configuration missing. Please check global settings.", "error");
        return null;
    }

    let config;
    try {
        config = JSON.parse(configStr);
    } catch (e) {
        return null;
    }

    if (!config.gemini_api_key || !config.model_name) {
        showToast("AI is not fully configured.", "error");
        return null;
    }

    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    let usageStr = localStorage.getItem('ai_usage');
    let usage = usageStr ? JSON.parse(usageStr) : { date: today, daily_count: 0, minute_calls: [] };

    if (usage.date !== today) {
        usage.date = today;
        usage.daily_count = 0;
        usage.minute_calls = [];
    }

    usage.minute_calls = usage.minute_calls.filter(time => now - time < 60000);

    const maxDaily = parseInt(config.per_day_limit, 10) || 50;
    const maxPerMin = parseInt(config.per_minute_limit, 10) || 15;

    if (usage.daily_count >= maxDaily) {
        showToast("Daily AI limit reached.", "error");
        return null;
    }
    if (usage.minute_calls.length >= maxPerMin) {
        showToast("Per-minute AI limit reached. Please wait a moment.", "error");
        return null;
    }

    return { config, usage };
}

function recordAIUsage(usage) {
    usage.daily_count++;
    usage.minute_calls.push(Date.now());
    localStorage.setItem('ai_usage', JSON.stringify(usage));
}

async function callGeminiAPI(prompt, systemInstruction = "") {
    const limits = checkAILimits();
    if (!limits) return null;

    const { config, usage } = limits;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model_name}:generateContent?key=${config.gemini_api_key}`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    };
    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("Gemini API Error:", errData);
            throw new Error(errData.error?.message || "AI Request Failed");
        }

        const data = await response.json();
        recordAIUsage(usage);

        if (data.candidates && data.candidates.length > 0) {
            let text = data.candidates[0].content.parts[0].text;
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        }
        return null;
    } catch (e) {
        console.error("AI Error:", e);
        showToast(e.message || "Failed to contact AI", "error");
        return null;
    }
}

function setupAIAssist(prefix) {
    const titleInput = document.getElementById(`${prefix}-title`);
    const aiBtn = document.getElementById(`${prefix}-ai-assist-btn`);

    if (!titleInput || !aiBtn) return;

    // We make sure not to duplicate listeners if renderDynamicFields is called multiple times
    const newAiBtn = aiBtn.cloneNode(true);
    aiBtn.parentNode.replaceChild(newAiBtn, aiBtn);

    // AI Button is now always active! No handleInput logic needed.

    const bindAIToggles = () => {
        const confirmBtn = document.getElementById('ai-confirm-btn');
        const applyAllToggle = document.getElementById('ai-apply-all-toggle');
        const applyAllWrapper = document.getElementById('ai-apply-all-wrapper');

        confirmBtn.disabled = true;
        applyAllWrapper.style.opacity = '1';
        applyAllWrapper.style.pointerEvents = 'auto';
        applyAllToggle.checked = false;

        const checkboxes = document.querySelectorAll('.ai-field-checkbox');
        checkboxes.forEach(cb => cb.checked = false);

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                const anyChecked = Array.from(checkboxes).some(c => c.checked);
                applyAllToggle.checked = allChecked;
                confirmBtn.disabled = !anyChecked;
            });
        });

        const newApplyAll = applyAllToggle.cloneNode(true);
        applyAllToggle.parentNode.replaceChild(newApplyAll, applyAllToggle);
        newApplyAll.addEventListener('change', (e) => {
            document.querySelectorAll('.ai-field-checkbox').forEach(cb => cb.checked = e.target.checked);
            confirmBtn.disabled = !e.target.checked;
        });

        confirmBtn.setAttribute('data-prefix', prefix);
    };

    const generateAIResponse = async (input, isCustom) => {
        const modalBody = document.getElementById('ai-modal-body');
        const confirmBtn = document.getElementById('ai-confirm-btn');
        const applyAllWrapper = document.getElementById('ai-apply-all-wrapper');

        confirmBtn.disabled = true;
        applyAllWrapper.style.opacity = '0';
        applyAllWrapper.style.pointerEvents = 'none';

        modalBody.innerHTML = `
            <div class="ai-loading-state">
                <div class="ai-spinner"></div>
                <p>Analyzing and generating premium suggestions...</p>
            </div>
        `;

        const currentCategory = document.getElementById(`${prefix}-category`)?.value || 'Residential';
        const currentLocation = document.getElementById(`${prefix}-location`)?.value || '';

        const systemInst = "You are a precise real estate AI. ONLY generate fields if the input explicitly suggests them. If you cannot confidently deduce category, sub_category, or location from the user's title/hints, return an EMPTY STRING for those keys. DO NOT guess or hallucinate locations. Always return ONLY a valid JSON object with the exact keys: 'category', 'sub_category', 'title', 'description', 'location'. Use relevant emojis in description.";

        const prompt = isCustom
            ? `Generate property details based on this user description: "${input}". Category hint: ${currentCategory}. Deduce title, description, location, sub_category and category. If info is missing, leave it empty.`
            : `Generate details for a property. Category hint: ${currentCategory}. Title hint: ${input}. Location hint: ${currentLocation}. Provide a catchy title, a detailed premium description, deduce the sub_category ONLY if obvious, and clean up location ONLY if provided.`;

        const aiResponse = await callGeminiAPI(prompt, systemInst);

        if (!aiResponse) {
            modalBody.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 20px;">Failed to generate suggestions. Please check your API limits.</p>`;
            return;
        }

        let html = '';
        const fields = ['category', 'sub_category', 'title', 'location', 'description'];
        window._aiGeneratedData = aiResponse;
        window._lastTitleCache = titleInput.value.trim();

        fields.forEach(field => {
            const val = aiResponse[field];
            const hasVal = val && val.trim() !== '';
            html += `
            <div class="ai-field-row ${!hasVal ? 'disabled' : ''}" style="animation: fadeInUp 0.4s ease forwards; opacity: 0; transform: translateY(15px); animation-delay: ${fields.indexOf(field) * 0.1}s">
                <div class="ai-field-content">
                    <div class="ai-field-label">${field.replace('_', ' ')}</div>
                    <div class="ai-field-value">${hasVal ? val : '<em>No suggestion generated</em>'}</div>
                </div>
                ${hasVal ? `
                <div class="ai-field-toggle">
                    <label class="toggle-wrapper">
                        <input type="checkbox" class="toggle-checkbox ai-field-checkbox" data-field="${field}">
                        <div class="toggle-slider"></div>
                    </label>
                </div>
                ` : ''}
            </div>
            `;
        });

        window._lastAIHTML = html;
        modalBody.innerHTML = html;
        bindAIToggles();
    };

    newAiBtn.addEventListener('click', async () => {
        const limits = checkAILimits();
        if (!limits) return;

        const currentTitle = titleInput.value.trim();
        const overlay = document.getElementById('ai-modal-overlay');
        const modalBody = document.getElementById('ai-modal-body');
        const confirmBtn = document.getElementById('ai-confirm-btn');
        const applyAllWrapper = document.getElementById('ai-apply-all-wrapper');

        // Strong Cache Condition
        if (window._lastTitleCache === currentTitle && window._lastAIHTML) {
            modalBody.innerHTML = window._lastAIHTML;
            overlay.classList.add('active');
            bindAIToggles();
            return;
        }

        overlay.classList.add('active');
        confirmBtn.disabled = true;
        applyAllWrapper.style.opacity = '0';
        applyAllWrapper.style.pointerEvents = 'none';

        if (!currentTitle) {
            modalBody.innerHTML = `
                <div class="ai-input-container">
                    <div class="ai-input-label">Sir, aap jo property list karna chahte hain, uski ek choti si detail yahan likh dein - jaise woh kahan hai, kitne size ki hai, kaya price hai, aur flat hai ya plot?</div>
                    <textarea id="ai-custom-prompt" class="ai-prompt-textarea" placeholder="E.g., 2 BHK flat in Bandra West, 1000 sqft, 2.5 Cr..."></textarea>
                    <div class="ai-warning-text">kripya saari details ek he baar mein likhein. Ai ka use sirf ek hi baar hoga, agar koi detail miss ho gahi toh baad mein add nahi kiya jaa sakta aap ko manually karna hogaa.</div>
                    <button id="ai-generate-custom-btn" class="btn btn-primary" style="margin-top: 10px;">Generate with AI</button>
                </div>
            `;

            document.getElementById('ai-generate-custom-btn').addEventListener('click', () => {
                const customInput = document.getElementById('ai-custom-prompt').value.trim();
                if (!customInput) { showToast("Please enter some details first.", "error"); return; }
                generateAIResponse(customInput, true);
            });
        } else {
            generateAIResponse(currentTitle, false);
        }
    });
}

// Global modal bindings
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ai-confirm-btn')?.addEventListener('click', (e) => {
        const btn = e.target;
        const prefix = btn.getAttribute('data-prefix');
        const checkboxes = document.querySelectorAll('.ai-field-checkbox');
        const aiData = window._aiGeneratedData || {};

        let categoryChanged = false;

        checkboxes.forEach(cb => {
            if (cb.checked) {
                const field = cb.getAttribute('data-field');
                const val = aiData[field];
                if (val) {
                    if (field === 'category') {
                        const catEl = document.getElementById(`${prefix}-category`);
                        if (catEl && catEl.value !== val && Array.from(catEl.options).some(o => o.value === val)) {
                            catEl.value = val;
                            categoryChanged = true;
                        }
                    } else if (field === 'sub_category') {
                        const subCatEl = document.getElementById(`${prefix}-sub-category`);
                        if (subCatEl) {
                            let optionFound = Array.from(subCatEl.options).some(o => o.value === val);
                            if (!optionFound) {
                                subCatEl.add(new Option(val, val));
                            }
                            subCatEl.value = val;
                        }
                    } else {
                        const el = document.getElementById(`${prefix}-${field}`);
                        if (el) {
                            el.value = val;
                        }
                    }
                }
            }
        });

        document.getElementById('ai-modal-overlay').classList.remove('active');
        showToast("AI suggestions applied!", "success");
    });

    document.getElementById('ai-modal-close')?.addEventListener('click', () => {
        document.getElementById('ai-modal-overlay').classList.remove('active');
    });


});