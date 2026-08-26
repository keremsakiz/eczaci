# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-08-26 (koddan doğrulandı, index.html 3336 satır)

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
- Rastgelelik tek bir değiştirilebilir kaynaktan akar: `rng()` → `_rngSource` (varsayılan Math.random). `withSeed(seed, fn)` bu kaynağı geçici olarak mulberry32 ile değiştirir; `rand()` ve `pick()` zaten `rng()` kullandığı için üretim kodunun kendisi değişmeden deterministik hale gelir

## 3. Tamamlanan Sistemler

**Çekirdek + gün döngüsü** — hasta kuyruğu (maxQueue: 3), gün süre değil müşteri limitiyle biter (patientsPerDayBase 8, her gün +2), takvim gün numarasından ilerler (17 Haziran 2026 = Gün 1), DAYEND ekranında gün özeti (servis/doğru/yanlış/küsen/kazanç + hedef tutturma rozeti).

**Sabır sistemi** — çalışıyor ama BARI GİZLİ: sabır her frame azalır, sıfırlanınca hasta küser ve angryRepLoss (8) itibar cezası uygulanır, reçete inceleme fazında (ONAYLA/REDDET beklerken) sabır donuk kalır. Ekranda tek örtük ipucu: sabır düşükken hastanın hafif titremesi. Konsoldan takip: cheats.state().activePatience ("12.3/38" formatında).

**İlaç sistemi** — 39 ilaç, 9 kategori sekmesi: agri_ates (Ağrı), soguk (Soğuk), alerji (Alerji), sindirim (Mide), vitamin (Vitamin), goz_kulak ("Göz&Kulak"), ilk_yardim (İlk Yrd.), uyku_sinir (Uyku), cilt (Cilt). Sekmeler emoji + metin olarak çizilir (drawTabLabel ikisini birlikte ortalar). Sipariş eşleştirme adet/multiset mantığıyla (sameMultiset, checkOrder) — reçetede aynı ilaçtan birden fazla istenebilir, sıra önemsiz adet önemli.

**Kategori taksonomisi (DÜZELTİLEN HATA)** — eskiden 39 ilaç **19 farklı kategoriye** dağılmıştı ama sekme sayısı 9'du: aynı rahatsızlığın iki ayrı kategorisi vardı ("ağrı" + "Ağrı/Ateş", "mide" + "Sindirim", "yara" + "İlk Yardım" …). En kötüsü `"alerji"` ile `"Alerji"` çifti: yalnızca baş harf büyüklüğüyle ayrılıyorlardı ve eşleşme tam string karşılaştırması (`m.category === symptom.category`) olduğu için ayrı kategori sayılıyorlardı. Sonuç: **35 semptomun 32'sinde** aynı sekmede duran, doğru görünen ilaç yanlış sayılıyordu — "Ateşim var" diyen hastaya Başsakin vermek hataydı, "Başım çok ağrıyor" diyene Ağrıban vermek hataydı. Kategoriler kanonik adlara birleştirildi; artık **kategori ↔ sekme 1:1** (9 kategori, 9 sekme) ve bir sekmedeki her ilaç o sekmenin semptomları için doğru cevap. Boot self-test'i bu 1:1 kuralını koruyor.

**Reçete sistemi + sahte reçete inceleme** — 6 sahtelik türü iki sınıfa ayrılmıştır:
- `DETECTABLE_FLAWS` = fake_doctor, expired, overdose, no_stamp, bad_signature — hepsi yalnız reçete kağıdına ve doktor defterine bakarak doğrulanabilir.
- `SUBTLE_FLAWS` = conflict (uyku ilacı + enerji takviyesi bir arada) — alan bilgisi ister, oyunun hiçbir yerinde öğretilmez.

Her sahte reçete **garanti olarak en az bir DETECTABLE kusur** taşır; conflict yalnızca ikinci kusur olarak eklenebilir (%50 ihtimalle ikinci kusur çekilir). Sebep: eskiden kusur 6'lık havuzdan rastgele seçiliyordu ve tek kusuru conflict olan reçete üretilebiliyordu — doktor defterdeki gerçek doktor, kaşe yerinde, imza düzgün, tarih bugün, adetler ×1. Oyuncunun yakalayabileceği hiçbir ipucu yoktu ama onaylayınca "sahte reçete" cezası yiyordu.

İpuçları renkle ele vermez (oyuncu tarihi/imzayı/kaşeyi okuyup anlamalı). Asimetrik ceza/ödül: sahteyi yakalayınca ödül (fakeCatchBonus 20₺ + fakeCatchRepGain 8 itibar), sahteyi onaylayıp ilaç verince ağır ceza (fakeApproveMoneyPenalty **182₺, türetilmiş** + fakeApproveRepLoss 15 itibar), gerçeği reddedince para cezası YOK, sadece satış kaybı + wrongRejectRepLoss 5 itibar. Reçetenin sahte olma ihtimali fakeChance 0.28.

**Doktor defteri** — 20 KNOWN_DOCTORS, tezgahtaki kapalı defter objesine dokununca açılma animasyonu. "Tanınan Doktorlar" başlığı kitabın DIŞINDA, üst kenarın üstünde ayrı krem plakada (kitap görseline binmiyor). İsimler kitaptaki çizgilere hizalı; hiza CONFIG.bookTextStartY (0.225) ve bookLineStep (0.0723) ile ince ayarlanabilir (kitap yüksekliğine oran).

**FAKE_DOCTORS** — 14 gerçekçi Türk hekim ismi, defterde YOK ama kasıtlı olarak KNOWN_DOCTORS'a yakın seçilmiş (Yıldırım/Yıldız, Koç/Koçak, Taş/Taşkın gibi) — oyuncu defteri gerçekten kontrol etmek zorunda kalır. **Kural: sahte isim, gerçek isimden yalnızca soyad öneki uzatmasıyla ayrılmamalı.** Bu yüzden iki isim değiştirildi: "Dr. Zeynep Kayahan" → "Dr. Sibel Kayahan" (defterde "Dr. Zeynep Kaya" var: ad aynı + soyad öneki, ayırt edilemiyordu), "Dr. Elif Şahiner" → "Dr. Nurcan Şahiner" (defterde "Dr. Elif Şahin" var). Kalan benzer çiftlerde ADLAR farklı olduğu için ayırt edilebilirler. Boot self-test'i bu kuralı denetler.

**MENU + GAMEOVER** — game.state MENU'den başlar. startNewGame() tam reset yapar (para, itibar, gün, stok dahil) ve game.hasRun = true işaretler. Menüde game.hasRun true ise "DEVAM ET (Gün N)" butonu görünür (reset yapmadan PLAYING'e döner); BAŞLA her zaman tam reset. triggerGameOver() game.hasRun'ı false'a çeker (bitmiş oyuna devam edilemez). loseReputation() merkezi helper — itibar <= minReputation olunca triggerGameOver() tetiklenir.

**STOK + ECZA DEPOSU** — ilaç bazında kalıcı stok (game.stock, startStock 10, maxStock 30; startNextDay resetlemez, sadece startNewGame kurar). Stok 0 → tapMedicine servise izin vermez, raf kartında "TÜKENDİ" etiketi + kısa toast uyarısı; stoğu olan kartlarda sağ üst köşede stok rozeti. Depo paneli PC ekranı kapsayıcısında (drawPcScreen — yeşilimsi sistem başlık şeridi; ileride SGK Medula/E-reçete ekranları aynı kapsayıcıya eklenecek). Sipariş adet bazlı: satırda −/+ adımlayıcı (pending sepet, maxStock clamp), tek "SİPARİŞ VER" butonu ile toplu uygulama. Sipariş tutarı kasadan düşer ve **kasa negatife inemez**: para yetmiyorsa buton pasifleşir ve butonun altında "⛔ Yetersiz bakiye — kasa: N₺" uyarısı görünür. Satır düzeni üç sabit oranlı sütun + ellipsisText yardımcı fonksiyonu (fontu küçültmeden "…" ile keser, sütunlar birbirine binmez).

**ARAYÜZ** — büyük ilaç kartları (3 sütunlu grid, görsel contain ile çizilir, asla ezilmez), grid dikeyde taşarsa drag-scroll + sağ kenarda ince retro scrollbar (sadece taşan içerikte görünür, salt görsel — tıklama hedefi değil). Büfeci düzeni HUD: sol kutuda GÜN + tarih (emojisiz) ile hava durumu satırı (kozmetik, oyun mantığına etkisi yok, gün numarasından deterministik seçilir — WEATHERS + WEATHER_SEQ, frame'de rastgele YOK), ortada kare EV butonu (menüye döner, veri silinmez), sağ kutuda itibar (emoji eşikleri: <35 😡, 35-69 😑, ≥70 😊, yanında %N) ve binlik ayraçlı para (formatMoney — toLocaleString kullanmaz, kendi ayraç mantığı, değer değişmediği sürece cache'li string döner). Gün sonu kartı yüksekliği sabit değil, içerikten hesaplanır (başlık + satır sayısı × satır adımı + butonlar + boşluklar) ve ferah satır aralığına sahip. Konuşma balonları krem/açık zeminli; reçeteli hastada balon spawn anında seçilen sabit bir repliğe sahiptir (frame'de yeniden seçilmez).

**Son görsel düzeltmeler** — PC tezgahın sağ tarafına, kapalı defterle aynı yüzey çizgisine oturacak şekilde hizalandı (CONFIG.pcScale/pcOffsetX ile ince ayarlanabilir); kategori sekmeleri yukarı taşındı ve ilaç grid'inin görünür alanı büyüdü; tezgah bandının altındaki alan artık bg_pharmacy'nin gömülü tezgahını tamamen örten, bandın ahşap tonlarından türetilmiş kodla çizilmiş bir gradyan zeminle kaplı (asset eklenmedi).

## 4. Ekonomi ve Denge

### 4.1 Türetilmiş temel değerler
Ekonominin hiçbir temel sayısı elle yazılmaz; hepsi MEDICINES dizisinden hesaplanır (deriveEconomy). İlaç eklendiğinde/fiyatı değiştiğinde denge kendini otomatik yeniden kurar:

| Değer | Kaynak | Şu anki |
|---|---|---|
| avgPrice | tüm ilaçların price ortalaması | 90,97₺ |
| avgCost | tüm ilaçların cost ortalaması | 62,69₺ |
| ortalama kâr marjı | 1 − cost/price ortalaması | %28,6 (ilaç bazında %18–41) |
| startMoney | 100'e yuvarlı (avgCost × 30) | 1.900₺ |
| fakeApproveMoneyPenalty | round(avgPrice × 2) | 182₺ |

Her ilaçta elle yazılmış cost (alış) / price (satış) vardır; kâr marjı ilaca göre değişir (temel ağrı kesici düşük, vitamin yüksek). Kazanç = servis edilen ilaçların price toplamı (adet dahil). Yanlış ilaç verilince stok düşer, para gelmez, üstüne verilen ilaçların cost toplamı zarar yazılır. Hem bu zarar hem sahte reçete cezası kasadan VE günlük kazanç sayacından (dayStats.money) düşer — hedef günlük kazanca karşı ölçüldüğü için bu tutarlılık şart.

### 4.2 Gün önden üretilir (buildDaySchedule)
Gün başında o günün **tüm hasta listesi tek seferde** üretilir ve game.daySchedule'a konur. Spawn artık anlık hasta üretmez, bu listeden sırayla çeker — spawn zamanlaması, kuyruk limiti (maxQueue 3) ve sabır sistemi değişmedi, değişen sadece hastanın NE ZAMAN üretildiği.

Üretim seed'lidir: `withSeed(CONFIG.daySeedBase + day * 7919, …)` + mulberry32. **Aynı seed + aynı gün = aynı liste**, her oynanışta. CONFIG.daySeedBase (20260617) değiştirilirse tüm günler yeniden kurulur. Determinizmi korumak için iki izolasyon var: pickKnownDoctor'ın okuduğu game.lastDoctor üretim boyunca izole edilir, ve reçete tarihleri `_dateDayOverride` ile **üretilen günün** tarihine damgalanır (yoksa gün 3'ün listesi gün 1'deyken üretilince gün 1'in tarihini basardı).

Liste cache'lenir (_dayScheduleCache); hedef menüden sorulsa bile gün iki kez üretilmez. Oynanırken hasta nesneleri değiştiği (sabır, decided) için beginDaySchedule her seferinde taze kopya verir — aynı gün yeniden oynanabilir.

### 4.3 Günlük hedef formülü
Hedef genel ortalamalardan değil, **o günün gerçek listesinden** hesaplanır:

```
N        = o günün toplam hasta sayısı
R        = SADECE geçerli hastaların sipariş cirosu (sahte reçeteliler 0₺ katkı yapar,
           çünkü doğru oynanış onları reddetmektir)
C        = aynı geçerli hastaların ilaç cost toplamı
missCost = (R + C) / geçerli hasta sayısı        ← o güne özel gerçek hata maliyeti
izinliHata(gün) = N × missRate(gün)
missRate(gün)   = max(0.10, 0.25 − (gün−1) × 0.015)

hedef = floor10( clamp( R − izinliHata × missCost, R×0.40, R×0.90 ) )
```

Bir hatanın maliyeti çift taraflıdır: kaçan ciro + yazılan cost zararı — missCost bunu birlikte ölçer. Tolerans **müşteri sayısına oranlıdır** (sabit hata payı büyüyen günlerde fiilen kusursuz oynanış dayatıyordu). goalRatioClamp [0.40, 0.90] yalnız güvenlik ağıdır; uç günlerde hedefin saçmalamasını (ör. "26/26 kusursuz gün") engeller. Yuvarlama AŞAĞI yapılır — yukarı yuvarlamak formülün az önce verdiği toleransın bir kısmını geri alıyordu.

Şu anki üretilmiş günlerden (cheats.balance() çıktısı):

| Gün | N | geçerli | R | C | missCost | missRate | izinli hata | hedef | efektif oran | gereken doğru |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 8 | 8 | 1.111₺ | 752₺ | 233₺ | 0,250 | 2,00 | 640₺ | 0,576 | **6/8** |
| 5 | 16 | 14 | 1.423₺ | 990₺ | 172₺ | 0,190 | 3,04 | 890₺ | 0,625 | **13/16** |
| 10 | 26 | 22 | 3.501₺ | 2.442₺ | 270₺ | 0,115 | 2,99 | 2.690₺ | 0,768 | **23/26** |

"Gereken doğru" sahte reçetelerin doğru reddedilmesini de doğru işlem sayar. Rakamlar üretilmiş gerçek günlerden geldiği için kesindir, tahmin değildir.

### 4.4 Hedefin yaptırımı YOKTUR — bu bilinçli bir tasarım kararıdır
Bunu net yazmak gerekiyor, çünkü koda bakan biri eksiklik sanabilir: **günlük para hedefinin hiçbir yaptırımı yoktur.** endDay() yalnız iki şey yapar — state'i DAYEND'e çeker ve `dayResult = { goal, met }` kurar. `met` bayrağı kodun tamamında sadece DAYEND kartındaki rozetin rengini ve metnini ("🎯 Hedef tuttu!" / "⚠️ Hedef tutmadı") belirler. İtibar kaybı yok, para cezası yok, oyun bitmez, kaçırılan hedef ertesi güne eklenmez; para ve stok olduğu gibi devreder. Üst üste hedef kaçırmak da hiçbir şey tetiklemez.

**Tek fail state itibarın 0'a inmesidir** (loseReputation → triggerGameOver). İtibar yalnız şu dört yoldan düşer: yanlış ilaç (5), sahte reçeteyi onaylamak (15), geçerli reçeteyi reddetmek (5), hastayı küstürmek (8).

Para baskısı **dolaylıdır**: kasa erir → depo siparişi verilemez → stok biter → hasta servis edilemez → itibar düşer → oyun biter. Hedef bu zincirin ölçüm göstergesidir, ceza mekanizması değil. Hedefe doğrudan yaptırım bağlanacaksa (itibar cezası, iflas vb.) bu bilinçli olarak alınmış bir karar olmalı; şu anki davranış kaza sonucu değildir.

### 4.5 Bilinen sınır: hasta değerleri heterojen
Hedef, günler arası kumarı çözer (R artık gerçek listeden gelir) ama **gün içi kumarı çözmez.** Ölçüm (200 gün): semptom hastasının ortalama değeri ~150₺, reçete hastasınınki ~420₺ — yaklaşık 2,8 kat fark. Reçete 1–3 kalem × 1–3 adet olabildiği için tek bir sipariş günün cirosunun büyük kısmını taşıyabilir.

Sonuç: missCost bir ortalama olduğundan, "3 hata" tek bir sayı değildir — en ucuz üç hastayı kaçırmakla en pahalı üçünü kaçırmak arasında birkaç yüz ₺ fark oluşur. Yani **hangi müşteride hata yaptığın günü belirleyebiliyor.** cheats.balance() her gün için bu zarfı (en kötü–en iyi aralık) yazdırır; şu an 10 günün 10'u da "hangi hastada hata yaptığına bağlı" durumunda.

Not edilen olası çözüm — **KARAR VERİLMEDİ, uygulanmadı**: tek bir siparişin günün cirosundaki payına tavan koymak (ör. bir hasta R'nin %X'inden fazlasını taşıyamasın; taşıyorsa kalem/adet küçültülsün). Bu, zarfı gerçekten daraltır ama reçete çeşitliliğini kısar. Alternatif olarak maxPrescriptionItems'ı 3'ten 2'ye çekmek ve adet ağırlıklarını 1'e kaydırmak da aynı yöne çalışır.

## 5. Mevcut Assetler
39 ilaçtan **14'ü gerçek PNG**, **25'i emoji fallback** (loadAssets() içindeki açık listeden doğrulandı):
- Gerçek PNG'si olanlar: med_agriban, med_oksurmez, med_nezleson, med_cvitamin, med_miderahat, med_bandajix, med_atesdus, med_alerjin, med_goznur, med_uykutas (ilk 10) + med_bassakin, med_kasgevset, med_disdindir, med_agrijel (Ağrı grubu tamamlandı)
- Kalan 25 ilaç emoji + renkli kutu fallback ile gösteriliyor

Karakter/sahne/UI assetleri (hepsi loadAssets() içinde kayıtlı ve assets/ klasöründe mevcut):
- 8 hasta karakteri: patient_granny, patient_man, patient_youth, patient_woman, patient_business, patient_grandpa, patient_worker, patient_lady
- Sahne/UI: bg_pharmacy, counter, doctor_book_closed, doctor_book, pc (tezgahtaki bilgisayar)

Diskte olup KULLANILMAYAN dosyalar:
- **prescription_paper.png** — artık loadAssets() içinde kayıtlı DEĞİL. Reçete kağıdı tamamen kodla çiziliyor (drawPrescriptionPaper), hiçbir Sprite.draw çağrısı bu asset'i istemiyor. Dosya assets/ klasöründe duruyor ama yüklenmiyor.
- **doctor_book_icon.png** — assets/ klasöründe var, kodda hiç geçmiyor (ne loadAssets'te ne başka yerde).

`cheats.assetStatus()` kapsamı: bg_pharmacy, counter, doctor_book, doctor_book_closed, pc + 39 ilacın assetKey'i + 8 hasta avatarı. Hiç yüklenmeyen btn_serve listeden çıkarıldı (her zaman "boş" gösterip yanıltıyordu).

## 6. Sıradaki Yapılacaklar
1. Eczane büyütme: geliştirmeler, nöbetçi (gece) modu — HUD altına Büfeci'deki gibi bir buton şeridi gelebilir.
2. PC'ye SGK Medula / E-reçete ekranları (drawPcScreen kapsayıcısı buna hazır tasarlandı).
3. Kalan 25 emoji ilacın PNG üretimi (grup grup ilerliyor; Ağrı grubu tamamlandı, **sırada Soğuk grubu**).
4. **Karar bekleyen:** sipariş konsantrasyon tavanı — tek hastanın günün cirosundaki payına sınır (bkz. 4.5). Uygulanmadı, tartışılmadı.

## 7. Çalışma Şekli (Kerem'in akışı)
- Promptlar Claude Code'a (VS Code, Opus, High effort) kopyala-yapıştır için kod bloğu içinde, açıklamasız verilir; sonu hep "Komple güncel index.html ver."
- İterasyon döngüsü: prompt → test → ekran görüntüsü → geri bildirim
- Görsel üretimi: ChatGPT (Büfeci stili prompt, düz/beyaz arka plan) → asistana gönderilir → asistan Python flood-fill ile şeffaflaştırır, gerekirse grid'i böler → present_files ile PNG döner. Higgsfield KULLANILMIYOR.
- Git: her sağlam noktada `git add -A && git commit -m "..." && git push`

### Görsel Stil Çapası
Büfeci tarzı: sıcak, hafif koyu, doygun, yarı-gerçekçi boyalı illüstrasyon, retro dokulu gölgeleme. Ahşap kahveleri, paslı metal, amber vurgular. KAWAII/PASTEL DEĞİL, düz vektör DEĞİL, çizgi film DEĞİL. İlaçlar 1:1, karakterler 3:4, arka plan 9:16.

## 8. Bilinen Teknik Riskler
- String vs number id uyumsuzluğu sameMultiset'i sessizce bozabilir — ilaç id'leri her zaman string olarak tutulmalı
- Eşleşme her yerde **id/kategori string'i** üzerinden yapılır, asla nesne referansı üzerinden değil. beginDaySchedule sığ kopya verir (request paylaşılır); derin klona (JSON/structuredClone) geçilirse bu kural bozulmaz ama request'in oynanış sırasında değişmediği varsayımı yeniden gözden geçirilmeli
- Çizim içinde Math.random()/new Date() çağrısı titremeye yol açar; dateShort() ve formatMoney() gün/değer değişmediği sürece cache'li string döner — yeni cache'lenmemiş hesaplamalar eklerken dikkat
- Dengesiz ctx.save()/ctx.restore() kümülatif transform/alpha kaymasına yol açabilir
- PNG çizmeden önce img.complete && img.naturalWidth > 0 kontrolü şart (Sprite.draw bunu zaten yapıyor, elle Assets.images erişiminde unutulmamalı)
- Yeni ilaç/semptom eklerken kategori adı MUTLAKA mevcut 9 kanonik addan biri olmalı; yeni bir yazım (ör. "Alerji " veya "alerji") sessizce ayrı kategori yaratır ve doğru ilacı yanlış yapar — boot self-test'i bunu yakalar ama uyarı konsola yazılır, oyuncuya görünmez

## 9. Geliştirici Araçları

### 9.1 Karar teşhis bloğu
`CONFIG.debugDecisions` (varsayılan **true**) açıkken her servis/red kararında konsola tek okunabilir blok basılır: hasta tipi, istenen liste (ad + id + adet), verilen liste, doktorun defterde olup olmadığı, her kusur kontrolünün sonucu ve karşılaştırılan iki değer (reçete tarihi ↔ oyun tarihi), iç bayraklar (fake, flaws), tespit edilebilir kusurların listesi ve sonuç + gerekçe. Kapatmak için `CONFIG.debugDecisions = false`.

### 9.2 Boot'ta sessiz çalışan self-test'ler
Üçü de yalnız sorun bulursa console.warn atar; oyuncuya hiçbir şey görünmez.
- **verifyGoalBalance(false)** — gün 1..10 için: izinli hata kadar hata hedefi tutturmalı, bir fazlası tutturmamalı (ortalama değerli hata varsayımıyla; 10'a yuvarlama adımının açıklayabildiği ihlaller elenir). Ayrıca patolojik uçları arar: izinli hata kadar hata EN İYİ hâlde bile tutmuyorsa "hedef imkânsız", bir fazlası EN KÖTÜ hâlde bile tutuyorsa "hedef anlamsız".
- **selfTestPatients()** — gün 1..10'daki her hastayı gezer: (a) kategori ↔ sekme 1:1 mi, (b) sahte doktor isimleri gerçeklerden ayırt edilebilir mi (ad aynı + soyad öneki yasak), (c) hastanın tam ihtiyacı verilince sonuç daima "doğru" mu, (d) her sahte reçetenin tespit edilebilir en az 1 kusuru var mı, (e) gerçek reçetelerde kusur bayrağı/görünür kusur yok mu ve doktoru defterde mi, (f) gerçek reçetenin tarihi o günün tarihi mi.
- **checkDataHealth()** — her ilaç kategorisinin en az bir semptomu, her semptom kategorisinin en az bir ilacı var mı.

### 9.3 Debug cheatleri (window.cheats — 21 adet, koddan birebir doğrulandı)
- addMoney(n) — parayı artırır
- setReputation(n) — itibarı clamp'li ayarlar
- skipDay() — PLAYING'deyse günü bitirir
- setPatience(n) — aktif hastanın sabrını ayarlar
- clearQueue() — kuyruğu/tezgahı/feedback'i temizler
- newPatient() — BONUS hasta spawn eder (günün programına, hedefe ve gün sonu sayacına karışmaz)
- spawnFake() — zorla sahte reçeteli BONUS hasta spawn eder
- daySchedule(day) — o günün üretilmiş hasta listesini (tip, istek, ciro, mal maliyeti) ve gün ekonomisini (N, geçerli, sahte, R, C, missCost, izinli hata, hedef) tabloyla yazar
- menu() — MENU state'ine geçer
- gameOver() — triggerGameOver() tetikler
- revealFlaws() — aktif reçetenin sahte/kusur/doktor/tarih/kaşe/imza dökümünü konsola yazar
- setGroup(gid) — aktif ilaç grubunu değiştirir (grid'i yeniden kurar)
- stock() — tüm ilaçların stok tablosunu console.table ile yazar
- setStock(id, n) — bir ilacın stoğunu clamp'li ayarlar
- emptyStock(id) — bir ilacın stoğunu sıfırlar
- openDepot() — depo panelini açar
- prices() — tüm ilaçların alış/satış/kâr% tablosunu console.table ile yazar
- explainPatient() — kuyruktaki mevcut hasta için karar teşhis bloğunu istek üzerine basar (debugDecisions kapalı olsa bile)
- balance() — avgPrice/avgCost/marj/startMoney + gün 1..10 tablosu (missRate, izinli hata, N, geçerli, R, C, missCost, hedef, efektif oran, gereken doğru) + denge doğrulama satırları
- assetStatus() — hangi asset'lerin yüklendiğini/boş olduğunu ve toplam yükleme özetini döner
- state() — gün/para/itibar/aktif sabır/kuyruk/tezgah/beklenen ilaç/gün istatistiklerini özetleyen JSON döner
