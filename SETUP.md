# Panduan Setup & Deploy Script ZHOST

Panduan ini akan memandu Anda langkah demi langkah untuk mengunggah (deploy) script website ini ke **domain milik Anda sendiri** beserta database Google Sheets Anda sendiri. Meskipun Anda pemula, silakan ikuti panduan ini dari awal hingga akhir.

Ada dua bagian utama:
1. **Setup Backend** (Google Sheets & Google Apps Script)
2. **Setup Frontend** (Website & Domain dengan Cloudflare)

---

## BAGIAN 1: Setup Backend (Google Sheets & Apps Script)

Backend aplikasi ini menggunakan Google Sheets sebagai database.

### Langkah 1: Copy Spreadsheet Database
1. Buka link template database Anda (jika belum ada, salin dari Google Sheets  Anda saat ini).
2. Klik menu **File** → **Buat salinan (Make a copy)**.
3. Simpan di Google Drive Anda sendiri.

### Langkah 2: Deploy Google Apps Script (GAS)
1. Di dalam Google Sheets yang baru Anda copy, klik menu **Ekstensi (Extensions)** → **Apps Script**.
2. Akan terbuka tab baru. Hapus semua kode default jika ada.
3. Buka file `appscript.js` dari folder komputer Anda, COPY SEMUA isinya (`Ctrl+A` lalu `Ctrl+C`).
4. PASTE isinya ke editor Apps Script (`Ctrl+V`).
5. Jangan lupa simpan (`Ctrl+S`).
6. Di pojok kanan atas, klik tombol biru **Terapkan (Deploy)** → **Deployment Baru (New deployment)**.
7. Pada menu roda gigi (Select type), pilih **Aplikasi Web (Web app)**.
8. Isi detail:
   - **Deskripsi:** Backend V1
   - **Aksesibilitas (Akses):** SIAPA SAJA (Anyone) *(Sangat Penting!)*
9. Klik **Deploy** dan setujui izin (Authorize access) ketika diminta (Pilih "Advanced" -> go to script).
10. Setelah berhasil, Anda akan mendapat **URL Aplikasi Web (Web app URL)** yang diawali dengan `https://script.google.com/macros/s/AKfy...`.
11. **COPY URL INI**. Anda sangat membutuhkannya di Bagian 2!

---

## BAGIAN 2: Setup Frontend & Domain (Website)

Di bagian ini kita akan menghubungkan kode website ke backend (GAS) Anda, lalu mempublikasikannya ke domain Anda.

### Langkah 1: Jalankan Script Auto-Setup
Pastikan Anda sudah menginstal **Node.js** di komputer Anda. Buka terminal (CMD / PowerShell / Terminal di dalam VS Code) pada folder project ini, lalu jalankan:

```bash
node setup.js
```

Script ini sangat interaktif. Anda hanya perlu menjawab pertanyaannya:
1. **Masukkan Domain Utama:** Ketik domain baru Anda (contoh: `domainanda.com`). Jangan pakai `https://` atau `www`.
2. **Domain Tambahan:** Tekan *Enter* saja jika tidak ada.
3. Lanjutkan tekan *Enter* (atau 'Y') untuk opsi lainnya.

> ✅ **Hasil:** Script ini akan otomatis membuat file `site.config.js` yang mengatur security domain Anda.

### Langkah 2: Hubungkan Frontend ke Backend
Buka file `wrangler.jsonc` di VS Code (ada di folder project). Cari baris:

```jsonc
"APP_GAS_URL": "https://script.google.com/macros/s/AKfy.../exec"
```

Ganti URL panjang di dalam tanda kutip tersebut dengan **URL Aplikasi Web (Web app URL)** yang Anda salin dari Langkah 2 Bagian 1.

### Langkah 3: Update Domain Anda & Hubungkan ke Cloudflare
1. Buka file `config.js`. Cari baris seperti ini:
   ```javascript
   _d: 'QUtmeW...exZWM='
   ```
   *Anda perlu mengubah URL obfuscated ini jika ingin lebih aman, tapi secara default langkah 2 (mengganti APP_GAS_URL di wrangler.jsonc) sudah cukup karena akses dialihkan via Cloudflare Worker.*

2. Login ke **Cloudflare Dashboard** (https://dash.cloudflare.com).
3. Tambahkan domain baru Anda ke Cloudflare jika belum ada.
4. Ubah **Nameserver** domain Anda di tempat Anda membeli domain (Niagahoster/Hostinger/dll) menjadi Nameserver milik Cloudflare.

### Langkah 4: Publikasikan Website (Deploy ke Pages)
1. Buka kembali terminal di VS Code pada folder project.
2. Jalankan perintah ini:
   ```bash
   npx wrangler pages deploy .
   ```
3. Saat muncul pertanyaan dari Wrangler:
   - Jika ditanya ingin buat project baru, pilih **Create a new project**.
   - Masukkan nama project (contoh: `web-edukasi`).
   - Jika ditanya "Production branch", tekan Enter (biasanya `main` atau `master`).
4. Tunggu proses upload selesai. Anda akan mendapatkan URL sementara berbentuk `https://nama-project.pages.dev`.

### Langkah 5: Pasang Custom Domain di Cloudflare
1. Di dashboard Cloudflare, buka menu **Workers & Pages**.
2. Pilih project `web-edukasi` yang baru saja Anda deploy.
3. Masuk ke tab **Custom Domains**.
4. Klik **Set up a custom domain**.
5. Masukkan domain utama Anda (misalnya `domainanda.com`) dan ikuti proses verifikasi otomatisnya.

---

## 🎉 SELESAI!
Tunggu beberapa menit hingga DNS Cloudflare tersebar (propagate). Buka `domainanda.com` di browser Anda. Website sudah online dan terhubung dengan Google Sheets Anda sendiri!

### Verifikasi Singkat:
1. Pergi ke `domainanda.com/admin-area`
2. Login menggunakan kredensial Admin Anda (sesuai yang ada di tab Users di Google Sheets Anda).
3. Jika bisa masuk, berarti koneksi Database sukses!

Jika terjadi kendala saat login admin untuk instalasi baru, ingat untuk pastikan tidak ada spasi tersembunyi (*trailing whitespace*) di dalam Google Sheets untuk kolom email dan password.
