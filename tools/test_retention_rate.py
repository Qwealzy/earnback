"""retention_rate.py testleri: tasarım belgesindeki kuralları sabitler.

Çalıştırma: python -m unittest discover -s tools
"""

import unittest

from retention_rate import WAD, detay, retention_rate_bps, wad

URETIM = dict(a_wad=wad(1.0), b_wad=wad(11.5), z_wad=wad(1.0), tavan_bps=500, taban_bps=100)


def oran(n, k, **p):
    return retention_rate_bps(n, k, **dict(URETIM, **p))


class Kurallar(unittest.TestCase):
    def test_yeni_yuklenici_tavani_oder(self):
        self.assertEqual(oran(0, 0), 500)

    def test_sinirlar_icinde(self):
        for n in range(0, 200, 7):
            for k in range(0, n + 1, max(1, n // 5)):
                self.assertTrue(100 <= oran(n, k) <= 500, (n, k))

    def test_temiz_is_orani_dusurur_artirmaz(self):
        onceki = oran(0, 0)
        for n in range(1, 120):
            simdiki = oran(n, 0)
            self.assertLessEqual(simdiki, onceki, n)
            onceki = simdiki

    def test_kusur_talebi_orani_artirir_azaltmaz(self):
        for n in (5, 10, 30, 80):
            onceki = oran(n, 0)
            for k in range(1, n + 1):
                simdiki = oran(n, k)
                self.assertGreaterEqual(simdiki, onceki, (n, k))
                onceki = simdiki

    def test_cok_temiz_sicil_tabana_iner(self):
        self.assertEqual(oran(10_000, 0), 100)

    def test_tam_sayi_hesap_float_ile_uyumlu(self):
        # Kontrat tam sayıyla, belge float ile hesaplıyor; fark en fazla 1 bps olmalı.
        for n, k in [(3, 0), (10, 0), (20, 0), (50, 1), (10, 1)]:
            d = detay(n, k, 1.0, 11.5, 1.0, 500, 100)
            beklenen = max(100, min(500, 500 * d["p_ust"] / d["p_yeni"]))
            self.assertLessEqual(abs(d["oran_bps"] - beklenen), 1, (n, k))

    def test_belgedeki_ornekler(self):
        # docs/DESIGN.md §4 tablosundaki değerler
        self.assertEqual(oran(10, 0), 282)
        self.assertEqual(oran(20, 0), 196)
        self.assertEqual(oran(10, 1), 479)

    def test_gecersiz_girdi_reddedilir(self):
        with self.assertRaises(ValueError):
            oran(3, 4)
        with self.assertRaises(ValueError):
            oran(1, 0, taban_bps=600)

    def test_buyuk_degerlerde_tasma_yok(self):
        # Solidity uint256 sınırı: ara çarpımlar 2**256'yı aşmamalı
        n = 1_000_000
        a1, b1 = wad(1.0), wad(11.5) + n * WAD
        s = a1 + b1
        self.assertLess((a1 * WAD // s) * (b1 * WAD // s), 2**256)
        self.assertLess(500 * (WAD * 2), 2**256)


if __name__ == "__main__":
    unittest.main()
