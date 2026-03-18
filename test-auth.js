#!/usr/bin/env node
/**
 * ============================================
 * Integration Tests — Authentication
 * ============================================
 *
 * Runs after deploying appscript.js to GAS.
 * Tests the live API authentication endpoints.
 *
 * Usage: node test-auth.js
 *
 * NOTE: Update ADMIN_EMAIL, ADMIN_PASS, MEMBER_EMAIL,
 *       MEMBER_PASS below with your actual credentials.
 */

const API_URL = 'https://cepat.icu/api';

// ── Test Credentials ───────────────────────────────────────
const ADMIN_EMAIL = 'admin@cepat.icu';
const ADMIN_PASS = 'admin123';
const MEMBER_EMAIL = 'bernaandya@gmail.com';
const MEMBER_PASS = 'p9ki0c';

// ── Helpers ────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;

async function apiCall(action, data = {}) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
    });
    return res.json();
}

function assert(testName, condition, detail = '') {
    total++;
    if (condition) {
        console.log(`  ✅ ${testName}` + (detail ? ` — ${detail}` : ''));
        passed++;
    } else {
        console.log(`  ❌ ${testName}` + (detail ? ` — ${detail}` : ''));
        failed++;
    }
}

// ── Tests ──────────────────────────────────────────────────

async function main() {
    console.log('\n  ╔══════════════════════════════════════════╗');
    console.log('  ║   🧪 Integration Tests — Authentication  ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log(`\n  API: ${API_URL}\n`);

    // ── 1. GAS Server Tests ────────────────────────────────
    console.log('  📡 GAS Unit Tests (run on server)');
    console.log('  ─────────────────────────────────');
    try {
        const r = await apiCall('test_auth');
        if (r.status === 'success' && r.tests) {
            r.tests.forEach(t => assert(t.test, t.pass, t.detail ? t.detail.substring(0, 80) : ''));
            console.log(`\n  Server summary: ${r.summary}`);
        } else {
            assert('GAS test_auth action available', false, 
                r.message || 'Action not found — deploy the latest appscript.js first');
        }
    } catch (e) {
        assert('GAS server reachable', false, e.message);
    }

    // ── 2. Integration: Admin Login ────────────────────────
    console.log('\n  🔐 Integration: Admin Login');
    console.log('  ──────────────────────────');
    try {
        const r = await apiCall('admin_login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
        assert('Admin login succeeds', r.status === 'success', JSON.stringify(r).substring(0, 100));
        if (r.status === 'success') {
            assert('Admin login returns nama', !!(r.data && r.data.nama), r.data?.nama);
        }
    } catch (e) {
        assert('Admin login network OK', false, e.message);
    }

    // ── 3. Integration: Admin Login with wrong password ────
    try {
        const r = await apiCall('admin_login', { email: ADMIN_EMAIL, password: 'wrongPassword' });
        assert('Admin login rejects wrong password', r.status === 'error', r.message);
    } catch (e) {
        assert('Wrong password test network OK', false, e.message);
    }

    // ── 4. Integration: Admin Login with member email ──────
    try {
        const r = await apiCall('admin_login', { email: MEMBER_EMAIL, password: MEMBER_PASS });
        assert('Admin login rejects member role', r.status === 'error', r.message);
    } catch (e) {
        assert('Member rejection test network OK', false, e.message);
    }

    // ── 5. Integration: Member Login ───────────────────────
    console.log('\n  👤 Integration: Member Login');
    console.log('  ───────────────────────────');
    try {
        const r = await apiCall('login', { email: MEMBER_EMAIL, password: MEMBER_PASS });
        assert('Member login succeeds', r.status === 'success', JSON.stringify(r).substring(0, 100));
    } catch (e) {
        assert('Member login network OK', false, e.message);
    }

    // ── 6. Integration: Empty credentials ──────────────────
    try {
        const r = await apiCall('admin_login', { email: '', password: '' });
        assert('Empty credentials rejected', r.status === 'error', r.message);
    } catch (e) {
        assert('Empty creds test network OK', false, e.message);
    }

    // ── 7. Debug: Inspect admin user raw data ──────────────
    console.log('\n  🔍 Debug: Raw Cell Data Inspection');
    console.log('  ──────────────────────────────────');
    try {
        const r = await apiCall('debug_login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
        if (r.status === 'success' && r.data && r.data.length > 0) {
            const d = r.data[0];
            assert('Email matches (trimmed)', d.password_match.trimmed, 
                `Raw match: ${d.password_match.raw}, Trimmed match: ${d.password_match.trimmed}`);
            assert('Password has no extra chars', d.password.raw_length === d.password.trimmed_length,
                `Raw: ${d.password.raw_length} chars, Trimmed: ${d.password.trimmed_length} chars`);
            assert('Email has no extra chars', d.email.length === d.email.trimmed_length,
                `Raw: ${d.email.length} chars, Trimmed: ${d.email.trimmed_length} chars`);
            assert('Role is admin', d.role.is_admin, `Role: "${d.role.raw}" → "${d.role.lowercase}"`);
            
            if (d.password.raw_length !== d.password.trimmed_length) {
                console.log(`\n  ⚠️  PASSWORD HAS HIDDEN CHARACTERS!`);
                console.log(`  Char codes: ${JSON.stringify(d.password.charCodes)}`);
            }
        } else {
            assert('Debug data available', false, r.message || 'No data returned — deploy latest appscript.js');
        }
    } catch (e) {
        assert('Debug endpoint reachable', false, e.message);
    }

    // ── Summary ────────────────────────────────────────────
    console.log('\n  ══════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${total} total`);
    if (failed > 0) {
        console.log('  ❌ Some tests FAILED');
        process.exit(1);
    } else {
        console.log('  ✅ All tests PASSED!');
    }
    console.log('');
}

main().catch(e => {
    console.error('\n  ❌ Fatal error:', e.message);
    process.exit(1);
});
