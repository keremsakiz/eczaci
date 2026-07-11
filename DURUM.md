# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-07-11 (koddan doğrulandı)

## Proje Özeti
Tarayıcı tabanlı eczane simülasyon oyunu (Türk mobil oyunu "Büfeci" esinli). Tek dosya: index.html (vanilla JS + HTML5 Canvas). 9:16 dikey mobil layout, iOS için Capacitor hedefli. Repo: github.com/keremsakiz/eczaci

## Teknik Gerçekler (koddan doğrulanmış)
- index.html: 2571 satır, tek dosya, vanilla JS + Canvas
- Layout dikdörtgenleri her zaman ilgili draw fonksiyonu İÇİNDE hesaplanır (render() içinde değil)
- window.cheats test objesi mevcut (satır ~2465), korunmalı
- Render kurallları: her frame Math.random()/new Date() çağrılmaz (titreme riski), ctx.save/restore dengeli

## TAMAMLANAN SİSTEMLER (koddan doğrulanmış)

### Çekirdek döngü
- Sipariş eşleştirme (expectedMedicineIds, çoklu-küme/multiset mantığı; counter düz string id listesi)
- Sahte reçete tespit sistemi + doktor defteri (tezgahta animasyonlu açılır defter, 20 tanınan doktor)
- Gün döngüsü (müşteri limiti bazlı), DAYEND özet kartı, hasta kuyruğu + sabır sistemi

### 1. MENU + GAMEOVER ekranları
- game.state MENU'den başlar; startNewGame() tam reset (para, itibar, gün, stok dahil)
- drawMenu: ECZACI başlık + BAŞLA + kilitli Ayarlar/Skor placeholder'ları
- drawGameOver: gün/para/sebep satırları + TEKRAR DENE + Ana Menü
- loseReputation() merkezi helper (4 itibar kaybı noktası buradan geçer); itibar <= minReputation → triggerGameOver()

### 2. STOK + ECZA DEPOSU
- İlaç bazında KALICI stok: game.stock (id → adet), startStock 10, maxStock 30; startNextDay resetlemez, sadece startNewGame kurar
- Stok 0 → servis engellenir (tapMedicine), rafta soluk buton + "TÜKENDİ" etiketi, kısa toast uyarısı (game.feedback'i ezmez)
- Raf butonlarında sağ-üst soluk stok rozeti
- Depo paneli PC ekranı kapsayıcısında — drawPcScreen("ECZA DEPOSU — Sipariş Ekranı"), yeşilimsi sistem başlık şeridi; ileride SGK Medula / E-reçete ekranları aynı kapsayıcıya eklenecek
- Adet bazlı sipariş: satırda −/+ adımlayıcı (pending sepet, satır bazında maxStock clamp), tek "SİPARİŞ VER (toplam₺)" butonu; para yetmezse pasif + toplam kırmızımsı; panel kapanınca sepet sıfırlanır
- Satır düzeni üç SABİT oranlı sütun (sol %46 ad/stok, orta %60'a kadar fiyat/tutar, sağ adımlayıcı) + ellipsisText helper (fontu küçültmeden "…" ile kısaltır)
- Panel açıkken oyun donar (update erken döner); DAYEND kartından da "📦 Depodan Sipariş" ile açılır

### 3. EKONOMİ (alış/satış ayrımı)
- Her ilaçta elle yazılmış cost/price (2026 TR gerçekçi; 29₺–231₺ bandı, kâr marjı ilaca göre %18–41: temel ağrı kesici düşük, vitamin yüksek)
- Kazanç = servis edilen ilaçların price toplamı (adet dahil); CONFIG.pricePerMedicine KALDIRILDI
- Sahte reçete ödül/ceza sabitleri aynı (fakeCatchBonus 20, fakeApproveMoneyPenalty 50 vb.)
- Fiyat yalnız depo panelinde görünür; rafta/reçetede/balonda fiyat gösterilmez

### 4. TEZGAHTA PC
- assets/pc.png (Sprite "pc"; asset yoksa fallback: koyu monitör + soluk ekran + 🖥️)
- Tezgahın en sağında, defterin simetriği; defterle benzer görsel ağırlık, alt kenar defterle hizalı
- CONFIG.pcScale / pcOffsetX ile elle ince ayar; tıklama alanı görselden her yönde ~9px geniş
- Tıklayınca depo sipariş ekranı açılır (layout.pcBtn)

### 5. GERÇEKÇİ SAHTE DOKTORLAR
- FAKE_DOCTORS: 14 ciddi/gerçekçi isim, hiçbiri defterde yok ama KASITLI olarak tanınanlara yakın (Yıldırım/Yıldız, Şahiner/Şahin, Kayahan/Kaya) — oyuncu defteri gerçekten kontrol etmek zorunda

### 6. TEZGAH ×N ROZETİ
- Aynı ilaçtan 2+ tezgaha konunca tek kutu + sağ üstte ×N rozeti; ✕ kaldır işareti sol üstte
- Kutuya tıkla → o ilaçtan BİR adet çıkar (lastIndexOf ile)
- counter veri yapısı (düz id listesi) ve sameMultiset/checkOrder DEĞİŞMEDİ; gruplama yalnız çizimde (rebuildCounterSlots)

### 7. KATEGORİ DÜZELTMESİ
- Yeni "alerji" grubu (🌼, soguk'tan hemen sonra): Alerjin, Kaşıntıdur, Burunferah
- Ağrıjel → agri_ates; Burunaç soğuk algınlığında kaldı
- 9 sekme; dağılım agri_ates 6 / soguk 5 / alerji 3 / sindirim 5 / vitamin 6 / goz_kulak 3 / ilk_yardim 4 / uyku_sinir 4 / cilt 3 = 39
- Bilinen yan etki: "Alerji" kategorisinin semptom karşılığı yok (Kaşıntıdur/Burunferah yalnız reçeteyle satılır); "Çok kaşınıyorum" ve "Burnum akıyor" semptomları bu ilaçları artık kabul etmiyor — SYMPTOMS düzeltmesi ileride

### 8. SABIR BARI GİZLENDİ
- Sabır SİSTEMİ aynen çalışıyor (azalma, küsme + itibar cezası, reçete incelemede donma) — sadece çizim kaldırıldı
- Tek örtük ipucu: düşük sabırda hasta titremesi
- Konsoldan takip: cheats.setPatience(n), cheats.state().activePatience ("5/38" formatında)

## MEVCUT ASSET'LER
- 10 ilaç PNG'si: agriban, alerjin, atesdus, bandajix, cvitamin, goznur, miderahat, nezleson, oksurmez, uykutas (kalan 29 ilaç emoji fallback)
- 8 karakter PNG'si (patient_*), bg_pharmacy, counter, prescription_paper
- doctor_book + doctor_book_closed (+ doctor_book_icon)
- pc (tezgahtaki bilgisayar, PHARMATEK)

## SIRADAKİ YAPILACAKLAR
1. DENGE TURU — yeni ekonomiye göre dailyGoal/startMoney/sahte cezaları ayarı (Kerem'in oynanış verisi bekleniyor: gün sonu kasa, hasta sayısı)
2. Eczane büyütme (geliştirmeler, nöbetçi modu)
3. PC'ye SGK Medula / E-reçete ekranları (drawPcScreen kapsayıcısı buna hazır)
4. Kalan 29 emoji ilacın PNG üretimi (grup grup; sırada: Ağrı grubu)

## CHEAT LİSTESİ (window.cheats)
- addMoney(n), setReputation(n), skipDay(), setPatience(n), clearQueue(), newPatient(), spawnFake()
- revealFlaws() — aktif reçetenin sahte/kusur dökümü
- setGroup(gid), assetStatus(), state() — state() activePatience dahil özet döner
- menu(), gameOver()
- stock() — tüm stok tablosu; setStock(id, n), emptyStock(id), openDepot()
- prices() — tüm ilaçların alış/satış/kâr% tablosu (console.table)

## Temizlik
- .DS_Store dosyaları repodan çıkarıldı ve .gitignore'a eklendi (commit 062cbde) — TAMAMLANDI

## Doğrulanacaklar (henüz koddan teyit edilmedi)
- İlaç id tip tutarlılığı (string vs number) sipariş eşleştirmede sorun yaratıyor mu
- ctx.save()/ctx.restore() rotasyon transformlarında dengeli mi
- PNG çizmeden önce asset hazır mı kontrolü (img.complete && img.naturalWidth > 0)

## Çalışma Kuralları
- claude.ai prompt yazar → Claude Code/Codex repoya yazıp commit eder → Kerem test eder → çalışınca push
- Değişiklikler parça parça: bitir → commit → DUR → test
- Değer/bug sorununda tahmin yok, koddan doğrula
- Çalışan şeyi bozma; stabilite önceliklidir
