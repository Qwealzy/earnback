# Earnback — mainnet hazırlık planı

Taslak: 2026-10-18. Hedef gönderim 24–26 Ekim, son tarih 2 Kasım 04:59 UTC.
Kaynaklar: `context/notes/22, 25, 26, 28, 29` ve `ANA-CONTEXT.md` §10 (çelişkide §10 geçerli), bu oturumdaki testnet provası (`docs/TESTNET-RESULTS.md`).

**Değişmez kurallar:**
- Mainnet deploy'u ve bütün gerçek USDC işlemlerini **kullanıcı kendi MetaMask EOA'sından** yapar; Claude hazırlar, göndermez (K6, G7).
- Mainnet bytecode Studio artifact'ıyla aynı olur, yeniden derleme yok (G8).
- Sırlar Studio'ya, repoya, `VITE_` değişkenlerine ve videoya girmez (G6).

## Durum

**Mainnet kontratı (18 Ekim, kullanıcının E hesabından, yerel deploy sayfasıyla):**
- Adres: **`0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81`** · chain 5042 · deploy bloğu **26.510.136**
- Tx: `0x8761d0d431eea820354366f32a5833936397a0d09fe0a87015ca560a5e8a548b` · ücret 0,055033 USDC
- [RUN] `arc-tests/verify_deploy.py mainnet <tx>`: creation input = Studio artifact + K1 argümanları; runtime = Studio testnet kasası (immutable maskeli); 9 constructor değeri doğru.
- Testnet provası (aynı sayfa, aynı ayarlar): `0x1324d02cB513f33ce53D9246933ba8D1ec0450DF`.
- Fork provası: Studio compass paketi olmadığı için Arc Foundry mainnet fork testi 5/5.
- **Sourcify: exact_match** (creation + runtime), matchId 56348498.

## Kim, ne zaman

| # | İş | Kim | Ne kanıtlar / neyi açar | Süre |
|---|---|---|---|---|
| 0 | **Kararlar** (aşağıda K1–K4) | Kullanıcı | Constructor değerleri deploy'dan sonra değiştirilemez | 10 dk |
| 1 | **USDC getirme** başlat | Kullanıcı | Gas + senaryolar için mainnet USDC | Binance: dakikalar; TR borsası: 2–4 gün |
| 2 | **UI-FIX-4 (Studio):** mainnet desteği | Claude → Studio | Arayüz mainnet'te çalışabilir | 1 tur |
| 3 | **Studio fork provası** (`compass:deploy --mode verify`) | Claude → Studio | "Mainnet hazırlığı Studio'da yapıldı" kanıtı, sırsız | 1 tur |
| 4 | **Yerel deploy sayfası** yaz, **testnet'te** prova | Claude yazar, kullanıcı testnet'te dener | Sayfa ve mainnet parametreleri gerçek işlemle denenir | 1 saat |
| 5 | **Mainnet deploy** | Kullanıcı (MetaMask) | Kontrat 5042'de | 10 dk |
| 6 | Doğrulama: runtime kodu = testnet kodu, constructor değerleri, **Sourcify** | Claude okur; Sourcify'a gönderim kullanıcı onayıyla | P3, güven rozeti | 30 dk |
| 7 | Arayüzü mainnet'e çevir (adres, deploy bloğu), export, **public repo**, **kalıcı link** | Claude → Studio; OAuth ve yayın kullanıcıda | K3, K7 | yarım gün |
| 8 | **Mainnet S1–S8** (tanıdıklarla), kanıt sayfası, video, README, gönderim | Kullanıcı + tanıdıklar; Claude hazırlar | K2, K4, K8, P1–P5 | 2 gün |

## 1. USDC getirme (not 29)

- **En ucuz:** global borsadan doğrudan Arc'a çekim. Binance ağ adı **"ARC"**, ücret 0,02 USDC, en az 0,1 USDC, memo yok. Coinbase en az 1 USDC.
- **Önce 0,1–1 USDC deneme**, `explorer.arc.io`'da gör, sonra kalanı gönder.
- Türk borsasından: TL → USDC → global borsa → ARC. MASAK beklemesi ilk çekimde 72 saat; **2–4 gün** sürebilir.
- **Yanlış ağ riski:** ARC ≠ ARB ≠ ARC-20. Sahte "Arc bridge/claim" sitelerinden uzak dur; yalnız borsanın kendi sitesi ve `explorer.arc.io`.
- **Miktar önerisi: 15–20 USDC.** Deploy ~0,015 USDC; senaryolar ~5 USDC (testnet tutarlarıyla); tanıdıklara 1–2'şer USDC; gas payı.

## 2. UI-FIX-4 (Studio'ya)

Şablon mainnet'e hazır değil (not 25 bulgu 8; bu oturumda `src/config.ts` okundu):
- `config.ts` zincir listesinde yalnız `arcTestnet` ve Ethereum `mainnet` (ENS için) var → **Arc mainnet (5042)** eklenmeli.
- Mainnet RPC'leri `fallback` ile: `https://rpc.mainnet.arc.io`, `rpc.quicknode.mainnet.arc.io`, `rpc.drpc.mainnet.arc.io` (docs.arc.io/arc/references/rpc-endpoints). Log taraması için dRPC kullanılmaz (testnet'te her `eth_getLogs`'u reddetti; mainnet'te de varsayılmalı).
- Ağ seçimi tek yerde (`app-config.ts` `ACTIVE_NETWORK`); explorer linkleri ağa göre (`explorer.arc.io` / `explorer.testnet.arc.io`).
- Mainnet'te uygulama yanlış ağdaysa açıkça uyarsın; testnet işlemleri mainnet sayfasında görünmesin.
- `tracing.ts` / konsol yakalama production build'de kapalı (not 25 A5).
- Kanıt sayfası: "demo parametresi" etiketi (D5), Sourcify rozeti, senaryo kartları (`proof-scenarios.ts`), dürüstlük satırları (P4).

## 3. Studio fork provası (not 22 §3.3, 26)

- Komut: `bun run compass:deploy RetentionVault '<ctorArgsJson>' --mode verify --blockchain ARC --compass-chain <Arc mainnet id> --rpc https://rpc.mainnet.arc.io`. Sır gerekmez, yayın yapmaz.
- Çıktı: `fork-ready` JSON ve `contracts/.compass-verify/RetentionVault.json` makbuzu (2 saat geçerli, bytecode + argümana bağlı) → kanıt klasörüne.
- **Bilinmeyen:** Arc mainnet'in Compass chain id'si. Studio'ya sorulacak; kaynak koddan doğrulanacak.

## 4–5. Yerel deploy sayfası ve mainnet deploy (not 28)

- `deploy/index.html`: Studio artifact'ını dosya seçiciyle yükler, `bytecode.object`'i **olduğu gibi** kullanır; artifact hash'i beklenenle eşleşmezse Deploy düğmesi kapalı kalır.
- `http://127.0.0.1:<port>` üzerinden açılır (file:// değil), viem'in `arc` zincir tanımı, projenin kilitli viem sürümü (CDN yok).
- Gas: `maxFeePerGas` en az 20 gwei (altı sessizce düşer), priority 1 gwei.
- **EOA şartı:** MetaMask hesabı akıllı hesaba yükseltilmiş olmamalı.
- MetaMask onay ekranı: "Deploy a contract", site `127.0.0.1`, ağ Arc, value 0, ücret ~0,01–0,1 USDC.
- **Önce testnet'te aynı sayfayla, mainnet parametreleriyle** yeni bir kasa deploy edilir. Sayfa ve parametreler gerçek işlemle denenmiş olur.
- Ağ bilgileri (mainnet): Arc · 5042 · `https://rpc.mainnet.arc.io` · USDC · `https://explorer.arc.io`.

## 6. Doğrulama

- Runtime kodu: mainnet `eth_getCode` = testnet kodu (immutable konumları maskeli; bu oturumda testnet için yapıldı, 25 konum).
- Constructor değerleri `eth_call` ile okunur, K1'deki kararla karşılaştırılır.
- **Sourcify** Arc 5042'yi destekliyor. Gereken: artifact'taki `rawMetadata` → `metadata.json` + kaynaklar (OpenZeppelin dahil, keccak eşleşmeli). Önce testnet'te ücretsiz prova. Gönderim herkese açık yayın sayılır → kullanıcı onayı.
- Yedek: Blockscout arayüzü `explorer.arc.io/contract-verification` (Standard JSON, `v0.8.28+commit.7893614a`). API'si Cloudflare arkasında.

## 7. Kalıcı link ve repo (not 25)

- Uygulama statik; Arc RPC'leri CORS'a açık, sunucu gerekmez.
- **Öneri: Cloudflare Pages, GitHub'dan.** Ücretsiz, uyku yok, ayda 500 build. Vercel Hobby ticari kullanımı yasaklıyor; GitHub Pages'te MetaMask uyarısı olayı var.
- Alan adı: `earnback.pages.dev` gibi; "arc, usdc, claim, airdrop, gateway, wallet, connect" geçmesin. Gönderimden 2–3 gün önce temiz profilde MetaMask ve Rabby ile aç.
- **Public repo'dan önce** `context/notes/14`, `27`, `33` çıkarılır (CLAUDE.md); `.env` zaten dışarıda.
- GitHub ve Cloudflare hesabı / OAuth kullanıcının kararı (S6).

## Kararlar (kullanıcı)

| # | Karar | Öneri | Gerekçe |
|---|---|---|---|
| K1 | Mainnet constructor değerleri | **Karar (18 Ekim): tutar tavanı yok.** Kontrat 0'a izin vermediği için `maxAgreementValue = maxTotalHeld = 1.000.000.000 USDC` (1e15 birim; pratikte sınırsız, ekranda okunaklı). Diğerleri: önsel **Beta(0,4; 4,6)** (D5, demo), z = 1, **capBps 500** (tasarımın en yüksek kesinti oranı, güvenlik limiti değil), floorBps 100, minRecordValue 0,5 USDC | Claude'un önerisi 5/50 USDC idi (denetlenmemiş kontrat, admin/pause yok, G4 "capped while unaudited"). Kullanıcı tavan istemedi. **Sonuç:** G4'ün tutar tavanı kısmı uygulanmıyor; README ve kanıt sayfasına "denetlenmemiş, tutar tavanı yok, yalnız küçük tutarlarla kullanın" dürüstlük satırı zorunlu (P4) |
| K2 | Hosting | **Karar (18 Ekim): Cloudflare Pages + kullanıcının Cloudflare'deki kendi alan adı** (ör. `earnback.<alan-adı>` alt alanı). Alt alan adında "arc, usdc, claim, gateway, wallet" geçmemeli | Kullanıcının alan adı zaten Cloudflare'de; ücretsiz, uyumaz |
| K3 | USDC yolu ve miktarı | **Karar (18 Ekim): global borsadan ARC ağıyla**, 15–20 USDC, önce 0,5 USDC deneme | En ucuz ve en hızlı |
| K4 | Mainnet senaryolarında roller | **Karar (18 Ekim): hepsi kullanıcının kendi cüzdanları** (D9'un yerine). Kanıt sayfasında ve README'de "aynı kişinin cüzdanları" açıkça yazılır (P4) | Hız; P1'de "farklı karşı taraf" puanı zayıflar, dürüstlük satırı şart |
