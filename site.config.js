/**
 * ============================================
 * SITE CONFIGURATION — Edit this file only!
 * ============================================
 *
 * Untuk deploy ke domain baru, ubah nilai di bawah ini.
 * Tidak perlu mengedit file lain.
 *
 * Format domain: tanpa protokol (https://), tanpa trailing slash (/)
 * Contoh: 'mydomain.com', bukan 'https://mydomain.com/'
 *
 * Jalankan "node setup.js" untuk generate file ini secara otomatis,
 * atau edit manual sesuai kebutuhan Anda.
 */
var SITE_CONFIG = {
    // ── Domain Utama (Production) ──────────────────────────
    PRIMARY_DOMAIN: 'rianlabs.web.id',

    // ── Daftar Domain yang Diizinkan ───────────────────────
    ALLOWED_DOMAINS: [
        'rianlabs.web.id',
        'www.rianlabs.web.id'
    ],

    // ── Pattern Subdomain yang Diizinkan ───────────────────
    ALLOWED_SUBDOMAIN_SUFFIXES: [
        '.rianlabs.web.id'
    ],

    // ── Cloudflare Pages Preview ───────────────────────────
    ALLOW_PAGES_DEV: true,

    // ── Local Development ──────────────────────────────────
    ALLOW_LOCALHOST: true
};
