# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-09-10 (kariyer modeli + fiyat güncellemeleri + dilenci turları işlendi, index.html **7.335 satır**)

Bu belge, projeyi hiç bilmeyen bir asistanın okuyup kaldığı yerden devam edebilmesi için yazılmış bir devir notudur. Buradaki her sayı koddan ya da ölçüm çıktısından doğrulanmıştır; doğrulanamayan hiçbir iddia yazılmadı.

---

## 1. Genel Bakış

**Eczacı**: Büfeci'den esinlenen, iOS hedefli Türk eczane simülasyonu.

Çekirdek döngü: hasta gelir → reçete uzatır, semptom söyler ya da e-reçete kodu verir → reçeteliyse ONAYLA/REDDET incelemesi → raftan doğru ilaç(lar) seçilir → SERVİS ET → para + itibar.

**Üst çerçeve KARİYER**: 30 günlük sezonlar, her yeni sezonda büyüyen bir ruhsat yenileme bedeli, ödeyemediğin gün kariyer biter (bkz. 2.1–2.5).

**Tek dosya**: `index.html` — 7.335 satır, HTML5 Canvas + vanilla JS, harici kütüphane yok, tüm CSS/JS inline. Yanında yalnız `assets/` klasörü (53 PNG) var.

- 9:16 dikey mobil layout, `devicePixelRatio` retina desteği
- Capacitor ile iOS paketleme planlı (henüz yapılmadı)
- GitHub: `github.com/keremsakiz/eczaci`
- State machine: `MENU / PLAYING / DAYEND / SEASONEND / CAREEREND` (eski `GAMEOVER` kaldırıldı — yerini bu iki bitiş ekranı aldı)
- 60 FPS `requestAnimationFrame` döngüsü; `update(dt)` ve `render()` ayrı
- Tüm sayısal ayarlar dosyanın başında tek bir `CONFIG` objesinde
- Rastgelelik tek bir değiştirilebilir kaynaktan akar: `rng()` → `_rngSource` (varsayılan `Math.random`). `withSeed(seed, fn)` bu kaynağı geçici olarak mulberry32 ile değiştirir; `rand()` ve `pick()` zaten `rng()` kullandığı için üretim kodu değişmeden deterministik olur.
- Layout dikdörtgenleri (butonlar, kartlar, sekmeler) her zaman ilgili draw fonksiyonu **içinde** hesaplanır, `render()` içinde değil.

---

## 2. Çekirdek Döngü

### 2.1 Kariyer ve sezon yapısı
Üç iç içe ölçek var: **gün** (müşteri limiti) → **sezon** (`seasonDays` = 30 gün) → **kariyer** (birden çok sezon).

Sezon sabit uzunlukta olmak zorundaydı: gün sayısı serbest bırakılırsa bir skor tablosu "en iyi oynayan" değil **"en çok oynayan"** sıralaması olur.

**Sezonlar arası DEVREDENLER** — bunlara yalnız `startNewCareer()` dokunur, `beginSeason()` ve `startNextDay()` hiç dokunmaz; devretmelerinin tek sebebi bu:

| Devreder | Devretmez |
|---|---|
| kasa (`money`) | itibar → her sezon `startReputation` (50) |
| geliştirme seviyeleri (`upgrades`) | gün sayacı → her sezon 1. günden |
| stok (`stock`) | sezon istatistikleri (`seasonStats`) |
| SGK alacak defteri (`receivables`) | sezon tohumu (her sezon kendi tohumu) |
| dilenci borç defteri (`beggarReturns`) | Medula kod kayıtları (`medulaRevealed`) |
| Medula defter sayaçları (`medulaBooked` / `medulaCollected`) | |

**İtibarın sıfırlanması bilinçli bir karardır**, kodda da not düşülü: sezonu bitiren şey itibar çöküşü *olabilmeli* (o yüzden sezon içinde 0'a inmek kariyeri bitirir), ama çökmemiş bir sezonun yorgun itibarı bir sonrakine **ceza olarak taşınmamalı**. Taşınsaydı kötü bir sezon bir sonrakini de sakatlar ve kariyer tek bir kötü günden geri dönülemez hâle gelirdi. Devreden şey **para ve eczane**; itibar her sezon yeniden kazanılır.

Medula defter sayaçlarının kariyer ölçeğinde tutulması bir zorunluluk: alacaklar sezonlar arası devrettiği için `verifyMedulaLedger()`'ın "yazılan = yatan + bekleyen" denkliği ancak kariyer boyunca toplanınca tutar (bkz. 17).

### 2.2 Ruhsat yenileme bedeli
Her yeni sezon bir açılış bedeli ödenir ve bedel sezon numarasıyla **geometrik** büyür:

```
seasonFeeFor(n) = n ≤ 1 ? 0
                : round( seasonFeeBase × seasonFeeGrowth^(n−2) , seasonFeeRound )
```

`seasonFeeBase` fiyat tablosundan türer (`avgPrice × seasonFeeBaseK`), sabit sayı gömülü değil. Şu anki değerler: **`seasonFeeBaseK` 88 → `seasonFeeBase` 8.000₺**, **`seasonFeeGrowth` 1,70**, `seasonFeeRound` 100.

| Sezon | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Bedel | **0₺** | 8.000₺ | 13.600₺ | 23.100₺ | 39.300₺ | 66.800₺ | 113.600₺ | 193.100₺ |

**1. sezon bedelsizdir** (kariyerin açılışı). Bedel yeni sezon **başlarken** `beginSeason()` içinde kasadan düşer; ödenebilirlik kontrolü orada değil **tek kapıda** (`tryStartNextSeason`) yapılır — o fonksiyon çağrıldığında bedelin karşılandığı garantidir, böylece yarım state oluşamaz.

Bedel ne için ödendiği **dört yerde** yazılı: sezon sonu kartındaki ayrı şerit ("Sezon 4 ruhsat yenileme bedeli · 23.100₺"), butonun kendisi ("YENİ SEZON (−23.100₺)"), sezon başındaki bilgi şeridi ("🧾 Ruhsat yenileme (Sezon 4): −23.100₺") ve kariyer sonu kartı.

**Neden bu değerler** (kalibrasyon, bkz. 14.3): `seasonFeeGrowth` A profilinin ömrünü hızlı belirliyor — 1,3'te bedel 12 sezonda bile yakalamıyor, 1,6'da A 8 sezon, 1,7'de 7, 1,9'da 6. `seasonFeeBase` mutlak seviyeyi kaydırıyor: 6.000 → A 7 / B 4, 8.000 → A 7 / B 3. Aranan davranış (A 6–10, B 2–4, C 1'i bile zor) yalnız **8.000 / 1,70** ile birden tutuyor.

### 2.3 İki bitiş, iki ekran
| Ekran | Koşul | Sonra ne olur |
|---|---|---|
| **SEZON SONU** (`SEASONEND`) | 30 gün doldu | Kariyer sürüyor. Kart sezon özetini + sonraki sezonun bedelini gösterir. Bedel karşılanıyorsa "YENİ SEZON (−X₺)"; karşılanmıyorsa buton **pasif** ve yanına "KARİYERİ BİTİR" pill'i çıkar. |
| **KARİYER SONU** (`CAREEREND`) | (a) sezon içinde itibar 0'a indi → `reason: "reputation"`  ·  (b) ruhsat bedeli ödenemedi → `reason: "fee"` | Kariyer kapandı. Yalnız YENİ KARİYER · ANA MENÜ. |

**İtibar çöküşü artık sezonu değil kariyeri bitirir.** `finishSeason("reputation")` sezonu kapatıp doğrudan `finishCareer`'a devreder. Bunun sonucu: SEASONEND ekranına **yalnız "completed" yolundan** gelinir, o yüzden o kartın erken-bitiş varyantı koddan kaldırıldı (ölü dal olacaktı). Kırmızımsı bitiş dili artık kariyer sonu kartında yaşıyor.

Son gün bitince DAYEND kartı **hiç gösterilmez**, doğrudan sezon kartı gelir — "Sonraki Gün →" butonu olmayan bir günün kapısı olmamalı. `startNextDay` başında ikinci bir kapı daha var, cheat ve uç yollardan 31. günün başlamasını engelliyor.

### 2.4 Kariyer skoru = ulaşılan en yüksek kasa
`careerResult.score` = **peak kasa** (`career.peakMoney`), o anki kasa değil. Sebep: kariyer zaten parasızlıktan biter, yani bitiş anındaki kasa neredeyse sıfırdır ve beceriyi hiç ölçmez. Peak her gün sonunda (`endDay`) ve sezon kapanışında `updateCareerPeak()` ile güncellenir; monoton arttığı için her yerden çağrılması güvenlidir.

**"En iyi sezon" o sezonun KAZANCINA (`earned`) göre seçilir, bitiş kasasına göre değil.** Kasa sezonlar arası devrettiği için en yüksek bitiş kasası her zaman **son** sezon olurdu ve sezonların kendi performansını hiç ölçmezdi.

İki leaderboard nesnesi var, ikisi de JSON-serileşir ve **hiçbir yere gönderilmez** (sonraki tur): `seasonResult` (28 alan, `buildSeasonResult`) ve `careerResult` (26 alan, `buildCareerResult`). `version` alanı şema değişirse ayırt etmek için.

### 2.5 Her sezonun kendi tohumu
`game.runSeed = seasonSeedFor(career.seed, n)`. Tek tohum kullanılsaydı 2. sezon 1. sezonun **aynı 30 gününü** oynatırdı. Bu türetmeyle kariyer bir bütün olarak tek tohumdan tekrarlanabilir kalır ama sezonlar birbirini tekrar etmez. `careerResult.careerSeed` kariyerin tamamını yeniden üretmeye yeter.

---

**Gün = süre değil, müşteri limiti.** Gün, o günün listesindeki hastalar bitince kapanır. Takvim gün numarasından ilerler (17 Haziran 2026 = Gün 1).

**Kuyruk ve sabır** — taban `maxQueue` 3 hasta (Tezgah ile 5'e çıkar). Sabır her frame azalır; sıfırlanınca hasta küser ve `angryRepLoss` (8) itibar cezası uygulanır. Reçete inceleme fazında (ONAYLA/REDDET beklerken) sabır **donuk kalır**. Taban `basePatience` 38 sn. Sabır hastanın **sahneye çıktığı anda** kurulur (`enqueuePatient`), bu yüzden gün ortasında alınan Bekleme Alanı yükseltmesi sonraki hastaya hemen yansır.

Sabır çarpanları birbiriyle çarpılır:
- Bekleme Alanı seviyesi: ×1,0 / ×1,2 / ×1,4
- Gece hastası: `nightPatienceMultiplier` ×1,2
- **Çok kalemli semptom**: `symptomPatienceMul` → 1 kalem ×1,0, 2 kalem ×1,25, 3 kalem ×1,5 (daha çok sekme gezmek gerektiği için)

Bar **gizlidir**; tek örtük ipucu sabır düşükken hastanın hafif titremesi. Konsoldan: `cheats.state().activePatience`.

**Üç hasta tipi:**

| Tip | Nasıl gelir | İnceleme fazı | Eşleşme kuralı |
|---|---|---|---|
| **Semptomlu** | Konuşma balonunda derdini anlatır | Yok | Verilen ilaçların **kategori** çoklu-kümesi, istenen semptomların kategori çoklu-kümesiyle aynı olmalı. Kategori içindeki **her** ilaç doğru. |
| **Reçeteli** | Kağıt reçete uzatır | **Var** — ONAYLA/REDDET | Verilen ilaçların **id** çoklu-kümesi reçete kalemleriyle birebir (adet dahil, sıra önemsiz) |
| **Medula (e-reçete)** | Balonda 6 haneli kod gösterir | **Yok** (asla sahte değil) | Reçeteyle aynı: id çoklu-kümesi birebir |

Semptomlu hastalar tek ürün istemez: **1–3 kalem**, ölçülen dağılım **%60 / %30 / %10** (11.485 hasta). Kalemler **daima farklı kategorilerden** seçilir — ölçümde kategori tekrarı **0**. Adet 1 veya 2 (%80 / %20). Konuşma balonu kombinasyon başına şablonla değil, kalem sayısına göre kalıptan kurulur (`buildSymptomLine`).

**Servis ve red kararları:**

| Karar | Para | İtibar | Stok |
|---|---|---|---|
| Doğru servis | + satış fiyatı toplamı | +2 | verilen ilaçlar düşer |
| Yanlış ilaç | − verilen ilaçların `cost` toplamı | −5 | verilen ilaçlar düşer (kutu açıldı) |
| Sahteyi reddetmek (doğru) | +20₺ | +8 | — |
| Sahteye ilaç vermek | −182₺ | −15 | — |
| Gerçeği reddetmek | ceza yok, satış kaybı | −5 | — |
| Hasta küsmesi | — | −8 | — |

`checkOrder` ve `rejectPrescription` bu kalemlerin tek kaynağıdır. Para hareketleri **hem kasaya hem günlük kazanç sayacına** (`addDayMoney`) işlenir — hedef günlük kazanca karşı ölçüldüğü için bu tutarlılık şart.

---

## 3. Gün Üretimi ve Determinizm

> **Kariyerde tohum hiyerarşisi**: `career.seed` → `seasonSeedFor(seed, n)` → `game.runSeed` → `daySeedFor(day)`. Ayrıca aynı `runSeed`'ten türeyen ama **birbirinden bağımsız** üç akış daha var: fiyat turları (`priceSeedFor`), dilenci planı (`beggarSeedFor`) ve dilenci geri dönüşü (`beggarReturnSeedFor`). Hepsi ayrı salt kullanır ki biri diğerinin RNG akışını kaydırmasın — hasta listesi bu üç sistemden hiç etkilenmez.

### 3.1 Tohumlama
Her yeni oyun `newRunSeed()` ile rastgele bir **koşu tohumu** üretir (`Math.random ^ Date.now`). Günün tohumu bundan ve gün numarasından türetilir:

```
daySeedFor(day) = karıştır( runSeed ^ CONFIG.daySeedBase, day )
```

(`daySeedBase` = 20260617; karıştırma 32-bit çarpma/xor-shift zinciri — ardışık gün ve koşular korelasyon vermesin diye.)

Sonuç: **aynı koşuda aynı gün her zaman aynı üretilir** (test edilebilirlik), ama **her yeni oyun tamamen farklı** bir 30 gün verir. `cheats.setSeed(v)` ile tohum sabitlenip gün birebir tekrarlanabilir.

### 3.2 buildDaySchedule — günün tamamı önden üretilir
Gün başında o günün **tüm hasta listesi tek seferde** üretilir ve `game.daySchedule`'a konur. Spawn anlık hasta üretmez, bu listeden sırayla çeker — spawn zamanlaması, kuyruk limiti ve sabır sistemi değişmedi; değişen sadece hastanın **ne zaman** üretildiği. Nöbet günlerinde gece hastaları da aynı listenin sonuna `night: true` bayrağıyla eklenir.

Liste hazır olduğu için günün ekonomisi doğrudan ondan çıkarılır: `R` (geçerli hastaların cirosu), `C` (mal maliyeti), `validCount`, `missCost` ve **hedef** hep gerçek listeden hesaplanır, ortalama tahminden değil.

Liste cache'lenir (`_dayScheduleCache`) — hedef menüden sorulsa bile gün iki kez üretilmez. Oynanırken hasta nesneleri değiştiği için (`patience`, `decided`) `beginDaySchedule` her seferinde taze sığ kopya verir.

### 3.3 Determinizm izolasyonu — üç kanal
Seed'li üretim yalnız RNG kaynağından değil, **okuduğu her dış durumdan** yalıtılmalıdır:
1. `game.lastDoctor` üretim başında **null'a çekilir** ve sonunda geri yüklenir.
2. Reçete tarihleri `_dateDayOverride` ile **üretilen günün** tarihine damgalanır.
3. Güne bağlı üretim parametreleri (sahte oranı) `genDay()` üzerinden okunur — yani her gün **kendi gününün** oranlarıyla kurulur, oynanan günün oranlarıyla değil.

> **Geçmişteki hata, ders olarak duruyor:** `withSeed` başlangıçta `lastDoctor`'ı kaydedip geri yüklüyor ama **sıfırlamıyordu**. `pickKnownDoctor` "çekilen isim === lastDoctor" olduğu sürece döngüde kalıp fazladan bir `rng()` harcar; dışarıdan gelen bir isim ilk çekilişle çakışınca tüm RNG akışı kayıyor ve aynı gün farklı üretiliyordu. Belirti: oynadıktan sonra gün 7'nin hedefi 2.030₺ yerine 1.700₺ çıkıyordu. İlk determinizm testi bunu kaçırmıştı çünkü aynı günü art arda ve **aynı dış durumla** üretiyordu. Üretim koduna dış state okuyan yeni bir dal eklenirse o da izole edilmeli.

### 3.4 Üç garanti
Hepsi `withSeed` **içinde**, garantiler birbirini ezmesin diye farklı indeksleri hedefler:

1. **Her günde ≥1 gerçek reçete** — yoksa `out[0]` (ilk gündüz hastası) gerçek reçeteliye çevrilir.
2. **2. günden itibaren ≥1 sahte reçete** — yoksa `out[dayN−1]` (son gündüz hastası) sahteye çevrilir. **Gün 1 öğretici kalır**, bu garanti uygulanmaz.
3. **Nöbet gecesinde ≥1 gerçek reçete** — yoksa listenin son elemanı (son gece hastası) gerçek reçeteliye çevrilir. Aksi halde gece yalnızca "reddet" kararlarından ibaret kalabiliyor: servis yok, ciro yok, öğrenilecek karşıt örnek yok.

Garantilerden **sonra** sipariş konsantrasyon tavanı çalışır (bkz. 4.7) ve yalnız sipariş **içeriğini** değiştirir, tipleri korur — üç garanti bozulmaz.

---

## 4. Ekonomi ve Denge

### 4.1 Türetilmiş temel değerler
Ekonominin hiçbir temel sayısı elle yazılmaz; hepsi `MEDICINES` dizisinden hesaplanır (`deriveEconomy`). İlaç eklendiğinde/fiyatı değiştiğinde denge kendini yeniden kurar:

| Değer | Kaynak | Şu anki |
|---|---|---|
| avgPrice | 39 ilacın **taban** `price` ortalaması | **90,97₺** |
| avgCost | 39 ilacın **taban** `cost` ortalaması | **62,69₺** |
| ortalama kâr marjı (taban) | 1 − cost/price ortalaması | **%28,6** (ilaç bazında %18–41) |
| startMoney | 100'e yuvarlı (avgCost × 30) | **1.900₺** |
| fakeApproveMoneyPenalty | round(avgPrice × 2) | **182₺** |
| geliştirme fiyatları | round100(avgPrice × costK[n]) | **1.400₺ / 2.700₺** |
| beggarMoneyGive | round(avgPrice × beggarMoneyK 1,0) | **91₺** |
| seasonFeeBase | round100(avgPrice × seasonFeeBaseK 88) | **8.000₺** |

> **DİKKAT — `MEDICINES`'teki `cost`/`price` artık TABAN fiyattır, güncel fiyat değil.** Oyun içinde geçerli fiyatlar `medPrice(m)` / `medCost(m)` üzerinden okunur (bkz. 4.8). `avgPrice`/`avgCost` taban tablodan **bir kez** türetilir ve asla yeniden hesaplanmaz; bu dondurma bilinçlidir ve şunları sabitler: **startMoney, geliştirme fiyatları (`upgradeCost`), sahte servis cezası, dilenciye verilen para ve ruhsat bedeli**. Fiyatlar dalgalanırken geliştirme fiyatı da oynasa oyuncu hiçbir bütçe planı yapamazdı. Self-test bunu üç ayrı günde (1/15/30) karşılaştırarak denetler ve `MEDICINES`'in runtime'da değiştirilip değiştirilmediğine de bakar.

39 ilaç, 9 kategori, 35 semptom. **Kategori ↔ sekme 1:1** (koddan doğrulandı: her `group` tam bir `category`'ye karşılık geliyor), yani bir sekmedeki her ilaç o sekmenin semptomları için doğru cevaptır.

### 4.2 Günlük hedef formülü
Hedef genel ortalamalardan değil, **o günün gerçek listesinden** hesaplanır:

```
N        = o günün toplam hasta sayısı (gündüz + gece)
R        = SADECE geçerli hastaların cirosu (sahte reçeteliler 0₺ katkı yapar,
           çünkü doğru oynanış onları reddetmektir)
C        = aynı geçerli hastaların cost toplamı
missCost = (R + C) / geçerli hasta sayısı      ← o güne özel gerçek hata maliyeti
izinliHata(gün) = N × missRate(gün)

hedef = floor10( clamp( R − izinliHata × missCost, R×0.40, R×0.90 ) )
```

Bir hatanın maliyeti çift taraflıdır: kaçan ciro **+** yazılan cost zararı — `missCost` bunu birlikte ölçer. Tolerans **müşteri sayısına oranlıdır**. Yuvarlama **aşağı** yapılır; yukarı yuvarlamak formülün az önce verdiği toleransın bir kısmını geri alıyordu.

**Güvenlik bandı** `goalRatioClamp` [0.40, 0.90] normalde boşta durur ama sahte-ağırlıklı günlerde alt bant devreye girebilir: izinli hata `N × missRate` ile hesaplanır ve N sahteleri de sayar, oysa hata yalnız geçerli hastalarda yapılabilir. Günün yarısı sahte olunca geçerli hasta sayısı düşer, `missCost` fırlar, tolerans absürtleşir. Ölçüldü: **40 koşu × 30 günün %3,8'inde** alt bant devreye giriyor (üst bant hiç girmiyor). `verifyGoalBalance` bu günlerde tolerans ölçütünü uygulamaz (`clampedAt` bayrağına bakar) ve verbose modda bildirir — sessizce yutmaz.

### 4.3 missRate eğrisi
```
missRate(gün) = max(missRateFloor, missRateBase − (gün−1) × hız)
hız = (missRateBase − missRateFloor) / (missRateFloorDay − 1)
```

`missRateBase` 0.25 → `missRateFloor` 0.10, tabana **`missRateFloorDay` = 30. günde** varılır.

**Daralma hızı CONFIG'te elle verilmez, türetilir.** Eskiden `missRateDecay: 0.015` sabitti ve taban **11. günde** doluyordu; kalan 20 gün boyunca hata toleransı hiç değişmiyordu. Artık `base` veya `floor` değiştirilirse hız kendiliğinden yeniden hesaplanır — tek kaynak `missRateFloorDay`.

### 4.4 Gün büyüklüğü tavanı — `maxPatientsPerDay` = 26
```
patientLimitFor(day) = min(maxPatientsPerDay, patientsPerDayBase + (day−1) × patientsPerDayStep)
```
(8 + (gün−1)×2, 26'da kırpılır → tavan **10. günde** bağlar. Geliştirmelerden **bağımsızdır**.)

Tavan **iki ayrı sorunu birden** çözmek için kondu:

1. **İtibar oynaklığı.** İtibar ölçeği sabit (0–150) ama kazanç/kayıp müşteri sayısıyla ölçekleniyor. Tavansız hâlde gün 28'de 87 müşteri vardı; geç oyunda tek kötü gün 30–40 puan sallıyor, yumuşak tavanın verdiği yastık (en fazla 50 puan) bir günde siliniyordu. Ödül/ceza değerlerini oynatmak bunu **çözmedi** (bkz. 15) — sorun değerlerde değil, gün ölçeğinin itibar ölçeğine göre sınırsız büyümesindeydi.
2. **Oturum uzunluğu.** 87 müşterilik gün mobilde ~14,5 dakika kesintisiz dokunma demek.

Tavandan sonra en uzun **kesintisiz blok 26 müşteri ≈ 4,3 dk**. En uzun tam gün (nöbet dahil) 36 müşteri ≈ 6,0 dk, ama araya "NÖBET BAŞLIYOR" kartı girdiği için 4,3 + 1,7 dk olarak bölünür.

### 4.5 Geç oyun kompozisyon eğrisi
Tavan müşteri sayısını dondurunca zorluk **kompozisyondan** gelmek zorunda. Üç eksen, hepsi gün numarasına bağlı ve 30. güne kadar yayılı:

**Sahte oranı rampası** — `fakeChanceFor(day)`:
```
gün 1 → fakeChance 0.42
gün fakeChanceLateDay (25) → fakeChanceLate 0.55
üstü → fakeChanceMax 0.60'ta durur
```
Ölçülen dizi: g1 %42,0 → g10 %46,9 → g20 %52,3 → g30 %57,7. Gündüzde bile en az %40 gerçek reçete kalır.

**Nöbet sıklığı** — `nightDutyEveryFor(day)`: gün < `nightDutyLateFromDay` (16) ise her `nightDutyEvery` (4) günde bir; sonrasında her `nightDutyEveryLate` (3) günde bir. Üretilen günler: **4, 8, 12, 18, 21, 24, 27, 30** — erken yarıda 3 nöbet, geç yarıda 5.

**Gece sahte oranı** — çarpan ve tavan değişmedi, sadece çarptıkları taban güne duyarlı: `nightFakeChance(day) = min(nightFakeRateCap 0.60, fakeChanceFor(day) × nightFakeRateBoost 1.8)`. 0.42 × 1.8 zaten tavanı aştığı için gece **1. günden beri tavanda** (%60).

### 4.6 Gün 1 / 10 / 20 / 30 (40 runSeed ortalaması, Vitrin Lv1, terminal kilitli)
**Fiyat güncellemeleri açık** olarak yeniden ölçüldü (2026-09-10):

| Gün | Müşteri (gündüz+gece) | Sahte oranı | İzinli hata | Geçerli hasta | R (ciro) | Hedef | Hedef/R |
|---|---|---|---|---|---|---|---|
| 1 | 8 (8+0) | %42,0 | 2,00 | 6,2 | 1.148₺ | 545₺ | 0,47 |
| 10 | 26 (26+0) | %46,9 | 5,29 | 20,0 | 3.745₺ | 2.068₺ | 0,55 |
| 20 | 26 (26+0) | %52,3 | 3,94 | 19,9 | 3.798₺ | 2.525₺ | 0,66 |
| 30 | 36 (26+10) | %57,7 | 3,60 | 25,5 | 5.185₺ | 3.982₺ | 0,77 |

Gün 10 → 20 satırı mekanizmayı gösteriyor: müşteri sayısı ve R **donmuş** (ikisi de 26 hasta, ~3,7–3,8k₺), ama izinli hata 5,29 → 3,94'e daraldığı için hedef 2.068 → 2.525₺'ye çıkıyor. **Boyut ekseni dururken tolerans ekseni işi devralıyor.** Hedef/R oranı 0,47 → 0,77 tırmanıyor.

Fiyat çarpanları R'yi hafifçe yukarı kaydırdı (marj rayının küçük şişirme yan etkisi, bkz. 4.8) ama **hedef R'den türediği için oran eğrisi aynı kaldı**. Hedef formülüne dokunulmadı; güncel fiyatlara kendiliğinden uyum sağlıyor. Güvenlik bandı 40 koşu × 30 günün **%4,2**'sinde devreye giriyor (yalnız alt bant; üst bant hiç girmiyor).

### 4.7 Sipariş konsantrasyon tavanı
Tek bir hastanın günün cirosunda tutabileceği en yüksek pay sınırlıdır. **Sabit yüzde işe yaramaz**: 6 geçerli hastalı bir günde kimsenin %15'in altında kalması matematiksel olarak imkânsızdır. Bu yüzden tavan **adil paya oranlıdır**:

```
tavan = clamp(concentrationCapFactor / geçerliHasta, concentrationCapMin, concentrationCapMax)
      = clamp(2.2 / validN, 0.15, 0.40)
```
9 hasta → %24 · 6 hasta → %37 · 20 hasta → %15.

Neden gerekli: hedef bir **ortalama** olan `missCost`'a dayanır, ama hasta değerleri heterojendir. Tavan olmadan "3 hata" tek bir sayı değildir — en ucuz üç hastayı kaçırmakla en pahalı üçünü kaçırmak arasında birkaç yüz ₺ fark oluşur, yani **hangi müşteride hata yaptığın günü tek başına belirleyebilir.**

Uygulama iki aşamalı: önce en yüksek paylı hastanın siparişi yeniden üretilir (en fazla `concentrationMaxPasses` = 25 tur), yetmezse en pahalı kalem kademe kademe küçültülür (zorla sığdırma). Ölçüldü (40 koşu × 30 gün, fiyat güncellemeleri açık): **703 yeniden üretme, 0 zorla sığdırma** — birinci aşama her zaman yetiyor. Tavan **güncel fiyatlarla** ölçülür (`refValuesFor` → `medPrice`), taban fiyatla değil; bu ayrımın bir kez yanlış kurulmuş olması gerçek bir hataya yol açtı (bkz. 17). `validN ≤ 2` olan günlerde kural matematiksel olarak sağlanamayacağı için hiç uygulanmaz (sonsuz döngü yerine dokunmadan çıkılır). Sahteler kapsam dışıdır (R'ye 0 katkı yapıyorlar).

### 4.8 Fiyat güncellemeleri — taban fiyat × güne bağlı çarpan
Belirli günlerde bazı ilaçların **alış ve satış fiyatı ayrı ayrı** oynar; kâr oranları birbirinden ayrışır. Amaç oyunun geç aşamada karar içermeyen deterministik bir banda girmesini kırmak: oyuncu zam gelmeden ucuz stok alıp kâr edebilsin.

**Okuma katmanı.** `MEDICINES` taban tablodur, hiç değişmez. Güncel fiyat:
```
medPrice(m) = max(1, round(m.price × mul.p))
medCost(m)  = max(1, round(m.cost  × mul.c))
```
Fiyatın okunduğu **her** yer bu ikisinden geçer: referans ciro (`refValuesFor`), semptom kategori ortalaması, konsantrasyon küçültme, depo sepeti (`depotOrderTotal`), servis kazancı, yanlış servis zararı, depo ekranı, dilencinin verdiği ilacın değeri.

**`priceStateFor(gün)` SAF bir fonksiyondur** — mutable birikim yok. `(runSeed, gün)` → çarpanlar; gün 1'den o güne kadarki turlar sırayla yeniden oynanır ve sonuç gün başına cache'lenir. **Neden mutable state kullanılmadı:** `buildDaySchedule(30)` gün 1'de de çağrılabiliyor (hedef sorgusu, self-test, denge doğrulaması) ve o günün R/C/hedefi **o günün** fiyatlarıyla hesaplanmalı. Birikimli mutable state olsaydı önden üretilen gün yanlış fiyatla cache'lenirdi. Hangi günün fiyatı okunduğunu `genDay()` söyler — sahte oranı ve reçete tarihi ile **tam aynı mekanizma**.

**Tur sıklığı ve seçim.** Bir turun kendisini `applyPriceRound(mul, day)` uygular; `priceRoundOn(day)` o günün turunu (varsa) döndürür ve haber/gösterge/şerit çizen her yer bunu okur. `isPriceUpdateDay(d)` → `d ≥ 2 && (d−1) % priceUpdateEvery === 0`. `priceUpdateEvery` = 5 ile turlar **6, 11, 16, 21, 26**. Gün 1 asla tur günü değildir (öğretici gün).

Seçim **kategori kümelidir**: kota (`round(39 × priceUpdateShare 0.25)` = 10 ilaç) dolana kadar kategoriler **bütün olarak** eklenir. Ölçülen sonuç: tur başına **10–14 ilaç / 2–3 kategori**. İlk hâlinde pay ilaçlara serpiliyordu ve bir tur 8 kategoriye dokunuyordu — o hâlde haber "her şey oynadı" demekle aynı şey oluyordu (bkz. 15).

Adımlar:
- **ALIŞ yönü kategoriden** gelir (haberin doğru olması için), büyüklüğü ilaç başına ayrı çekilir
- **SATIŞ adımı ilaç başına tamamen bağımsız** çekilir — marjların ayrışması bu bağımsızlıktan doğar
- her adım `[priceDriftMin 0.60, priceDriftMax 1.60]` bandında clamp'lenir, yani sezon boyunca birikerek uçmaz

Ölçüldü (40 koşu × 30 gün × 39 ilaç): çarpanlar **0,600–1,600** bandının içinde kaldı; gün 30'da **637 ilaç-koşuda alış/satış ters yönde**, 646'sında aynı yönde hareket etmiş — bağımsızlık gerçekten çalışıyor. Marj yayılımı taban **%18–41 (sd 0,059)** → gün 30 **%3–64 (sd 0,152)**.

**Bir gün önceden yön haberi — sistemin şartı.** Haber olmasa oyuncu turu ancak olduktan sonra görür ve kâr karardan değil şanstan gelir. Gün sonu kartında iki satırlı amber şerit, **depo sekmesi diliyle**: `💱 Yarın alış fiyatları değişiyor` / `Mide ↓ · İlk Yrd. ↓ · Ağrı ↑`. Kategori adı yerine sekme etiketi kullanılır çünkü oyuncunun alışveriş yaptığı dil odur (kategori ↔ sekme 1:1). **Tutar verilmez, yalnız yön** — kesin tutar kararı bir hesaba indirir, yön ise karar bırakır. Tur gününde ayrıca gün başı bilgi şeridi, depo ekranı başlık notu ve satır başına ↑/↓ göstergesi çıkar.

**`priceMinMargin` rayı ve yan etkisi.** Bağımsız adımlar satışı alışın altına düşürebiliyordu ve oyuncunun buna karşı bir hamlesi yok (geçerli reçeteyi reddetmek itibar yakar). Ray marj tabanını sağlar: önce satışı yükseltir, yetmezse alışı düşürür; ikisi de bantta kalır.

Ama ray **asimetriktir** — satışı yukarı / alışı aşağı ittiği için simetrik adımlarda bile **ortalama marjı yukarı şişirir**. Ölçüldü: `priceStepMax` 0,22'de şişme **+0,23 puan** (%28,6 → %28,8, ihmal edilebilir), 0,35'te +1,64, 0,50'de +3,17 puan. Yani büyük adım sezon skorunu enflasyonla yukarı çeker ve "yüksek skor" beceriden değil ayardan gelir. **`priceStepMax` bu yüzden 0,22'de bırakıldı** ve self-test'e şişme 1 puanı aşarsa uyaran bir denetim eklendi (0,50 ile denendi, uyarıyı veriyor).

Rayın küçük bir kaçağı var ve dürüstlük adına yazılı: ray **çarpan** düzeyinde çalışır, `medPrice`/`medCost` ise tam sayıya yuvarlar. Yuvarlama sonrası gerçekleşen en düşük marj 40 koşu × 30 gün × 39 ilaçta **%2,86** (rayın ima ettiği %4,76'nın altı). Negatife hiç düşmüyor: aynı 46.800 kontrolde **0 zararına satış**.

---

## 5. İtibar Sistemi

> **İtibar SEZON ölçeğinde yaşar.** Her sezon `startReputation` (50) ile başlar, sezonlar arası devretmez (gerekçe: 2.1). Sezon içinde 0'a inmek **kariyeri** bitirir (2.3).

**Tek fail state itibarın 0'a inmesidir** (`loseReputation` → `triggerGameOver`). Başlangıç 50.

**Kazanç kalemleri:** doğru servis **+2**, sahteyi yakalamak **+8**, hedefi tutturan gün **+3**.
**Kayıp kalemleri:** yanlış ilaç **−5**, sahteye ilaç vermek **−15**, gerçeği reddetmek **−5**, hasta küsmesi **−8**.

### 5.1 Yumuşak tavan
Sert 100 tavanı, tavana çarpan kazancı tamamen yok ediyordu; kayıplar ise her zaman tam işliyordu. Sonuç: **iyi oynamak yastık biriktirmiyordu.** Şimdi:

| Ayar | Değer | Anlamı |
|---|---|---|
| `repSoftCap` | 100 | buraya kadar kazanç **tam değerle** |
| `repOverflowFactor` | 0.5 | 100 üstündeki kazanç **yarım değerle** birikir |
| `repMax` | 150 | mutlak tavan |
| `minReputation` | 0 | oyun sonu eşiği |

**Kayıplarda yumuşatma YOKTUR** — tam değerle işler. `CONFIG.maxReputation` (100) artık kullanılmıyor; clamp'lerde kullanılırsa 100 üstü yastık ilk kayıpta silinir, o yüzden koda dokunulmamalı.

### 5.2 Hedefi kaçırmanın cezası yoktur — bilinçli karar
Kodu okuyan biri eksiklik sanabilir, o yüzden net yazılıyor: **günlük para hedefini kaçırmanın hiçbir yaptırımı yoktur.** `endDay()` iki şey yapar — state'i DAYEND'e çeker ve `dayResult = { goal, met, repGain }` kurar.

- **Tutturan gün** `goalMetReputation` = **+3 itibar** kazandırır (yumuşak tavan yüzünden fiilen eklenen değer `repGain`'e yazılır, kart bunu gösterir).
- **Kaçıran gün hiçbir ceza almaz**: itibar kaybı yok, para cezası yok, oyun bitmez, kaçırılan hedef ertesi güne eklenmez. Üst üste kaçırmak da hiçbir şey tetiklemez. `met` bayrağı yalnız DAYEND kartındaki rozetin rengini ve metnini belirler.

Para baskısı **dolaylıdır**: kasa erir → depo siparişi verilemez → stok biter → hasta servis edilemez → itibar düşer → oyun biter. Hedef bu zincirin ölçüm göstergesidir, ceza mekanizması değil.

Bunun bir bedeli var ve bölüm 16'da açık konu olarak duruyor: sabit iyi oynayan oyuncu hedefi kaçırsa bile ölmüyor.

---

## 6. Reçete İnceleme

### 6.1 Kusur türleri
İki sınıf:
- **`DETECTABLE_FLAWS`** = `fake_doctor`, `expired`, `no_stamp`, `bad_signature` (4 kusur) — hepsi yalnız reçete kağıdına ve doktor defterine bakarak doğrulanabilir.
- **`SUBTLE_FLAWS`** = `conflict` (uyku ilacı + enerji takviyesi bir arada) — alan bilgisi ister, oyunun hiçbir yerinde öğretilmez.

**Kural: her sahte reçete garanti olarak en az bir DETECTABLE kusur taşır.** `conflict` yalnızca ikinci kusur olarak eklenebilir. Eskiden kusur havuzdan rastgele seçiliyordu ve tek kusuru `conflict` olan reçete üretilebiliyordu: doktor defterdeki gerçek doktor, kaşe yerinde, imza düzgün, tarih bugün — oyuncunun yakalayabileceği hiçbir ipucu yoktu ama onaylayınca ceza yiyordu. Boot self-test'i bu kuralı denetler.

**YÜKSEK ADET KUSUR DEĞİLDİR.** Eskiden `overdose` (×8/×10) bir sahtelik kusuruydu; kaldırıldı. Adet dağılımı her reçetede aynı: ölçülen **%73 ×1, %18 ×2, %6 ×3, %3 ×4–6**. Doktor 5 kutu yazabilir ve bu reçeteyi sahte yapmaz. Reçete kalem sayısı: %32 tek, %38 iki, %30 üç kalem.

İpuçları renkle ele vermez — oyuncu tarihi, imzayı, kaşeyi okuyup anlamalı.

### 6.2 Doktor defteri ve sahte isim kuralı
**20 `KNOWN_DOCTORS`** — tezgahtaki kapalı defter objesine dokununca açılma animasyonu. "Tanınan Doktorlar" başlığı kitabın **dışında**, üst kenarın üstünde ayrı krem plakada. İsimler kitaptaki çizgilere hizalı; hiza `CONFIG.bookTextStartY` (0.225) ve `bookLineStep` (0.0723) ile ince ayarlanır (kitap yüksekliğine oran).

**14 `FAKE_DOCTORS`** — defterde yok ama kasıtlı olarak gerçeklere yakın seçilmiş (Yıldırım/Yıldız, Koç/Koçak, Taş/Taşkın) ki oyuncu defteri gerçekten kontrol etsin.

> **Kural: sahte isim, gerçek isimden yalnızca soyad öneki uzatmasıyla ayrılmamalı.** Bu yüzden iki isim değişti: "Dr. Zeynep Kayahan" → **"Dr. Sibel Kayahan"** (defterde "Dr. Zeynep Kaya" var: ad aynı + soyad öneki, ayırt edilemiyordu), "Dr. Elif Şahiner" → **"Dr. Nurcan Şahiner"** (defterde "Dr. Elif Şahin"). Kalan benzer çiftlerde **adlar** farklı olduğu için ayırt edilebilirler. Boot self-test'i bu kuralı denetler.

Ayrıca: doktoru defterde olan bir sahte reçete, `fake_doctor` kusuru **taşıyamaz** — başka bir kusurla sahte olmalı. Self-test bunu da kontrol eder.

---

## 7. Medula Sistemi (e-reçete)

### 7.1 Ne açılır
Terminal Lv2 (2.700₺) alınınca:
- PC'de **MEDULA SİSTEMİ** sekmesinin kilidi kalkar. (Satın alınmadan sekme görünür ama pasiftir, "🔒 Geliştirme'den satın al" yazar, dokunuş yutulur.)
- Reçeteli hastaların bir kısmı kağıt yerine e-reçete kodu getirmeye başlar (`medulaPatientRatio` 0.30).

Terminal kilitliyken **hiç** Medula hastası üretilmez. Satın alma `invalidateDaySchedules()` çağırır — hasta tipleri değiştiği için önden üretilmiş günler geçersizleşir.

### 7.2 Kod formatı ve alfabe
```
MEDULA_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"   // 36 karakter, TAM set
```
Kod **6 karakter** (`medulaCodeLen`) ve **daima "2" ile başlar** (gerçek Medula kodlarının biçimini andırsın diye).

> **Not — bu bilinçli olarak değiştirildi.** Alfabe eskiden 31 karakterdi ve I, O, Q, 0, 1 karıştırılabilirlik gerekçesiyle çıkarılmıştı. Şimdi **tam 36 karakterlik set** kullanılıyor: klavyede eksik tuş kalmasın diye. Belgenin eski sürümündeki "31 karakter, I/O/Q/0/1 yok" iddiası artık **geçersizdir**.

Kodlar hasta üretiminde seed'li rng ile belirlenir → aynı gün her zaman aynı kodları verir; gün içinde benzersizdirler.

### 7.3 PC ekranı ve kod girişi
1. Medula hastası kağıt uzatmaz; balonunda repliğini ve **kodu** koyu yeşil şeritte gösterir (kod hep orada durur, tekrar bakılabilir).
2. Oyuncu PC → MEDULA SİSTEMİ ekranını açar, kodu **tuş takımıyla** girer (alfabe ızgarası + ⌫ SİL + ✓ SORGULA).
3. Yanlış/eksik kod → "Kayıt bulunamadı", giriş temizlenir. Kod yalnızca **kuyruktaki** hastalar arasında aranır (gelmemiş hastanın kodunu oyuncu zaten bilemez).
4. Doğru kod → ilaç listesi görünür **ve o hasta için kalıcı kalır**: geri dönünce reçete panelinin yerinde "MEDULA KAYDI" kartı durur.

**Girilen kod PC kapanınca TEMİZLENMEZ** — oyuncu koda tekrar bakmak için PC'yi kapatıp açtığında yazdıkları durmalı. Temizlenme yalnız şurada olur: başarılı sorgu, "Kayıt bulunamadı", SİL tuşu, gün değişimi, yeni oyun.

Sorgu durumu `game.medulaRevealed["gün:kod"]` içinde tutulur — **istek nesnesine yazılmaz**, çünkü o nesne gün cache'iyle paylaşılıyor; oraya yazılsa yeni oyunda eski sorgular açık gelirdi.

### 7.4 Medula reçetesi ASLA sahte değildir
`makeMedulaRequest` her zaman `fake: false` üretir. Medula hastasında `activeNeedsDecision()` false döner: **ONAYLA/REDDET fazı hiç çalışmaz**, doktor defteri ve kusur mantığı devreye girmez. Yanlış ilaç vermek normal yanlış servis gibi cezalandırılır.

Bu, sahte reçeteyle karşılaşma oranını bir miktar düşürür (kağıt reçetelerin bir kısmı Medula'ya kayıyor) — bilinen ve kabul edilmiş bir takas.

### 7.5 ÖDEME AYRIMI (kritik)
Medula satışının parası kasaya **anında girmez**. İki sayaç bilinçli olarak ayrılmıştır:

| Sayaç | Ne zaman yazılır | Neden |
|---|---|---|
| `dayStats.money` (günlük kazanç — **hedefin ölçüldüğü** sayaç) | Hizmet edilen **GÜN** | Hedef formülü, R ve missCost hiç etkilenmesin |
| `game.money` (harcanabilir **nakit**) | Hizmetten **2 gün sonra** (`medulaPayDelayDays`) | Nakit akışı baskısı |

**Vadeli alacak defteri**: `game.receivables = [{ dueDay, amount }]`. `startNextDay()` içinde `collectReceivables()` vadesi gelenleri kasaya aktarır. Bildirim iki yerde: gün başında yeşil bilgi şeridi ("🏦 SGK ödemesi yattı: +X₺" — stok uyarısından **ayrı kanal**, birbirini ezmezler) ve DAYEND kartında satır. Hizmet edilen günün kartında ayrıca "🧾 SGK alacağı: X₺ (gün N+2)" görünür. PC ana ekranında bekleyen alacak ve vade dökümü durur.

**Kalıcılık:** stok/geliştirme ile aynı yol — `startNewGame()` sıfırlar, `startNextDay()` dokunmaz; DEVAM ET'te korunur. **Oyun biterse yatmamış alacak kaybolur.**

**Defter bütünlüğü:** `verifyMedulaLedger()` her tahsilatta ve self-test'te "yazılan toplam = kasaya giren + hâlâ bekleyen" eşitliğini kontrol eder.

Medula satış fiyatı normal fiyatla **aynıdır**; tek fark ödemenin gecikmesi. Nöbet farkı (×1,25) Medula satışına da uygulanır.

---

## 8. Nöbetçi Eczane

Türkiye'de eczaneler sırayla nöbet tutar. Nöbet **aynı günün ikinci bölümüdür**, ayrı bir gün tipi ya da ayrı bir state değil.

### 8.1 Neden ayrı gün tipi değil
Gece hastaları gün programının parçası olarak `buildDaySchedule` içinde üretilir ve listenin sonuna `night: true` ile eklenir. Bu sayede **hedef formülü hiç değişmeden doğru çalışır**: R, C ve missCost zaten "o günün gerçek listesinden" hesaplandığı için gece hastaları kendiliğinden hesaba giriyor. Tek uyum: `allowedMissesFor(day)` `totalPatientsFor(day)` (gündüz + gece) kullanır — formülün tanımı aynı, N'in kapsamı genişledi.

### 8.2 CONFIG
| Ayar | Değer | Anlamı |
|---|---|---|
| `nightDutyEvery` | 4 | gün < 16: her 4. gün nöbetçi |
| `nightDutyEveryLate` | 3 | gün ≥ 16: her 3. gün nöbetçi |
| `nightDutyLateFromDay` | 16 | sıklığın arttığı gün |
| `nightPatientRatio` | 0.4 | gündüz müşteri sayısının oranı |
| `nightPatientMin` | 3 | gece en az bu kadar hasta |
| `nightFakeRateBoost` | 1.8 | gece sahte oranı çarpanı |
| `nightFakeRateCap` | 0.60 | tavan — gecede bile en az %40 gerçek |
| `nightPriceMultiplier` | 1.25 | nöbet farkı |
| `nightPatienceMultiplier` | 1.2 | gece hastası daha sabırlı |
| `nightIntroDuration` | 2.2 | geçiş kartının otomatik kapanma süresi (sn) |
| `nightFadeTime` | 0.9 | gece tonlamasının oturma süresi (sn) |

`isNightDutyDay(day)` tek yerdedir; nöbet tespiti hep buradan yapılır. Tavan bağladıktan sonra gece bloğu sabit **10 hasta** (26 × 0,4).

### 8.3 Nöbet farkı yalnız SATIŞ fiyatına
`nightPriceMultiplier` gece hastalarının **satış fiyatına** uygulanır; ilacın **mal maliyeti (`cost`) değişmez** — eczane aynı ilacı aynı fiyata almıştır, sadece nöbet farkıyla satar. Çarpım hem gerçek kazanca (`checkOrder`) hem de R hesabına (`refValuesFor(request, priceMul)`) girer, yani hedef de nöbet farkını görür.

### 8.4 Akış ve görsel
- Gündüz hastaları bitince DAYEND'e gidilmez: `beginNightShift()` çalışır, **"🌙 NÖBET BAŞLIYOR"** geçiş kartı açılır (gece hasta sayısını ve "sahte reçete girişimi artar" uyarısını yazar). Tek dokunuşla ya da 2,2 sn sonra kapanır; açıkken oyun donar.
- **Gece tonlaması, yeni asset olmadan**: `drawNightOverlay()` arka planın üstüne `multiply` ile gece mavisi→mor gradyan, tezgah bandının üstüne `lighter` ile sıcak amber hâle koyar — salon kararır, tezgah aydınlık kalır. `game.nightT` 0,9 sn'de oturur.
- Gece bitince normal DAYEND kartı gelir; **☀️ Gündüz kazancı** ve **🌙 Gece kazancı** ayrı satır olur, başlık "Gün N + Nöbet Bitti".
- **Bir önceki günün** DAYEND kartında mor uyarı şeridi: "🌙 Yarın nöbetçisin — stoklarını kontrol et".
- Nöbet günü HUD'da 🌙 rozeti durur (gece bölümünde dolgusu parlar).

---

## 9. Eczane Geliştirme

Paranın harcanacağı yer. Geliştirmeler kalıcı bir para gideridir.

### 9.1 PC navigasyonu
Tezgahtaki PC'ye dokununca `openPc()` **dört butonlu** ana ekranı getirir:

```
[ 🧾 SATIŞ              — Siparişi hazırla ve servis et  (sepet doluysa "Sepette N kalem") ]
[ 📦 ECZA DEPOSU        — İlaç siparişi ver                                                ]
[ 🔧 ECZANE GELİŞTİRME  — Kalıcı yükseltmeler                                              ]
[ 🖥️ MEDULA SİSTEMİ     — (Lv2 alınmadan kilitli)                                          ]
```

`game.pcScreen` = `"home" | "sale" | "depot" | "upgrades" | "medula"`. `drawPcPanel()` hangisi açıksa onu çizer ve **her frame önce kapalı ekranların rect'lerini temizler** (görünmeyen buton tıklanabilir kalmasın). Alt ekranlarda sağ üstte "‹ GERİ" ana ekrana döner; ✕ paneli kapatır. Medula'nın kilit davranışı değişmedi: satın alınmadan buton görünür ama pasiftir, "🔒 Geliştirme'den satın al" yazar ve dokunuş yutulur. DAYEND kartındaki "📦 Depodan Sipariş" doğrudan depo ekranına gider.

#### SATIŞ ekranı (`drawSale`)
Tek ekranda iki bölüm, üst üste: **İSTENEN** üstte, **SEPET** altta. Oyuncu paneli kapatmadan ikisini karşılaştırabilsin diye aynı ekranda dururlar.

**Üstte İSTENEN** (`saleWantRows`) — hastanın ne istediği:

| Hasta tipi | Gösterilen |
|---|---|
| Reçeteli (onaylanmış) | kalem adı + adet listesi |
| Reçeteli (henüz onaylanmamış) | "Reçete henüz onaylanmadı" |
| Medula (kod sorgulanmış) | kalem adı + adet listesi |
| Medula (kod sorgulanmamış) | "Kod XXXXXX — önce MEDULA'dan sorgula" |
| Semptomlu | semptomların emoji + etiketi (adet >1 ise ×N) |

Tablodaki iki "gizli" hâl (onaylanmamış reçete, sorgulanmamış Medula kodu) bilinçlidir: SATIŞ ekranı **bilgi kaynağı değildir**. Reçetenin onaylanması ONAYLA/REDDET fazından, Medula listesinin görülmesi MEDULA ekranındaki kod sorgusundan geçmek zorundadır — aksi halde SATIŞ ekranı iki mekaniği birden atlatan bir kestirme olurdu.

**Altta SEPET** — seçilen her kalem bir satır: ilaç görseli, adı, `−` / `+` adımlayıcı ve adet. Başlığın sağında toplam kalem sayısı yazar. `+` sepetteki adet stoğa eşitken pasifleşir; `−` adedi 0'a indirince **satır sepetten düşer**. Sepet boşken "Sepet boş — aşağıdaki raftan ilaç seç" yazar.

**En altta SERVİS ET** — sepet boşken ya da servis izni yokken pasif; aktifken nabız gibi parlar.

**Tezgahta hasta yoksa** ekran "🚪 Tezgahta hasta yok" der, sepet bölümü hiç çizilmez.

**Sığma:** İSTENEN kutusu panel yüksekliğinin %24,5'i, sepet kutusu SERVİS ET'e kadar kalan alan. İkisinde de satır yüksekliği **6 satır referansına göre** hesaplanır (`min(kutuH/6.2, kutuH/(n+0.2))`), yani kalem sayısı arttıkça satırlar sıkışır, taşmaz. Ölçüldü (390×844, 6 kalemlik reçete): 6 sepet satırı ve 12 adımlayıcı butonun tamamı panel içinde, satır çakışması 0, SERVİS ET son satırın 18 px altında ve panel alt kenarının 49 px üstünde.

#### DONMA KURALI — SATIŞ dondurmaz, diğer üçü dondurur
Bu **bilinçli bir tasarım kararıdır** ve tek noktadan verilir:

```js
function pcFreezesGame() { return game.depotOpen && game.pcScreen !== "sale"; }
```

`update()` yalnız bu fonksiyona bakar (`if (pcFreezesGame()) return;`).

| Ekran | Sabır / spawn | Gerekçe |
|---|---|---|
| **SATIŞ** | **İŞLER** | Hizmet anının parçası. Oyuncu siparişi hazırlarken hasta beklemeye devam eder; sepeti PC'ye taşımak zaman baskısını kaldırmak için değil, tezgahı boşaltmak içindir. |
| ECZA DEPOSU | donar | Hizmet anının parçası değil |
| ECZANE GELİŞTİRME | donar | Hizmet anının parçası değil |
| MEDULA SİSTEMİ | donar | Hizmet anının parçası değil |

Ölçüldü (1 sn = 60 frame): SATIŞ Δsabır = 1,000 sn · DEPO / GELİŞTİRME / MEDULA Δ = 0,000 · panel kapalı Δ = 1,000.

> Medula'nın dondurması bir takastır: kod girişi tuş takımıyla yapıldığı için zaman baskısı altında yapılması cezalandırıcı olurdu. Bunun bedeli, Medula hastasında oyuncunun sorgu için istediği kadar zaman bulmasıdır.

### 9.2 Kalemler ve fiyatlar
Fiyatlar sabit değil: `round100(avgPrice × costK[n])`, ve `costK.length === maxLevel − 1` (n'inci alım = `costK[n−1]`). Lv1 herkeste bedava başlangıç durumudur.

| Kalem | id | Lv1 | Lv2 | Lv3 | Lv1→2 | Lv2→3 |
|---|---|---|---|---|---|---|
| Tezgah | `tezgah` | kuyruk 3 hasta | 4 hasta | 5 hasta | 1.400₺ | 2.700₺ |
| Depo Rafı | `depo` | stok tavanı 30 kutu | 45 kutu | 60 kutu | 1.400₺ | 2.700₺ |
| **Vitrin** | `vitrin` | **%50 reçeteli** | **%55 reçeteli** | **%60 reçeteli** | 1.400₺ | 2.700₺ |
| Bekleme Alanı | `bekleme` | normal sabır | +%20 | +%40 | 1.400₺ | 2.700₺ |
| Medula Terminali | `medula` | kilitli | açık — e-reçete hastaları gelir | — (maxLevel 2) | 2.700₺ | — |

Maks seviyede buton yerine **TAM** yazar ve tıklanamaz. Para yetmiyorsa buton pasifleşir, depo ekranıyla aynı biçimde "⛔ Yetersiz bakiye — kasa: N₺" uyarısı çıkar. Satın alma kasadan düşer, **kasa negatife inemez**.

### 9.3 VİTRİN — müşteri SAYISI değil, reçeteli hasta PAYI
Bu, belgeye ayrı başlıkla yazılacak kadar önemli bir değişiklik.

Vitrin eskiden günlük müşteri sayısına **+2/+4** ekliyordu. Gün büyüklüğü `maxPatientsPerDay`'de tavanlandıktan sonra bu **10. günden itibaren hiçbir şey yapmıyordu**: Lv1 ile Lv3 birebir aynı günü üretiyordu. Parası alınan, hiçbir etkisi olmayan ölü bir geliştirmeydi.

Yeni işlevi: **seviye başına reçeteli hasta payını yükseltmek.**
```
vitrinRxShare(lv) = clamp(prescriptionChance + (lv−1) × vitrinRxBonus, 0, 1 − vitrinSymptomFloor)
                  = %50 / %55 / %60
```
`vitrinSymptomFloor` = 0.40, yani **semptomlu hasta payı %40'ın altına inemez** — Lv3'te bile karışım tek tipe dönüşmez.

**Kritik detay — sahte seyreltmesi.** Reçeteli payını ham hâliyle yükseltmek işe yaramadı, çünkü sahte reçetenin cirosu sıfırdır. Ölçüldü (20 koşu, 15.300 hasta): geçerli reçete 238₺, semptomlu hasta 165₺ (**1,44×**), ama reçetelilerin ~%51'i sahte olduğu için bir reçeteli hastanın **beklenen** değeri semptomlunun yalnızca **0,70 katı**. Ham artış Vitrin Lv3'te R'yi **%4,2 düşürüyordu**.

Çözüm: reçete başına sahte ihtimali, payın büyüdüğü oranda seyreltilir.
```
vitrinFakeDilution() = prescriptionChance / effPrescriptionChance()   // 1.00 / 0.91 / 0.83
sahte/hasta = pay × sahteŞansı × (taban/pay) = taban × sahteŞansı     // paydan BAĞIMSIZ
```
Yani **gün başına düşen sahte sayısı değişmez** (inceleme mekaniği ve sahte oranı ekseni aynen korunur), Vitrin'in eklediği hastalar **gerçek reçete** olur. Doğrulandı: sahte/hasta oranı Lv1 %25,62 · Lv2 %25,54 · Lv3 %25,69.

Sonuç (40 koşu × 30 gün toplam R): Lv1 107.070₺ → Lv2 110.990₺ (**+%3,7**) → Lv3 113.392₺ (**+%5,9**). Geçerli hasta/gün üç seviyede de 18,9.

Bu R'yi büyütür, hedef R'den türediği için **kendiliğinden ölçeklenir** — hedef formülüne dokunulmadı.

### 9.4 eff*() katmanı
`CONFIG.maxQueue / maxStock / basePatience / prescriptionChance` **hiçbir oyun kodunda doğrudan okunmaz**; hepsi seviyeye göre hesaplanan efektif değerlerden geçer:

| Fonksiyon | Lv1 | Maks |
|---|---|---|
| `effMaxQueue()` | 3 | 5 |
| `effMaxStock()` | 30 | 60 |
| `effPatience()` | 38,0 sn | 53,2 sn |
| `effPrescriptionChance()` | 0,50 | 0,60 |
| `medulaUnlocked()` | false | true |

(CONFIG değerleri hâlâ **taban** olarak duruyor ve `eff*()` içinde okunuyor.)

`patientLimitFor(day)` artık bu listede **yok** — gün büyüklüğü geliştirmelerden tamamen bağımsız.

### 9.5 Kalıcılık ve cache geçersizleştirme
Stokla **aynı yol**: `initUpgrades()` yalnız `startNewGame()` tarafından çağrılır, `startNextDay()` dokunmaz. Günler arası korunur, DEVAM ET'te korunur, BAŞLA'da (tam reset) hepsi Lv1'e döner.

**Vitrin ve Medula gün üretimini değiştirir** (biri hasta karışımını, diğeri hasta tiplerini), o yüzden satın alma `invalidateDaySchedules()` çağırır. **Oynanmakta olan gün etkilenmez**: `patientsForDay()` ve `goalForDay()` o günün `game.daySchedule` snapshot'ından okur, cache'ten değil. Etki ertesi günden başlar.

---

## 10. Dilenci

Tezgaha nadiren gelen, günün hasta programına **ait olmayan** karakter. İki tipi var: `"beggar"` (yardım isteyen) ve `"beggarpay"` (borcunu ödemeye gelen). `isBeggarType()` ikisinin ortak dışlamalarını taşır.

### 10.1 Programın dışında olması (kritik)
Dilenci `daySchedule`'a **hiç girmez**; `patient.bonus = true` ile cheat hastalarının izlediği yolun aynısını kullanır. Sonuç: **N, R, C, missCost, hedef, konsantrasyon tavanı ve gün sonu sayacı onu görmez.** Ölçüldü — dilenci kuyruğa girdikten sonra `N`, `R`, `goal` ve `daySpawned` birebir aynı kalıyor.

Hasta mantığının hiçbir yoluna girmez: `servingAllowed()` false, `activeNeedsDecision()` false, `expectedMedicineIds()` boş, `refValuesFor` sıfır katkı + `valid:false`, `request`'te `fake` alanı yok. Self-test bunların hepsini ayrı ayrı denetler.

Buna rağmen **gelişi deterministiktir**: `beggarPlanFor(gün)` kendi tohum akışında (`BEGGAR_SEED_SALT`) hangi gün, kaçıncı hastadan sonra ve hangi replikle geleceğini verir — hasta listesinin RNG akışını kaydırmaz. Gün 1'de asla gelmez, günde en fazla bir kez. `beggarChance` 0,30 → sabit test tohumunda 30 günde **9 ziyaret** (beklenen 0,30 × 29 = 8,7).

### 10.2 Üç seçenek
Reçetenin ikili şeridiyle **aynı yerde, aynı buton dilinde, üç eşit kolon**; her buton iki satır (ne yapıldığı / bedeli). İkisi asla aynı anda görünmez.

| Seçenek | Bedel | İtibar | Pasif olma koşulu |
|---|---|---|---|
| **💊 İLAÇ VER** | stoktaki **en ucuz** kalemden 1 adet (güncel alışa göre) | `beggarRepGive` **+6** | stok tamamen boşsa |
| **💵 PARA VER** | `beggarMoneyGive` **91₺** (avgPrice × 1,0) | +6 | kasa yetmezse |
| **✕ REDDET** | — | `beggarRepReject` **−8** | hiç |

Sabrı `beggarPatienceMul` 0,8 ile normal hastadan kısadır. **Sabır dolarsa reddetmiş sayılır** (aynı ceza) — bekleyip görmezden gelmek reddetmenin ucuz yolu olmasın. Dilenci sayaçları hasta sayaçlarından ayrı tutulur: `served`/`correct`/`wrong`/`angry` hiç kirletilmez.

### 10.3 İtibar tavanı asimetrisi — geri ödemenin var olma sebebi
Ölçüldü (kariyer boyu, 60 tohum): A profilinde yardımın **nominal** itibar karşılığı **+353**, **fiilen uygulanan** ise yalnız **+22** — yumuşak tavan %94'ünü yiyor. Reddetme ise tam değerle **−466** işliyor.

Yani itibar tavanındaki oyuncu için yardımın karşılığı fiilen sıfırdı, reddetmek de ona pahalıya gelmiyordu (zaten tavanda): **dilenci güçlü oyuncu için her iki yönde de anlamsızdı.** Çözüm, yardımın **itibar tavanından bağımsız, nakit** bir karşılığı olması.

### 10.4 Geri ödeme
Yardım edilince (`beggarGiveMedicine` / `beggarGiveMoney`) `scheduleBeggarReturn()` bir zar atar; tutarsa geri ödeme defterine `{ dueDay, amount, line }` yazılır. Vadesi gelen borçlu tezgaha **bonus hasta** olarak gelir ve **tek butonu** olur: `💵 ÖDEMEYİ AL (+X₺)`. Yapay bir ikinci seçenek uydurulmadı — üç butonlu şerit yerine aynı şeride tam genişlikte tek buton kondu.

| CONFIG | Değer | Ne |
|---|---|---|
| `beggarReturnChance` | 0,55 | geri dönme ihtimali (garantili DEĞİL) |
| `beggarReturnDelayMin/Max` | 2 / 5 gün | vade aralığı |
| `beggarReturnMul` | 2,5 | ödeme = verilenin değeri × bu |

**Borç RAF fiyatı üzerinden hesaplanır** (`medPrice`), alış maliyeti üzerinden değil: borcun değeri dilencinin **eline geçen** değerdir, kişi aldığı şeyin karşılığını öder, senin tedarik maliyetini bilmez. Para verildiyse verilen tutar esas alınır.

**Reddedilen geri dönmez** — `beggarRefuse` içinden `scheduleBeggarReturn` çağrılmaz; sabır bitişinde de çağrılmaz. Self-test ikisini de denetler.

**Seed'li**: zar, yardımın **yapıldığı güne** bağlı kendi tohum akışında atılır (günde en fazla bir dilenci olduğu için gün tek başına anahtar). Aynı runSeed + aynı yardım kararları her zaman aynı geri dönüşleri verir, ve zar hasta üretim akışını kaydırmaz.

Ödeme kasaya girer **ve** `addDayMoney` ile günün kazanç sayacına yazılır; **hedef formülüne dokunulmadı** — hedef o günün hasta listesinden hesaplanıyor, bu bonus hasta o listede yok, yani ödeme hedefi kolaylaştıran serbest bir paydır. Sezon ve kariyer kartında dilenci satırı varsa geri ödeme satırı da çıkar.

Borçlunun sabrı biterse para alınmaz ama **ceza da yoktur**: bu bir ödül hastası, kaçırmanın bedeli ödülün kendisi. Küsen müşteri sayacına da girmez.

Defter, SGK alacaklarıyla **aynı kalıcılık yolunda**: kariyer boyu kalıcı, `startNewCareer` sıfırlar, `beginSeason` vadeyi bir sezon geriye çeker (yoksa 31. güne yazılan borç bir daha asla gelmezdi — bkz. 17).

---

## 11. Görseller

**39 ilacın 39'u gerçek PNG** — emoji fallback'e düşen ilaç kalmadı (koddan ve diskten doğrulandı).

`loadAssets()` içinde **52 kayıt**, diskte **52 PNG**. Kayıtlı ama diskte olmayan dosya **yok**; diskte olup kayıtlı olmayan dosya da **yok** (eski `prescription_paper.png` ve `doctor_book_icon.png` artık ortada değil).

| Grup | Adet |
|---|---|
| İlaç (`med_*`) | 39 |
| Hasta karakteri (`patient_*`) | 8 |
| Sahne/UI (`bg_pharmacy`, `counter`, `doctor_book`, `doctor_book_closed`, `pc`) | 5 |

**Emoji fallback yolu kaldırılmadı** ve kaldırılmamalı: `Sprite.draw(...)` PNG yüklenmemişse/eksikse `fallback` çizer. Bu bir güvenlik ağıdır — asset geç yüklenirse, bozuksa ya da yeni bir ilaç PNG'siz eklenirse oyun çizim hatası vermez, emoji + renkli kutuyla devam eder.

> **Dikkat:** loader `MEDICINES`'i otomatik gezmez, **açık liste tutar**. Yeni ilaç eklerken `assets/` klasörüne PNG koymak yetmez, `loadAssets()` içine `Assets.load(...)` satırı da eklenmelidir.

**Üretim akışı** (özet — ayrıntı projede ayrı belgede): ChatGPT'de Büfeci stilinde, düz/beyaz arka planlı görsel üretilir → asistana gönderilir → Python flood-fill ile şeffaflaştırılır, gerekirse grid bölünür → PNG olarak döner. Higgsfield kullanılmıyor.

**Görsel stil çapası**: sıcak, hafif koyu, doygun, yarı-gerçekçi boyalı illüstrasyon, retro dokulu gölgeleme. Ahşap kahveleri, paslı metal, amber vurgular. KAWAII/PASTEL DEĞİL, düz vektör DEĞİL, çizgi film DEĞİL. İlaçlar 1:1, karakterler 3:4, arka plan 9:16.

---

## 12. Servis Akışı, Tezgah ve Arayüz

### 12.1 Servis akışı — seçim altta, onay PC'de
Akış üç adıma ayrılmıştır ve tezgah yüzeyi **tamamen boş** kalır:

1. **Seçim (alt alan).** Kategori sekmeleri ve ilaç kartı gridi değişmedi. Karta dokunmak ilacı **sepete** ekler; aynı karta tekrar dokunmak adedi artırır (`tapMedicine`). Dokunuşta **stok kontrol edilir ama düşülmez**: stok 0 ise ya da sepetteki adet stoğa eşitse ekleme yapılmaz ve toast uyarısı çıkar.
2. **Sepet ve onay (PC → SATIŞ ekranı).** Adet düzenlemesi ve servis onayı burada (bkz. 9.1).
3. **Servis (poşet animasyonu).** SERVİS ET'e basılınca panel kapanır, tezgahta kodla çizilen dolu bir eczane poşeti belirip hastaya doğru kayar (`CONFIG.bagFlyTime` = 0,6 sn), uçuş bitince `checkOrder()` çalışır ve mevcut doğru/yanlış geri bildirimi görünür.

**Sepet veri yapısı DEĞİŞMEDİ:** `game.counter` hâlâ düz bir id listesidir (aynı ilaç birden çok kez geçer). `checkOrder`, `sameMultiset` ve `expectedMedicineIds` bu biçime bağlı olduğu için **eşleşme mantığına hiç dokunulmadı**; üzerine yalnız `cartRows()`, `cartCount()`, `cartChange()`, `clearCart()` yardımcıları eklendi.

**Stok düşümü tek noktadadır:** yalnız `checkOrder()` içinde, servis anında. Sepete eklemek, sepetten çıkarmak ya da sepeti boşaltmak **hiçbir stok kaybı yaratmaz**. Hasta sabrı bitip giderse `clearCart()` çalışır ve SATIŞ ekranı açıksa PC ana ekranına dönülür — yine stok kaybı olmaz.

**Poşet uçuşu sırasında sabır donar.** Aksi halde poşet havadayken hasta küsüp kuyruktan düşebilir ve `checkOrder()` **başka bir hastaya** uygulanırdı.

> **`resetTransientAnims()`** — `bagAnim` ve `flyAnims`'i söndürür. `startNextDay`, `startNewGame`, `triggerGameOver` ve `cheats.clearQueue` çağırır. Yarım kalmış bir poşet uçuşu gün değişince kararı sıfırlanmış kuyruğa uygulardı; bu geçişlerin zorunlu parçasıdır.

**Görsel geri bildirim.** Karta dokunulup ilaç gerçekten eklendiğinde (`tapMedicine` true dönerse) `startFlyToPc()` karttan PC'ye kısa bir uçuş başlatır (`CONFIG.flyTime` = 0,35 sn, hafif kavisli, sönümlenerek). **Salt görseldir**, oyun durumuna hiç dokunmaz. Ayrıca sepette ürün varken PC objesinin sağ üst köşesinde **toplam kalem sayısını** gösteren rozet durur — tepsi kalktığı için oyuncunun "seçtiklerim nerede" sorusunun tek görünür cevabı budur.

**Sahnede kalanlar:** reçete kağıdı ve konuşma balonu yerinde durur. SATIŞ ekranı onların yerine geçmez; panel kapalıyken de görünürler.

### 12.2 Sprite.rect
`Sprite.rect(key, x, y, w, h, fit)` görselin kutu içinde **gerçekten kaplayacağı** dikdörtgeni döndürür (asset yoksa `null`). Oran korunduğu için görsel kutuyu genelde doldurmaz; aradaki fark boşluktur.

**Hâlâ kullanılıyor** ama artık yalnız `Sprite.draw` içinden: dokuz `Sprite.draw` çağrısının hepsi ondan geçer. Dışarıdan çağıran kalmadı — tek dış çağıran `counterItemRects` idi, o da tepsiyle birlikte silindi.

`fit` modları: `"contain"`, `"contain-bottom"`, `"cover"`, `"stretch"`. Fiilen kullanılan iki tanesi: `"cover"` (arka plan, tezgah bandı) ve `"contain"` (kalan yedi çağrı — hasta avatarı, defter, ilaç kartı, sepet satırı, uçuş animasyonu).

> **`"contain-bottom"` modunun artık HİÇ ÇAĞIRANI YOK.** Taban hizası (dar/uzun ve geniş/kısa ürünleri aynı yüzeye oturtma) yalnız tezgah tepsisi için vardı. Kod duruyor ama ölü daldır — bkz. bölüm 16.

### 12.3 Kaldırılan tepsi katmanı
Tezgah ürün tepsisi tamamen söküldüğü için `counterItemRects`, tepsi rozet/dokunma hesabı ve onu denetleyen `verifyCounterLayout()` **koddan silindi**. Rozet çapı sınırlama, eşmerkezli dokunma kutusu ve "rozeti slot karesine değil çizim dikdörtgenine bağla" kuralı artık geçerli değil — bağlanacak rozet kalmadı.

### 12.4 drawEmoji — glif kutusuna göre ortalama
Emojiler font metriklerine göre değil, **gerçek glif kutusuna** göre ortalanır: `measureText`'in `actualBoundingBoxLeft/Right/Ascent/Descent` değerleriyle ölçülüp merkez düzeltmesi uygulanır. Aksi halde farklı emojiler aynı kutuda farklı yerlere oturuyordu. `selfTestEmoji()` oyundaki her emojiyi 64px referans kutuda çizip merkez sapmasını denetler (tolerans ~%6); tarayıcı `actualBoundingBox` vermiyorsa denetim atlanır.

### 12.5 HUD ve diğer arayüz
- **HUD**: sol kutuda satır1 GÜN, satır2 tarih (emojisiz); nöbet günlerinde sol kutu ile EV butonu arasındaki boşlukta 🌙 rozeti; ortada kare EV butonu (menüye döner, veri silinmez); sağ kutuda itibar (emoji eşikleri: <35 😡, 35–69 😑, ≥70 😊) ve binlik ayraçlı para.
- `formatMoney` `toLocaleString` kullanmaz, kendi ayraç mantığı vardır ve değer değişmediği sürece **cache'li string** döner. `dateShort()` de gün değişmediği sürece cache'lidir — çizim içinde `new Date()` çağrısı titremeye yol açar.
- **İlaç kartları**: 3 sütunlu grid, görsel `contain` ile çizilir (asla ezilmez), dikeyde taşarsa drag-scroll + sağ kenarda ince retro scrollbar (salt görsel, tıklama hedefi değil). Stok 0 → "TÜKENDİ" etiketi; stoğu olanlarda sağ üstte stok rozeti.
- **Gün sonu kartı** yüksekliği sabit değil, içerikten hesaplanır (başlık + satır sayısı × satır adımı + butonlar + boşluklar).
- **Konuşma balonları** krem/açık zeminli; reçeteli hastada replik **spawn anında** seçilir (frame'de yeniden seçilmez).

---

## 13. Geliştirici Araçları

### 13.1 Karar teşhis bloğu
`CONFIG.debugDecisions` (varsayılan **true**) açıkken her servis/red kararında konsola tek okunabilir blok basılır: hasta tipi, istenen liste (ad + id + adet), verilen liste, doktorun defterde olup olmadığı, her kusur kontrolünün sonucu, karşılaştırılan iki değer (reçete tarihi ↔ oyun tarihi), iç bayraklar ve sonuç + gerekçe.

### 13.2 Boot'ta sessiz çalışan self-test'ler
Hepsi yalnız sorun bulursa `console.warn` atar; oyuncuya hiçbir şey görünmez. **Şu an boot'ta 0 uyarı çıkıyor.**

**`verifyGoalBalanceAllTiers(false)`** — dengeyi iki uçtan koşturur (tüm geliştirmeler Lv1'de ve tümü maksimumdayken; `withUpgradeLevels` seviyeleri geçici değiştirip iki yönde de cache'i temizler). Her turda: izinli hata kadar hata hedefi tutturmalı, bir fazlası tutturmamalı. Ayrıca patolojik uçları arar — izinli hata kadar hata **en iyi** hâlde bile tutmuyorsa "hedef imkânsız", bir fazlası **en kötü** hâlde bile tutuyorsa "hedef anlamsız". Güvenlik bandına takılan günlerde tolerans ölçütü uygulanmaz.

**`verifyConcentrationCapAllTiers(false)`** — her günde en yüksek paylı geçerli hastanın payı, o günün adil-paya-oranlı tavanını aşmıyor mu (sağlanabilir günlerde).

**`selfTestPatients()`** — gün gün her hastayı ve tüm sistem verisini gezer:
- **(0)** kategori ↔ sekme 1:1 mi
- **(0b)** sahte doktor isimleri gerçeklerden ayırt edilebilir mi (ad aynı + soyad öneki yasak)
- **(0c)** geliştirmeler: her seviye geçerli efektif değer üretiyor mu, fiyatlar artan mı, `costK.length === maxLevel − 1` mi, maks seviyede satın alma reddediliyor mu, maks üstü seviye için fiyat üretiliyor mu
- **(0c2) gün büyüklüğü tavanı + geç oyun kompozisyon eğrisi** — bu turda eklendi, en kapsamlı blok:
  - tavan bağlayıcı mı, aşılıyor mu, dizi hiç azalıyor mu
  - **Vitrin müşteri sayısına dokunuyor mu** (dokunuyorsa "hâlâ müşteri SAYISINI değiştiriyor" uyarısı), payı seviyeyle artıyor mu, `vitrinSymptomFloor`'u deliyor mu
  - `missRate` tabana kampanya bitmeden oturuyor mu
  - sahte oranı artıyor mu, tavanı aşıyor mu, gece oranını bozuyor mu
  - nöbet sıklığı geç oyunda gerçekten artıyor mu
  - **nihai kural:** tavan bağladıktan sonraki **her gün** için en az bir eksen hâlâ hareketli mi — değilse `"gün N: hiçbir zorluk ekseni ilerlemiyor (düz plato)"`
- **(0c3) FİYAT GÜNCELLEMELERİ** — bu turda eklendi:
  - **bant**: 30 günün *her* günü, her ilaç, her iki alan için çarpan `[priceDriftMin, priceDriftMax]` içinde mi
  - **determinizm**: cache temizlenip aynı gün yeniden türetilince birebir aynı sonuç mu
  - **sabitler**: geliştirme fiyatı ve startMoney fiyat turlarından etkilenmiyor mu, `MEDICINES` runtime'da değiştirilmiş mi
  - **zararına satış**: hiçbir gün `medPrice < medCost` olmuyor mu
  - **marj rayının yan etkisi**: ortalama kâr oranı şişmesi 1 puanı aşarsa uyarır (bkz. 4.8)
  - gün 1 tur günü değil mi, sezonda en az 2 tur var mı
- **(0c4) DİLENCİ** — gün listesine sızmıyor mu, gün 1'de gelmiyor mu, bonus işaretli mi, `fake` alanı yok mu, `refValuesFor`'da sıfır katkı mı, sabır çarpanı devrede mi, servis/inceleme yolları kapalı mı. **Geri ödeme**: `beggarReturnMul > 1` mi, ihtimal ve gecikme aralığı geçerli mi, `beggarReturnDelayMax` sezon uzunluğuna yakın mı (geri dönüşler sezon dışına taşar), borçlu da hasta mantığından dışlanmış mı, zar deterministik mi, tutar verilenin üstünde mi
- **(0c5) KARİYER** — bedel formülü (1. sezon bedelsiz, kesin artan, sonlu, 100'e yuvarlı), devredenler/devretmeyenler tek tek, sezon geçişinde kasa denkliği (`önceki − bedel + tahsil edilen alacak`), SGK defter bütünlüğü, alacak vadesinin yeniden tabanlanması, yeni sezonun farklı tohumla başlaması, peak monotonluğu ve sezonlar arası korunması, bedel ödenemezken sezon başlatılamaması, `careerResult` şeması ve JSON-serileşirliği
- **(0d2)** reçete garantileri: her günde ≥1 gerçek, 2. günden itibaren ≥1 sahte, gerçek reçetelerde kusur bayrağı yok, `overdose` hiç üretilmiyor
- **(0d3)** Medula kuralları (terminal geçici olarak maks seviyeye alınır): kod uzunluğu ve "2" başlangıcı, alfabe dışı karakter yok, kodlar gün içinde benzersiz, hiçbir Medula hastası sahte değil, kalem listesi boş değil, R'ye giriyor, terminal açıkken en az bir Medula hastası üretiliyor, **alacak defteri bütünlüğü**
- **(0d4)** çok kalemli semptom sabrı: 3 kalemli hasta 1 kalemliden kesin uzun bekliyor, çarpan tam 1,5 ve **Bekleme Alanı seviyesinden bağımsız** (geliştirme çarpanı yerine geçmemiş)
- **(0e)** nöbet kuralları: gece hasta sayısı ≥ `nightPatientMin`, `nightFakeChance()` tavanı aşmıyor, gecede ≥1 gerçek reçete, gündüz bölümünde `night:true` hasta yok, nöbet olmayan günde hiç gece hastası yok
- **(f–i)** hastanın tam ihtiyacı verilince sonuç daima "doğru" mu; her sahte reçetenin tespit edilebilir en az 1 kusuru var mı; gerçek reçetelerde kusur yok mu ve doktoru defterde mi; gerçek reçetenin tarihi o günün tarihi mi

**`selfTestEmoji()`** — oyundaki her emojinin glif kutusuna göre doğru ortalandığını denetler (bkz. 12.4). Yeni kartların ikonları (📅 🔎 🚨 ⭐ 🤝 🏆 💵 ✓ ✗) denetim listesine eklendi.

**`checkDataHealth()`** — her ilaç kategorisinin en az bir semptomu, her semptom kategorisinin en az bir ilacı var mı.

> **(KALDIRILDI) `verifyCounterLayout()`** — tezgah tepsisindeki rozet ve dokunma kutusunun görsel dikdörtgeni içinde kaldığını denetliyordu. Tepsiyle birlikte silindi; boot'ta artık çağrılmıyor ve `cheats.checkCounter()` de kaldırıldı.
>
> **Yerine dosya İÇİNDE bir denetim gelmedi.** SATIŞ ekranının sığması (satırlar panelden taşmıyor mu, adımlayıcılar panel içinde mi, SERVİS ET son satırın altında mı) yalnız **dışarıdan headless ölçümle** doğrulandı — boot self-test'i bunu görmez. Panel yerleşimi değiştirilirse ölçüm elle tekrarlanmalı. Bkz. bölüm 16.

### 13.3 Debug cheatleri (`window.cheats` — **41 adet**, koddan sayıldı)

| Cheat | Ne yapar |
|---|---|
| `addMoney(n)` | parayı artırır |
| `setReputation(n)` | itibarı clamp'li ayarlar |
| `skipDay()` | PLAYING'deyse günü bitirir |
| `setPatience(n)` | aktif hastanın sabrını ayarlar |
| `clearQueue()` | kuyruğu/tezgahı/feedback'i temizler |
| `newPatient()` | BONUS hasta spawn eder (günün programına ve hedefe karışmaz) |
| `spawnFake()` | zorla sahte reçeteli BONUS hasta spawn eder |
| `daySchedule(day)` | o günün üretilmiş listesini ve gün ekonomisini tabloyla yazar |
| `menu()` | MENU state'ine geçer |
| `gameOver()` | itibar tükenmiş gibi: sezon erken biter **ve kariyer kapanır** |
| `endSeason()` | son gün tamamlanmış gibi: sezon normal biter (kariyer sürer) |
| `seasonResult()` | sezon özet nesnesini JSON olarak basar ve döner |
| `career()` | sezon no, tamamlanan sezon, peak kasa, kasa, sonraki bedel + ödenebilir mi + geçmiş sezon tablosu |
| `fees(n)` | ilk n sezonun ruhsat bedeli ve kümülatif toplamı |
| `nextSeason()` | `tryStartNextSeason()` — bedel yetmezse kariyeri bitirir |
| `endCareer(reason)` | kariyeri kapatır (`"fee"` / `"reputation"`) |
| `careerResult()` | kariyer özet nesnesini JSON olarak basar ve döner |
| `prices(day)` | o günün taban/güncel alış-satış, çarpanlar ve kâr% tablosu + yarının haberi |
| `priceRounds()` | sezondaki tüm fiyat turları: gün, etkilenen ilaç sayısı, kategoriler |
| `beggar()` | dilenciyi hemen tezgaha alır |
| `beggarPlan()` | sezon boyunca dilencinin hangi gün, kaçıncı hastadan sonra geleceği |
| `beggarPay(n)` | borcunu ödemeye gelen dilenciyi tezgaha alır (tutar opsiyonel) |
| `beggarReturns()` | bekleyen geri ödeme defteri + toplam |
| `revealFlaws()` | aktif reçetenin sahte/kusur/doktor/tarih/kaşe/imza dökümünü yazar |
| `setGroup(gid)` | aktif ilaç grubunu değiştirir |
| `concentration(days)` | konsantrasyon tavanı dökümü: en yüksek paylı hasta, payı, tavan, yeniden üretme/zorla sığdırma sayısı |
| `stock()` | tüm ilaçların stok tablosu |
| `setStock(id, n)` | bir ilacın stoğunu clamp'li ayarlar |
| `emptyStock(id)` | bir ilacın stoğunu sıfırlar |
| `openDepot()` | PC panelini doğrudan DEPO ekranında açar |
| `explainPatient()` | mevcut hasta için karar teşhis bloğunu istek üzerine basar |
| `setSeed(v)` | koşu tohumunu sabitler, gün cache'ini temizler, oynanan günü yeni tohumla kurar |
| `seed()` | mevcut `runSeed`'i yazar |
| `medula()` | terminal durumu, vadeli SGK alacak defteri, defter denetimi, kuyruktaki Medula kodları |
| `nightDuty()` | önümüzdeki nöbet günlerini tabloyla yazar + nöbet ayarları özeti |
| `forceNight()` | mevcut günü nöbet gününe çevirip gece bölümünü başlatır (`_forcedNightDays` yalnız buradan dolar) |
| `upgrades()` | tüm kalemlerin seviyesi, etkisi, sonraki seviye ve fiyatı + efektif değer özeti (reçeteli pay dahil) |
| `setUpgrade(id, seviye)` | test için seviye zorlar; vitrin/medula ise cache'i geçersiz kılar |
| `balance()` | avgPrice/avgCost/**taban** marj/startMoney + gün 1..10 tablosu + `verifyGoalBalanceAllTiers(true)` |
| `assetStatus()` | hangi asset'lerin yüklendiğini/boş olduğunu ve kapsam özetini döner |
| `state()` | gün/para/itibar/aktif sabır/kuyruk/tezgah/beklenen ilaç/gün istatistikleri |

---

## 14. ÖLÇÜM BULGULARI

Bu bölüm belgenin en değerli kısmı. **2026-09-10'da tamamen yenilendi**; tek sezonluk eski tablolar (hayatta kalma 60/60, B′ itibar eğrisi, tek sezon kasa dağılımı) kariyer modeliyle **geçersizleşti** ve silindi.

Sayıların hangi turdan geldiği her alt bölümde yazılı. Dört tur var:
- **T1 — sezon yapısı turu**: 30 günlük sezon, tek sezonluk skor dağılımı
- **T2 — fiyat + dilenci turu**: fiyat güncellemeleri, dilenci, tek sezonluk getiri ölçümü
- **T3 — kariyer turu**: ruhsat bedeli kalibrasyonu, ilk kariyer ölçümü
- **T4 — geri ödeme turu**: dilenci geri ödemesi, kariyer modelinde yeniden ölçümler (en güncel)

### 14.1 Ölçüm düzeneği
Headless Node harness: `index.html`'in **gerçek** fonksiyonları (canvas stub'lı `vm` sandbox) çalıştırılır — `buildDaySchedule`, `checkOrder`, `rejectPrescription`, `gainReputation`, `beginSeason`, `tryStartNextSeason`, `placeDepotOrder`, `beggarPayCollect` hepsi orijinal koddur, yeniden yazılmamıştır. Bot karar seviyesinde oynar (frame döngüsü koşmaz), kendi RNG'si oyunun RNG'sinden bağımsızdır ki gün üretimini bozmasın.

**Bot profilleri:**

| Profil | Doğruluk | Amaç |
|---|---|---|
| **A** | %100 (kusursuz) | tavan/doyma ölçümü |
| **B** | %85 sabit (i.i.d.) | "iyi oyuncu" referansı |
| **B′** | %25 ihtimalle kötü gün (%65), diğer günler %88 (ort. ~%82) | **korelasyonlu kötü seri** — gerçek oyuncunun kötü gününü modeller |
| **C** | %70 | "vasat oyuncu", ölmesi beklenen |

**Bot politikası** (kariyer modeline uyarlanmış hâli):
1. Sabah o günün gerçek listesinden ihtiyaç çıkarılıp **stok tamamlanır** (ihtiyaç × 1,5, `effMaxStock`'a kırpık). Bu adım bedel rezervinden **etkilenmez** — ölçüldü ve rafı boş bırakmak itibardan öldürüyor, o zaman bedeli ödeyecek sezon da kalmıyor (B′'nin 1. sezonda ölme oranı %28 → %50+ olmuştu).
2. **Zam haberi varsa** o kategorilerde bir sonraki tura kadar gerçekten satılacak miktar alınır (%20 payla). Sezonun son 2 gününde hiç alınmaz: devredilemeyen stok yakılmış nakittir.
3. **Geliştirme** ancak 20 × avgCost rezervin üstündeki fazladan alınır; sezonun son 3 gününde rezerve **sonraki sezonun bedeli** de eklenir.
4. **Dilenci**: stok bolsa (≥3) ilaç, değilse para, ikisi de yoksa reddet. Borçlu geldiğinde ödeme her zaman alınır.

Harness'ın bilinçli modelleme kararları: rafta ilaç yoksa hasta küstürülür (`angryRepLoss`) — gerçek oyuncu kısmi/yanlış servis de yapabilir, bu model biraz daha sert. Dilencinin kuyrukta yer tutma maliyeti modellenmez (zaman yok).

### 14.2 KARİYER ÖLÇÜMÜ (T4 — 60 tohum, kariyer bitene kadar, en fazla 12 sezon)
En güncel ve en önemli tablo. `seasonFeeBase` 8.000 / `seasonFeeGrowth` 1,70, fiyat güncellemeleri ve dilenci geri ödemesi açık.

| Profil | Tamamlanan sezon (ort / med / aralık) | Kariyer skoru ort | Medyan | En kötü | En iyi | CV | En iyi/en kötü | Bitiş sebebi |
|---|---|---|---|---|---|---|---|---|
| **A** | **6,8 / 7 / 6–7** | 140.976₺ | 141.076₺ | 127.101₺ | 162.045₺ | **%5** | 1,27× | **bedel 60/60** |
| **B** | **2,9 / 3 / 0–4** | 21.421₺ | 20.627₺ | 4.663₺ | 40.598₺ | %44 | 8,71× | bedel 59 · itibar 1 |
| **B′** | 1,4 / 1 / 0–4 | 10.766₺ | 7.542₺ | 2.216₺ | 27.738₺ | %63 | 12,52× | bedel 40 · itibar 20 |
| **C** | **0,2 / 0 / 0–1** | 4.041₺ | 4.033₺ | 2.033₺ | 6.126₺ | %20 | 3,01× | itibar 49 · bedel 11 |

**Hedef davranış tutuyor**: A 6–10 bandında (6–7), B 2–4 bandında (medyan 3), C 1 sezonu bile zor tamamlıyor (medyan 0). A'nın **hiçbir koşusu 12 sezon cap'ine dayanmıyor** — bedel her zaman yakalıyor.

**Bitiş sebebi ayrımı sistemin amaçlandığı gibi çalıştığını gösteriyor**: iyi oyuncuyu **ekonomi** bitiriyor (A ve B'nin neredeyse tamamı bedelden), kötü oyuncuyu **itibar** bitiriyor (C'nin %82'si). B′ tam ortada bölünüyor (40 bedel / 20 itibar).

**Profiller arası ayrım kariyer modeliyle güçlendi.** A/B oranı tek sezonlu modelde 3,71× idi, şimdi **6,6×**. A'nın en kötü koşusu (127.101₺) B'nin en iyisinin (40.598₺) 3,1 katı — bantlar açık arayla ayrık.

### 14.3 Ruhsat bedeli kalibrasyonu (T3 — 11 kombinasyon × 20–40 tohum)
Aranan davranış: A 6–10 sezon, B 2–4, C ≤1.

| base | growth | A (med) | B (med) | C (med) | Sonuç |
|---|---|---|---|---|---|
| 7.000 | 1,30 | **12 (cap)** | 6 | 0 | ✗ bedel hiç yakalamıyor |
| 7.000 | 1,60 | 8 | 4 | 0 | ✓ ama B bandın üst kenarında |
| 7.000 | 1,70 | 7 | 4 | 0 | ✓ B hâlâ üst kenarda |
| **8.000** | **1,70** | **7** | **3** | **0** | ★ **seçildi** — üçü de bandın ortasında |
| 6.000 | 1,70 | 7 | 4 | 0 | ✓ B üst kenarda |
| 7.000 | 1,90 | 6 | 3 | 0 | ✓ ama A bandın alt kenarında |
| 12.000+ | ≥1,60 | ≤6 | 1 | 0 | ✗ B çöküyor |
| 30.000 | 1,90 | 3 | 1 | 0 | ✗ A da çöküyor |

Okunacak ders: **`growth` A'nın ömrünü, `base` B'nin ömrünü belirliyor.** A'nın sezon başına net birikimi B'nin ~6 katı olduğu için aynı geometrik eğri ikisini farklı sezon indekslerinde yakalıyor; iki hedefi birden tutmak `growth`'u orta bantta (1,6–1,7) tutmayı gerektiriyor.

### 14.4 Fiyat sisteminin karar getirisi (T4 — kariyer modeli, 60 tohum)
Aynı tohumlarda, aynı dilenci politikasıyla; tek fark zam haberini kullanmak.

| Profil | Haberi kullanan | Kullanmayan | **Getiri** | Tamamlanan sezon (kullanan/kullanmayan) |
|---|---|---|---|---|
| **A** | 140.976₺ | 135.787₺ | **%3,8** | **7 / 6** |
| **B** | 21.421₺ | 20.489₺ | **%4,5** | 3 / 3 |
| B′ | 10.766₺ | 10.562₺ | %1,9 | 1 / 1 |
| C | 4.041₺ | 4.097₺ | %−1,4 (gürültü) | 0 / 0 |

**T2'de bu getiri %1,7 idi.** Sebep doğru teşhis edilmişti: tek sezonlu modelde 11. günden sonra para kıt değildi, ucuzken stoklamanın değeri ancak "ucuz alamazsam alamam" olduğunda ortaya çıkar. **Ruhsat bedeli parayı yeniden kıt yapınca getiri %3'ün üstüne çıktı** — fiyat sistemi artık atmosfer değil, karar mekaniği.

**Mekanizma beklenen yerde değil.** Sezon başına *ciro* (`earned`) karşılaştırıldığında fark **tam sıfır** çıkıyor, her sezonda: ucuza stoklamak ciroyu değiştirmiyor, **maliyeti** düşürüyor. Sezon başına **net kasa artışı** ölçülünce görünüyor (A profili):

| Sezon | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|---|---|---|---|---|---|---|
| Haberi kullanan | 41.449₺ | 44.622₺ | 43.656₺ | 43.928₺ | 44.539₺ | 43.487₺ | 44.023₺ |
| Kullanmayan | 40.864₺ | 43.298₺ | 42.773₺ | 42.873₺ | 43.310₺ | 41.976₺ | 42.667₺ |
| Getiri | %1,4 | %3,1 | %2,1 | %2,5 | %2,8 | **%3,6** | %3,2 |

Geç sezonlarda daha çok işe yarıyor (S1 %1,4 → S6 %3,6) ama fark dramatik değil; S2 zaten %3,1. **Asıl kazanç sezon içi yüzdelerde değil, kariyer uzunluğunda**: biriken tasarruf bir sezonluk bedeli daha karşılıyor ve A **6 yerine 7 sezon** oynuyor. Bir fazladan sezon peak'e ~44k₺ ekliyor; %3,8'in çoğu oradan geliyor.

**T2'de reddedilen ayar denemeleri** (tek sezonlu, 40 tohum): `priceStepMax` 0,22 → 0,50 ve `priceUpdateEvery` 5 → 3 aralığında **getiri %1,7–2,8'de takılıyordu**, CV ise %9 → %15'e çıkıyordu; yani eklenen şey ağırlıkla gürültüydü. `effMaxStock` 30 → 80 → 200 **hiçbir şeyi değiştirmedi** (birebir aynı sayılar): bağlayıcı kısıt depo kapasitesi değil **talep** — yalnız önümüzdeki günlerde gerçekten satacağın kadar ucuz alabilirsin. Bu yüzden ayarlar oynatılmadı, çözüm bedelin getirdiği nakit kıtlığından geldi.

### 14.5 Dilenci: eşleştirilmiş karşılaştırma (T4 — 60 tohum, aynı tohumlar)
"Hep yardım et" ile "hep reddet" aynı tohumlarda koşturuldu.

| Profil | Skor: yardım | Reddet | Fark | Yardımın kazandırdığı koşu | Kaybettirdiği | Eşit | Medyan fark |
|---|---|---|---|---|---|---|---|
| **A** | 140.976₺ | 140.007₺ | **%0,7** | **56/60** | 4 | 0 | +1.025₺ |
| **B** | 21.421₺ | 21.013₺ | %1,9 | 48/60 | 12 | 0 | +381₺ |
| **B′** | 10.766₺ | 10.191₺ | %5,6 | 34/60 | 21 | 5 | +78₺ |
| **C** | 4.041₺ | 3.885₺ | %4,0 | 32/60 | 17 | 11 | +5₺ |

İtibar bilançosu ve geri ödeme (kariyer boyu):

| Profil | Yardım: itibar **FİİLEN** | (nominal) | Geri ödeme (adet / ₺) | Reddet: itibar |
|---|---|---|---|---|
| **A** | **+22** | +353 | **34 / 4.467₺** | −466 |
| B | +67 | +156 | 15 / 1.778₺ | −210 |
| B′ | +45 | +87 | 6 / 568₺ | −110 |
| C | +27 | +30 | 2 / 219₺ | −30 |

**Yardımın net etkisi pozitif ve tutarlı**: A'da 56/60 eşleştirilmiş kazanç — gürültü değil, neredeyse kesin bir kazanç. Geri ödeme oranı 34/59 ziyaret = **%58**, `beggarReturnChance` 0,55 ile uyumlu.

**Ama A için büyüklük küçük: skorun %0,7'si.** Geri ödeme "her iki yönde de anlamsız" sorununu çözdü (artık tavandan bağımsız 4.467₺ nakit var) ama kaldıraç 141k₺'lik bir skorun yanında ufak. Büyütmek için aritmetik hazır: `beggarReturnMul` 2,5 → ~5 getiriyi ~%3'e çıkarır, ya da `beggarChance` 0,30 → 0,60 ziyaret sayısını ikiye katlar. **İkisi de yapılmadı**: 5× geri ödeme "ilacı alamayan kişi" için anlatısal olarak zorlama, ziyaret sıklığını ikiye katlamak da oyunu bölen kesinti sayısını ikiye katlar. Karar bekliyor (bkz. 18).

### 14.6 Geliştirme doyması (T4, A profili)
Kariyer modelinde tüm geliştirmeler A profilinde medyan **11. günde** bitiyor. Kariyer modeli bunu **çözmedi ama önemini azalttı**: geliştirmeler 1. sezonda bitiyor, sonraki sezonlarda satın alınacak bir şey kalmıyor — ancak artık paranın gideceği bir yer var (**ruhsat bedeli**) ve o yer paranın tamamını düzenli olarak tüketiyor. Ayrıntı için bkz. 16.

### 14.7 Oturum uzunluğu (T1, 10 sn/müşteri varsayımı — değişmedi)

| Ölçü | Değer |
|---|---|
| En uzun **kesintisiz blok** | **26 müşteri ≈ 4,3 dk** ✓ |
| En uzun gece bloğu | 10 müşteri ≈ 1,7 dk |
| En uzun tam gün (nöbet dahil, arada geçiş kartı var) | 36 müşteri ≈ 6,0 dk |

Dilenci ve borçlu bu bloklara **birer müşteri daha** ekleyebilir (günde en fazla ikisi birlikte +2), ama ikisi de tek dokunuşla kapanır.

### 14.8 Zorluk eksenleri vs sezon uzunluğu (T1)
Üç eksenin 30 günlük sezona uyumu ölçüldü:

| Eksen | Seyir | Sezon içinde doyuyor mu |
|---|---|---|
| İzinli hata (`missRate`) | 0,250 → 0,105 (g29) → **0,100 (g30)** | **tam son günde** ✓ |
| Sahte oranı (gündüz) | 0,420 → 0,550 (g25) → **0,577 (g30)** | tavana (0,60) gün **35**'te varır → doymuyor ✓ |
| Nöbet sıklığı | 4, 8, 12 → 18, 21, 24, 27, 30 | erken %20 → geç %33 ✓ |

`fakeChanceLateDay` (25) bir plato değil, **kalibrasyon noktası** — rampa aynı eğimle 30'a kadar sürer. Müşteri tavanı gün 10'da bağlanıyor, sonrasında hiçbir ekseni hareketsiz gün yok. **Gün 31 olsaydı `missRate` ilk kez düz kalacaktı** — 30 günlük sınır tam eğrilerin bittiği yerde duruyor.

Bir eksen ilerlemiyor: **gece sahte oranı 1. günden beri tavanda** (0,42 × 1,8 = 0,756 → `nightFakeRateCap` 0,60'a kırpılıyor), yani gecenin kompozisyonu 30 gün boyunca sabit. Bkz. 16.

---

## 15. DENENİP REDDEDİLENLER

Bunlar tekrar denenmesin diye yazıldı. Her biri gerçekten uygulandı ve ölçüldü.

**Konveks kabuk ile görsel kesimi.** İlaç PNG'lerini şeffaflaştırırken silüeti konveks kabukla çıkarmak denendi. Reddedildi: **gölgeyi silüete katıyor** — ürünün altındaki yumuşak gölge kabuğun içinde kalıyor ve kesim ürünün gerçek sınırını vermiyor. Flood-fill yaklaşımına dönüldü.

**Medula ipucunun kusur işaretlemesi.** Medula terminali başlangıçta reçete incelemesine yardım eden bir ipucu aracıydı: sorgulanan reçetenin kusurlu alanlarını işaretliyordu. Reddedildi: inceleme mekaniğini **tamamen çözen bir oracle** oluyordu — oyuncunun tarihe, kaşeye, imzaya, deftere bakmasına hiç gerek kalmıyordu. Tasarım tamamen söküldü (`hintFields`, `medulaMarks`, işaret çizimi ve ipucu self-test'i kaldırıldı) ve Medula yeni bir **hasta tipi + ödeme gecikmesi** sistemine dönüştürüldü.

**İtibar ödül/ceza kaldıraçlarının büyütülmesi.** %85 doğrulukla oynayan botun ölmesini telafi etmek için `repGainCorrect`, `fakeCatchRepGain` ve `angryRepLoss` yükseltildi. Reddedildi ve **taban değerlere geri alındı**: B'yi kurtarmadı, buna karşılık **C'nin ömrünü 2,6 kat uzattı** (ölmesi gereken oyuncu yaşamaya başladı) ve itibarın tavana yapışmasını geri getirdi. Asıl sebep itibar ekonomisi değil, geç oyundaki stok/nakit sarmalıydı. CONFIG'te bu değerlerin yanında uyarı notu duruyor.

**Hedefi tutturan güne itibar ödülünün tek başına çözüm sanılması.** `goalMetReputation` eklendi ve tek başına yeterli sanıldı. Reddedildi (ödül **kaldırılmadı**, ama tek çözüm olma iddiası düştü): ödül gün ölçeğinde bir tampon veriyor, ama **kırmaya çalıştığı çıkrığın kendisine tabi** — gün büyüdükçe kaybedilen itibar da büyüdüğü için sabit +3'lük ödül geç oyunda anlamsızlaşıyordu. Gerçek çözüm gün büyüklüğüne tavan koymak oldu.

**Vitrin'in reçeteli payını ham hâliyle artırması.** Vitrin'in yeni işlevi ilk hâlinde sadece `prescriptionChance`'ı yükseltiyordu. Reddedildi: reçetelilerin ~%51'i sahte ve sahtenin cirosu sıfır olduğu için bir reçeteli hastanın **beklenen** değeri semptomlunun 0,70 katı — Vitrin Lv3 R'yi **%4,2 düşürüyordu**, yani parası alınan ve ciroyu azaltan bir geliştirmeydi. Sahte seyreltmesi (`vitrinFakeDilution`) eklenerek düzeltildi; şimdi Lv3 R'yi **%5,9 artırıyor**.

**Fiyat turunda payın ilaçlara serpilmesi.** Fiyat güncellemelerinin ilk hâlinde `priceUpdateShare` payı 39 ilaca **rastgele serpiliyordu**. Reddedildi: bir tur **8 kategoriye** dokunuyordu (ölçüldü) ve haber böyle olunca "her şey oynadı" demekle aynı şey oluyor — oyuncuya karar bırakmıyor, çünkü hazırlanacak bir hedef yok. Seçim **kategori kümeli** hâle getirildi (kota dolana kadar kategoriler bütün olarak eklenir); şimdi tur başına 2–3 kategori düşüyor ve "yarın Vitamin'e zam" haberi eyleme dönüştürülebilir bir bilgi. Bkz. 4.8.

**Kariyer skorunu A profilinin CV'sini büyütmek için değiştirmek.** Kariyer skoru kümülatif olduğu için kusursuz oyuncular arasında dağılım daralıyor (%9 → %5, bkz. 16). Skoru "en iyi tek sezonun kazancı" ya da "peak × tamamlanan sezon" gibi toplamayan bir bileşime çevirmek düşünüldü. **Reddedildi**: optimize edilecek popülasyon gerçekte yok. %100 doğrulukla oynayan bot bir idealizasyon; ortalamanın en iyi çalıştığı ve dolayısıyla varyansın en çok söndüğü tek popülasyon da tam olarak o. Gerçek uzman oyuncuların bulunduğu bandın hemen altında, %85 oynayan B profilinde dağılım **zaten muazzam** (CV %44, en iyi/en kötü 8,71×, sezon 0–4). Skor tanımını olmayan bir popülasyon için bozmak, var olan popülasyonda çalışan bir ayrımı riske atmak olurdu.

**Sabit yüzdeli konsantrasyon tavanı.** Tek hastanın günün cirosundaki payına sabit bir yüzde (ör. %15) tavanı denendi. Reddedildi: **az hastalı günlerde matematiksel olarak sağlanamıyor** — 6 geçerli hastalı bir günde kimsenin %15'in altında kalması imkânsızdır (en iyi ihtimalle herkes eşit olsa bile pay 1/6 = %16,7). Uygulama sonsuz döngüye giriyordu. Tavan **adil paya oranlı** hâle getirildi (`2.2 / validN`, [0.15, 0.40] arası) ve sağlanamayan günlerde (`validN ≤ 2`) hiç uygulanmıyor.

---

## 16. BİLİNEN AÇIK KONULAR

**(BÜYÜK ÖLÇÜDE ÇÖZÜLDÜ) Geliştirme doyması / paranın gideceği yer olmaması.** Tüm geliştirmeler A profilinde hâlâ medyan **11. günde** bitiyor, yani geliştirme ağacı 1. sezonda tükeniyor. Ama asıl şikâyet — "paranın harcanacağı yer yok, kasa sonsuza birikiyor" — **ruhsat yenileme bedeliyle çözüldü**: bedel geometrik büyüyor ve A profilinin 60/60 koşusunda kariyeri o bitiriyor (14.2). Para artık düzenli ve artan biçimde tüketiliyor.

Kalan kısım: **geliştirme ağacının kendisi hâlâ sığ.** 2. sezondan itibaren satın alınacak hiçbir şey yok, geliştirme ekranı ölü bir menü hâline geliyor. Sezon başına yeni bir geliştirme katmanı (ya da sezonlar arası taşınan bir "eczane seviyesi") hâlâ eksik.

**Kariyer skorunun kümülatif olması kusursuz oyuncular arasında ayrışmayı daraltıyor — yapısal, kabul edildi.** A profilinin kariyer skoru CV'si **%5** (en iyi/en kötü 1,27×); tek sezonluk modelde %9 / 1,58× idi. Sebep aritmetik: kariyer skoru ~7 sezonun toplamı ve toplama işlemi varyansı söndürüyor. Sezon başına CV %9 ise 7 sezonun toplamının CV'si ≈ %9/√7 = %3,4; gözlenen %5'in kalanı 6-vs-7 sezon eşiğinden geliyor.

Taranan hiçbir bedel kombinasyonu ikisini birden vermedi: kariyeri kısaltmak CV'yi yükseltiyor (30.000/1,9 → A 3 sezon, CV %8) ama 6–10 hedefini deliyor; uzatmak CV'yi düşürüyor. **Kariyer uzunluğu ve skor genişliği bu skor tanımıyla aynı anda büyütülemiyor.** Kabul edildi çünkü (a) B profilinde dağılım zaten çok geniş (CV %44), (b) skor tanımını değiştirme fikri gerekçesiyle reddedildi (bkz. 15). Bir leaderboard'ın tepesinde kusursuz oyuncuların ±%13 bandında toplanacağı **bilinerek** kabul edilmiş bir maliyet.

**Gecenin kompozisyon ekseni ilerlemiyor.** `nightFakeChance(day) = min(nightFakeRateCap 0.60, fakeChanceFor(day) × 1.8)` ve gün 1'de bile 0,42 × 1,8 = 0,756 tavanı aştığı için gece sahte oranı **1. günden 30. güne kadar sabit %60**. Gündüz tabanı %42 → %57,7 tırmanırken gece hiç kıpırdamıyor: nöbet geceleri geç oyunda daha sık geliyor (sıklık ekseni çalışıyor) ama **daha zor gelmiyor**. Düzeltmek için ya `nightFakeRateCap` yükseltilmeli ya `nightFakeRateBoost` düşürülüp rampaya alan açılmalı — ikisi de nöbetin zorluk profilini değiştirir, ölçülmeden yapılmamalı.

**(ÇÖZÜLDÜ) Tezgahta 5+ ürün doktor defteriyle çakışıyordu.** Ürün tepsisi tamamen kaldırıldı; tezgah yüzeyinde yalnız defter ve PC kaldı. Ölçüldü (390×844): defter x[8–133], PC x[291–391] — kesişmiyorlar ve çakışacak üçüncü nesne yok.

**SATIŞ ekranının sığması dosya içinde denetlenmiyor.** `verifyCounterLayout()` silindi ve yerine boot self-test'ine bir karşılık konmadı. Panel yerleşimi (İSTENEN kutusu %24,5, sepet kutusu kalan alan, 6 satır referanslı satır yüksekliği) yalnız dışarıdan headless ölçümle doğrulandı. Panel oranları ya da `maxPrescriptionItems` değiştirilirse sığma sessizce bozulabilir — ya ölçüm elle tekrarlanmalı ya da boot'a bir yerleşim denetimi eklenmeli.

**`Sprite.rect`'in `"contain-bottom"` modu ölü dal.** Taban hizası yalnız tezgah tepsisi için vardı; tepsi kalkınca çağıranı kalmadı (dokuz `Sprite.draw` çağrısının yedisi `"contain"`, ikisi `"cover"`). Kod duruyor. Silmek mi, ileride kullanmak mı — karar verilmedi; silinirse `Sprite.rect`'in yorum bloğu da sadeleşir.

**Poşet animasyonu görsel olarak doğrulanmadı.** `bagAnim` zamanlaması ve `checkOrder`'ın uçuş sonunda çalıştığı ölçüldü, ama poşetin nasıl göründüğü, nereden nereye kaydığı ve PC rozetinin konumu headless ölçümle görülemez. **Gerçek cihazda bakılmalı.**

**Sepetin kalıcılığı test edilmedi.** Sepet hasta küsünce ve gün geçince temizleniyor (doğrulandı), ama oyuncu SATIŞ ekranını kapatıp DEVAM ET'e ya da menüye giderse sepetin ne olması gerektiği tasarım olarak kararlaştırılmadı. Şu an `startNewGame` temizliyor, menüye gidip DEVAM ET ile dönmek temizlemiyor — bilinçli bir karar değil, mevcut kodun yan etkisi.

**(KARİYER MODELİYLE DEĞİŞTİ) Sabit %85 oynayan oyuncu hiç tehlikeye girmiyor.** Tek sezonluk modelde B profili 60/60 çıkıyordu. Kariyer modelinde B **medyan 3 sezonda** bitiyor ve 60 koşunun 59'unda **bedelden** ölüyor — yani artık tehlikede, ama tehlike itibardan değil ekonomiden geliyor. Aşağıdaki teşhis itibar tarafı için hâlâ geçerli: Kompozisyon eksenleri B′'yi (korelasyonlu kötü seriler) vuruyor ama i.i.d. %85'i vurmuyor: izinli hata gün 30'da bile hasta başına 0,10, yani 36 hastalık günde 3,6 hata hakkı var; %85 doğruluk beklenen 5,4 hataya karşılık geliyor, oyuncu hedefi **kaçırıyor** ama hedefi kaçırmanın cezası yok — sadece +3 itibardan mahrum kalıyor.

> Tek kaldıraç **hedefi kaçırmaya bir bedel koymaktır** ve bu **bilinçli olarak yapılmadı** (bkz. 5.2). Yapılırsa önce 4.2'deki miss-maliyeti harmanlaması yapılmalı: sahte hastanın "kaçırma maliyeti" gerçek hastanınkiyle aynı sayılmamalı, yoksa güvenlik bandına takılan %3,8'lik gün dilimi haksız yere cezalandırılır.

---

## 17. DÜZELTİLEN HATALAR

Bu turlarda bulunup düzeltilen, tekrar edilmemesi gereken üç hata. Üçü de **yeni bir sistem eklenirken var olan bir varsayımın sessizce bozulmasıyla** oluştu — hepsi ölçümle ya da self-test'le yakalandı, hiçbiri oyun sırasında görünür bir belirti vermiyordu.

**`_dateDayOverride` penceresi R/C ölçümünden önce kapanıyordu.** `buildDaySchedule` günün hastalarını `_dateDayOverride = day` penceresi içinde üretiyor, sonra `finally` ile pencereyi kapatıyordu — ama R/C/`refRevenue` hesabı o `finally`'den **sonra** geliyordu. Fiyatlar sabitken bu fark görünmüyordu; fiyat güncellemeleri gelince konsantrasyon tavanı **o günün** fiyatıyla ölçülürken R/C **oynanan günün** fiyatıyla hesaplanmaya başladı ve ikisi birbirini tutmadı. Belirti: `verifyConcentrationCapAllTiers` gün 8'de "bir hasta R'nin %15,8'ini tutuyor, tavan %15,0" uyarısı verdi. Düzeltme: R/C döngüsü pencerenin içine alındı. **Ders:** `genDay()` okuyan her hesap aynı `_dateDayOverride` penceresinde olmak zorunda.

**SGK alacaklarının vadesi sezona göreliydi.** `addReceivable` vadeyi `dueDay = game.dayNumber + medulaPayDelayDays` olarak yazıyor, `collectReceivables` ise `dueDay <= game.dayNumber` diye tahsil ediyor. Kariyer modelinde gün sayacı her sezon 1'e döndüğü için 31/32. güne yazılmış bir alacak bu koşulu **bir daha asla** sağlamıyor ve para sonsuza kadar askıda kalıyordu (defter denkliği bozulmuyordu, o yüzden sessizdi — oyuncu sadece hiç ödenmiyordu). Düzeltme: `beginSeason` her alacağın vadesini bir sezon geriye çekiyor (`max(1, dueDay − seasonDays)`) ve sezon başında `collectReceivables()` çağrılıyor. Aynı hata **dilenci geri ödeme defterinde** de olacaktı, aynı yerde aynı şekilde düzeltildi. Self-test 31. güne yazılı bir alacakla bunu denetliyor.

**Medula defter sayaçları sezon başında sıfırlanınca denklik bozuluyordu.** `verifyMedulaLedger()` "yazılan = yatan + bekleyen" denkliğini kontrol ediyor. `medulaBooked`/`medulaCollected` sezon başında sıfırlanırsa, alacaklar sezonlar arası **devrettiği** için bekleyen tutar duruyor ama yazılan sıfırlanıyor ve denklik patlıyordu. Düzeltme: bu iki sayaç **kariyer ölçeğine** taşındı — yalnız `startNewCareer` sıfırlıyor. **Ders:** bir defterin sayaçları, defterin kendisiyle aynı ölçekte yaşamak zorunda.

---

## 18. Sıradaki İşler

1. **Geliştirme ağacını derinleştirmek** — para gideri tarafı ruhsat bedeliyle çözüldü, ama 2. sezondan itibaren satın alınacak hiçbir şey kalmıyor ve geliştirme ekranı ölü bir menü oluyor (bkz. 16). Sezon başına yeni katman ya da sezonlar arası taşınan bir "eczane seviyesi".
2. **Yeni servis akışını cihazda görmek** — poşet animasyonu, karttan PC'ye uçuş ve PC sepet rozeti yalnız kodla doğrulandı; görünüş gerçek cihazda değerlendirilmeli. Aynı turda SATIŞ ekranının sığması için boot'a bir yerleşim denetimi eklenip eklenmeyeceğine karar verilmeli (bkz. 16).
3. **Karar bekleyen: hedefe yaptırım.** Eklenecekse önce miss-maliyeti harmanlaması yapılmalı. Bu karar verilmeden sabit %85 oyuncusu tehlikeye girmez.
4. **Capacitor ile iOS paketleme** — henüz hiç yapılmadı; gerçek cihazda oturum uzunluğu ve dokunma hedefi boyutları ölçülmeli (10 sn/müşteri varsayımı gerçek cihazda doğrulanmadı).
5. **(ÇÖZÜLDÜ) 30 günden sonrası tanımsızdı.** Sezon 30 günde biter, kariyer yeni bir sezonla devam eder (bkz. 2.1–2.3). Zorluk eğrileri tam 30. günde tamamlanıyor (14.8) ve sezon sınırı oraya oturtuldu.
6. **Karar bekleyen: dilenci kaldıracının büyüklüğü.** Geri ödeme yardımı pozitif hâle getirdi ama A profilinde etki skorun yalnız %0,7'si. `beggarReturnMul` ya `beggarChance` büyütülecek mi — aritmetik ve gerekçeler 14.5'te.
7. **Karar bekleyen: gecenin kompozisyon ekseni.** Gece sahte oranı 1. günden beri tavanda; nöbet geceleri geç oyunda sıklaşıyor ama zorlaşmıyor (bkz. 16). Düzeltme nöbetin zorluk profilini değiştirir, ölçülmeden yapılmamalı.
8. **Leaderboard.** `seasonResult` (28 alan) ve `careerResult` (26 alan) hazır, JSON-serileşir, hiçbir yere gönderilmiyor. Gönderim, saklama ve gösterim tamamen yapılmadı.

---

## 19. Çalışma Şekli

- Promptlar Claude Code'a (VS Code, Opus, high effort) verilir; sonu hep "Komple güncel index.html ver."
- İterasyon döngüsü: prompt → test → ekran görüntüsü → geri bildirim
- Denge değişiklikleri **ölçülerek** yapılır: headless harness + A/B/B′/C bot profilleri (bkz. 14.1). Değer oynatmadan önce ölç, oynattıktan sonra tekrar ölç.
- Git: her sağlam noktada `git add -A && git commit -m "..." && git push`

## 20. Bilinen Teknik Riskler

- İlaç id'leri her zaman **string** olmalı — string/number uyumsuzluğu `sameMultiset`'i sessizce bozar.
- Eşleşme her yerde **id/kategori string'i** üzerinden yapılır, asla nesne referansı üzerinden değil. `beginDaySchedule` sığ kopya verir (`request` paylaşılır); derin klona geçilirse "request oynanış sırasında değişmez" varsayımı gözden geçirilmeli.
- Çizim içinde `Math.random()` / `new Date()` titremeye yol açar; `dateShort()` ve `formatMoney()` cache'lidir, yeni cache'lenmemiş hesaplama eklerken dikkat.
- Dengesiz `ctx.save()/restore()` kümülatif transform/alpha kaymasına yol açar.
- PNG çizmeden önce `img.complete && img.naturalWidth > 0` şart (`Sprite.draw` yapıyor, elle `Assets.images` erişiminde unutulmamalı).
- Yeni ilaç/semptom eklerken kategori adı **mevcut 9 kanonik addan biri** olmalı; yeni bir yazım sessizce ayrı kategori yaratır ve doğru ilacı yanlış yapar. Self-test yakalar ama uyarı yalnız konsola gider.
- **Seed'li üretim okuduğu her dış duruma bağımlıdır** (bkz. 3.3). Üretim koduna dış state okuyan yeni bir dal eklenirse izole edilmeli.
- **Gündüz/gece ayrımı iki yere bağımlı:** (a) spawn sırası — gece hastaları listenin **sonunda** olmalı, çünkü faz geçişi `dayCompleted >= sch.dayN` ile tetikleniyor; (b) hedef hesabı — `night` bayrağı `refValuesFor`'a fiyat çarpanı olarak giriyor, bayrak kaybolursa gece cirosu R'ye eksik girer ve hedef sessizce düşer. Self-test ikisini de denetler.
- `game.phase` para sayacını da ikiye ayırır (`addDayMoney`); yeni para hareketi eklenirse `dayStats.money`'ye elle yazmak yerine **`addDayMoney()` kullanılmalı**.
- **`CONFIG.maxReputation` (100) artık kullanılmıyor.** Clamp'lerde kullanılırsa yumuşak tavanın verdiği 100 üstü yastık ilk kayıpta silinir. Üst sınır `repMax`'tir.
- `loadAssets()` açık liste tutar, `MEDICINES`'i gezmez — yeni ilacın PNG'si için `Assets.load` satırı elle eklenmeli.
