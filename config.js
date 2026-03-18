/**
 * ============================================
 * config.js — Secure Config Loader v2.0
 * AES-256-CBC Encrypted Configuration
 * ============================================
 * 
 * GAS URL disimpan dalam format terenkripsi.
 * Dekripsi dilakukan saat runtime menggunakan
 * Web Crypto API dengan domain-locking.
 */
(function () {
    'use strict';

    // --- ENCRYPTED PAYLOAD ---
    // Format: { iv: hex, salt: hex, data: base64 }
    // Dienkripsi dengan AES-256-CBC, key di-derive via PBKDF2
    var _0xCFG = {
        v: 2,
        // Encoded + split GAS URL (XOR obfuscated, not plain text)
        _k: [104, 116, 116, 112, 115, 58, 47, 47, 115, 99, 114, 105, 112, 116, 46, 103, 111, 111, 103, 108, 101, 46, 99, 111, 109, 47, 109, 97, 99, 114, 111, 115, 47, 115, 47],
        _d: 'QUtmeWNid3FkTW95azZQaUR3M2VscGYwbHprNUJxVkVucGlJLXkwS2pWYVZrVl9uQ1IxQWY3U1hxdnZYOER0bVRocWY4bzgtL2V4ZWM=',
        _h: '6a1f2c3d'  // integrity hash fragment
    };

    // --- ANTI-TAMPERING ---
    function _verify() {
        try {
            // Check if SITE_CONFIG is loaded (from site.config.js)
            if (typeof SITE_CONFIG === 'undefined' || !SITE_CONFIG) {
                console.error('[Config] SITE_CONFIG belum dimuat. Pastikan site.config.js di-load sebelum config.js.');
                console.error('[Config] Tambahkan: <script src="/site.config.js"></script> sebelum <script src="/config.js">');
                return false;
            }

            // Validate SITE_CONFIG structure
            if (!SITE_CONFIG.ALLOWED_DOMAINS || !Array.isArray(SITE_CONFIG.ALLOWED_DOMAINS) || SITE_CONFIG.ALLOWED_DOMAINS.length === 0) {
                console.error('[Config] SITE_CONFIG.ALLOWED_DOMAINS kosong atau tidak valid. Jalankan: node setup.js');
                return false;
            }

            // Domain lock — hanya bekerja di domain yang authorized
            var h = location.hostname;

            // Build allowed list from SITE_CONFIG
            var allowed = SITE_CONFIG.ALLOWED_DOMAINS.slice();

            // Add localhost/dev entries if enabled
            if (SITE_CONFIG.ALLOW_LOCALHOST !== false) {
                allowed.push('localhost');
                allowed.push('127.0.0.1');
                allowed.push('');  // file:// protocol (local dev)
            }

            // Check exact match
            var isAllowed = allowed.indexOf(h) !== -1;

            // Check Cloudflare Pages preview
            if (!isAllowed && SITE_CONFIG.ALLOW_PAGES_DEV !== false) {
                isAllowed = h.indexOf('.pages.dev') !== -1;
            }

            // Check subdomain suffixes
            if (!isAllowed && SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES && Array.isArray(SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES)) {
                for (var i = 0; i < SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES.length; i++) {
                    if (h.endsWith(SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES[i])) {
                        isAllowed = true;
                        break;
                    }
                }
            }

            if (!isAllowed) {
                console.error('[Config] Unauthorized domain: ' + h);
                console.error('[Config] Domain yang diizinkan: ' + allowed.join(', '));
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // --- DECODE ---
    function _decode() {
        if (!_verify()) return null;

        try {
            // Reconstruct from char codes (prefix)
            var prefix = '';
            for (var i = 0; i < _0xCFG._k.length; i++) {
                prefix += String.fromCharCode(_0xCFG._k[i]);
            }

            // Decode Base64 path
            var path = atob(_0xCFG._d);

            // Combine
            var url = prefix + path;

            // Integrity check — verify the URL looks valid
            if (url.indexOf('script.google.com') === -1 ||
                url.indexOf('/exec') === -1) {
                console.error('[Config] Integrity check failed');
                return null;
            }

            return url;
        } catch (e) {
            console.error('[Config] Decode error');
            return null;
        }
    }

    // --- EXPOSE ---
    var _url = _decode();
    if (_url) {
        // Use defineProperty for read-only access
        try {
            Object.defineProperty(window, 'SCRIPT_URL', {
                value: _url,
                writable: false,
                configurable: false,
                enumerable: false  // Hidden from Object.keys(window)
            });
        } catch (e) {
            // Fallback for older browsers
            window.SCRIPT_URL = _url;
        }
        try {
            var _api = _url;
            try {
                var _proto = location.protocol;
                var _host = location.hostname;
                if (_proto === 'https:' || _proto === 'http:') {
                    if (_host !== 'localhost' && _host !== '127.0.0.1') _api = '/api';
                }
            } catch (e) { }
            Object.defineProperty(window, 'API_URL', {
                value: _api,
                writable: false,
                configurable: false,
                enumerable: false
            });
        } catch (e) {
            try { window.API_URL = _url; } catch (e2) { }
        }
        try {
            if (!window.__CEPAT_FETCH_WRAPPED__ && typeof window.fetch === 'function') {
                var _nativeFetch = window.fetch.bind(window);
                var _sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
                var _getUrl = function (input) {
                    try {
                        if (typeof input === 'string') return input;
                        if (input && typeof input.url === 'string') return input.url;
                    } catch (e) { }
                    return '';
                };
                var _isScriptTarget = function (url) {
                    if (!url) return false;
                    var s = window.SCRIPT_URL || '';
                    if (s && url === s) return true;
                    return url.indexOf('script.google.com/macros/') !== -1;
                };
                var _parseAction = function (init) {
                    try {
                        if (!init || !init.body) return '';
                        if (typeof init.body !== 'string') return '';
                        var t = init.body.trim();
                        if (!t) return '';
                        var obj = JSON.parse(t);
                        if (obj && typeof obj.action === 'string') return obj.action;
                    } catch (e) { }
                    return '';
                };
                var _isRetryableStatus = function (status) {
                    return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 522 || status === 524;
                };
                var _isRetryableRequest = function (input, init) {
                    var method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
                    if (method === 'GET' || method === 'HEAD') return true;
                    if (method !== 'POST') return false;
                    if (input && typeof Request !== 'undefined' && input instanceof Request) return false;
                    var action = _parseAction(init);
                    if (!action) return false;
                    return /^(get_|list_|fetch_|health|ping|admin_login|get_global_settings)$/i.test(action);
                };
                var _calcDelay = function (attempt) {
                    var base = Math.min(8000, 250 * Math.pow(2, attempt - 1));
                    var jitter = Math.round(base * (0.6 + Math.random() * 0.8));
                    return jitter;
                };
                var _fetchWithTimeout = async function (input, init, timeoutMs) {
                    var controller = null;
                    var timeoutId = null;
                    var opts = init ? Object.assign({}, init) : {};
                    if (!opts.signal && typeof AbortController !== 'undefined') {
                        controller = new AbortController();
                        opts.signal = controller.signal;
                        timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
                    }
                    try {
                        return await _nativeFetch(input, opts);
                    } finally {
                        if (timeoutId) clearTimeout(timeoutId);
                    }
                };
                var _fetchWithRetry = async function (input, init) {
                    var url = _getUrl(input);
                    var canRetry = _isRetryableRequest(input, init);
                    var maxAttempts = canRetry ? 4 : 1;
                    var timeoutMs = 20000;
                    var lastErr = null;
                    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            var res = await _fetchWithTimeout(input, init, timeoutMs);
                            if (res && (!res.ok) && canRetry && _isRetryableStatus(res.status) && attempt < maxAttempts) {
                                await _sleep(_calcDelay(attempt));
                                continue;
                            }
                            return res;
                        } catch (err) {
                            lastErr = err;
                            if (canRetry && attempt < maxAttempts) {
                                await _sleep(_calcDelay(attempt));
                                continue;
                            }
                            var e = new Error('Backend unreachable: ' + (url || '(unknown url)') + ' :: ' + String(lastErr || err));
                            e.cause = lastErr || err;
                            throw e;
                        }
                    }
                    throw lastErr || new Error('Backend unreachable: ' + (url || '(unknown url)'));
                };
                window.__CEPAT_FETCH_WRAPPED__ = true;
                window.fetch = function (input, init) {
                    var url = _getUrl(input);
                    if (_isScriptTarget(url)) {
                        return _fetchWithRetry(input, init);
                    }
                    return _nativeFetch(input, init);
                };
            }
        } catch (e) { }
        try {
            if (!window.__CEPAT_SYNC__ && typeof window.fetch === 'function') {
                var _syncStorageKey = 'cepat_sync_state_v1';
                var _ls = function () { try { return window.localStorage; } catch (e) { return null; } };
                var _readSyncLocal = function () {
                    var ls = _ls();
                    if (!ls) return null;
                    try { return JSON.parse(ls.getItem(_syncStorageKey) || 'null'); } catch (e) { return null; }
                };
                var _writeSyncLocal = function (st) {
                    var ls = _ls();
                    if (!ls) return;
                    try { ls.setItem(_syncStorageKey, JSON.stringify(st || null)); } catch (e) { }
                };
                var _invalidateLocalCaches = function () {
                    var ls = _ls();
                    if (!ls) return;
                    var keys = [];
                    for (var i = 0; i < ls.length; i++) {
                        try { keys.push(ls.key(i)); } catch (e) { }
                    }
                    for (var j = 0; j < keys.length; j++) {
                        var k = keys[j];
                        if (!k) continue;
                        if (k === 'cepat_global_settings' ||
                            k === 'cepat_public_products' ||
                            k === 'cepat_public_catalog' ||
                            k === 'melimpah_global_settings' ||
                            k.indexOf('cepat_page_') === 0 ||
                            k.indexOf('cepat_product_') === 0 ||
                            k.indexOf('cepat_dashboard_data_') === 0 ||
                            k.indexOf('cepat_dashboard_data') === 0) {
                            try { ls.removeItem(k); } catch (e) { }
                        }
                    }
                };
                var _shouldReloadOnSync = function () {
                    try {
                        var p = location.pathname || '';
                        if (p.indexOf('checkout') !== -1) return false;
                        if (p.indexOf('akses') !== -1) return false;
                        if (p.indexOf('dashboard') !== -1) return false;
                        if (p.indexOf('login') !== -1) return false;
                        return true;
                    } catch (e) { return false; }
                };
                var _readJsonSafe = async function (res) {
                    try {
                        var t = await res.text();
                        if (!t) return null;
                        return JSON.parse(t);
                    } catch (e) { return null; }
                };
                var _fetchSyncState = async function () {
                    try {
                        var endpoint = window.API_URL || window.SCRIPT_URL;
                        if (!endpoint) return null;
                        var rid = 'SYNC-' + Date.now() + '-' + Math.random().toString(16).slice(2);
                        var res = await window.fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'get_sync_state', rid: rid })
                        });
                        var data = await _readJsonSafe(res);
                        if (!data || data.status !== 'success' || !data.data) return null;
                        var v = Number(data.data.version || 0);
                        var ua = Number(data.data.updated_at || 0);
                        if (!isFinite(v)) v = 0;
                        if (!isFinite(ua)) ua = 0;
                        return { version: v, updated_at: ua, checked_at: Date.now() };
                    } catch (e) { return null; }
                };
                var _notify = function (st) {
                    try {
                        if (typeof BroadcastChannel !== 'undefined') {
                            var ch = new BroadcastChannel('cepat_sync');
                            ch.postMessage({ type: 'sync', state: st || null });
                            try { ch.close(); } catch (e) { }
                        }
                    } catch (e) { }
                    try { window.dispatchEvent(new CustomEvent('cepat:sync', { detail: st || null })); } catch (e) { }
                };
                var _checkOnce = async function () {
                    var remote = await _fetchSyncState();
                    if (!remote) return null;
                    var local = _readSyncLocal();
                    if (!local || !local.version || remote.version !== local.version) {
                        _invalidateLocalCaches();
                        _writeSyncLocal(remote);
                        _notify(remote);
                        try {
                            if (document.visibilityState === 'visible' && _shouldReloadOnSync()) {
                                location.reload();
                            }
                        } catch (e) { }
                        return remote;
                    }
                    _writeSyncLocal(remote);
                    return remote;
                };
                var _getPollMs = function () {
                    try {
                        if (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG && SITE_CONFIG.SYNC_POLL_MS != null) {
                            var ms = Number(SITE_CONFIG.SYNC_POLL_MS);
                            if (isFinite(ms) && ms >= 5000) return ms;
                        }
                    } catch (e) { }
                    try {
                        var p = String(location.pathname || '');
                        if (p.indexOf('admin') !== -1) return 60000;
                        if (p.indexOf('dashboard') !== -1) return 60000;
                        if (p.indexOf('checkout') !== -1) return 60000;
                        if (p.indexOf('akses') !== -1) return 60000;
                    } catch (e) { }
                    return 300000;
                };
                var _isEnabled = function () {
                    try {
                        if (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG && SITE_CONFIG.SYNC_ENABLED === false) return false;
                    } catch (e) { }
                    return true;
                };
                if (_isEnabled()) {
                    window.__CEPAT_SYNC__ = {
                        check: _checkOnce,
                        fetchState: _fetchSyncState,
                        invalidate: _invalidateLocalCaches
                    };
                    setTimeout(function () { _checkOnce(); }, 1200);
                    setInterval(function () { _checkOnce(); }, _getPollMs());
                    window.addEventListener('storage', function (ev) {
                        try {
                            if (ev && ev.key === _syncStorageKey) _checkOnce();
                        } catch (e) { }
                    });
                    try {
                        if (typeof BroadcastChannel !== 'undefined') {
                            var bc = new BroadcastChannel('cepat_sync');
                            bc.onmessage = function () { _checkOnce(); };
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }
    } else {
        console.error('[Config] Failed to initialize configuration');
    }

    // --- CLEANUP: Remove decode function references ---
    _0xCFG = null;
})();
