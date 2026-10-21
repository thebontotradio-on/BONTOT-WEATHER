# BONTOT WEATHER

**Know the Sky. Own Your Day.**

Aplikasi pemantauan cuaca dan kualitas udara hiper-lokal, modern, dan andal berbasis React, TypeScript, Tailwind CSS, Vite, Lucide Icons, dan Recharts. Terintegrasi langsung dengan layanan API Open-Meteo untuk prakiraan cuaca, kualitas udara (AQI), dan geocoding.

---

## Identitas Visual Resmi & Aset Lokal

- **Official Logo:** Menggunakan logo resmi BONTOT WEATHER beresolusi tinggi (1254x1254 px) yang disimpan secara lokal di `public/bontot-weather-logo.png` tanpa ketergantungan pada hosting gambar eksternal saat aplikasi berjalan.
- **Favicon & Apple Touch Icon:** Dikonfigurasi di `index.html` menggunakan `public/favicon.png` dan `public/bontot-weather-logo.png`.
- **Integrasi Desain:** Logo resmi terintegrasi di navbar header dengan efek glowing container, border cyan-indigo, dan mikro-animasi hover scale, serta lambang resmi di footer aplikasi.

---

## Animasi Atmosfer Dinamis Berbasis Cuaca Aktual

Aplikasi menyajikan atmosfer latar belakang (`AtmosphericBackground`) yang hidup dan beradaptasi secara otomatis mengikuti data cuaca Open-Meteo dan siklus siang/malam lokasi:

1. **Cerah Siang (`clear-day` / `partly-cloudy-day`):** Pancaran aura matahari keemasan lembut, denyut atmosfer halus (`anim-sun-pulse`), dan gradasi langit hangat.
2. **Cerah Malam (`clear-night` / `partly-cloudy-night`):** Bulan bercahaya dengan halo korona lunar lembut (`anim-moon-halo`) dan taburan 10+ bintang berkelip acak (`anim-star-twinkle`).
3. **Berawan & Mendung (`cloudy` / `overcast`):** Multi-lapisan awan parallaks melayang dengan kecepatan berbeda (`anim-cloud-slow` dan `anim-cloud-fast`) memberikan kedalaman visual.
4. **Gerimis (`drizzle`):** Partikel tetesan air halus miring dengan kecepatan konstan (`anim-drizzle`).
5. **Hujan Sedang (`rain`):** Presipitasi tetesan air teratur dengan sudut kemiringan natural (`anim-rain-normal`).
6. **Hujan Lebat (`heavy-rain`):** Curahan hujan berdensitas tinggi, kecepatan tinggi (`anim-heavy-rain`), disertai atmosfer langit mendung gelap.
7. **Badai Petir (`thunderstorm`):** Hujan badai lebat disertai kilatan petir ambien berkala (`anim-lightning`) yang dipicu **hanya** jika kondisi badai terindikasi resmi dari data WMO.
8. **Berkabut (`fog`):** Lapisan kabut lembut horizontal yang mengalir perlahan bolak-balik dengan variasi kedalaman (`anim-fog-drift`).
9. **Salju (`snow`):** Butiran kristal salju melayang turun dengan ayunan sinusoidal dan rotasi halus (`anim-snow`).
10. **Kondisi Tidak Diketahui (`unknown` / `null`):** Tampilan gradasi kosmik netral tanpa menciptakan efek cuaca palsu.

### Aksesibilitas & Efisiensi Performa:
- **`prefers-reduced-motion`:** Menghormati pengaturan aksesibilitas sistem pengguna. Bila diaktifkan, seluruh animasi dihentikan dan beralih ke gradasi statis.
- **Optimasi Tab Tidak Aktif:** Menggunakan event listener `document.visibilitychange` untuk menghentikan (`animation-play-state: paused`) proses render saat peramban berada di tab latar belakang, menghemat daya baterai dan siklus GPU.
- **GPU-Accelerated:** Seluruh animasi dibangun menggunakan CSS 3D transforms (`translate3d`) dan `opacity` tanpa memicu layout reflow.

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
- **In-App QA Diagnostic Suite:** Panel diagnostik interaktif terintegrasi yang menjalankan pengujian skenario nyata secara langsung di peramban.

---

## 18 Skenario Pengujian QA Terverifikasi

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
16. **Pemetaan Efek Atmosfer Dinamis:** Pengujian presisi pemetaan animasi visual cuaca cerah, malam, berawan, gerimis, hujan, badai petir, kabut, dan salju.
17. **Netralitas Kondisi Unknown & Null:** Memastikan data cuaca kosong/unknown tidak memicu efek visual palsu.
18. **Validitas Logo Resmi & Favicon:** Memastikan file gambar logo resmi lokal berukuran penuh, header PNG valid, dan favicon terpasang.

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
Menjalankan 18 skenario pengujian integrasi berbasis Vitest.

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
├── index.html                    # Entry point HTML aplikasi dengan font & favicon resmi
├── package.json                  # Metadata dependensi & script proyek
├── package-lock.json             # Kunci dependensi versi terkunci
├── postcss.config.js             # Konfigurasi PostCSS untuk Tailwind CSS
├── tailwind.config.js            # Konfigurasi tema dan utilitas Tailwind CSS
├── tsconfig.json                 # Konfigurasi TypeScript compiler
├── vite.config.ts                # Konfigurasi bundling Vite & Vitest test runner
├── README.md                     # Dokumentasi resmi proyek
├── bontot_weather.tsx            # Salinan source aplikasi di root workspace
├── public/
│   ├── bontot-weather-logo.png   # Aset logo resmi resolusi tinggi BONTOT WEATHER
│   └── favicon.png               # Aset favicon resmi BONTOT WEATHER
├── docs/
│   └── SOURCE_BASELINE.md        # Catatan audit & baseline source code Gemini
├── source/
│   └── bontot_weather.tsx        # Source aplikasi lengkap tersinkronisasi
├── src/
│   ├── App.tsx                   # Implementasi lengkap seluruh fitur, state, & diagnostik BONTOT WEATHER
│   ├── index.css                 # Base styles, animasi atmosfer dinamis & glassmorphism
│   └── main.tsx                  # Mount React 18 ke DOM
└── tests/
    └── bontot_weather_qa.test.ts # 18 test skenario nyata yang menguji fungsi inti src/App.tsx
```

---

## Lisensi & Kontribusi

Dikembangkan untuk ekosistem **The Bontot Radio**. Seluruh hak cipta dilindungi.
