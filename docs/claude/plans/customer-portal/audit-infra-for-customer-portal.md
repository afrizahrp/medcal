Betul. Ini **prompt utuh** yang tinggal kamu copy-paste ke Claude Code. Saya buat sebagai **satu handoff**, bukan dipecah menjadi task-task terpisah.

````markdown
# MedCal — Audit Infrastructure untuk Customer Surface / Tech PWA

Kita akan menambahkan customer surface baru:

`customer.kalibrasimedika.co.id`

yang akan menjalankan:

`apps/tech-pwa`

Sebelum melakukan implementasi apa pun, lakukan **forensic audit terhadap repository dan production infrastructure configuration** untuk menentukan apakah `apps/tech-pwa` sudah siap dijadikan service production terpisah.

## Konteks Production Saat Ini

MedCal production berada di:

`/medcal`

Deployment menggunakan Docker Compose.

Service production yang saat ini sudah berjalan:

```text
kalibrasimedika.co.id
    -> Nginx
    -> medcal-web
    -> apps/web

kalibrasimedika.co.id/public/*
    -> Nginx
    -> medcal-web-api
    -> apps/web-api

api.kalibrasimedika.co.id
    -> Nginx
    -> medcal-api
    -> apps/api

apps.kalibrasimedika.co.id
    -> Nginx
    -> medcal-portal
    -> apps/portal
````

Current host ports:

```text
medcal-api      -> 127.0.0.1:3001
medcal-web-api  -> 127.0.0.1:3002
medcal-portal   -> 127.0.0.1:3003
medcal-web      -> 127.0.0.1:3010
```

PostgreSQL production berjalan native di host VPS, bukan sebagai container.

Docker service menggunakan network:

`medcal_net`

Nginx berjalan di host VPS dan menjadi reverse proxy untuk seluruh public domain MedCal.

Let's Encrypt digunakan untuk certificate production.

Production environment menggunakan:

`/medcal/.env.production`

Jangan membaca atau menampilkan secret/value sensitif ke dalam report. Jika perlu menyebut environment variable, cukup sebut nama variable dan status/configuration requirement-nya.

## Target Baru

Service baru:

```text
customer.kalibrasimedika.co.id
    -> Nginx
    -> Docker service untuk apps/tech-pwa
```

`apps/tech-pwa` sebelumnya **memang belum dicontainerize**, karena pada saat itu aplikasinya belum siap untuk production.

Sekarang kita perlu menentukan apakah kondisi repository saat ini sudah memungkinkan `tech-pwa` masuk ke production topology tersebut.

---

# TUGAS

Lakukan audit menyeluruh terhadap repository.

**Jangan melakukan implementasi atau perubahan apa pun.**

Tujuan audit:

> Menentukan apa yang sebenarnya dibutuhkan agar `apps/tech-pwa` dapat dijalankan sebagai service production terpisah di `customer.kalibrasimedika.co.id`, tanpa mengganggu service MedCal production yang sudah berjalan.

Audit harus berdasarkan kondisi repository yang benar-benar ada sekarang. Jangan berasumsi bahwa sesuatu tersedia hanya karena secara teori seharusnya tersedia.

Periksa terutama:

* struktur `apps/tech-pwa`;
* framework/runtime dan cara aplikasi dijalankan;
* `package.json`;
* existing Dockerfile, jika ada;
* konfigurasi Next.js/build/runtime, jika applicable;
* environment variables;
* `NEXT_PUBLIC_*`;
* authentication/session/cookie/origin configuration;
* API endpoint yang digunakan tech-pwa;
* hostname/origin assumptions;
* apakah ada hardcoded domain/port;
* apakah aplikasi membutuhkan WebSocket atau koneksi khusus;
* apakah aplikasi membutuhkan akses langsung ke service lain;
* existing Docker patterns di `apps/web`, `apps/portal`, atau service lain;
* `docker-compose.prod.yml`;
* Docker network;
* Nginx configuration/template yang ada di repository;
* SSL/certificate assumptions;
* DNS assumptions;
* port allocation;
* security/isolation;
* compatibility dengan production VPS topology yang sudah ada.

## Hal yang secara khusus harus diperiksa

### 1. Tech PWA runtime

Tentukan secara konkret:

* bagaimana `apps/tech-pwa` saat ini dibuild;
* bagaimana dijalankan;
* apakah membutuhkan Node server;
* apakah output-nya standalone atau membutuhkan full `node_modules`;
* apakah ada `start` script;
* apakah ada requirement khusus saat runtime;
* apakah existing configuration cocok untuk Docker production.

Jangan langsung menyimpulkan perlu Dockerfile baru. Cari dulu apakah sudah ada pattern atau configuration yang bisa digunakan.

### 2. Docker readiness

Bandingkan `apps/tech-pwa` dengan aplikasi MedCal lain yang sudah production/containerized.

Tentukan:

* apakah sudah Docker-ready;
* apa yang kurang;
* apakah existing Dockerfile dapat digunakan;
* apakah perlu Dockerfile baru;
* apakah ada dependency/build issue;
* apakah ada issue monorepo/pnpm workspace;
* apakah image perlu source tertentu saat runtime;
* apakah ada asset/static file yang berpotensi hilang dari image.

### 3. Compose topology

Audit bagaimana `tech-pwa` seharusnya masuk ke Compose.

Tentukan:

* proposed service name;
* proposed internal/container port;
* proposed host port;
* apakah perlu expose ke host;
* apakah cukup berada di `medcal_net`;
* apakah perlu `depends_on`;
* apakah perlu environment;
* apakah perlu build args;
* apakah perlu `extra_hosts`;
* apakah perlu akses service MedCal lain;
* apakah ada potensi collision dengan port yang sudah digunakan.

**Jangan mengubah Compose. Hanya audit dan rekomendasikan topology.**

### 4. Nginx

Audit kebutuhan untuk:

```text
customer.kalibrasimedika.co.id
```

Tentukan:

* server block yang dibutuhkan;
* upstream/target port;
* websocket requirement jika ada;
* forwarding headers;
* HTTP → HTTPS;
* interaction dengan existing Nginx configuration;
* apakah ada risiko mengganggu domain existing.

### 5. SSL / Certificate

Audit kebutuhan certificate untuk:

```text
customer.kalibrasimedika.co.id
```

Tentukan:

* apakah existing certificate mencakup domain tersebut atau tidak;
* apakah perlu certificate expansion/new certificate;
* bagaimana certificate seharusnya dikelola berdasarkan topology saat ini.

**Jangan menjalankan Certbot.**

### 6. DNS

Tentukan record DNS yang dibutuhkan untuk:

```text
customer.kalibrasimedika.co.id
```

Audit hanya. Jangan melakukan perubahan DNS.

### 7. Environment & authentication

Ini penting.

Audit seluruh configuration yang berkaitan dengan:

* API base URL;
* public URL;
* authentication;
* session;
* cookies;
* cookie domain;
* trusted origins;
* CORS;
* CSRF/origin;
* OAuth/redirect jika ada;
* WebSocket origin jika ada.

Tentukan apakah hostname:

`customer.kalibrasimedika.co.id`

memerlukan perubahan environment/configuration pada tech-pwa atau service lain.

Jangan expose secret.

### 8. Security / isolation

Pastikan rekomendasi tidak membuat customer surface mendapatkan akses yang tidak perlu terhadap:

* PostgreSQL;
* internal API;
* host filesystem;
* service lain;
* Docker socket;
* privileged capability.

Audit apakah `tech-pwa` cukup sebagai isolated frontend/service dan hanya mendapatkan akses network yang memang dibutuhkan.

### 9. Existing production safety

Semua rekomendasi harus mempertahankan service production existing:

```text
medcal-api
medcal-web-api
medcal-web
medcal-portal
```

Jangan mengasumsikan port `3000` tersedia.

Jangan mengubah topology existing hanya demi memasukkan `tech-pwa`.

---

# OUTPUT YANG SAYA INGINKAN

Buat **satu audit report** yang ringkas tetapi konkret.

Gunakan struktur berikut:

## 1. Executive Summary

Jelaskan kondisi `apps/tech-pwa` saat ini dan apakah secara umum siap menuju containerization.

## 2. Current Tech PWA Architecture

Jelaskan berdasarkan repository:

* framework;
* build;
* runtime;
* dependencies;
* environment;
* API/auth relationship.

## 3. Docker Readiness

Berikan:

```text
READY / PARTIAL / NOT READY
```

Lalu jelaskan evidence-nya.

Jika ada Dockerfile/config existing, sebutkan file dan apakah usable.

## 4. Production Topology Recommendation

Gambarkan topology yang direkomendasikan:

```text
Internet
   |
customer.kalibrasimedika.co.id
   |
 Nginx
   |
 host port
   |
medcal-tech-pwa
   |
apps/tech-pwa
```

Sesuaikan diagram dengan hasil audit sebenarnya.

## 5. Required Repository Changes

Pisahkan:

* Dockerfile;
* Compose;
* environment;
* application config;
* authentication/origin;
* dependency/package changes.

Jangan mengubah apa pun.

## 6. Required VPS Changes

Pisahkan:

* Docker/Compose;
* Nginx;
* SSL;
* DNS;
* firewall/port jika memang relevan.

## 7. Security / Isolation Findings

Sebutkan risiko atau requirement security yang ditemukan.

## 8. Findings

Gunakan kategori:

```text
BLOCKER
REQUIRED
RECOMMENDED
NO ACTION
```

Hanya masukkan sesuatu ke kategori jika ada evidence dari audit.

## 9. Implementation Sequence

Berikan urutan implementasi yang aman setelah audit selesai.

Pisahkan minimal:

```text
Repository
VPS
DNS
SSL
Deployment
Validation
Rollback
```

## 10. Final Verdict

Jawab secara eksplisit:

```text
READY FOR CONTAINERIZATION
```

atau

```text
NOT READY FOR CONTAINERIZATION
```

Jika `NOT READY`, sebutkan blocker konkret yang harus dibereskan terlebih dahulu.

---

# IMPORTANT CONSTRAINTS

Ini **AUDIT ONLY**.

Jangan:

* edit source code;
* edit `package.json`;
* membuat Dockerfile;
* mengubah `docker-compose.prod.yml`;
* mengubah Nginx production;
* menjalankan Certbot;
* mengubah DNS;
* restart/rebuild production;
* menjalankan database migration;
* membuat perubahan destructive apa pun.

Jangan berhenti hanya karena menemukan satu gap. Audit sampai seluruh jalur:

```text
Repository
→ Build
→ Docker
→ Compose
→ Network
→ Nginx
→ DNS
→ SSL
→ Authentication
→ Runtime
```

sudah diperiksa.

Yang saya butuhkan dari audit ini bukan sekadar daftar file, tetapi **gambaran nyata tentang apa yang sudah siap, apa yang belum, kenapa belum, dan urutan perubahan yang aman untuk membawa `tech-pwa` ke production sebagai `customer.kalibrasimedika.co.id`.**

```


