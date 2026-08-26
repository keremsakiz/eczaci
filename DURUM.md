# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-07-12 (koddan doğrulandı, index.html 2802 satır)

Bu belge, projeyi hiç bilmeyen bir asistanın okuyup kaldığı yerden devam edebilmesi için yazılmış bir devir notudur.

## 1. Oyun Nedir
Eczacı: Büfeci'den esinlenen, iOS hedefli Türk eczane simülasyonu.

Çekirdek döngü: hasta gelir → reçete uzatır ya da semptom söyler → reçeteliyse ONAYLA/REDDET incelemesi → raftan doğru ilaç(lar) seçilir → SERVİS ET → para + itibar.

## 2. Teknik Yapı
- Tek dosya index.html (HTML5 Canvas + vanilla JS, harici kütüphane yok), tüm CSS/JS inline
- 9:16 dikey mobil layout, devicePixelRatio retina desteği
- Capacitor ile iOS paketleme planlı (henüz yapılmadı)
- GitHub: github.com/keremsakiz/eczaci (origin remote doğrulandı)
- State machine: MENU / PLAYING / DAYEND / GAMEOVER
- 60 FPS requestAnimationFrame döngüsü; update(dt) ve render() ayrı fonksiyonlar
- Tüm sayısal ayarlar dosyanın başında tek bir CONFIG objesinde
- Asset katmanı: Assets.load(key, src) + Sprite.draw(ctx, key, x, y, w, h, fallback, fit) — PNG yoksa/yüklenmemişse fallback (çoğunlukla emoji) çizilir. Yeni görsel eklemek çoğu zaman sadece assets/ klasörüne doğru isimle PNG koymak demektir, AMA loadAssets() içinde o assetKey'in Assets.load ile kayıtlı olduğu ayrıca doğrulanmalı (loader MEDICINES'i otomatik gezmiyor, açık liste tutuyor)
- Layout dikdörtgenleri (butonlar, kartlar, sekmeler) her zaman ilgili draw fonksiyonu İÇİNDE hesaplanır, render() içinde değil

## 3. Tamamlanan Sistemler

**Çekirdek + gün döngüsü** — hasta kuyruğu (maxQueue: 3), gün süre değil müşteri limitiyle biter (patientsPerDayBase 8, her gün +2), takvim gün numarasından ilerler (17 Haziran 2026 = Gün 1), DAYEND ekranında gün özeti (servis/doğru/yanlış/küsen/kazanç + hedef tutturma).

**Sabır sistemi** — çalışıyor ama BARI GİZLİ: sabır her frame azalır, sıfırlanınca hasta küser ve angryRepLoss (8) itibar cezası uygulanır, reçete inceleme fazında (ONAYLA/REDDET beklerken) sabır donuk kalır. Ekranda tek örtük ipucu: sabır düşükken hastanın hafif titremesi. Konsoldan takip: cheats.state().activePatience ("12.3/38" formatında).

**İlaç sistemi** — 39 ilaç, 9 kategori sekmesi: agri_ates (Ağrı), soguk (Soğuk), alerji (Alerji), sindirim (Mide), vitamin (Vitamin), goz_kulak ("Göz&Kulak"), ilk_yardim (İlk Yrd.), uyku_sinir (Uyku), cilt (Cilt). Sekmeler emojisiz, sadece metin. Sipariş eşleştirme adet/multiset mantığıyla (sameMultiset, checkOrder) — reçetede aynı ilaçtan birden fazla istenebilir, sıra önemsiz adet önemli.

**Reçete sistemi + sahte reçete inceleme** — 6 sahtelik türü (fake_doctor, expired, overdose, no_stamp, bad_signature, conflict), ipuçları renkle ele vermez (oyuncu tarihi/imzayı/kaşeyi okuyup anlamalı), ONAYLA/REDDET kararı, asimetrik ceza/ödül: sahteyi yakalayınca ödül (fakeCatchBonus 20₺ + itibar), sahteyi onaylayıp ilaç verince ağır ceza (fakeApproveMoneyPenalty 50₺ + itibar), gerçeği reddedince hafif ceza (wrongRejectRepLoss 5).

**Doktor defteri** — 20 KNOWN_DOCTORS, tezgahtaki kapalı defter objesine dokununca açılma animasyonu. "Tanınan Doktorlar" başlığı kitabın DIŞINDA, üst kenarın üstünde ayrı krem plakada (kitap görseline binmiyor). İsimler kitaptaki çizgilere hizalı; hiza CONFIG.bookTextStartY (0.225) ve bookLineStep (0.0723) ile ince ayarlanabilir (kitap yüksekliğine oran).

**FAKE_DOCTORS** — 14 gerçekçi Türk hekim ismi, defterde YOK ama kasıtlı olarak KNOWN_DOCTORS'a yakın seçilmiş (Yıldırım/Yıldız, Şahiner/Şahin, Kayahan/Kaya gibi) — oyuncu defteri gerçekten kontrol etmek zorunda kalır.

**MENU + GAMEOVER** — game.state MENU'den başlar. startNewGame() tam reset yapar (para, itibar, gün, stok dahil) ve game.hasRun = true işaretler. Menüde game.hasRun true ise "DEVAM ET (Gün N)" butonu görünür (reset yapmadan PLAYING'e döner); BAŞLA her zaman tam reset. triggerGameOver() game.hasRun'ı false'a çeker (bitmiş oyuna devam edilemez). loseReputation() merkezi helper — itibar <= minReputation olunca triggerGameOver() tetiklenir.

**STOK + ECZA DEPOSU** — ilaç bazında kalıcı stok (game.stock, startStock 10, maxStock 30; startNextDay resetlemez, sadece startNewGame kurar). Stok 0 → tapMedicine servise izin vermez, raf kartında "TÜKENDİ" etiketi + kısa toast uyarısı; stoğu olan kartlarda sağ üst köşede stok rozeti. Depo paneli PC ekranı kapsayıcısında (drawPcScreen — yeşilimsi sistem başlık şeridi; ileride SGK Medula/E-reçete ekranları aynı kapsayıcıya eklenecek). Sipariş adet bazlı: satırda −/+ adımlayıcı (pending sepet, maxStock clamp), tek "SİPARİŞ VER" butonu ile toplu uygulama. Satır düzeni üç sabit oranlı sütun + ellipsisText yardımcı fonksiyonu (fontu küçültmeden "…" ile keser, sütunlar birbirine binmez).

**EKONOMİ** — her ilaçta elle yazılmış cost (alış) / price (satış); kâr marjı ilaca göre ~%18-41 arasında değişir (temel ağrı kesici düşük, vitamin yüksek). Kazanç = servis edilen ilaçların price toplamı (adet dahil). Sabit birim fiyat (CONFIG.pricePerMedicine) kaldırıldı.

**ARAYÜZ** — büyük ilaç kartları (3 sütunlu grid, görsel contain ile çizilir, asla ezilmez), grid dikeyde taşarsa drag-scroll + sağ kenarda ince retro scrollbar (sadece taşan içerikte görünür, salt görsel — tıklama hedefi değil). Büfeci düzeni HUD: sol kutuda GÜN + tarih (emojisiz) ile hava durumu satırı (kozmetik, oyun mantığına etkisi yok, gün numarasından deterministik seçilir — WEATHERS + WEATHER_SEQ, frame'de rastgele YOK), ortada kare EV butonu (menüye döner, veri silinmez), sağ kutuda itibar (emoji eşikleri: <35 😡, 35-69 😑, ≥70 😊, yanında %N) ve binlik ayraçlı para (formatMoney — toLocaleString kullanmaz, kendi ayraç mantığı, değer değişmediği sürece cache'li string döner). Gün sonu kartı yüksekliği sabit değil, içerikten hesaplanır (başlık + satır sayısı × satır adımı + butonlar + boşluklar) ve ferah satır aralığına sahip. Konuşma balonları krem/açık zeminli; reçeteli hastada balon spawn anında seçilen sabit bir repliğe sahiptir (frame'de yeniden seçilmez).

**Son görsel düzeltmeler** — PC tezgahın sağ tarafına, kapalı defterle aynı yüzey çizgisine oturacak şekilde hizalandı (CONFIG.pcScale/pcOffsetX ile ince ayarlanabilir); kategori sekmeleri yukarı taşındı ve ilaç grid'inin görünür alanı büyüdü; tezgah bandının altındaki alan artık bg_pharmacy'nin gömülü tezgahını tamamen örten, bandın ahşap tonlarından türetilmiş kodla çizilmiş bir gradyan zeminle kaplı (asset eklenmedi).

## 4. Mevcut Assetler
39 ilaçtan **14'ü gerçek PNG**, **25'i emoji fallback**:
- Gerçek PNG'si olanlar: med_agriban, med_oksurmez, med_nezleson, med_cvitamin, med_miderahat, med_bandajix, med_atesdus, med_alerjin, med_goznur, med_uykutas (ilk 10) + med_bassakin, med_kasgevset, med_disdindir, med_agrijel (Ağrı grubu tamamlandı — 4 yeni PNG loadAssets()'e bağlandı)
- Kalan 25 ilaç emoji + renkli kutu fallback ile gösteriliyor

Karakter/sahne/UI assetleri (hepsi loadAssets() içinde kayıtlı ve assets/ klasöründe mevcut):
- 8 hasta karakteri: patient_granny, patient_man, patient_youth, patient_woman, patient_business, patient_grandpa, patient_worker, patient_lady
- Sahne/UI: bg_pharmacy, counter, prescription_paper, doctor_book_closed, doctor_book, pc (tezgahtaki bilgisayar)

## 5. Sıradaki Yapılacaklar
1. **DENGE TURU (öncelikli)** — yeni ekonomiye göre dailyGoal / startMoney / sahte reçete cezaları ayarlanmalı. Eldeki veri: Gün 1'de 8 servis, 5 doğru / 3 yanlış, 394₺ kazanç; hedef 150₺ (çok kolay tutuyor, gevşek kalıyor). Depodan sipariş sonrası kasa erimesi de ölçülüp buna göre startMoney/dailyGoal dengelenmeli.
2. Eczane büyütme: geliştirmeler, nöbetçi (gece) modu — HUD altına Büfeci'deki gibi bir buton şeridi gelebilir.
3. PC'ye SGK Medula / E-reçete ekranları (drawPcScreen kapsayıcısı buna hazır tasarlandı).
4. Kalan emoji ilaçların PNG üretimi (grup grup ilerliyor; Ağrı grubu tamamlandı, sırada Soğuk grubu).
5. GAMEOVER kartındaki "📅 Ulaşılan gün" satırındaki emoji kaldırılmalı — HUD'da aynı sorun (emoji üzerinde sabit tarih görseli göstermesi) daha önce düzeltildi, GAMEOVER kartı unutuldu (index.html satır ~2472).

## 6. Çalışma Şekli (Kerem'in akışı)
- Promptlar Claude Code'a (VS Code, Opus, High effort) kopyala-yapıştır için kod bloğu içinde, açıklamasız verilir; sonu hep "Komple güncel index.html ver."
- İterasyon döngüsü: prompt → test → ekran görüntüsü → geri bildirim
- Görsel üretimi: ChatGPT (Büfeci stili prompt, düz/beyaz arka plan) → asistana gönderilir → asistan Python flood-fill ile şeffaflaştırır, gerekirse grid'i böler → present_files ile PNG döner. Higgsfield KULLANILMIYOR.
- Git: her sağlam noktada `git add -A && git commit -m "..." && git push`

### Görsel Stil Çapası
Büfeci tarzı: sıcak, hafif koyu, doygun, yarı-gerçekçi boyalı illüstrasyon, retro dokulu gölgeleme. Ahşap kahveleri, paslı metal, amber vurgular. KAWAII/PASTEL DEĞİL, düz vektör DEĞİL, çizgi film DEĞİL. İlaçlar 1:1, karakterler 3:4, arka plan 9:16.

## 7. Bilinen Teknik Riskler
- String vs number id uyumsuzluğu sameMultiset'i sessizce bozabilir — ilaç id'leri her zaman string olarak tutulmalı
- Çizim içinde Math.random()/new Date() çağrısı titremeye yol açar; dateShort() ve formatMoney() gün/değer değişmediği sürece cache'li string döner — yeni cache'lenmemiş hesaplamalar eklerken dikkat
- Dengesiz ctx.save()/ctx.restore() kümülatif transform/alpha kaymasına yol açabilir
- PNG çizmeden önce img.complete && img.naturalWidth > 0 kontrolü şart (Sprite.draw bunu zaten yapıyor, elle Assets.images erişiminde unutulmamalı)

## 8. Debug Cheatleri (window.cheats — koddan birebir doğrulandı)
- addMoney(n) — parayı artırır
- setReputation(n) — itibarı clamp'li ayarlar
- skipDay() — PLAYING'deyse günü bitirir
- setPatience(n) — aktif hastanın sabrını ayarlar
- clearQueue() — kuyruğu/tezgahı/feedback'i temizler
- newPatient() — yeni hasta spawn eder
- spawnFake() — zorla sahte reçeteli hasta spawn eder
- menu() — MENU state'ine geçer
- gameOver() — triggerGameOver() tetikler
- revealFlaws() — aktif reçetenin sahte/kusur/doktor/tarih/kaşe/imza dökümünü konsola yazar
- setGroup(gid) — aktif ilaç grubunu değiştirir (grid'i yeniden kurar)
- stock() — tüm ilaçların stok tablosunu console.table ile yazar
- setStock(id, n) — bir ilacın stoğunu clamp'li ayarlar
- emptyStock(id) — bir ilacın stoğunu sıfırlar
- openDepot() — depo panelini açar
- prices() — tüm ilaçların alış/satış/kâr% tablosunu console.table ile yazar
- assetStatus() — hangi asset'lerin yüklendiğini/boş olduğunu ve toplam yükleme özetini döner
- state() — gün/para/itibar/aktif sabır/kuyruk/tezgah/beklenen ilaç/gün istatistiklerini özetleyen JSON döner
