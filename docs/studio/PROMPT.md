# Arc Studio'da kullanım: kısa prompt ve adımlar

## A. Kısa prompt (SPEC.md dosya olarak eklenebiliyorsa)
Aşağıdaki kutunun içini olduğu gibi kopyala:

```
Build the RetentionVault smart contract exactly as specified in the attached SPEC.md, using max preset: full review, Slither, and Foundry tests.

Priorities, in order:
1. Follow every hard constraint in SPEC.md (no owner/admin, pull payments, no payable, nonReentrant, custom errors).
2. The rateFor() integer math must reproduce the fixture table in SPEC.md exactly; write those fixtures as tests.
3. Write the invariant tests I1–I6, R1, R2, R6, R7 with a handler and a 6-decimal MockUSDC that has a blocklist.
4. Add [profile.arc] network = "arc" to foundry.toml.
5. Deploy to Arc testnet with the demo constructor values in SPEC.md.

If anything in SPEC.md is ambiguous, ask me before choosing. Do not add features that are not in SPEC.md. Do not build a UI yet.
```

## B. Dosya eklenemiyorsa
`docs/studio/SPEC.md` dosyasının **tamamını** prompt olarak yapıştır (~8.000 karakter; sınır 10.000). Spesifikasyonun başlığında "Smart Contract mode, max preset" zaten yazıyor.

## Adımlar
1. Studio'da **yeni bir uygulama** aç.
2. **Smart Contract** modunu seç. Build modu kullanma: hızlı (quick) incelemeye düşebilir.
3. Önce **Plan** sorarsa, plan cevabını kaydet: ekran görüntüsü al ya da metni kopyala. Plan, jüri için "Studio kullanımı" kanıtı.
4. Prompt'u gönder (A ya da B).
5. Studio soru sorarsa (`ask_user_questions`), cevapları kendin uydurma. Soruyu bana getir; SPEC.md'ye göre birlikte cevaplayalım.
6. **Escape tuşuna basma.** Çalışan turu durduruyor. Menüleri dışarı tıklayarak kapat.
7. Tur bitince şunları kaydet:
   - Studio proje linki (`studio.arc.io/app/...`)
   - Testnet kontrat adresi
   - Test sonucu ekranı
   - Audit özeti

   Studio içeriği silinebildiği için ekran görüntülerini erken al.
8. Kodu bana getir: Studio'dan export (zip ya da GitHub). Şunları yapacağım:
   - L1–L14 kontrol listesiyle kodu okumak.
   - `rateFor` çıktısını `araclar/kesinti_orani.py` ile karşılaştırmak.
   - Arc profiliyle testleri çalıştırmak.

## Dikkat
- Prompt'ta **"minimal"** kelimesi geçmesin; hızlı preset'i tetikliyor.
- Studio'ya özel anahtar, seed ya da `.env` içeriği verme (G6).
- Studio'nun mainnet hakkında söylediklerine güvenme. Mainnet deploy'unu kendi cüzdanınla, Studio dışında yapacağız (K6, G7).
- Studio kodda bir şey değiştirmek isterse ve bu SPEC.md'ye aykırıysa, bana sor.
