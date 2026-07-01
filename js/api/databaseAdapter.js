// databaseAdapter.js
import { FIREBASE_CONFIG } from '../config.js';

const DB_URL = FIREBASE_CONFIG.databaseURL;

/**
 * Helper to get the Firebase Auth Token for REST requests.
 */
async function getAuthParam() {
    if (window.firebase && window.firebase.auth().currentUser) {
        const token = await window.firebase.auth().currentUser.getIdToken();
        return `?auth=${token}`;
    }
    return '';
}

/**
 * Fetches Properties
 */
export async function fetchProperties() {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/properties.json${authParam}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    const data = await response.json();
    return data || {};
}

/**
 * Fetches Leads
 */
export async function fetchLeads() {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/leads.json${authParam}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    const data = await response.json();
    return data || {};
}

/**
 * Fetches Global Settings
 */
export async function fetchGlobalSettings() {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/global_settings/global_settings.json${authParam}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    const data = await response.json();
    return data || {};
}

/**
 * Fetches Secure Settings (API keys)
 */
export async function fetchSecureSettings() {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/secure_settings.json${authParam}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    const data = await response.json();
    return data || {};
}

/**
 * Saves a NEW property
 */
export async function saveProperty(data) {
    const authParam = await getAuthParam();
    const id = `prop_${Date.now()}`;
    const response = await fetch(`${DB_URL}/properties/${id}.json${authParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return { status: 'success', id: id };
}

/**
 * Updates an EXISTING property
 */
export async function updateProperty(id, data) {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/properties/${id}.json${authParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return { status: 'success' };
}

/**
 * Deletes a property
 */
export async function deleteProperty(id) {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/properties/${id}.json${authParam}`, {
        method: 'DELETE'
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return true;
}

/**
 * Updates Global Settings
 */
export async function updateGlobalSettings(data) {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/global_settings/global_settings.json${authParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return { status: 'success' };
}

/**
 * Updates Lead Status
 */
export async function updateLeadStatus(id, status) {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/leads/${id}.json${authParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_status: status })
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return { status: 'success' };
}

/**
 * Deletes a Lead
 */
export async function deleteLead(id) {
    const authParam = await getAuthParam();
    const response = await fetch(`${DB_URL}/leads/${id}.json${authParam}`, {
        method: 'DELETE'
    });

    if (!response.ok) throw new Error(`Firebase Error: ${response.status}`);
    return { status: 'success' };
}
