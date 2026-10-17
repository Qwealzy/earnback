# Hakediş Teminat Kasası: tasarım belgesi (v1)

Taslak: 2026-10-16. Durum: **D1, D2, D5, D9 kararlaştırıldı (16 Ekim); D7 ürün adı **Earnback** (17 Ekim); D3, D4, D6, D8 öneriyle ilerliyor.** Ayrıntı §15'te.
- Dayanaklar: `context/notes/34` (retention verisi), `36` (ikinci sektör), `ZORUNLU-SARTLAR.md`, `notes/23` (güvenlik), `notes/24` (UX).
- Aktüeryal hesabın referansı: `araclar/kesinti_orani.py` (testleri: `araclar/test_kesinti_orani.py`).

---

## 0. Özet
Bir işin bedelinden kesilen garanti payı (retention / holdback), işi yaptıran tarafta değil **tarafsız bir kontratta** durur.
- Geçici kabulde yarısı, garanti (kusur sorumluluk) süresi bitince kalanı **kendiliğinden** işi yapana gider.
- Süre içinde işi yaptıran imzalı bir kusur talebi açabilir. Talep itiraz penceresi ve isteğe bağlı bir hakemle çözülür.
- **Kesinti oranı** işi yapanın bu kontrattaki siciline göre aktüeryal olarak hesaplanır: yeni yüklenici tavanı öder, temiz sicil kesintiyi düşürür.

Sektörden bağımsız bir kontrat. Demoda iki senaryo var: inşaat (işveren → yüklenici → taşeron) ve sınır ötesi yazılım işi.

**v1 kapsamı:** tek kontrat ve kontrat içi aktüeryal hesap.
- Taşeron zinciri yeni bir mekanizmayla değil, **bileşimle** kuruluyor: yüklenici, taşeronla yaptığı anlaşmada işveren rolündedir.

**v1'de olmayanlar (sonraki adımlar):**
- Teminata karşı avans
- Çok seviyeli otomatik zincir
- ERC-8183 ajan işleri uzantısı
- Aynı anda birden çok kusur talebi

## 1. Roller
| Rol | Kodda | Ne yapar |
|---|---|---|
| İşveren | `payer` | Anlaşmayı önerir, hakediş öder, geçici kabulü imzalar, kusur talebi açar |
| Yüklenici | `payee` | Anlaşmayı kabul eder, geçici kabulü imzalar, talebe cevap verir, parasını çeker |
| Hakem (isteğe bağlı) | `arbiter` | Yalnızca itiraz edilmiş bir talepte, talep tutarını işveren ile yüklenici arasında böler. Parayı başka bir adrese gönderemez |
| Herkes | — | Süresi dolmuş adımları tetikleyebilir (`finalize`, `resolveUnanswered`, `resolveByDefault`). Kimse beklemek zorunda kalmaz, zincirde cron yok |

**Kontrat seviyesinde owner ya da admin yok.** Parametreler constructor'da sabitlenir (G2, G3). Owner olmadığı için Studio'nun factory ile deploy ettiğinde ortaya çıkan owner tuzağı bu kontratı etkilemez.

## 2. Parametreler
**Kontrat geneli (constructor, değişmez):**
- `usdc`: Arc USDC ERC-20 adresi (`0x3600…0000`, 6 ondalık). Kontrat `payable` değil ve `receive` fonksiyonu yok (T5).
- `priorA`, `priorB` (WAD): önsel Beta. Üretim önerisi (1,0; 11,5), demo önerisi (0,4; 4,6). Kararı §15'te.
- `zWad`: ihtiyat katsayısı (öneri 1,0).
- `capBps`: kontrat geneli kesinti tavanı (öneri 1000 = %10). Bir anlaşmanın tavanı bundan büyük olamaz.
- `floorBps`: alt sınır (öneri 100 = %1).
- `maxAgreementValue`: anlaşma başına üst tutar (öneri 50 USDC).
- `maxTotalHeld`: kontratta tutulabilecek toplam (öneri 500 USDC). "Capped while unaudited" (G4).
- `minRecordValue`: sicile sayılacak en küçük anlaşma tutarı (öneri 0,5 USDC); sybil işlerini pahalı kılmak için.

**Anlaşma başına** (öneriyle girilir, kabulle dondurulur):
- `payee`, `arbiter` (sıfır adres olabilir; payer ya da payee olamaz)
- `contractValue`: toplam iş bedeli; bu tutardan fazla hakediş ödenemez
- `maxBps`: sözleşmedeki kesinti tavanı, en fazla `capBps`
- `minBps`: işverenin kabul edeceği en düşük oran (sybil koruması, §4)
- `defectPeriod`: kusur sorumluluk süresi; 60 saniye ile 730 gün arası (demoda dakikalar)
- `responseWindow`, `arbiterWindow`: 60 saniye ile 30 gün arası

## 3. Durum makinesi
```
Proposed --accept--> Active --(iki imza)--> DefectPeriod --finalize--> Closed
   |                   |                        |
 cancel             payProgress             openClaim -> ClaimOpen -> (accept | silence)      -> DefectPeriod
   v                                                          |-> reject -> Disputed -> (arbiter | default) -> DefectPeriod
 Cancelled
```

| Fonksiyon | Kim | Ne zaman | Etki |
|---|---|---|---|
| `createAgreement(...)` | payer | — | `Proposed`; parametreler kaydedilir |
| `cancelProposal(id)` | payer | `Proposed` | `Cancelled` |
| `acceptAgreement(id)` | payee | `Proposed` | Oran hesaplanır ve **dondurulur**: `retentionBps = min(maxBps, max(minBps, aktüeryalOran(payee)))`. Durum `Active` olur |
| `payProgress(id, amount, ref)` | payer | `Active` | Kontrat `transferFrom` ile `amount` kadarını çeker; payee'nin çekilebilir bakiyesine `amount − kesinti` eklenir, kesinti havuza girer. Toplam ödeme `contractValue`'yu aşamaz |
| `signProvisional(id)` | payer, payee | `Active` | İki imza tamamlanınca havuzdaki kesintinin yarısı serbest kalır, `defectEnd = now + defectPeriod` olur ve durum `DefectPeriod`'a geçer |
| `openClaim(id, amount, evidenceHash)` | payer | `DefectPeriod`, `now < defectEnd`, açık talep yok | `amount ≤ kullanılabilir havuz` şartıyla tutar kilitlenir; `responseDeadline` başlar |
| `respondClaim(id, accept)` | payee | `now ≤ responseDeadline` | Kabul: tutar payer'a. Ret: `Disputed`, `arbiterDeadline` başlar |
| `resolveUnanswered(id)` | herkes | `now > responseDeadline`, cevap yok | **Sessizlik kabul sayılır**; tutar payer'a (karar D2) |
| `arbiterDecide(id, payerShare)` | arbiter | `Disputed`, `now ≤ arbiterDeadline` | `payerShare ≤ amount` payer'a, kalanı havuza (yükleniciye) döner |
| `resolveByDefault(id)` | herkes | `Disputed`, `now > arbiterDeadline` ya da hakem yok | **Varsayılan kural** (karar D1; öneri: tutar havuza, yani yükleniciye döner) |
| `finalize(id)` | herkes | `now ≥ defectEnd`, açık talep yok | Kalan havuz payee'ye gider, durum `Closed` olur, sicil güncellenir |
| `withdraw()` | herkes | — | Çağıranın çekilebilir bakiyesini gönderir (pull-payment, T6) |

**Geçici kabul zaman aşımı (D10):** Yüklenici imzalayınca `Requested` durumuna geçilir ve `provisionalDeadline` başlar. İşverenin seçenekleri:
- İmzalamak.
- `objectProvisional` ile gerekçeli itiraz etmek. İtiraz hakeme gider; hakem susarsa ya da hakem yoksa kabul sayılır.

İşveren hiçbir şey yapmazsa `resolveProvisional` ile kabul sayılır. Hakem açıkça reddederse yüklenici daha sonra yeniden talep edebilir.

**Sınır kuralları** (off-by-one hatalarına karşı, L13):
- Talep `now < defectEnd` iken açılabilir.
- Finalize `now ≥ defectEnd` iken yapılabilir.
- Cevap ve hakem kararı son saniye dahil geçerlidir (`≤`). Bu sınırlar testlerde tek tek denenir.

## 4. Aktüeryal kesinti oranı (deneyim çarpanı)
Yüklenicinin bu kontrattaki sicili:
- **n:** kapanmış anlaşma sayısı
- **k:** en az bir talebi haklı çıkmış anlaşma sayısı (talep kabul edildiyse, sessizlikle kesinleştiyse ya da hakem `payerShare > 0` dediyse)

```
a' = a + k,  b' = b + n − k
p̂      = a' / (a' + b')                               (sonsal ortalama, Beta-Binomial)
sd      = sqrt(a' b' / ((a' + b')² (a' + b' + 1)))
p_üst   = p̂ + z · sd                                   (ihtiyatlı üst sınır)
p_yeni  = p_üst(n = 0, k = 0)                          (sicili olmayan yüklenici)
oran    = clamp(maxBps · p_üst / p_yeni, floorBps, maxBps)
Z       = n / (n + a + b)                              (kredibilite, panelde gösterilir)
```

**Yorum:** Yeni yüklenici sözleşme tavanını öder. İhtiyatlı risk tahmini düştüğü oranda kesinti de düşer. Kusur talebi gelen yüklenici tavana geri yaklaşır.

**Önsel ortalama %8.** Kaynağı: retention'ın sözleşmelerin ~%8'inde gerçekten kullanılması (Pye Tait, notes/34 §1).

**Örnekler** (tavan %5, taban %1; değerler `araclar/kesinti_orani.py` çıktısı, testlerde sabit):

| Sicil | Üretim: Beta(1; 11,5) | Demo: Beta(0,4; 4,6) |
|---|---|---|
| 0 iş | %5,00 | %5,00 |
| 3 iş, 0 talep | %4,06 | %3,21 |
| 10 iş, 0 talep | **%2,82** | %1,75 |
| 20 iş, 0 talep | %1,96 | %1,06 |
| 10 iş, 1 talep | %4,79 | %4,35 |
| 10 iş, 3 talep | %5,00 | %5,00 |

**Panel metriği: "serbest kalan sermaye" = (tavan − oran) × iş bedeli.** Örnek: 10 temiz işi olan yüklenicinin 100 USDC'lik işinde 2,18 USDC daha az kesilir.

**Sybil ve manipülasyon** (dürüstlük satırına yazılacak):
- Sicil yalnızca bu kontrattaki işlerden oluşur. Bir yüklenici kendi iki cüzdanıyla sahte "temiz iş" üretebilir.
- Önlemler:
  - `payer ≠ payee` ve `contractValue ≥ minRecordValue` şartı var.
  - İşveren `minBps` ile oranı her zaman tavana kadar yükseltebilir. Model bir **öneri tabanıdır**; işveren daha fazla koruma isteyebilir, daha az değil.
- Sicilin cüzdan değil kimlik bazında tutulması (ör. ERC-8004) sonraki adım.

**Tam sayı uygulaması:**
- WAD (1e18) ölçek, aşağı yuvarlama.
- Karekök için OpenZeppelin `Math.sqrt`.
- Formülün sırası `kesinti_orani.py`'deki `_p_ust` ile **aynı** olmalı. Testler (n, k) fikstürleriyle Python çıktısını birebir karşılaştırır.

## 5. Para akışı ve muhasebe
- **Tek giriş noktası:** `payProgress`. İşveren yalnızca o tutar kadar `approve` verir; sınırsız onay istenmez (G10).
- **Kesinti:** `kesinti = amount × retentionBps / 10000` (aşağı yuvarlama). Toz kalmaz, çünkü kalan tutar `amount − kesinti` olarak hesaplanır.
- **Durum değişkenleri:**
  - `withdrawable[address]`: çekilebilir bakiyeler.
  - Anlaşma bazında: `retained` (toplam kesilen), `releasedToPayee`, `awardedToPayer`, `lockedInClaim`.
  - `totalHeld = Σ withdrawable + Σ (retained − releasedToPayee − awardedToPayer)`.
- **Muhasebe sayaçlarla yapılır.** `balanceOf(this)` asla muhasebe için kullanılmaz (L4); kontrata doğrudan gönderilen USDC hesabı bozmaz (I6).
- **Bütün çıkışlar `withdraw()` üzerinden.** Engellenmiş (blocklisted) bir adres yalnızca kendi çekimini başarısız kılar (I5).

## 6. Kusur talebi ve itiraz (karar D1–D4)
- **Aynı anda tek açık talep** (v1). Talep tutarı, `retained − releasedToPayee − awardedToPayer`'ı aşamaz.
- **Kanıt:** Kanıt zincire konmaz; yalnızca `evidenceHash` (ör. fotoğraf ya da rapor dosyasının hash'i) yazılır. Sunumda "kanıt zincir dışında, özeti zincirde" diye anlatılır.
- **Sessizlik kuralı:** Yüklenici cevap vermezse talep kabul sayılır (D2). Bu, işverenin korunmasıdır.
- **Hakem susarsa ya da hakem yoksa:** Önerilen varsayılan kural, tutarın havuza, yani yükleniciye dönmesi (D1). Gerekçe:
  - Paranın asıl sahibi yüklenici; Yeni Zelanda'nın tröst mantığı da bu.
  - İşverenin talep açmak için tüm garanti süresi var.
  - Zincir dışı hukuki yollar açık kalıyor.

## 7. Taşeron zinciri (bileşim)
1. İşveren → yüklenici anlaşması #1.
2. Yüklenici → taşeron anlaşması #2; burada yüklenici `payer` rolünde.
3. Yüklenici, #1'den gelen hakedişin taşerona düşen kısmını #2'ye öder. Taşeronun kesintisi de kontratta durur.

Yüklenici batsa bile taşeronun kesintisi kontratta kalır. **Carillion senaryosu**, demonun ana hikâyesi.

v1'de otomatik yönlendirme yok; yüklenici ödemeyi kendisi yapar. Otomatik yönlendirme sonraki adım.

## 8. Güvenlik kuralları
Kaynak: `ZORUNLU-SARTLAR` T5–T10 ve G1–G10, `notes/23` L1–L14.
- Solidity 0.8.28, evm `paris`, optimizer açık, 200 runs (Studio ayarları). Mainnet bytecode Studio artifact'ıyla aynı olmalı (G8).
- `ReentrancyGuard` kullanılır; checks-effects-interactions sırası korunur; `SafeERC20` kullanılır.
- `payable`, `receive`, `fallback`, `delegatecall`, upgrade yok. `emergencyWithdraw` ya da `sweep` yok (L11).
- Rastgelelik yok (L14).
- Her durum değiştiren fonksiyonda rol kontrolü var ve bunun negatif testi yazılır (L1, L8).
- Döngü içinde dış transfer yok (L3).
- Bölmeden önce çarpma yapılır (L6).
- Tutar tavanları: `maxAgreementValue`, `maxTotalHeld`.
- Mainnet deploy kullanıcının EOA'sından yapılır: yerel sayfa + MetaMask (G7). Ardından Sourcify doğrulaması (P3).
- Ürün adında ve alan adında "arc", "usdc", "claim", "gateway" kullanılmaz (P6).

## 9. Invariant'lar ve test hedefleri
| # | Kural |
|---|---|
| I1 | `usdc.balanceOf(vault) ≥ totalHeld` |
| I2 | `totalHeld == Σ yatırılan − Σ çekilen` (ghost değişkenle) |
| I3 | Her anlaşmada `retained == releasedToPayee + awardedToPayer + havuzda kalan`; hiçbir kuruş iki kez çıkmaz |
| I4 | Rolü olmayan bir adresin rol gerektiren çağrısı hiçbir zaman başarılı olmaz |
| I5 | Engellenmiş bir alıcı, başkalarının çekimini engellemez |
| I6 | Kontrata doğrudan gönderilen USDC `totalHeld`'i değiştirmez |
| R1 | `floorBps ≤ retentionBps ≤ maxBps ≤ capBps`; oran kabulden sonra değişmez |
| R2 | Hakem yalnızca payer ile payee arasında bölebilir; `payerShare ≤ amount` |
| R3 | `finalize` yalnızca `now ≥ defectEnd` iken ve açık talep yokken çalışır |
| R4 | Her hakedişte payee'nin bakiyesi tam olarak `amount − kesinti` artar |
| R5 | Kontratın oranı, `kesinti_orani.py` fikstürleriyle birebir aynı |
| R6 | Her `Closed` anlaşmada sicilde n tam bir kez artar; k anlaşma başına en fazla bir kez artar |
| R7 | Ödeme toplamı `contractValue`'yu aşamaz; `totalHeld`, `maxTotalHeld`'i aşamaz |

**Test katmanları:**
- Studio'nun kendi testleri.
- Arc profiliyle Foundry (`[profile.arc] network = "arc"`, G5).
- Invariant handler'ı.
- Testnet fork'u üzerinde blocklist testi (notes/23 §3.7).
- Mutasyon kontrolü: kodda 2–3 satır bozulunca testler kırılıyor mu (L12)?

## 10. Olaylar (kanıt sayfası için)
`AgreementCreated`, `AgreementAccepted(id, retentionBps, n, k)`, `ProgressPaid(id, amount, retained, ref)`, `ProvisionalSigned`, `ProvisionalAccepted(id, released)`, `ClaimOpened`, `ClaimAnswered`, `ClaimDecided`, `ClaimDefaulted`, `Finalized(id, released)`, `Withdrawn(account, amount)`

Kanıt sayfası bu olayları doğrudan RPC'den, küçük blok aralıklarıyla okur (T9).

## 11. Mainnet demo senaryoları
**Kurulum:**
- Cüzdanlar: İşveren (E), Yüklenici (Y), Taşeron (T), Hakem (H). Mümkünse farklı kişiler (karar D9); değilse "aynı kişinin cüzdanları" kanıt sayfasında yazılır.
- Parametreler: demo önseli, süreler dakika ölçeğinde.

| # | Senaryo | Akış | Tutar |
|---|---|---|---|
| S1 | Mutlu yol (inşaat) | E→Y 2 USDC: iki hakediş, kesinti %5 → geçici kabulde yarısı → 10 dk sonra finalize → withdraw | 2 USDC |
| S2 | Taşeron zinciri | Y→T 1 USDC, aynı akış; Y payer rolünde | 1 USDC |
| S3 | Talep kabul | E talep açar (0,03), Y kabul eder → E'ye | 0,03 |
| S4 | İtiraz + hakem | Talep 0,04 → Y reddeder → H 0,02 E'ye, kalanı havuza | 0,04 |
| S5 | Sessizlik | Talep 0,02 → Y cevap vermez → `resolveUnanswered` | 0,02 |
| S6 | Hakem susar | Talep 0,02 → ret → süre dolar → `resolveByDefault` | 0,02 |
| S7 | Aktüerya | Y 3 küçük temiz işi kapatır (0,5 USDC × 3) → yeni anlaşmada Y'nin oranı **%3,21**, yeni gelen T'nin oranı **%5** → "serbest kalan sermaye" panelde | 1,5 + 2 USDC |
| S8 | Yazılım işi | Müşteri → ajans 1 USDC, 30 dk garanti, mutlu yol | 1 USDC |

**Tahmini maliyet:** ~45 işlem; gas ~0,05 USDC ve deploy ~0,015 USDC. Cüzdanlarda toplam ~15 USDC bulunmalı. Kilitli tutarlar demo sonunda geri çekilir.

## 12. Arayüz (notes/24 §5.2 deseni)
1. **Anlaşmalar:** liste ve "yeni anlaşma" formu. Formda önerilen oran, sicil ve serbest kalan sermaye canlı gösterilir.
2. **Anlaşma sayfası** `/agreement/:id`:
   - Durum rozeti; kontrattaki enum'la bire bir eşleşir.
   - Her bekleyen adımda geri sayım ve "süre dolunca ne olur" cümlesi.
   - Rolüne göre butonlar.
   - İşlem butonunun dört durumu: boşta, imza bekleniyor, zincirde bekliyor, onaylandı veya başarısız.
3. **Sicil paneli:** p̂, Z, p_üst, oran; formülün açıklaması (aktüerya burada görünür).
4. **`/proof`:** cüzdansız açılır.
   - Kontrat adresi, Sourcify rozeti, canlı `totalHeld`.
   - Senaryo kartları, her biri işlem linki ve maliyetiyle.
   - Dürüstlük satırları.

Ücretler dolar olarak gösterilir, gwei olarak değil. Güven cümlesi: "Para kontratta, admin anahtarı yok, süre dolunca kendiliğinden yükleniciye gider."

## 13. Studio süreci
1. **Plan modu:** Bu belge §1–§9, ayrı bir spesifikasyon dosyası olarak verilir (prompt sınırı 10.000 karakter). Prompt'ta "minimal" kelimesi geçmez (S1).
2. **Smart Contract modu:** kontrat, Studio audit'i ve Foundry testleri. Invariant listesi spesifikasyonun içinde.
3. **Claude incelemesi:** L1–L14 kontrol listesi; R5 için Python fikstürleriyle karşılaştırma; Arc profiliyle testler.
4. **Testnet deploy** (Studio) ve UI. Escape tuşuna basılmaz (S2).
5. **Studio'da fork provası** (`--mode verify`, S5).
6. **Mainnet deploy:** kullanıcı, yerel sayfa + MetaMask ile yapar. Ardından Sourcify doğrulaması ve testnet–mainnet bytecode karşılaştırması.
7. **S1–S8 mainnet senaryoları**, kanıt sayfası, video ve README.

## 14. Kapsam dışı (README'de "sonraki adımlar")
- **Teminata karşı avans:** v2. Circle'ın lending önceliğine bağlanır.
- **Otomatik taşeron yönlendirmesi.**
- **Kimlik bazlı sicil** (ERC-8004).
- **ERC-8183 ajan işleri için garanti penceresi:** Standart "itiraz yok" diyor; bu katman o boşluğu dolduruyor.
- **Çoklu talep ve kısmi uzlaşma teklifleri.**

## 15. Kararlar
| # | Karar | Durum |
|---|---|---|
| D1 | Hakem susarsa ya da hakem yoksa itiraz edilen tutar | **Karar: yükleniciye (havuza döner)**, kullanıcı 16 Ekim |
| D2 | Yüklenici talebe cevap vermezse | **Karar: kabul sayılır**, kullanıcı 16 Ekim |
| D3 | Hakem zorunlu mu | Öneriyle ilerleniyor: isteğe bağlı |
| D4 | Aynı anda kaç talep | Öneriyle ilerleniyor: bir (v1) |
| D5 | Demo önseli | **Karar: Beta(0,4; 4,6)**; kanıt sayfasında "demo parametresi, üretimde Beta(1; 11,5)" yazılır, kullanıcı 16 Ekim |
| D6 | Tavanlar | Öneriyle ilerleniyor: anlaşma başına 50 USDC, toplam 500 USDC |
| D7 | Ürün adı (İngilizce; alan adında "arc", "usdc", "claim", "gateway" geçmemeli) | **Karar: Earnback**, kullanıcı 17 Ekim. Yüklenici temiz siciliyle kesintiyi geri kazanır. Kripto/escrow alanında aynı adlı ürün bulunmadı (web araması, 17 Ekim). Alan adı kullanıcının seçimi |
| D8 | Demo sektörleri | Öneriyle ilerleniyor: inşaat + yazılım |
| D9 | Farklı kişiler cüzdan kullanabilir mi | **Karar: evet, 2–3 tanıdık var**, kullanıcı 16 Ekim |
| D10 | İşveren geçici kabulü hiç imzalamazsa | **Karar: sayılmış kabul**, kullanıcı 16 Ekim. Yüklenici imzaladıktan sonra işverenin `responseWindow` kadar süresi var. Ne imzalar ne gerekçeli itiraz ederse kabul sayılır. İtiraz ederse hakem karar verir; hakem susar ya da hakem yoksa kabul sayılır (D1 ile aynı yön). Ayrıntı: `docs/studio/SPEC-D10.md`. Kaynak: Studio'nun functional-auditor bulgusu |

**D9'un sonuçları:**
- Senaryo rolleri tanıdıklara dağıtılır; her biri küçük tutarlarla (0,5–2 USDC) kendi cüzdanını kullanır.
- Tanıdıklara Arc ağı ve USDC getirme talimatı hazırlanmalı.
- Kanıt sayfasında hangi rolün farklı kişi olduğu yazılır.
- Kişisel bilgiler (isim, e-posta) repoya ve kanıt sayfasına girmez.
