# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-08-26 (koddan doğrulandı, index.html 4099 satır)

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

**Çekirdek + gün döngüsü** — hasta kuyruğu (taban maxQueue 3, Tezgah seviyesiyle 5'e çıkar), gün süre değil müşteri limitiyle biter (patientsPerDayBase 8, her gün +2), takvim gün numarasından ilerler (17 Haziran 2026 = Gün 1), DAYEND ekranında gün özeti (servis/doğru/yanlış/küsen/kazanç + hedef tutturma rozeti). Her 4. gün NÖBET: gün ikinci bir gece bölümüyle uzar (bkz. bölüm 6).

**Sabır sistemi** — çalışıyor ama BARI GİZLİ: sabır her frame azalır, sıfırlanınca hasta küser ve angryRepLoss (8) itibar cezası uygulanır, reçete inceleme fazında (ONAYLA/REDDET beklerken) sabır donuk kalır. Taban süre basePatience 38 sn; Bekleme Alanı seviyesi ve (gece hastalarında) nöbet çarpanı bunun üstüne biner — hastanın sabrı SAHNEYE ÇIKARKEN kurulur (enqueuePatient), bu yüzden gün ortasında alınan yükseltme sonraki hastaya hemen yansır. Ekranda tek örtük ipucu: sabır düşükken hastanın hafif titremesi. Konsoldan takip: cheats.state().activePatience ("12.3/38" formatında).

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
Gün başında o günün **tüm hasta listesi tek seferde** üretilir ve game.daySchedule'a konur. Spawn artık anlık hasta üretmez, bu listeden sırayla çeker — spawn zamanlaması, kuyruk limiti ve sabır sistemi değişmedi, değişen sadece hastanın NE ZAMAN üretildiği. Nöbet günlerinde gece hastaları da aynı listenin sonuna eklenir (bkz. bölüm 6).

Üretim seed'lidir: `withSeed(CONFIG.daySeedBase + day * 7919, …)` + mulberry32. **Aynı seed + aynı gün = aynı liste**, her oynanışta. CONFIG.daySeedBase (20260617) değiştirilirse tüm günler yeniden kurulur. Determinizmi korumak için üç izolasyon var:
1. `game.lastDoctor` üretim başında **null'a çekilir** ve sonunda geri yüklenir (yalnızca geri yüklemek yetmez — aşağıdaki düzeltilen hataya bakın).
2. Reçete tarihleri `_dateDayOverride` ile **üretilen günün** tarihine damgalanır (yoksa gün 3'ün listesi gün 1'deyken üretilince gün 1'in tarihini basardı).
3. Medula ipucu alanları ve doz işaretinin düşeceği kalem de üretim anında sabitlenir — çizim hiç rng tüketmez.

**DÜZELTİLEN HATA — determinizmi sessizce bozuyordu:** `withSeed` başlangıçta `game.lastDoctor`'ı kaydedip sonunda geri yüklüyor ama **sıfırlamıyordu**. `pickKnownDoctor` "çekilen isim === game.lastDoctor" olduğu sürece döngüde kalıp fazladan bir `rng()` harcar; dışarıdan gelen bir isim ilk çekilişle çakışınca tüm RNG akışı kayıyor ve **aynı gün farklı üretiliyordu**. Belirti: oynadıktan sonra gün 7'nin hedefi 2.030₺ yerine 1.700₺ çıkıyordu. İlk determinizm testi bunu kaçırmıştı, çünkü aynı günü art arda ve aynı dış durumla üretiyordu. Ders: seed'li üretim yalnız RNG kaynağından değil, **okuduğu her dış durumdan** yalıtılmalı. Şimdiki test 22 farklı `lastDoctor` değeri × 10 gün + 3000 frame oynanmış durum üzerinden koşuyor.

Liste cache'lenir (_dayScheduleCache); hedef menüden sorulsa bile gün iki kez üretilmez. Oynanırken hasta nesneleri değiştiği (sabır, decided) için beginDaySchedule her seferinde taze kopya verir — aynı gün yeniden oynanabilir.

### 4.3 Günlük hedef formülü
Hedef genel ortalamalardan değil, **o günün gerçek listesinden** hesaplanır:

```
N        = o günün toplam hasta sayısı
R        = SADECE geçerli hastaların sipariş cirosu (sahte reçeteliler 0₺ katkı yapar,
           çünkü doğru oynanış onları reddetmektir)
C        = aynı geçerli hastaların ilaç cost toplamı
missCost = (R + C) / geçerli hasta sayısı        ← o güne özel gerçek hata maliyeti
izinliHata(gün) = N × missRate(gün)          ← N = totalPatientsFor(day) = gündüz + gece
missRate(gün)   = max(0.10, 0.25 − (gün−1) × 0.015)

hedef = floor10( clamp( R − izinliHata × missCost, R×0.40, R×0.90 ) )
```

Bir hatanın maliyeti çift taraflıdır: kaçan ciro + yazılan cost zararı — missCost bunu birlikte ölçer. Tolerans **müşteri sayısına oranlıdır** (sabit hata payı büyüyen günlerde fiilen kusursuz oynanış dayatıyordu). goalRatioClamp [0.40, 0.90] yalnız güvenlik ağıdır; uç günlerde hedefin saçmalamasını (ör. "26/26 kusursuz gün") engeller. Yuvarlama AŞAĞI yapılır — yukarı yuvarlamak formülün az önce verdiği toleransın bir kısmını geri alıyordu.

Şu anki üretilmiş günlerden (cheats.balance() çıktısı):

| Gün | N | geçerli | R | C | missCost | missRate | izinli hata | hedef | efektif oran | gereken doğru |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 8 | 8 | 1.166₺ | 830₺ | 249₺ | 0,250 | 2,00 | 660₺ | 0,566 | **6/8** |
| 4 🌙 | 20 | 14 | 2.033₺ | 1.369₺ | 243₺ | 0,205 | 4,10 | 1.030₺ | 0,507 | **16/20** |
| 5 | 16 | 13 | 2.073₺ | 1.452₺ | 271₺ | 0,190 | 3,04 | 1.240₺ | 0,598 | **13/16** |
| 8 🌙 | 31 | 24 | 3.667₺ | 2.414₺ | 253₺ | 0,145 | 4,50 | 2.520₺ | 0,687 | **27/31** |
| 10 | 26 | 25 | 3.339₺ | 2.294₺ | 225₺ | 0,115 | 2,99 | 2.660₺ | 0,797 | **23/26** |

🌙 = nöbet günü; N gündüz + gece toplamıdır (gün 4 = 14+6, gün 8 = 22+9).

"Gereken doğru" sahte reçetelerin doğru reddedilmesini de doğru işlem sayar. Rakamlar üretilmiş gerçek günlerden geldiği için kesindir, tahmin değildir.

**Not — bu tablo bir önceki sürüme göre kaydı:** Medula ipucu alanlarının seçimi gün üretimi sırasında seed'li rng tükettiği için tüm gün listeleri yeniden dizildi (gün 1 hedefi 640₺ → 660₺, gün 7 2.030₺ → 2.110₺). Determinizm bozulmadı; aynı seed hâlâ aynı günü veriyor. Eski dizilime dönmek gerekirse `CONFIG.daySeedBase` ile oynanır.

### 4.4 Hedefin yaptırımı YOKTUR — bu bilinçli bir tasarım kararıdır
Bunu net yazmak gerekiyor, çünkü koda bakan biri eksiklik sanabilir: **günlük para hedefinin hiçbir yaptırımı yoktur.** endDay() yalnız iki şey yapar — state'i DAYEND'e çeker ve `dayResult = { goal, met }` kurar. `met` bayrağı kodun tamamında sadece DAYEND kartındaki rozetin rengini ve metnini ("🎯 Hedef tuttu!" / "⚠️ Hedef tutmadı") belirler. İtibar kaybı yok, para cezası yok, oyun bitmez, kaçırılan hedef ertesi güne eklenmez; para ve stok olduğu gibi devreder. Üst üste hedef kaçırmak da hiçbir şey tetiklemez.

**Tek fail state itibarın 0'a inmesidir** (loseReputation → triggerGameOver). İtibar yalnız şu dört yoldan düşer: yanlış ilaç (5), sahte reçeteyi onaylamak (15), geçerli reçeteyi reddetmek (5), hastayı küstürmek (8).

Para baskısı **dolaylıdır**: kasa erir → depo siparişi verilemez → stok biter → hasta servis edilemez → itibar düşer → oyun biter. Hedef bu zincirin ölçüm göstergesidir, ceza mekanizması değil. Hedefe doğrudan yaptırım bağlanacaksa (itibar cezası, iflas vb.) bu bilinçli olarak alınmış bir karar olmalı; şu anki davranış kaza sonucu değildir.

### 4.5 Bilinen sınır: hasta değerleri heterojen
Hedef, günler arası kumarı çözer (R artık gerçek listeden gelir) ama **gün içi kumarı çözmez.** Ölçüm (200 gün): semptom hastasının ortalama değeri ~150₺, reçete hastasınınki ~420₺ — yaklaşık 2,8 kat fark. Reçete 1–3 kalem × 1–3 adet olabildiği için tek bir sipariş günün cirosunun büyük kısmını taşıyabilir.

Sonuç: missCost bir ortalama olduğundan, "3 hata" tek bir sayı değildir — en ucuz üç hastayı kaçırmakla en pahalı üçünü kaçırmak arasında birkaç yüz ₺ fark oluşur. Yani **hangi müşteride hata yaptığın günü belirleyebiliyor.** cheats.balance() her gün için bu zarfı (en kötü–en iyi aralık) yazdırır; şu an 10 günün 10'u da "hangi hastada hata yaptığına bağlı" durumunda.

Not edilen olası çözüm — **KARAR VERİLMEDİ, uygulanmadı**: tek bir siparişin günün cirosundaki payına tavan koymak (ör. bir hasta R'nin %X'inden fazlasını taşıyamasın; taşıyorsa kalem/adet küçültülsün). Bu, zarfı gerçekten daraltır ama reçete çeşitliliğini kısar. Alternatif olarak maxPrescriptionItems'ı 3'ten 2'ye çekmek ve adet ağırlıklarını 1'e kaydırmak da aynı yöne çalışır.

## 5. Eczane Geliştirme

Paranın harcanacağı yer. Önceden para birikip duruyordu; geliştirmeler kalıcı bir para gideri.

### 5.1 PC ana ekranı
Tezgahtaki PC'ye dokununca artık doğrudan depo AÇILMAZ; `openPc()` iki butonlu ana ekranı getirir:

```
[ 📦 ECZA DEPOSU      — İlaç siparişi ver     ]
[ 🔧 ECZANE GELİŞTİRME — Kalıcı yükseltmeler  ]
```

`game.pcScreen` üç değer alır: `"home"` | `"depot"` | `"upgrades"`. `drawPcPanel()` hangisi açıksa onu çizer ve **her frame önce kapalı ekranların rect'lerini temizler** (görünmeyen buton tıklanabilir kalmasın). Her iki alt ekranda sağ üstte "‹ GERİ" butonu ana ekrana döner; ✕ paneli tamamen kapatır. Depo ekranının mantığı değişmedi — sadece GERİ butonu eklendi. DAYEND kartındaki "📦 Depodan Sipariş" doğrudan depo ekranına gider (eski davranış korundu).

### 5.2 Kalemler ve fiyatlar
Fiyatlar sabit değil: `round100(avgPrice × costK[n])`. `costK.length === maxLevel − 1`, yani her satın almaya birebir bir katsayı düşer (n'inci alım = `costK[n−1]`). Lv1 herkeste bedava başlangıç durumudur.

| Kalem | id | Lv1 (taban) | Maks | Lv1→2 | Lv2→3 |
|---|---|---|---|---|---|
| Tezgah | tezgah | kuyruk 3 hasta | 5 hasta | 1.400₺ | 2.700₺ |
| Depo Rafı | depo | stok tavanı 30 kutu | 60 kutu | 1.400₺ | 2.700₺ |
| Vitrin | vitrin | normal | +4 müşteri/gün | 1.400₺ | 2.700₺ |
| Bekleme Alanı | bekleme | normal sabır | +%40 | 1.400₺ | 2.700₺ |
| Medula Terminali | medula | 0 alan işaretlenir | 1 alan | 2.700₺ | — (maxLevel 2) |

Listede her kalemin mevcut seviyesi, etkisi ve bir sonraki seviyenin fiyatı görünür; maks seviyede buton yerine **TAM** yazar ve tıklanamaz. Para yetmiyorsa buton pasifleşir ve depo ekranıyla **aynı biçimde** "⛔ Yetersiz bakiye — kasa: N₺" uyarısı çıkar. Satın alma kasadan düşer, kasa negatife inemez.

### 5.3 eff*() katmanı
CONFIG.maxQueue / maxStock / basePatience **artık hiçbir oyun kodunda doğrudan okunmaz**; hepsi seviyeye göre hesaplanan efektif değerlerden geçer:

| Fonksiyon | Lv1 | Maks |
|---|---|---|
| effMaxQueue() | 3 | 5 |
| effMaxStock() | 30 | 60 |
| effPatience() | 38,0 sn | 53,2 sn |
| patientLimitFor(1) | 8 | 12 |
| effMedulaHints() | 0 | 1 |

(CONFIG değerleri hâlâ TABAN olarak duruyor ve eff*() içinde okunuyor — kaldırılmadılar.)

### 5.4 Kalıcılık
Stokla **aynı yol**: `initUpgrades()` yalnız `startNewGame()` tarafından çağrılır, `startNextDay()` dokunmaz. Sonuç: günler arası korunur, menüdeki DEVAM ET'te korunur, BAŞLA'da (tam reset) hepsi Lv1'e döner.

### 5.5 Vitrin ↔ gün cache'i (dikkat)
Vitrin seviyesi `patientLimitFor(day)`'i değiştirir, o da önden üretilmiş günleri ve hedefleri geçersiz kılar. Satın alma `invalidateDaySchedules()` çağırır. **Oynanmakta olan gün etkilenmez**: `patientsForDay()` ve `goalForDay()` o günün `game.daySchedule` snapshot'ından okur, cache'ten değil. Etki ertesi günden başlar — gün ortasında Vitrin Lv2 alınınca o günün N'i ve hedefi aynı kalır, sonraki gün büyür.

### 5.6 Medula terminali — ne YAPAR, ne YAPMAZ
**Yapar:** reçete kağıdında bir alanı (doktor / kaşe / imza / doz / tarih) nötr mavi kesikli çerçeveyle işaretler ve altına "🖥️ Medula: işaretli alanı kontrol et" yazar. İşaret sayısı terminal seviyesi kadardır.

**YAPMAZ:**
- Sahtelik kararını değiştirmez. `request.fake` ve `checkOrder` mantığına dokunmaz; katman tamamen görseldir.
- Sahte/gerçek ayrımı yapmaz. **Gerçek reçetelerde de aynı sayıda işaret çıkar** — sahtede işaret gerçekten kusurlu alana düşer, gerçekte beş alandan rastgele birine.
- Çizim sırasında rastgelelik tüketmez; işaret alanları üretim anında seed'li rng ile sabitlenir (aynı gün = aynı işaretler).

**Bu bilinçli bir tasarım kararıdır.** İlk uygulamada işaret yalnız gerçekten kusurlu alana düşüyordu; o zaman "işaret var → sahte, işaret yok → gerçek" oluyordu ve terminal alındığı anda reçete incelemesi tamamen çözülüyordu — yani bir **oracle**'a dönüşüyordu. Şimdiki hâlde işaret "buraya bak" der, "yakaladım" demez: bakılacak yeri daraltır ama kararı oyuncuya bırakır. Boot self-test'i bu özelliği koruyor (bkz. 11.2).

Ölçüm (gün 1–10, terminal maks): 21 sahte reçetenin 21'inde, 62 gerçek reçetenin 62'sinde işaret var — korelasyon sıfır. Sahtelerde işaret 21/21 gerçekten kusurlu alana düşüyor.

## 6. Nöbetçi Eczane

Türkiye'de eczaneler sırayla nöbet tutar. Belirli günlerde eczane nöbetçidir: normal gün bittikten sonra gece bölümü başlar, az ama zorlu müşteri gelir.

### 6.1 Neden ayrı gün tipi değil
Nöbet **aynı günün ikinci bölümüdür**, ayrı bir gün tipi ya da ayrı bir state değil. Gece hastaları gün programının parçası olarak `buildDaySchedule` içinde üretilir ve listenin sonuna `night: true` bayrağıyla eklenir.

Bu, belgeye yazmaya değecek kadar önemli: **hedef formülü hiç değişmeden doğru çalışıyor.** R, C ve missCost zaten "o günün gerçek listesinden" hesaplandığı için gece hastaları kendiliğinden hesaba giriyor; hedefi ayrıca ölçeklemek gerekmedi. Tek uyum: `allowedMissesFor(day)` artık `totalPatientsFor(day)` (gündüz + gece) kullanıyor — formülün tanımı ("N × missRate") aynı, N'in kapsamı genişledi.

### 6.2 CONFIG
| Ayar | Değer | Anlamı |
|---|---|---|
| nightDutyEvery | 4 | her 4. gün nöbetçi (gün 4, 8, 12…) |
| nightPatientRatio | 0.4 | gündüz müşteri sayısının oranı |
| nightPatientMin | 3 | gece en az bu kadar hasta |
| nightFakeRateBoost | 1.8 | gece sahte reçete oranı çarpanı |
| nightFakeRateCap | 0.60 | …tavan; gecede bile en az %40 gerçek reçete |
| nightPriceMultiplier | 1.25 | nöbet farkı |
| nightPatienceMultiplier | 1.2 | gece hastası daha sabırlı (gidecek başka yeri yok) |
| nightIntroDuration | 2.2 | geçiş kartının otomatik kapanma süresi (sn) |
| nightFadeTime | 0.9 | gece tonlamasının oturma süresi (sn) |

Gece sahte ihtimali: `min(0.60, 0.28 × 1.8) = 0.504`. `isNightDutyDay(day)` tek yerdedir; nöbet tespiti hep buradan yapılır.

### 6.3 Nöbet farkı yalnız SATIŞ fiyatına
`nightPriceMultiplier` gece hastalarının **satış fiyatına** uygulanır; ilacın **mal maliyeti (cost) değişmez** — eczane aynı ilacı aynı fiyata almıştır, sadece nöbet farkıyla satar. Bu çarpım hem gerçek kazanca (`checkOrder`) hem de R hesabına (`refValuesFor(request, priceMul)`) girer, yani hedef de nöbet farkını görür. Doğrulandı: gün 4'te gece ham cirosu 281₺ → R'ye 351₺ (×1,250), gündüz ×1,000, gece cost'u çarpılmamış.

### 6.4 Gecede en az bir gerçek reçete garantisi
Gece sahte oranı yüksek olduğu için, küçük gece bloklarında (3–6 hasta) tesadüfen **hiç gerçek reçete olmayan** bir nöbet üretilebiliyordu. O gece yalnızca "reddet" kararlarından ibaret kalır: servis yok, ciro yok, öğrenilecek karşıt örnek yok. Bu yüzden üretimde garanti var — gece bloğunda gerçek (servis edilebilir) reçete yoksa son gece hastası gerçek reçeteli olarak yeniden üretilir. Tamamı `withSeed` içinde yapıldığı için determinizm bozulmaz.

### 6.5 Akış ve görsel
- Gündüz hastaları bitince DAYEND'e gidilmez: `beginNightShift()` çalışır, **"🌙 NÖBET BAŞLIYOR"** geçiş kartı açılır (mevcut kart dili — koyu panel + gece moru başlık şeridi; gece hasta sayısını ve "sahte reçete girişimi artar" uyarısını yazar). Tek dokunuşla ya da 2,2 sn sonra kapanır; açıkken oyun donar (depo paneliyle aynı kalıp).
- **Gece tonlaması, yeni asset olmadan**: `drawNightOverlay()` arka planın üstüne `multiply` ile gece mavisi→mor gradyan, tezgah bandının üstüne `lighter` ile sıcak amber hâle koyar — salon kararır, tezgah aydınlık kalır. `game.nightT` 0,9 sn'de oturur, geçiş ani değildir.
- Gece bitince normal DAYEND kartı gelir; nöbet gecesiyse **☀️ Gündüz kazancı** ve **🌙 Gece kazancı** ayrı satır olarak görünür (kart yüksekliği içerikten hesaplandığı için otomatik uzar) ve başlık "Gün N + Nöbet Bitti" olur.
- **Bir önceki günün** DAYEND kartında mor uyarı şeridi: "🌙 Yarın nöbetçisin — stoklarını kontrol et". Oyuncu aynı karttaki depo butonundan hazırlanabilir.
- Nöbet günü HUD'da 🌙 rozeti durur (gece bölümünde dolgusu parlar). Rozet, sol kutu ile EV butonu arasındaki boşluğa ölçülüp ortalanır — HUD düzeni değişmedi.

### 6.6 Gerçek dağılım (koddan)
| Gün | Gündüz | Gece | Toplam | Gece reçete | Gece sahte | Gece gerçek | Gece semptom | Gece cirosu | Hedef |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 14 | 6 | 20 | 4 | 3 | 1 | 2 | 351₺ | 1.030₺ |
| 8 | 22 | 9 | 31 | 5 | 3 | 2 | 4 | 813₺ | 2.520₺ |

Gece hastaları geliştirme etkilerinden de yararlanır: Bekleme Lv3 + gece = 38 × 1,4 × 1,2 = 63,8 sn sabır; kuyruk tavanı Tezgah seviyesinden gelir.

## 7. Mevcut Assetler
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

## 8. Sıradaki Yapılacaklar
1. PC'ye SGK Medula / E-reçete ekranları (drawPcScreen kapsayıcısı buna hazır; `game.pcScreen` üçüncü/dördüncü bir değer alarak genişler).
2. Kalan 25 emoji ilacın PNG üretimi (grup grup ilerliyor; Ağrı grubu tamamlandı, **sırada Soğuk grubu**).
3. **Karar bekleyen:** sipariş konsantrasyon tavanı — tek hastanın günün cirosundaki payına sınır (bkz. 4.5). Uygulanmadı, tartışılmadı.
4. **Gözlem — ölçülmeli:** gün 8'de 31 müşteri var (22 gündüz + 9 gece) ve sayı her gün artıyor. Mobilde tek oturumda oynanabilir bir uzunluk mu, gerçek cihazda süre tutulup bakılmalı. Uzun geliyorsa `patientsPerDayStep` ya da `nightPatientRatio` ayarlanır; ikisi de hedefi otomatik yeniden hesaplattığı için denge elle düzeltilmez.

## 9. Çalışma Şekli (Kerem'in akışı)
- Promptlar Claude Code'a (VS Code, Opus, High effort) kopyala-yapıştır için kod bloğu içinde, açıklamasız verilir; sonu hep "Komple güncel index.html ver."
- İterasyon döngüsü: prompt → test → ekran görüntüsü → geri bildirim
- Görsel üretimi: ChatGPT (Büfeci stili prompt, düz/beyaz arka plan) → asistana gönderilir → asistan Python flood-fill ile şeffaflaştırır, gerekirse grid'i böler → present_files ile PNG döner. Higgsfield KULLANILMIYOR.
- Git: her sağlam noktada `git add -A && git commit -m "..." && git push`

### Görsel Stil Çapası
Büfeci tarzı: sıcak, hafif koyu, doygun, yarı-gerçekçi boyalı illüstrasyon, retro dokulu gölgeleme. Ahşap kahveleri, paslı metal, amber vurgular. KAWAII/PASTEL DEĞİL, düz vektör DEĞİL, çizgi film DEĞİL. İlaçlar 1:1, karakterler 3:4, arka plan 9:16.

## 10. Bilinen Teknik Riskler
- String vs number id uyumsuzluğu sameMultiset'i sessizce bozabilir — ilaç id'leri her zaman string olarak tutulmalı
- Eşleşme her yerde **id/kategori string'i** üzerinden yapılır, asla nesne referansı üzerinden değil. beginDaySchedule sığ kopya verir (request paylaşılır); derin klona (JSON/structuredClone) geçilirse bu kural bozulmaz ama request'in oynanış sırasında değişmediği varsayımı yeniden gözden geçirilmeli
- Çizim içinde Math.random()/new Date() çağrısı titremeye yol açar; dateShort() ve formatMoney() gün/değer değişmediği sürece cache'li string döner — yeni cache'lenmemiş hesaplamalar eklerken dikkat
- Dengesiz ctx.save()/ctx.restore() kümülatif transform/alpha kaymasına yol açabilir
- PNG çizmeden önce img.complete && img.naturalWidth > 0 kontrolü şart (Sprite.draw bunu zaten yapıyor, elle Assets.images erişiminde unutulmamalı)
- Yeni ilaç/semptom eklerken kategori adı MUTLAKA mevcut 9 kanonik addan biri olmalı; yeni bir yazım (ör. "Alerji " veya "alerji") sessizce ayrı kategori yaratır ve doğru ilacı yanlış yapar — boot self-test'i bunu yakalar ama uyarı konsola yazılır, oyuncuya görünmez
- **Seed'li üretim, okuduğu HER dış duruma bağımlıdır.** withSeed yalnız RNG kaynağını değiştirmekle kalmaz; `game.lastDoctor`'ı da sıfırlar ve `_dateDayOverride`'ı kurar. Üretim koduna dış state okuyan yeni bir dal eklenirse (ör. "son verilen ilacı tekrarlama") o da izole edilmeli, yoksa aynı gün farklı üretilir ve hedef kayar — sessiz, testsiz yakalanması zor bir hata sınıfı
- **Gündüz/gece ayrımı iki yere bağımlı:** (a) spawn sırası — gece hastaları listenin SONUNDA olmalı, çünkü faz geçişi `dayCompleted >= sch.dayN` ile tetikleniyor; listeyi karıştıran bir değişiklik nöbeti bozar. (b) hedef hesabı — `night` bayrağı `refValuesFor`'a fiyat çarpanı olarak giriyor, bayrak kaybolursa gece cirosu R'ye eksik girer ve hedef sessizce düşer. Boot self-test'i ikisini de denetler (gündüz bölümünde night:true hasta olmamalı, nöbet olmayan günde hiç gece hastası olmamalı)
- `game.phase` ("day"/"night") para sayacını da ikiye ayırır (`addDayMoney`); yeni bir para hareketi eklenirse `game.dayStats.money`'ye elle yazmak yerine `addDayMoney()` kullanılmalı, yoksa DAYEND'deki gündüz/gece toplamı tutmaz

## 11. Geliştirici Araçları

### 11.1 Karar teşhis bloğu
`CONFIG.debugDecisions` (varsayılan **true**) açıkken her servis/red kararında konsola tek okunabilir blok basılır: hasta tipi, istenen liste (ad + id + adet), verilen liste, doktorun defterde olup olmadığı, her kusur kontrolünün sonucu ve karşılaştırılan iki değer (reçete tarihi ↔ oyun tarihi), iç bayraklar (fake, flaws), tespit edilebilir kusurların listesi ve sonuç + gerekçe. Kapatmak için `CONFIG.debugDecisions = false`.

### 11.2 Boot'ta sessiz çalışan self-test'ler
Üçü de yalnız sorun bulursa console.warn atar; oyuncuya hiçbir şey görünmez. Şu an boot'ta **0 uyarı** çıkıyor.
- **verifyGoalBalanceAllTiers(false)** — dengeyi **iki uçtan** koşturur: tüm geliştirmeler Lv1'de ve tümü maksimumdayken (`withUpgradeLevels` seviyeleri geçici olarak değiştirir ve iki yönde de gün cache'ini geçersiz kılar). Her turda `verifyGoalBalance` gün 1..10'a bakar — nöbet günleri 4 ve 8 dahil: izinli hata kadar hata hedefi tutturmalı, bir fazlası tutturmamalı (ortalama değerli hata varsayımıyla; 10'a yuvarlama adımının açıklayabildiği ihlaller elenir). Ayrıca patolojik uçları arar: izinli hata kadar hata EN İYİ hâlde bile tutmuyorsa "hedef imkânsız", bir fazlası EN KÖTÜ hâlde bile tutuyorsa "hedef anlamsız".
- **selfTestPatients()** — gün 1..10'daki her hastayı ve tüm sistem verisini gezer:
  - (a) kategori ↔ sekme 1:1 mi
  - (b) sahte doktor isimleri gerçeklerden ayırt edilebilir mi (ad aynı + soyad öneki yasak)
  - (c) **geliştirme denetimi**: her kalemin her seviyesi geçerli efektif değer üretiyor mu, fiyatlar artan mı, `costK.length === maxLevel − 1` mi, maks seviyede satın alma reddediliyor mu, maks üstü seviye için fiyat üretiliyor mu
  - (d) **Medula ipucu sızdırma denetimi**: terminal maks seviyeye alınıp tüm reçeteler taranır; sahte ve gerçek reçetelerin işaretlenme oranı **eşit** olmalı, her reçetede işaret sayısı terminal seviyesi kadar olmalı, hiçbir reçetede `hintFields` eksik olmamalı. Eşit değilse "Medula ipucu SAHTELİK SIZDIRIYOR" uyarısı düşer (negatif testle doğrulandı: eski davranış geri konunca uyarı tetikleniyor)
  - (e) **nöbet kuralları**: gece hasta sayısı ≥ nightPatientMin, `nightFakeChance()` tavanı aşmıyor, gece bölümünde ≥1 gerçek reçete var, gündüz bölümünde `night:true` hasta yok, nöbet olmayan günde hiç gece hastası yok
  - (f) hastanın tam ihtiyacı verilince sonuç daima "doğru" mu
  - (g) her sahte reçetenin tespit edilebilir en az 1 kusuru var mı
  - (h) gerçek reçetelerde kusur bayrağı/görünür kusur yok mu ve doktoru defterde mi
  - (i) gerçek reçetenin tarihi o günün tarihi mi
- **checkDataHealth()** — her ilaç kategorisinin en az bir semptomu, her semptom kategorisinin en az bir ilacı var mı.

### 11.3 Debug cheatleri (window.cheats — 25 adet, koddan birebir doğrulandı)
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
- openDepot() — PC panelini doğrudan DEPO ekranında açar (PC'ye dokunmak ana ekrana götürür; bu cheat onu atlar)
- prices() — tüm ilaçların alış/satış/kâr% tablosunu console.table ile yazar
- explainPatient() — kuyruktaki mevcut hasta için karar teşhis bloğunu istek üzerine basar (debugDecisions kapalı olsa bile)
- nightDuty() — önümüzdeki 6 nöbet gününü tabloyla yazar: gündüz/gece/toplam hasta, gece reçete ve sahte sayısı, gece cirosu, hedef. Üstünde nöbet ayarlarının özeti (sıklık, oran, gece sahte ihtimali, nöbet farkı)
- forceNight() — mevcut günü nöbet gününe çevirip gece bölümünü hemen başlatır (test için). Günü yeniden üretir, gündüz kısmını tamamlanmış sayar. `_forcedNightDays` yalnız bu cheat tarafından doldurulur; normal üretimi etkilemez
- upgrades() — tüm geliştirme kalemlerinin seviyesi, mevcut etkisi, bir sonraki seviyenin etkisi ve fiyatı (maks ise "TAM"); altında efektif değerlerin özeti (kuyruk, stok tavanı, gün müşterisi, sabır, medula ipucu)
- setUpgrade(id, seviye) — test için seviye zorlar (clamp'li); vitrin ise gün cache'ini geçersiz kılar
- balance() — avgPrice/avgCost/marj/startMoney + gün 1..10 tablosu (missRate, izinli hata, N, geçerli, R, C, missCost, hedef, efektif oran, gereken doğru) + `verifyGoalBalanceAllTiers(true)` ile hem Lv1 hem maks seviyede gün gün denge dökümü (her gün için "en kötü–en iyi" hata zarfı dahil)
- assetStatus() — hangi asset'lerin yüklendiğini/boş olduğunu ve toplam yükleme özetini döner
- state() — gün/para/itibar/aktif sabır/kuyruk/tezgah/beklenen ilaç/gün istatistiklerini özetleyen JSON döner
