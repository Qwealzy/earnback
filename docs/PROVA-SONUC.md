# Earnback — testnet provası sonuçları

Ortam: Arc Testnet (5042002), kasa `0xfa5e10d370140acbdfe977437be6742908449b39`, yerel arayüz (UI-FIX-3 uygulanmış). Doğrulama: `arc-testleri/oku.sh <id>` ve `arc-testleri/bakiye.sh`, yedek RPC `rpc.drpc.testnet.arc.io` (ana RPC bu IP'ye rate limit verdi).

Hesaplar (aynı kişinin dört cüzdanı):

| Rol | Adres |
|---|---|
| E İşveren | `0x451eB23355E37Eb4F8CA21778f0c68D467E93912` |
| Y Yüklenici | `0x6bc18be75bFF8a9fd4636E006d520f8F5a491d9A` |
| T Taşeron | `0x51f83314748aacb4479043ad46b6f2Ffa4c6a5c6` |
| H Hakem | `0xB77aD296072f6c2ff915DBB378F5c21ACCCf4E6e` |

Başlangıç bakiyeleri (17 Ekim, faucet sonrası): E 5,000000 · Y 4,998110 · T 5,000000 · H 5,000000 USDC.

## S1 — Mutlu yol (inşaat), anlaşma #0 ✅

| Adım | Zincirde okunan [RUN] |
|---|---|
| E oluşturur | payer E, payee Y, hakem yok, 1 USDC, maxBps 500, minBps 100, 120/60/60 sn, Proposed |
| Y kabul eder | Active, retentionBps **500** (yeni yüklenici → tavan) |
| E öder 0,5 + 0,5 | paid 1,000000; retained 0,050000; Y withdrawable 0,950000; totalHeld 1,000000 |
| Geçici kabul (Y ister, E imzalar) | DefectPeriod; releasedToPayee 0,025000; Y withdrawable 0,975000 |
| Finalize + Y withdraw | Closed; releasedToPayee 0,050000; pool 0; totalHeld 0; **record(Y) = (1, 0)** |

Son bakiyeler: E 3,976937 (1 USDC iş + ~0,023 gas, 7 işlem) · Y 5,990825 (+1 USDC − ~0,007 gas, 3 işlem).

## S2 — Taşeron zinciri, anlaşma #1 ✅

Y payer, T payee, 0,5 USDC, hakem yok. [RUN] Closed; retentionBps 500; paid 0,500000; retained 0,025000, tamamı T'ye (releasedToPayee 0,025000); pool 0; totalHeld 0; **record(T) = (1, 0)**. Y'nin sicili değişmedi (payer rolündeydi).

Bakiyeler: Y 5,472566 · T 5,492714.

## S3 — Talep kabul

- **Anlaşma #2 (ilk deneme):** geçici kabulde E geç imzaladı, talep 0,1 USDC girildi (available 0,0125) ve iki kez `ExceedsPool` ile revert etti; süre doldu. Finalize edildi: talepsiz kapandı, kalan T'ye; **record(T) = (2, 0)**. Ders: talep süresi için garanti 600 sn.
- **Anlaşma #3 ✅:** E → T, 0,5 USDC, garanti 600 sn. [RUN] Closed; talep 0,001 USDC, T kabul etti, `upheld = true`, awardedToPayer 0,001000; **record(T) = (3, 1)**.
  - **Aktüerya zincirde doğrulandı:** T'nin kabul anındaki sicili (2, 0) iken `retentionBps = 364`. Referans `kesinti_orani.py` (demo önseli Beta(0,4; 4,6), z = 1, tavan 500, taban 100) aynı sicil için **364** veriyor; birebir aynı. T'nin yeni sicili (3, 1) için referans oran 500 (tavana dönüş).
- Çekilmemiş bakiyeler (provanın sonunda çekilecek): E 0,001000 · T 0,999000; totalHeld 1,000000 = bu ikisinin toplamı.

## S5 — Sessizlik, anlaşma #4 ✅

E → T, hakem H, 0,5 USDC, garanti 600 sn, cevap 60 sn, hakem 120 sn. S4 olarak başladı; T 60 sn içinde cevap veremedi, S5'e dönüştü. [RUN] T'nin sicili (3, 1) iken `retentionBps = 500` (referans 500, tavana dönüş doğrulandı). Talep 0,01 → cevap süresi doldu → `resolveUnanswered` → awardedToPayer 0,010000, `upheld = true` (D2) → Finalize: releasedToPayee 0,015000; **record(T) = (4, 2)**.

Çekilmemiş: E 0,011000 · T 1,489000; totalHeld 1,500000.

## S4 — İtiraz + hakem, anlaşma #5 ✅

E → T, hakem H, 0,5 USDC, garanti 600 sn, cevap 60 sn, hakem 120 sn. [RUN] retentionBps 500 (record(T) (4, 2) → referans 500). Talep 0,01 → T reddetti → H `arbiterDecide` ile 0,005 payer'a → awardedToPayer 0,005000, `upheld = true` → Finalize: releasedToPayee 0,020000 (geri dönen 0,005 dahil); **record(T) = (5, 3)**.

Bakiyeler (18 Ekim): E 1,893065 (+0,016 çekilmemiş) · Y 5,472566 · T 5,459469 (+1,984 çekilmemiş) · H 4,997300 (1 işlem gas'ı). totalHeld 2,000000.

## S6 — Hakem susar, anlaşma #6 ✅

E → T, hakem H, 0,5 USDC, garanti 600, cevap 180, hakem 120 sn. [RUN] retentionBps 500 (record(T) (5, 3) → referans 500). Talep 0,01 → T reddetti → H sustu → `resolveByDefault` → awardedToPayer **0**, `upheld = false` (D1: tutar havuza, yükleniciye) → Finalize: releasedToPayee 0,025000 (teminatın tamamı); **record(T) = (6, 3)**: n arttı, k artmadı.

Çekilmemiş: E 0,016000 · T 2,484000; totalHeld 2,500000.

## S8 — Yazılım işi + sayılmış geçici kabul (D10), anlaşma #7 ✅

E → Y, 0,5 USDC, hakem yok, garanti 120, cevap 60 sn. [RUN] Y'nin sicili (1, 0) iken `retentionBps = 421` (referans **421**). Y geçici kabul istedi, E imzalamadı (`payerSigned = false`), süre dolunca `resolveProvisional` → sayılmış kabul → Finalize: Closed, releasedToPayee 0,021050 (teminatın tamamı); **record(Y) = (2, 0)**.

## S7 — Aktüerya karşılaştırması (işlemsiz) ✅

[RUN] Zincirdeki `rateFor(payee, maxBps)` ile referans `kesinti_orani.py` (demo önseli, z = 1, taban 100):

| Hesap | Sicil (n, k) | Zincir, tavan 500 | Referans | Zincir, tavan 1000 | Referans |
|---|---|---|---|---|---|
| Y | (2, 0) temiz | **364** | 364 | 729 | 729 |
| T | (6, 3) talepli | 500 | 500 | 1000 | 1000 |
| H | (0, 0) yeni | 500 | 500 | 1000 | 1000 |

Prova boyunca kabul anında dondurulan oranlar da referansla aynı: #3 T (2, 0) → 364, #4–#6 T → 500, #7 Y (1, 0) → 421. Temiz sicilli Y aynı işte %3,64 öderken yeni gelen H ve talepli T %5 öder; 100 USDC'lik işte Y'nin kasada daha az bekleyen sermayesi 1,36 USDC.

## Kapanış: çekimler ve kasa ✅

İlk denemede çekimler zincire ulaşmadı (explorer'da withdraw yok; kontrat simülasyonu başarılı, sorun MetaMask onayında). Tekrar denendi [RUN]:

| Hesap | Çekim tx | Durum |
|---|---|---|
| Y | `0xea38686ade7f21dfca56415b3e1ae2166db49d2c0198e4dc9981fb92dd52759c` | success, 0,500000 |
| E | `0xed671cd10892f15ca02a0c2b6a3ec651247610c981805c468f2807bf652010c6` | success, 0,016000 |
| T | `0xb05710b90ed1d5d3743f65c12210e33f81d684f5d536583a3bcd8dac3e8e018c` | success, 2,484000 |

**Kasa:** `totalHeld = 0`, kasanın USDC bakiyesi 0. Anlaşma #0–#7'nin hepsi Closed. Kilitli tutar yok.

**Son bakiyeler:** E 0,874976 · Y 5,960395 · T 7,930951 · H 4,997300. Toplam 19,998110 → 19,763622; provanın toplam gas maliyeti **0,234488 USDC** (8 anlaşma, ~70 işlem; 2 revert dahil).

## Özet

- 8 anlaşmayla S1–S8'in hepsi testnet'te arayüzden uçtan uca yapıldı; her sonuç zincirden okundu.
- **Kontrat davranışı tasarımla birebir:** sessizlik kabul (D2), hakem susarsa yükleniciye (D1), sayılmış geçici kabul (D10), pull-payment, `totalHeld` muhasebesi.
- **Aktüerya zincirde doğrulandı:** dondurulan oranlar (364, 421, 500) ve `rateFor` sonuçları referans `kesinti_orani.py` ile birebir.
- **Kontratta hata bulunmadı.** Bulunan 10 kusurun hepsi arayüzde; 6'sı yerelde düzeltildi, 4'ü Studio'ya gidecek.

## Provada bulunan arayüz kusurları

| # | Kusur | Durum |
|---|---|---|
| 1 | Anlaşma listesi boş: tarama sonucu sayfa açılışında önbelleğe alınıyor, yeni anlaşma görünmüyor; tarama ana RPC'nin rate limit'ine takılıyor | Açık (Studio'ya) |
| 2 | `vaultScanner` `ProgressPaid` olayını yanlış imzayla arıyor (`address indexed payer` yok, `cut` var) → kanıt sayfasında toplam ödenen hep 0 | Açık (Studio'ya) |
| 3 | Form önizlemesindeki "Credibility Z" kutusu Z yerine önsel ortalamayı (0,08) gösteriyor | Yerelde düzeltildi: yeni yüklenicide Z = 0 |
| 4 | Approve onaylanınca tutar alanı siliniyor | Yerelde düzeltildi (UI-FIX-3 eki) |
| 5 | Pay Progress, izin verilmeden de basılabiliyor | Yerelde düzeltildi: izin yetmiyorsa yalnız Approve, yetiyorsa yalnız Pay görünür |
| 7 | Talep tutarı kullanılabilir teminatla karşılaştırılmıyor; 0,1 USDC talep (available 0,0125) zincirde `ExceedsPool` ile iki kez revert etti, gas boşa gitti (tx `0xcf74…a4`, `0x76b8…fe`; `arc-testleri/neden.sh` ile çözüldü). Form "en fazla X" göstermeli ve aşınca göndermemeli | Yerelde düzeltildi: alan en fazla tutarı gösteriyor, aşan talep gönderilmiyor |
| 8 | Arayüz yalnız ana RPC'yi (`rpc.testnet.arc.io`) kullanıyor; prova sırasında anlaşma oluştururken "rate limit" alındı | Yerelde: okumalar resmi yedek RPC'lerden (dRPC, QuickNode, sonra ana) `fallback` ile. Studio'ya: aynı fallback, mainnet için de |
| 9 | **`utils/rateCalc.ts` (BigInt replica) kontratın formülünü taklit etmiyordu**: Studio farklı bir "kredi" formülü yazmış, sicil sayılarını WAD'a çevirmeden önsele ekliyordu. Sicilsiz yüklenicide tesadüfen doğru (%5), sicillide yanlış: `/record/Y` (2, 0) için zincir 364, replica 500. Grafik ve form önizlemesi de bu kodu kullanıyor | Yerelde düzeltildi: kontratın `pUpper`/`rateFor` tamsayı matematiği adım adım (floor sqrt); 13 fikstürde Python referansıyla birebir [RUN] `bun run rateCalc.check.ts` → ALL MATCH |
| 10 | Form önizlemesi her zaman "yeni yüklenici (n = 0)" oranını gösteriyor; girilen payee'nin sicilini kullanmıyor (tasarım §12: önerilen oran ve sicil canlı gösterilmeli) | Açık (Studio'ya) |
| 6 | Kanıt ve itiraz alanına yazılan metin hash'lenmiyor, ham bayt olarak zincire yazılıyor (32 baytta kesiliyor, metin herkese açık). Tasarım §6: zincire yalnız özet (hash) yazılmalı | Açık (Studio'ya): metin girilirse keccak256 alınmalı |
