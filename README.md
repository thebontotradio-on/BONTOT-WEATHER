# BONTOT WEATHER

**Know the Sky. Own Your Day.**

Aplikasi pemantauan cuaca dan kualitas udara hiper-lokal, modern, dan andal berbasis React, TypeScript, Tailwind CSS, Vite, Lucide Icons, dan Recharts. Terintegrasi langsung dengan layanan API Open-Meteo untuk prakiraan cuaca, kualitas udara (AQI), dan geocoding.

---

## Fitur Utama

- **Live Weather Metrics:** Suhu aktual, suhu terasa (*apparent temperature*), kelembapan relatif, kecepatan & arah angin, tekanan udara permukaan, jarak pandang (*visibility*), indeks UV, titik embun, dan estimasi curah hujan.
- **Prakiraan Per Jam (24 Jam) & 7 Hari:** Dilengkapi visualisasi grafik interaktif Recharts untuk tren suhu, peluang presipitasi, dan kecepatan angin.
- **Air Quality Index (AQI):** Menampilkan US AQI, konsentrasi PM2.5, PM10, Karbon Monoksida (CO), Nitrogen Dioksida (NO2), dan Ozon (O3) dengan indikator kesehatan.
- **Rekomendasi Aktivitas Cerdas & Deterministik:** Rekomendasi mandiri untuk membawa payung, aktivitas luar ruangan, proteksi radiasi UV, kenyamanan termal, dan berkendara, dengan evaluasi *null-safe* independen.
- **Pencarian Lokasi & GPS:** Pencarian kota geocoding cerdas dengan pencegahan *race condition* (`AbortController`), reverse geocoding untuk deteksi lokasi GPS saat ini, dan preset kota-kota utama Indonesia & dunia.
- **Sistem Cache Cerdas (FIFO/LRU):**
  - Batas maksimal 10 entri cache.
  - Kedaluwarsa otomatis setelah 2 jam (*stale threshold* 7.200.000 ms) atau bila timestamp tidak valid.
  - Pencocokan koordinat geografis berbasis toleransi presisi $\pm 0.01^\circ$ (~1,1 km) untuk mencegah cache salah lokasi.
- **In-App QA Diagnostic Suite:** Panel diagnostik interaktif terintegrasi yang menjalankan 15 pengujian skenario nyata secara langsung di peramban.

---

## 15 Perbaikan Kritis & Integritas Data

1. **Integritas Data Hujan:** Nilai peluang hujan yang hilang (`null`) tidak pernah dipalsukan menjadi `0%`.
2. **Indeks UV Independen:** Data UV yang hilang tidak diasumsikan "Aman".
3. **Kenyamanan Termal:** Suhu terasa yang tidak dilaporkan tidak dinyatakan "Nyaman".
4. **Data Parsial:** Setiap parameter dievaluasi secara terisolasi tanpa saling mengunci saat satu metrik hilang.
5. **Penanganan Kode WMO:** Kode cuaca WMO yang tidak dikenal ditangani secara netral (*Unknown Condition*).
6. **Pencegahan Race Condition Cuaca:** Permintaan cuaca menggunakan `AbortController` dan request ID monotonik.
7. **Pencegahan Race Condition Pencarian:** Permintaan geocoding sebelumnya langsung dibatalkan saat pengguna terus mengetik.
8. **Proteksi Callback GPS:** Callback GPS yang datang terlambat dibatalkan jika pengguna sudah memilih lokasi manual.
9. **Kapasitas Cache Terbatas (10 Entri):** Pemangkasan otomatis berbasis timestamp tertua saat entri baru disimpan.
10. **Validasi Cache Kedaluwarsa:** Deteksi data usang (>2 jam) dan timestamp corrupt.
11. **Pemisahan Cache Antar Koordinat:** Cache Surabaya tidak akan dipakai untuk Jakarta; validasi toleransi koordinat ketat.
12. **Integritas AQI:** Nilai AQI kosong dilaporkan sebagai "Data belum tersedia", bukan "Kualitas Bagus".
13. **Null-Safety Visualisasi:** Grafik dan kartu metrik tetap stabil saat API Open-Meteo mengalami *missing values*.
14. **Sinkronisasi Zona Waktu:** Waktu lokal beradaptasi secara dinamis mengikuti koordinat terpilih (WIB, WITA, WIT, dsb).
15. **Timer Pembaruan Tunggal:** Pembaruan otomatis (auto-refresh) memakai siklus interval tunggal yang bersih tanpa *leak*.

---

## Persyaratan Sistem

- **Node.js:** Versi 18.0.0 atau lebih baru (disarankan LTS Node 20+)
- **NPM:** Versi 9.0.0 atau lebih baru

---

## Panduan Instalasi & Menjalankan Proyek

### 1. Kloning Repository
```bash
git clone https://github.com/thebontotradio-on/BONTOT-WEATHER.git
cd BONTOT-WEATHER
```

### 2. Memasang Dependensi
```bash
npm install
```

### 3. Menjalankan Server Pengembangan (Dev)
```bash
npm run dev
```
Aplikasi akan aktif di `http://localhost:5173`.

### 4. Menjalankan Pengujian Otomatis (QA Test Suite)
```bash
npm test
```
Menjalankan 15 skenario pengujian integrasi berbasis Vitest.

### 5. Membangun Bundle Produksi
```bash
npm run build
```
Hasil build produksi yang dioptimalkan akan tersedia di folder `dist/`.

### 6. Menjalankan Pratinjau Produksi
```bash
npm run preview
```

---

## Struktur File Proyek

```
BONTOT-WEATHER/
├── .gitignore                    # Aturan pengabaian file Git (node_modules, dist, .env, dll)
├── index.html                    # Entry point HTML aplikasi dengan font Plus Jakarta Sans
├── package.json                  # Metadata dependensi & script proyek
├── package-lock.json             # Kunci dependensi versi terkunci
├── postcss.config.js             # Konfigurasi PostCSS untuk Tailwind CSS
├── tailwind.config.js            # Konfigurasi tema dan utilitas Tailwind CSS
├── tsconfig.json                 # Konfigurasi TypeScript compiler
├── vite.config.ts                # Konfigurasi bundling Vite & Vitest test runner
├── README.md                     # Dokumentasi resmi proyek
├── bontot_weather.tsx            # Salinan source aplikasi di root workspace
├── docs/
│   └── SOURCE_BASELINE.md        # Catatan audit & baseline source code Gemini
├── source/
│   └── bontot_weather.tsx        # Source aplikasi lengkap (menggantikan placeholder lama)
├── src/
│   ├── App.tsx                   # Implementasi lengkap seluruh fitur, state, & diagnostik BONTOT WEATHER
│   ├── index.css                 # Base Tailwind styles & efek glassmorphism
│   └── main.tsx                  # Mount React 18 ke DOM
└── tests/
    └── bontot_weather_qa.test.ts # 15 test skenario nyata yang menguji fungsi inti src/App.tsx
```

---

## Lisensi & Kontribusi

Dikembangkan untuk ekosistem **The Bontot Radio**. Seluruh hak cipta dilindungi.
