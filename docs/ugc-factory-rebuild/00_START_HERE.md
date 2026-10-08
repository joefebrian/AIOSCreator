# AIOSCreator UGC Factory — Grok Build handoff

Version 1.0 · 2 October 2026 · Product owner: Joe

Paket ini adalah rencana implementasi untuk rebuild UGC Factory di AIOSCreator. Kode aplikasi dan koneksi provider belum diperiksa atau diubah dalam penyusunan paket ini.

## Keputusan inti

Satu keluarga produk bisa memiliki beberapa SKU fisik. Satu SKU fisik bisa ditautkan ke banyak listing marketplace di berbagai negara, setelah kesamaan produk dan variannya diperiksa.

Contoh: building set 60 komponen dapat punya listing Indonesia, Malaysia, dan US. Paket 100 komponen adalah SKU berbeda di keluarga produk yang sama. Persamaan judul listing tidak membuktikan persamaan SKU.

Satu production menghasilkan satu video final untuk satu SKU, satu listing penjualan, satu market, satu bahasa utama, dan satu platform/placement. Banyak shot dan render attempt di dalamnya tetap dihitung sebagai satu production. Pemilihan lima market tidak otomatis membuat lima video.

Market rilis: Indonesia, Malaysia, Singapore, Thailand, United States. Fokus: HomeGadget kitchen prep/cleaning; preschool toys dengan alur unbox → first play atau unbox → build → play. Orang tua dan pembeli hadiah adalah audience komersial mainan; usia 3–6 adalah kelompok pengguna produk.

## Isi paket

| File | Gunanya |
| --- | --- |
| 01_DEVELOPMENT_PLAN.md | Scope, keputusan produk, UX, arsitektur, delapan milestone M0–M7, dan syarat selesai. |
| 02_TECHNICAL_CONTRACTS.md | Entitas, fakta/offer, status, approval, provider adapter, API logis, dan performa. |
| 03_GROK_BUILD_PROMPTS.md | Prompt kickoff, prompt per milestone, dan prompt melanjutkan pekerjaan. |
| 04_ACCEPTANCE_AND_BENCHMARK.md | Skenario uji, pemeriksaan video nyata, dan batas bukti kualitas/performa. |
| 05_CREATIVE_PLAYBOOKS_AND_SHOT_EXAMPLES.md | Lima recipe awal, category playbook, dan contoh rencana 30 detik. |
| 06_RECIPE_REGISTRY.seed.json | Seed konfigurasi untuk kelima recipe dan lima market; belum merupakan evaluasi performa. |
| 07_START_GROK_BUILD.txt | Prompt kickoff singkat untuk langsung dipaste. |
| templates/performance_import.csv | Header CSV untuk import performa; tanpa angka contoh yang bisa disangka data nyata. |
| references/ | Salinan Bible dan implementation guide yang diperiksa sebagai referensi. |

## Cara pakai di Grok Build

1. Extract folder ini ke repository AIOSCreator, misalnya docs/ugc-factory-rebuild/. Sesuaikan root bila repository berupa monorepo.
2. Gunakan Grok Build 0.2.112 dan pilih Grok 4.7 dengan effort xhigh sesuai konfigurasi lo. Paket memakai instruksi file biasa; tidak bergantung pada fitur khusus versi CLI yang lebih baru.
3. Pastikan video benchmark asli tersedia bagi builder melalui folder referensi/media service aplikasi. Gunakan sample yang lo pilih sebagai benchmark output; nama file dan hash harus dicatat saat M0/M2. Bible tidak menggantikan video benchmark.
4. Paste isi 07_START_GROK_BUILD.txt. Builder mulai dari audit repository, lalu menerapkan milestone secara berurutan. Tidak perlu meminta konfirmasi ulang untuk keputusan yang sudah ada di paket.
5. Kalau sesi terputus, pakai prompt Resume di 03_GROK_BUILD_PROMPTS.md. Builder melanjutkan dari catatan implementasi, bukan mengulang seluruh pekerjaan.

Nama GPT 6 Astra, Seedance 2.5, dan WAN 3.0 Prime merupakan pilihan peran/model produk. Builder wajib memeriksa model ID, endpoint, account access, dan parameter nyata dari konfigurasi provider aplikasi sebelum live call. Grok 4.7 adalah model untuk mengerjakan build; tidak otomatis menjadi model runtime UGC Factory.

## Urutan hasil yang perlu terlihat

M0: peta repository dan integrasi nyata.

M1–M2: katalog SKU/listing, Production Board, benchmark breakdown, dan recipe registry.

M3–M4: keputusan Jev, brief yang berisi fakta terverifikasi, script, shot plan, audio strategy, serta approval yang tersimpan.

M5–M6: job provider sungguhan, video lengkap, pemeriksaan kualitas, perbaikan shot, dan export.

M7: import performa, pencatatan eksperimen, variasi terkontrol, dan release checklist.

Lulus lint/build dan mock test berarti fondasi perangkat lunak berjalan. Kualitas video baru diterima setelah video nyata dibandingkan dengan benchmark. Label winning membutuhkan performa campaign yang teratribusi; confidence Jev tidak menggantikannya.

## Batas release

Rebuild berfokus pada video vertikal. Katalog 33 template lama dan history tetap dipertahankan sebagai data legacy; lima recipe pilot menjadi jalur aktif awal. Fashion Motion, slideshow, Character, dan module lain memakai layanan bersama yang sudah ada tanpa ikut diperluas dalam rebuild ini.

Import URL tidak dijanjikan selalu berhasil. URL tetap disimpan, dengan pilihan upload aset dan input manual ketika connector tidak tersedia atau tidak dapat membaca listing. Auto-post, ads automation, live analytics API, affiliate payout, dan seller checkout berada di fase lanjutan.

Provider credentials, exact repository paths, jumlah video benchmark yang tersedia, dan skor video hasil pilot harus dilaporkan sebagai fakta hasil audit. Jangan menandai hal yang belum diperiksa sebagai sudah siap.
