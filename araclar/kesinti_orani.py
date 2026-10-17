"""Hakediş Teminat Kasası: aktüeryal kesinti oranının referans hesabı.

Kontrattaki Solidity hesabının birebir aynısını tam sayı aritmetiğiyle yapar
(WAD = 1e18 ölçek, aşağı yuvarlama). Studio'nun yazdığı kontratın sonuçları
bu dosyanın çıktılarıyla karşılaştırılır (deterministik test fikstürü).

Model (deneyim çarpanı / experience rating):
  Yüklenicinin bu kontrattaki sicili: n kapanmış iş, k haklı çıkmış kusur talebi.
  Önsel Beta(a, b)            -> piyasa ortalaması a / (a + b)
  Sonsal ortalama              p_hat = (a + k) / (a + b + n)
  Sonsal std. sapma            sd = sqrt(a' b' / ((a' + b')^2 (a' + b' + 1)))
  İhtiyatlı üst sınır          p_ust = p_hat + z * sd
  Referans                     p_yeni = p_ust(n=0, k=0)  (sicili olmayan yüklenici)
  Kesinti oranı (bps)          oran = clamp(tavan * p_ust / p_yeni, taban, tavan)
  Yani yeni yüklenici tavanı öder; ihtiyatlı risk tahmini düştüğü oranda kesinti düşer.
  Kredibilite (gösterim için)  Z = n / (n + a + b)

Kullanım: python araclar/kesinti_orani.py
"""

import math
from decimal import Decimal

WAD = 10**18


def wad(x):
    """Ondalık parametreyi WAD'a kesin çevirir (float hatası olmadan: 4.6 -> 4600000000000000000)."""
    return int(Decimal(str(x)) * WAD)


def isqrt(x):
    return math.isqrt(x)


def kesinti_orani_bps(n, k, a_wad, b_wad, z_wad, tavan_bps, taban_bps):
    """Kontratın hesaplayacağı kesinti oranı (bps). Girdiler tam sayı."""
    if not (0 <= k <= n):
        raise ValueError("0 <= k <= n olmalı")
    if not (0 < taban_bps <= tavan_bps <= 10_000):
        raise ValueError("0 < taban <= tavan <= 10000 olmalı")
    p_ust = _p_ust(a_wad + k * WAD, b_wad + (n - k) * WAD, z_wad)
    p_yeni = _p_ust(a_wad, b_wad, z_wad)
    oran = tavan_bps * p_ust // p_yeni
    return max(taban_bps, min(tavan_bps, oran))


def _p_ust(a1, b1, z_wad):
    """Beta(a1, b1) için p_hat + z * sd, WAD ölçekte."""
    s = a1 + b1
    p_hat = a1 * WAD // s
    # var = a1*b1 / (s^2 * (s+1)); taşmayı önlemek için adım adım
    var = (a1 * WAD // s) * (b1 * WAD // s) // WAD * WAD // (s + WAD)
    sd = isqrt(var * WAD)
    return p_hat + z_wad * sd // WAD


def detay(n, k, a, b, z, tavan_bps, taban_bps):
    """Okunabilir ara değerler (float, yalnız gösterim)."""
    a1, b1 = a + k, b + n - k
    s = a1 + b1
    p_hat = a1 / s
    sd = math.sqrt(a1 * b1 / (s * s * (s + 1)))
    return {
        "p_yeni": (a / (a + b)) + z * math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1))),
        "p_hat": p_hat,
        "sd": sd,
        "p_ust": p_hat + z * sd,
        "Z": n / (n + a + b),
        "oran_bps": kesinti_orani_bps(n, k, wad(a), wad(b), wad(z), tavan_bps, taban_bps),
    }


def tablo(baslik, a, b, z, tavan_bps=500, taban_bps=100):
    print(f"\n### {baslik}: önsel Beta({a}, {b}) -> ortalama %{100 * a / (a + b):.1f}, ağırlık {a + b}, z = {z}, tavan %{tavan_bps / 100}, taban %{taban_bps / 100}")
    print("| Sicil (n iş, k talep) | p̂ | p_üst | Kredibilite Z | Kesinti oranı | 100 USDC işte kesinti | Serbest kalan |")
    print("|---|---|---|---|---|---|---|")
    for n, k in [(0, 0), (3, 0), (5, 0), (10, 0), (20, 0), (50, 1), (10, 1), (10, 3)]:
        d = detay(n, k, a, b, z, tavan_bps, taban_bps)
        kesinti = 100 * d["oran_bps"] / 10_000
        serbest = 100 * tavan_bps / 10_000 - kesinti
        print(f"| {n} iş, {k} talep | %{100 * d['p_hat']:.2f} | %{100 * d['p_ust']:.2f} | {d['Z']:.2f} | %{d['oran_bps'] / 100:.2f} | {kesinti:.2f} USDC | {serbest:.2f} USDC |")


if __name__ == "__main__":
    tablo("Üretim parametreleri (öneri)", a=1.0, b=11.5, z=1.0)
    tablo("Demo parametreleri (öneri)", a=0.4, b=4.6, z=1.0)
