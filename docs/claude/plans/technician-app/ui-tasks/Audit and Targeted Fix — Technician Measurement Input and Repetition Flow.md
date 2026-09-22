# Task: Audit & Targeted Fix — Technician Measurement Input and Repetition Flow

Context:
Saya sedang melakukan input hasil kalibrasi pada tech-pwa untuk device BSM.

Ditemukan 3 behavior/UX issue:

1. Measurement result harus dapat menerima:
   - nilai desimal seperti `0.6`
   - nilai desimal lainnya seperti `225.3`
   - hasil non-numeric / karakter seperti `OR`
   
   Contoh actual calibration result:
   - Resistansi pembumian protektif → `0,220`
   - Resistansi Isolasi → `OR`
   - Arus bocor peralatan → `0,6`

2. Klik "Simpan pembacaan" TIDAK boleh otomatis membuat repetition/pengulangan baru.

3. Button `+ Tambah pengulangan` tetap dipertahankan.
   Button `- Hapus pengulangan` TIDAK perlu ditambahkan untuk saat ini.
   Jika user membuat repetition baru tetapi tidak mengisinya, empty repetition tidak boleh dianggap sebagai actual measurement dan tidak perlu dipersist/ditampilkan setelah page ditutup/reload.

## IMPORTANT: AUDIT FIRST

Jangan langsung mengubah implementation.

Audit terlebih dahulu existing flow secara end-to-end:

- measurement input UI
- input type / component
- local/form state
- client-side validation
- save measurement handler
- repetition creation logic
- API/query hook yang digunakan
- request/response payload
- backend validation/schema jika relevan
- persistence model/database jika relevan
- tolerance evaluation / conformity calculation
- reload/read-back flow
- rendering repetition setelah reload
- tests yang sudah ada

Tujuan audit adalah menemukan ROOT CAUSE, bukan hanya memperbaiki symptom di UI.

Cari khususnya:

A. Mengapa `0.6` bisa bermasalah?
   - Apakah karena input type `number`?
   - step/min validation?
   - parsing?
   - schema?
   - serialization?
   - atau layer lain?

B. Mengapa karakter seperti `OR` tidak dapat diterima?
   - Apakah measurement result secara konseptual memang disimpan sebagai numeric?
   - Apakah API/database/schema memaksa numeric?
   - Apakah hanya UI yang membatasi?
   - Jangan mengubah data model hanya karena UI terlihat numeric sebelum memastikan existing domain model.

C. Mengapa klik "Simpan pembacaan" membuat repetition baru?
   - Temukan exact handler/state transition yang menyebabkan ini.
   - Pastikan save dan "Tambah pengulangan" menjadi dua action yang terpisah.

D. Bagaimana empty repetition diperlakukan saat:
   - save
   - submit/finalize
   - reload
   - validation
   - rendering

## DOMAIN/UX RULE YANG HARUS DICAPAI

Measurement result harus diperlakukan sebagai "hasil pembacaan", bukan semata-mata angka.

Contoh valid:
- `225.3`
- `0.6`
- `0,6` jika existing locale/input normalization memang mendukungnya
- `OR`

Untuk hasil numeric:
- tolerance/conformity evaluation tetap bekerja seperti existing behavior.

Untuk hasil non-numeric seperti `OR`:
- jangan otomatis mengubahnya menjadi NaN lalu dianggap "Tidak sesuai".
- jangan membuat asumsi baru mengenai arti `OR`.
- pertahankan/ikuti existing domain semantics jika sudah ada.
- Jika existing system belum memiliki semantics untuk non-numeric result, dokumentasikan temuan tersebut dan lakukan perubahan minimum yang diperlukan agar value dapat disimpan tanpa merusak evaluation flow.

Jangan membuat business rule baru untuk arti `OR` tanpa evidence dari existing code/domain.

## REPETITION RULE

Behavior yang diinginkan:

Initial:
    Reading 1
    [ input ]

    + Tambah pengulangan

Setelah "Simpan pembacaan":
    Reading 1
    [ saved value ]

    + Tambah pengulangan

JANGAN otomatis menjadi:
    Reading 1
    Reading 2 [ empty ]

Jika technician memang ingin melakukan pembacaan kedua:
    technician secara eksplisit klik `+ Tambah pengulangan`

Setelah itu:
    Reading 1
    [ 225.3 ]

    Reading 2
    [ empty ]

    + Tambah pengulangan

Jika Reading 2 tetap kosong:
- jangan anggap sebagai actual measurement
- jangan menyebabkan validation error hanya karena slot kosong yang belum digunakan
- jangan persist sebagai actual result
- setelah reload, empty unused repetition tidak perlu ditampilkan

Namun hati-hati:
Jika existing business rule memang membutuhkan minimal satu reading, pertahankan rule tersebut.
Yang harus dihilangkan adalah automatic creation/persistence of a new repetition sebagai side effect dari Save.

## BUTTON `-` REPETITION

Jangan implement button `- Hapus pengulangan`.

Tidak diperlukan untuk task ini.

Empty unused repetition cukup dianggap sebagai transient UI state dan tidak perlu dipersist.

## IMPLEMENTATION SCOPE

Setelah audit, implementasikan hanya perubahan yang memang diperlukan untuk memenuhi behavior di atas.

Prioritas:

1. Fix measurement input agar menerima decimal termasuk `0.x`.
2. Fix agar valid non-numeric measurement result seperti `OR` dapat diterima jika existing domain/data contract memungkinkan.
3. Pisahkan action "Simpan pembacaan" dari "Tambah pengulangan".
4. Pastikan empty unused repetition tidak dipersist/ditampilkan sebagai actual measurement.
5. Jangan menambahkan `- Hapus pengulangan`.
6. Jangan melakukan refactor besar atau perubahan unrelated.

## IMPORTANT ABOUT NUMERIC EVALUATION

Jangan menghilangkan existing numeric tolerance evaluation hanya karena input sekarang dapat berupa string.

Ideal behavior:

    raw measurement result
           |
           +--> numeric value --> existing numeric tolerance evaluation
           |
           +--> non-numeric value --> preserve/display/store according to domain semantics

Jangan melakukan blind `parseFloat()` terhadap semua result dan menganggap gagal parse = "Tidak sesuai".

## TESTING

Audit existing tests terlebih dahulu.

Tambahkan/update tests yang memang diperlukan untuk membuktikan:

1. `0.6` dapat diinput dan disimpan.
2. `225.3` tetap dapat diinput dan disimpan.
3. `OR` dapat diterima/disimpan jika data contract existing mendukungnya.
4. Numeric result tetap dievaluasi terhadap tolerance seperti sebelumnya.
5. Save reading tidak membuat repetition baru.
6. Explicit `+ Tambah pengulangan` membuat repetition baru.
7. Empty unused repetition tidak dipersist sebagai actual measurement.
8. Reload tidak menampilkan empty unused repetition sebagai actual measurement.
9. Existing measurement flow/regression tetap aman.

Gunakan test pattern/framework yang sudah dipakai project.
Jangan menambahkan framework testing baru.

## BACKEND / API CHANGES

Jangan mengubah backend/API/database hanya untuk membuat UI terlihat bekerja.

Tetapi jika audit membuktikan bahwa current API/schema memang secara fundamental melarang valid measurement result seperti `OR`, maka:

- dokumentasikan root cause terlebih dahulu
- lakukan perubahan minimum yang diperlukan agar domain dapat menyimpan actual measurement result
- audit impact ke endpoint, validation, persistence, reporting, dan existing consumers
- jangan melakukan migration/refactor besar tanpa kebutuhan yang terbukti

Jika existing backend sebenarnya sudah mampu menyimpan string tetapi UI yang membatasi, cukup fix UI/client-side flow.

## DELIVERABLE

Sebelum coding, berikan audit singkat:

### Audit Findings
- Current measurement input flow:
- Root cause decimal issue:
- Root cause non-numeric issue:
- Root cause automatic repetition:
- Empty repetition persistence behavior:
- Relevant files/components:
- API/backend impact:

### Implementation Plan
Daftar perubahan minimum yang akan dilakukan.

Setelah itu implementasikan.

### Final Report
Berikan:
- files changed
- exact behavior changes
- tests added/updated
- test result
- apakah ada backend/API/schema change
- regression risks / remaining concerns

Jangan mengubah unrelated functionality.

Jangan menganggap requirement di atas sebagai alasan untuk melakukan broad refactor.
Tujuannya adalah targeted fix terhadap existing measurement flow.