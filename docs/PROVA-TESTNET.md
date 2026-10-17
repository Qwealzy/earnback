# Earnback — testnet provası (tek kişi, 4 hesap)

Amaç: mainnet'ten önce S1–S8 akışlarını arayüzden uçtan uca denemek ve hataları arkadaşların vakti gitmeden bulmak. **Ortam: Arc Testnet (chain 5042002), test USDC. Gerçek para yok.**

Kontrat: `0xfa5e10d370140acbdfe977437be6742908449b39` (D10'lu sürüm). Zincirden okunan ayarlar (17 Ekim, `arc-cast call`):

| Ayar | Değer |
|---|---|
| `capBps` / `floorBps` | 1000 (%10) / 100 (%1) |
| `maxAgreementValue` | 50 USDC |
| `maxTotalHeld` | 500 USDC |
| `minRecordValue` | 0,5 USDC (sicile sayılması için en az iş bedeli) |
| Süre sınırları | `defectPeriod` ≥ 60 sn; `responseWindow`, `arbiterWindow` 60 sn – 30 gün |

## 1. Kurulum (bir kez)

1. **MetaMask'ta 4 hesap:** `E` İşveren, `Y` Yüklenici, `T` Taşeron, `H` Hakem. Hesap adlarını böyle koy; karışmasın.
2. **Ağ:** Arayüzdeki "Connect Wallet" ağı eklemeyi önerir. Elle eklemek gerekirse:
   - Ad: Arc Testnet · RPC: `https://rpc.testnet.arc.io` · Chain ID: `5042002` · Sembol: `USDC` · Explorer: `https://explorer.testnet.arc.io`
   - Gas USDC ile ödenir; her hesapta biraz USDC olmalı.
3. **Test USDC:** `https://faucet.circle.com` → ağ "Arc Testnet" → her hesabın adresini ayrı ayrı yapıştır. 17 Ekim'de faucet her hesaba 5 USDC verdi; tutarlar buna göre ayarlandı (E'nin toplam harcaması ≈ 4,2 USDC + gas).
4. **Arayüz:** Claude yerelde açar (`http://localhost:5173`, WSL'deki kopya). Bu kopyada **UI-FIX-3** var: anlaşma düğmeleri kontratın durumlarıyla eşleşiyor ve **Withdraw** düğmesi eklendi. Studio önizlemesinde bu düzeltme henüz yok; orada prova yapılamaz.

## 2. Her anlaşmanın temel akışı

| Adım | Kim | Arayüzde |
|---|---|---|
| 1 | E | Anlaşmalar → yeni anlaşma: payee, (isteğe bağlı) arbiter, bedel, maxBps, minBps, süreler → **Create** |
| 2 | Y | Anlaşma sayfası → **Accept Agreement** (oran bu anda dondurulur) |
| 3 | E | Tutarı yaz → **Approve (exact)** → **Pay Progress** |
| 4 | Y, sonra E | Y: **Request Provisional Acceptance**, E: **Sign Provisional Acceptance** (yarısı serbest kalır, garanti süresi başlar) |
| 5 | herkes | Süre dolunca **Finalize** (kalan yükleniciye, sicil güncellenir). Düğme süre dolunca kendiliğinden çıkar |
| 6 | Y (ve parası olan herkes) | **Withdraw** |

**Prova süreleri** (beklemeyi kısaltmak için): garanti 120 sn, cevap ve hakem pencereleri 60 sn. Hesap değiştirince sayfayı yenile.

## 3. Senaryolar

Sicil sırası önemli: **Y yalnız temiz işler yapar, talepler T'ye açılır.** Böylece S7'de temiz sicil ile talepli sicil yan yana görünür.

| # | Senaryo | Roller | Ne yapılır | Beklenen |
|---|---|---|---|---|
| S1 | Mutlu yol (inşaat) | E → Y, 1 USDC, iki ödeme 0,5 + 0,5 | Temel akış | Kesinti %5 (maxBps 500, yeni yüklenici). Geçici kabulde yarısı, finalize'da kalanı Y'ye. Y'nin sicili n = 1 |
| S2 | Taşeron zinciri | Y → T, 0,5 USDC | Temel akış, **Y payer rolünde** | T'nin sicili n = 1, k = 0 |
| S3 | Talep kabul | E → T, 0,5 USDC | Garanti süresinde E talep açar (0,01), T **Accept Claim** | 0,01 E'ye; T'de k = 1 (finalize sonrası) |
| S4 | İtiraz + hakem | E → T, hakem H, 0,5 USDC | Talep 0,01 → T **Reject Claim** → H **Decide** ile 0,005 E'ye karar verir | 0,005 E'ye, kalanı havuza; k artar |
| S5 | Sessizlik | E → T, 0,5 USDC | Talep 0,01 → T cevap vermez → 60 sn sonra herkes **Resolve Unanswered** | 0,01 E'ye (D2) |
| S6 | Hakem susar | E → T, hakem H, 0,5 USDC | Talep 0,01 → T Reject → H susar → 60 sn sonra **Resolve By Default** | Tutar havuza, yani T'ye döner (D1); k artmaz |
| S8 | Yazılım işi + D10 | E → Y, 0,5 USDC | Temel akış ama **E geçici kabulü imzalamaz**; 60 sn sonra **Resolve Provisional (deemed accepted)** | Sayılmış kabul (D10); finalize sonrası Y'nin sicili n = 2 |
| S1b | Üçüncü temiz iş | E → Y, 0,5 USDC | Temel akış | Y'nin sicili n = 3, k = 0 |
| S7 | Aktüerya | E → Y ve E → H, maxBps 500 | Y için ve hiç işi olmayan H için **yeni anlaşma formu**; kabul edip birer küçük ödeme | Y'nin oranı **%3,21** (321 bps), H'nin **%5**; T'nin (talepli) oranı tavana yakın. `/record/<adres>` sayfalarında zincir oranı = yerel hesap |

S7'deki 321 bps, `araclar/kesinti_orani.py`'nin demo önseli Beta(0,4; 4,6) ile n = 3, k = 0 için verdiği değerdir (tavan 500, taban 100).

## 4. Her adımda kaydet

Her işlem için tx hash'ini `docs/PROVA-SONUC.md`'ye (Claude oluşturur) senaryo ve adım adıyla yaz ya da Claude'a söyle. Beklenmeyen her şeyi (hata mesajı, yanlış rakam, takılan buton) ekran görüntüsüyle not et.

## 5. Bitti sayılması için

- S1–S8'in her adımı arayüzden yapıldı; her tx explorer'da `status 1`.
- `/proof` sayfası senaryoları ve `totalHeld`'i doğru gösteriyor.
- `/record` sayfalarında Y, T ve H için zincir oranı yerel hesapla aynı.
- Kilitli tutar kalmadı: bütün anlaşmalar `Closed`, bütün hesaplar `Withdraw` yaptı.
- Bulunan hatalar bir sonraki Studio turu için listelendi.
