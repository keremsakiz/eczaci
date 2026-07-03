# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-07-03 (koddan doğrulandı)

## Proje Özeti
Tarayıcı tabanlı eczane simülasyon oyunu (Türk mobil oyunu "Büfeci" esinli). Tek dosya: index.html (vanilla JS + HTML5 Canvas). 9:16 dikey mobil layout, iOS için Capacitor hedefli. Repo: github.com/keremsakiz/eczaci

## Teknik Gerçekler (koddan doğrulanmış)
- index.html: 2137 satır, tek dosya, vanilla JS + Canvas
- Layout dikdörtgenleri her zaman ilgili draw fonksiyonu İÇİNDE hesaplanır (render() içinde değil)
- window.cheats test objesi mevcut (satır ~2059), korunmalı

## Biten / Kodda VAR olan özellikler (doğrulanmış)
- Menü ekranı + Game Over ekranı (STATE.MENU, triggerGameOver())
- Merkezi itibar kaybı (loseReputation), sıfır itibarda game over
- Sahte reçete tespit sistemi + doktor defteri (tezgahta animasyonlu açılır defter, 20 doktor)
- 39 ilaç, 8 kategori sekmesi
- Sipariş eşleştirme (expectedMedicineIds, çoklu-küme/multiset mantığı)

## Kodda OLMAYAN / Yanlış hatırlanan (dikkat)
- STOK / DEPO sistemi: kodda YOK. "stock" kelimesi index.html'de hiç geçmiyor. Eski notlarda "bitti" yazıyorsa yanlış — koda göre yok.

## Assets durumu
- assets/ içinde ~12 ilaç PNG'si var (agriban, alerjin, atesdus, bandajix, cvitamin, goznur, miderahat, nezleson, oksurmez, uykutas + bazıları)
- 39 ilacın çoğu hâlâ emoji fallback kullanıyor — kalanlar kademeli PNG'ye çevrilecek
- Karakter/tezgah/arkaplan/defter PNG'leri mevcut

## Bilinen çöp / temizlenecek
- .DS_Store dosyaları repoya commit'lenmiş (kökte ve assets/ içinde) — .gitignore'a eklenip repodan çıkarılmalı

## Doğrulanacaklar (henüz koddan teyit edilmedi)
- İlaç id tip tutarlılığı (string vs number) sipariş eşleştirmede sorun yaratıyor mu
- ctx.save()/ctx.restore() rotasyon transformlarında dengeli mi
- PNG çizmeden önce asset hazır mı kontrolü (img.complete && img.naturalWidth > 0)

## Çalışma Kuralları
- claude.ai prompt yazar → Claude Code/Codex repoya yazıp commit eder → Kerem test eder → çalışınca push
- Değişiklikler parça parça: bitir → commit → DUR → test
- Değer/bug sorununda tahmin yok, koddan doğrula
- Çalışan şeyi bozma; stabilite önceliklidir
