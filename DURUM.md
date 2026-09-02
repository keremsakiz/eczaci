# ECZACI — PROJE DURUM BELGESİ
Son güncelleme: 2026-09-03 (servis akışı bölümleri güncellendi, index.html **5.650 satır**)

Bu belge, projeyi hiç bilmeyen bir asistanın okuyup kaldığı yerden devam edebilmesi için yazılmış bir devir notudur. Buradaki her sayı koddan ya da ölçüm çıktısından doğrulanmıştır; doğrulanamayan hiçbir iddia yazılmadı.

---

## 1. Genel Bakış

**Eczacı**: Büfeci'den esinlenen, iOS hedefli Türk eczane simülasyonu.

Çekirdek döngü: hasta gelir → reçete uzatır, semptom söyler ya da e-reçete kodu verir → reçeteliyse ONAYLA/REDDET incelemesi → raftan doğru ilaç(lar) seçilir → SERVİS ET → para + itibar.

**Tek dosya**: `index.html` — 5.523 satır, HTML5 Canvas + vanilla JS, harici kütüphane yok, tüm CSS/JS inline. Yanında yalnız `assets/` klasörü (52 PNG) var.

- 9:16 dikey mobil layout, `devicePixelRatio` retina desteği
- Capacitor ile iOS paketleme planlı (henüz yapılmadı)
- GitHub: `github.com/keremsakiz/eczaci`
- State machine: `MENU / PLAYING / DAYEND / GAMEOVER`
- 60 FPS `requestAnimationFrame` döngüsü; `update(dt)` ve `render()` ayrı
- Tüm sayısal ayarlar dosyanın başında tek bir `CONFIG` objesinde
- Rastgelelik tek bir değiştirilebilir kaynaktan akar: `rng()` → `_rngSource` (varsayılan `Math.random`). `withSeed(seed, fn)` bu kaynağı geçici olarak mulberry32 ile değiştirir; `rand()` ve `pick()` zaten `rng()` kullandığı için üretim kodu değişmeden deterministik olur.
- Layout dikdörtgenleri (butonlar, kartlar, sekmeler) her zaman ilgili draw fonksiyonu **içinde** hesaplanır, `render()` içinde değil.

---

## 2. Çekirdek Döngü

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
| avgPrice | 39 ilacın `price` ortalaması | **90,97₺** |
| avgCost | 39 ilacın `cost` ortalaması | **62,69₺** |
| ortalama kâr marjı | 1 − cost/price ortalaması | **%28,6** (ilaç bazında %18–41) |
| startMoney | 100'e yuvarlı (avgCost × 30) | **1.900₺** |
| fakeApproveMoneyPenalty | round(avgPrice × 2) | **182₺** |
| geliştirme fiyatları | round100(avgPrice × costK[n]) | **1.400₺ / 2.700₺** |

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

1. **İtibar oynaklığı.** İtibar ölçeği sabit (0–150) ama kazanç/kayıp müşteri sayısıyla ölçekleniyor. Tavansız hâlde gün 28'de 87 müşteri vardı; geç oyunda tek kötü gün 30–40 puan sallıyor, yumuşak tavanın verdiği yastık (en fazla 50 puan) bir günde siliniyordu. Ödül/ceza değerlerini oynatmak bunu **çözmedi** (bkz. 14) — sorun değerlerde değil, gün ölçeğinin itibar ölçeğine göre sınırsız büyümesindeydi.
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

| Gün | Müşteri (gündüz+gece) | Sahte oranı | İzinli hata | Geçerli hasta | R (ciro) | Hedef |
|---|---|---|---|---|---|---|
| 1 | 8 (8+0) | %42,0 | 2,00 | 6,1 | 1.067₺ | 520₺ |
| 10 | 26 (26+0) | %46,9 | 5,29 | 19,6 | 3.560₺ | 1.933₺ |
| 20 | 26 (26+0) | %52,3 | 3,94 | 19,0 | 3.520₺ | 2.283₺ |
| 30 | 36 (26+10) | %57,7 | 3,60 | 25,7 | 5.168₺ | 3.968₺ |

Gün 10 → 20 satırı mekanizmayı gösteriyor: müşteri sayısı ve R **donmuş** (ikisi de 26 hasta, ~3,5k₺), ama izinli hata 5,29 → 3,94'e daraldığı için hedef 1.933 → 2.283₺'ye çıkıyor. **Boyut ekseni dururken tolerans ekseni işi devralıyor.** Hedef/R oranı: g10 0,54 → g20 0,65 → g30 0,77.

### 4.7 Sipariş konsantrasyon tavanı
Tek bir hastanın günün cirosunda tutabileceği en yüksek pay sınırlıdır. **Sabit yüzde işe yaramaz**: 6 geçerli hastalı bir günde kimsenin %15'in altında kalması matematiksel olarak imkânsızdır. Bu yüzden tavan **adil paya oranlıdır**:

```
tavan = clamp(concentrationCapFactor / geçerliHasta, concentrationCapMin, concentrationCapMax)
      = clamp(2.2 / validN, 0.15, 0.40)
```
9 hasta → %24 · 6 hasta → %37 · 20 hasta → %15.

Neden gerekli: hedef bir **ortalama** olan `missCost`'a dayanır, ama hasta değerleri heterojendir. Tavan olmadan "3 hata" tek bir sayı değildir — en ucuz üç hastayı kaçırmakla en pahalı üçünü kaçırmak arasında birkaç yüz ₺ fark oluşur, yani **hangi müşteride hata yaptığın günü tek başına belirleyebilir.**

Uygulama iki aşamalı: önce en yüksek paylı hastanın siparişi yeniden üretilir (en fazla `concentrationMaxPasses` = 25 tur), yetmezse en pahalı kalem kademe kademe küçültülür (zorla sığdırma). Ölçüldü (40 koşu × 30 gün): **710 yeniden üretme, 0 zorla sığdırma** — birinci aşama her zaman yetiyor. `validN ≤ 2` olan günlerde kural matematiksel olarak sağlanamayacağı için hiç uygulanmaz (sonsuz döngü yerine dokunmadan çıkılır). Sahteler kapsam dışıdır (R'ye 0 katkı yapıyorlar).

---

## 5. İtibar Sistemi

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

Bunun bir bedeli var ve bölüm 15'te açık konu olarak duruyor: sabit iyi oynayan oyuncu hedefi kaçırsa bile ölmüyor.

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

## 10. Görseller

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

## 11. Servis Akışı, Tezgah ve Arayüz

### 11.1 Servis akışı — seçim altta, onay PC'de
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

### 11.2 Sprite.rect
`Sprite.rect(key, x, y, w, h, fit)` görselin kutu içinde **gerçekten kaplayacağı** dikdörtgeni döndürür (asset yoksa `null`). Oran korunduğu için görsel kutuyu genelde doldurmaz; aradaki fark boşluktur.

**Hâlâ kullanılıyor** ama artık yalnız `Sprite.draw` içinden: dokuz `Sprite.draw` çağrısının hepsi ondan geçer. Dışarıdan çağıran kalmadı — tek dış çağıran `counterItemRects` idi, o da tepsiyle birlikte silindi.

`fit` modları: `"contain"`, `"contain-bottom"`, `"cover"`, `"stretch"`. Fiilen kullanılan iki tanesi: `"cover"` (arka plan, tezgah bandı) ve `"contain"` (kalan yedi çağrı — hasta avatarı, defter, ilaç kartı, sepet satırı, uçuş animasyonu).

> **`"contain-bottom"` modunun artık HİÇ ÇAĞIRANI YOK.** Taban hizası (dar/uzun ve geniş/kısa ürünleri aynı yüzeye oturtma) yalnız tezgah tepsisi için vardı. Kod duruyor ama ölü daldır — bkz. bölüm 15.

### 11.3 Kaldırılan tepsi katmanı
Tezgah ürün tepsisi tamamen söküldüğü için `counterItemRects`, tepsi rozet/dokunma hesabı ve onu denetleyen `verifyCounterLayout()` **koddan silindi**. Rozet çapı sınırlama, eşmerkezli dokunma kutusu ve "rozeti slot karesine değil çizim dikdörtgenine bağla" kuralı artık geçerli değil — bağlanacak rozet kalmadı.

### 11.4 drawEmoji — glif kutusuna göre ortalama
Emojiler font metriklerine göre değil, **gerçek glif kutusuna** göre ortalanır: `measureText`'in `actualBoundingBoxLeft/Right/Ascent/Descent` değerleriyle ölçülüp merkez düzeltmesi uygulanır. Aksi halde farklı emojiler aynı kutuda farklı yerlere oturuyordu. `selfTestEmoji()` oyundaki her emojiyi 64px referans kutuda çizip merkez sapmasını denetler (tolerans ~%6); tarayıcı `actualBoundingBox` vermiyorsa denetim atlanır.

### 11.5 HUD ve diğer arayüz
- **HUD**: sol kutuda satır1 GÜN, satır2 tarih (emojisiz); nöbet günlerinde sol kutu ile EV butonu arasındaki boşlukta 🌙 rozeti; ortada kare EV butonu (menüye döner, veri silinmez); sağ kutuda itibar (emoji eşikleri: <35 😡, 35–69 😑, ≥70 😊) ve binlik ayraçlı para.
- `formatMoney` `toLocaleString` kullanmaz, kendi ayraç mantığı vardır ve değer değişmediği sürece **cache'li string** döner. `dateShort()` de gün değişmediği sürece cache'lidir — çizim içinde `new Date()` çağrısı titremeye yol açar.
- **İlaç kartları**: 3 sütunlu grid, görsel `contain` ile çizilir (asla ezilmez), dikeyde taşarsa drag-scroll + sağ kenarda ince retro scrollbar (salt görsel, tıklama hedefi değil). Stok 0 → "TÜKENDİ" etiketi; stoğu olanlarda sağ üstte stok rozeti.
- **Gün sonu kartı** yüksekliği sabit değil, içerikten hesaplanır (başlık + satır sayısı × satır adımı + butonlar + boşluklar).
- **Konuşma balonları** krem/açık zeminli; reçeteli hastada replik **spawn anında** seçilir (frame'de yeniden seçilmez).

---

## 12. Geliştirici Araçları

### 12.1 Karar teşhis bloğu
`CONFIG.debugDecisions` (varsayılan **true**) açıkken her servis/red kararında konsola tek okunabilir blok basılır: hasta tipi, istenen liste (ad + id + adet), verilen liste, doktorun defterde olup olmadığı, her kusur kontrolünün sonucu, karşılaştırılan iki değer (reçete tarihi ↔ oyun tarihi), iç bayraklar ve sonuç + gerekçe.

### 12.2 Boot'ta sessiz çalışan self-test'ler
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
- **(0d2)** reçete garantileri: her günde ≥1 gerçek, 2. günden itibaren ≥1 sahte, gerçek reçetelerde kusur bayrağı yok, `overdose` hiç üretilmiyor
- **(0d3)** Medula kuralları (terminal geçici olarak maks seviyeye alınır): kod uzunluğu ve "2" başlangıcı, alfabe dışı karakter yok, kodlar gün içinde benzersiz, hiçbir Medula hastası sahte değil, kalem listesi boş değil, R'ye giriyor, terminal açıkken en az bir Medula hastası üretiliyor, **alacak defteri bütünlüğü**
- **(0d4)** çok kalemli semptom sabrı: 3 kalemli hasta 1 kalemliden kesin uzun bekliyor, çarpan tam 1,5 ve **Bekleme Alanı seviyesinden bağımsız** (geliştirme çarpanı yerine geçmemiş)
- **(0e)** nöbet kuralları: gece hasta sayısı ≥ `nightPatientMin`, `nightFakeChance()` tavanı aşmıyor, gecede ≥1 gerçek reçete, gündüz bölümünde `night:true` hasta yok, nöbet olmayan günde hiç gece hastası yok
- **(f–i)** hastanın tam ihtiyacı verilince sonuç daima "doğru" mu; her sahte reçetenin tespit edilebilir en az 1 kusuru var mı; gerçek reçetelerde kusur yok mu ve doktoru defterde mi; gerçek reçetenin tarihi o günün tarihi mi

**`selfTestEmoji()`** — oyundaki her emojinin glif kutusuna göre doğru ortalandığını denetler (bkz. 11.4).

**`checkDataHealth()`** — her ilaç kategorisinin en az bir semptomu, her semptom kategorisinin en az bir ilacı var mı.

> **(KALDIRILDI) `verifyCounterLayout()`** — tezgah tepsisindeki rozet ve dokunma kutusunun görsel dikdörtgeni içinde kaldığını denetliyordu. Tepsiyle birlikte silindi; boot'ta artık çağrılmıyor ve `cheats.checkCounter()` de kaldırıldı.
>
> **Yerine dosya İÇİNDE bir denetim gelmedi.** SATIŞ ekranının sığması (satırlar panelden taşmıyor mu, adımlayıcılar panel içinde mi, SERVİS ET son satırın altında mı) yalnız **dışarıdan headless ölçümle** doğrulandı — boot self-test'i bunu görmez. Panel yerleşimi değiştirilirse ölçüm elle tekrarlanmalı. Bkz. bölüm 15.

### 12.3 Debug cheatleri (`window.cheats` — **29 adet**, koddan sayıldı)

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
| `gameOver()` | `triggerGameOver()` tetikler |
| `revealFlaws()` | aktif reçetenin sahte/kusur/doktor/tarih/kaşe/imza dökümünü yazar |
| `setGroup(gid)` | aktif ilaç grubunu değiştirir |
| `concentration(days)` | konsantrasyon tavanı dökümü: en yüksek paylı hasta, payı, tavan, yeniden üretme/zorla sığdırma sayısı |
| `stock()` | tüm ilaçların stok tablosu |
| `setStock(id, n)` | bir ilacın stoğunu clamp'li ayarlar |
| `emptyStock(id)` | bir ilacın stoğunu sıfırlar |
| `openDepot()` | PC panelini doğrudan DEPO ekranında açar |
| `prices()` | tüm ilaçların alış/satış/kâr% tablosu |
| `explainPatient()` | mevcut hasta için karar teşhis bloğunu istek üzerine basar |
| `setSeed(v)` | koşu tohumunu sabitler, gün cache'ini temizler, oynanan günü yeni tohumla kurar |
| `seed()` | mevcut `runSeed`'i yazar |
| `medula()` | terminal durumu, vadeli SGK alacak defteri, defter denetimi, kuyruktaki Medula kodları |
| `nightDuty()` | önümüzdeki nöbet günlerini tabloyla yazar + nöbet ayarları özeti |
| `forceNight()` | mevcut günü nöbet gününe çevirip gece bölümünü başlatır (`_forcedNightDays` yalnız buradan dolar) |
| `upgrades()` | tüm kalemlerin seviyesi, etkisi, sonraki seviye ve fiyatı + efektif değer özeti (reçeteli pay dahil) |
| `setUpgrade(id, seviye)` | test için seviye zorlar; vitrin/medula ise cache'i geçersiz kılar |
| `balance()` | avgPrice/avgCost/marj/startMoney + gün 1..10 tablosu + `verifyGoalBalanceAllTiers(true)` |
| `assetStatus()` | hangi asset'lerin yüklendiğini/boş olduğunu ve kapsam özetini döner |
| `state()` | gün/para/itibar/aktif sabır/kuyruk/tezgah/beklenen ilaç/gün istatistikleri |

---

## 13. ÖLÇÜM BULGULARI

Bu bölüm belgenin en değerli kısmı. Sayılar **2026-09-02 tarihli son ölçüm turundan** gelir (gün büyüklüğü tavanı + geç oyun kompozisyon eğrisi + Vitrin yeniden amaçlandırma turu).

### 13.1 Ölçüm düzeneği
Headless Node harness: `index.html`'in **gerçek** fonksiyonları (canvas stub'lı `vm` sandbox) çalıştırılır — `buildDaySchedule`, `checkOrder`, `rejectPrescription`, `gainReputation` hepsi orijinal koddur, yeniden yazılmamıştır. Bot karar seviyesinde oynar (frame döngüsü koşmaz), kendi RNG'si oyunun RNG'sinden bağımsızdır ki gün üretimini bozmasın.

**Bot profilleri:**

| Profil | Doğruluk | Amaç |
|---|---|---|
| **A** | %100 (kusursuz) | tavan/doyma ölçümü |
| **B** | %85 sabit (i.i.d.) | "iyi oyuncu" referansı |
| **B′** | %25 ihtimalle kötü gün (%65), diğer günler %88 (ort. ~%82) | **korelasyonlu kötü seri** — gerçek oyuncunun kötü gününü modeller |
| **C** | %70 | "vasat oyuncu", ölmesi beklenen |

**Düzeltilmiş satın alma politikası:** sabah önce o günün gerçek listesinden ihtiyaç çıkarılıp **stok tamamlanır** (ihtiyaç × 1,5, `effMaxStock`'a kırpık), geliştirme **ancak** 20 × avgCost'luk rezervin üstündeki fazladan alınır. Bu düzeltme şart: eski politika rafı boşken kasayı geliştirmeye yatırıyor, stok tükeniyor, satış düşüyor ve sarmal kapanıyordu — ölçüm bu yüzden yanlış sonuç veriyordu.

### 13.2 Hayatta kalma (60 runSeed × 30 gün)

| Profil | Hayatta | Ölüm günü | Geç oyunda (g16+) ölen |
|---|---|---|---|
| A | **60/60** | — | — |
| B | **60/60** | — | — |
| **B′** | **49/60 (%82)** | med **26** (min 12, max 30) | **10/11** |
| C | **1/60 (%2)** | med 12 | 20 |

Kompozisyon eğrisi eklenmeden önce (yalnız tavan varken) B′ 45/60 idi ve **medyan ölüm günü 20**'ydi. Şimdi 49/60 ve **medyan 26** — ölümler geç oyuna kaydı, yani zorluk artık sona doğru birikiyor.

### 13.3 B′ itibar eğrisi

| gün | 1 | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| ortalama | 65 | 118 | 126 | 129 | 129 | **116** | **120** |
| min | 10 | 57 | 42 | 47 | 16 | **1** | **0** |
| yaşayan koşu | 60 | 60 | 60 | 59 | 58 | 55 | 51 |

- Tehlike bölgesine (**<25**) giren koşu: **14/60 (%23)** — bunların **10'u geç oyunda**.
- `<40`'a düşen: 24/60 · `<60`'a düşen: 46/60
- `<25`'te geçen gün oranı: tüm koşu %1,5 · geç oyun (g16+) **%2,5**
- Günlük `|Δitibar|`: tüm koşu 20,9 · geç oyun 21,2

Ortalama 15–20. günde tepe yapıp düşüyor. **Plato yok**, geç oyunda gerçek tehlike var.

### 13.4 Oturum uzunluğu (10 sn/müşteri varsayımı)

| Ölçü | Değer |
|---|---|
| En uzun **kesintisiz blok** | **26 müşteri ≈ 4,3 dk** ✓ |
| En uzun gece bloğu | 10 müşteri ≈ 1,7 dk |
| En uzun tam gün (nöbet dahil, arada geçiş kartı var) | 36 müşteri ≈ 6,0 dk |

Tavansız hâlde en uzun gün 87 müşteri ≈ **14,5 dk** idi.

### 13.5 Tavan değeri seçimi (önceki tur, 60 runSeed)
20, 26 ve 32 karşılaştırıldı:

| Tavan | B′ hayatta | En uzun kesintisiz blok | Karar |
|---|---|---|---|
| yok (taban) | 14/60 (%23) | 66 müşteri ≈ 11,0 dk | ✗ |
| 20 | 52/60 (%87) | 20 müşteri ≈ 3,3 dk | fazla güvenli |
| **26** | **45/60 (%75)** | **26 müşteri ≈ 4,3 dk** | **seçildi** |
| 32 | 43/60 (%72) | 32 müşteri ≈ 5,3 dk | bütçeyi aşıyor |

26 seçildi: kesintisiz blok 5 dakikalık bütçenin altında kalıyor, B′ profili tehlikeyi koruyor. 32, üstelik `missRate` tabana oturduktan **sonra** bağladığı için self-test uyarısı da veriyordu.

### 13.6 Geliştirme doyması (A profili)
- Tüm geliştirmeler tamam: **60/60 koşuda, medyan gün 12** (min 9, max 13)
- 30. gün kasası: medyan **41.872₺** (min 38.379 / max 48.117₺)
- Son 5 günün kasa artışı: medyan **1.560₺/gün**

Tavansız hâlde doyma gün 11'de ve 30. gün kasası 68.759₺ idi. Doyma **bir gün ötelendi ama kalkmadı**.

---

## 14. DENENİP REDDEDİLENLER

Bunlar tekrar denenmesin diye yazıldı. Her biri gerçekten uygulandı ve ölçüldü.

**Konveks kabuk ile görsel kesimi.** İlaç PNG'lerini şeffaflaştırırken silüeti konveks kabukla çıkarmak denendi. Reddedildi: **gölgeyi silüete katıyor** — ürünün altındaki yumuşak gölge kabuğun içinde kalıyor ve kesim ürünün gerçek sınırını vermiyor. Flood-fill yaklaşımına dönüldü.

**Medula ipucunun kusur işaretlemesi.** Medula terminali başlangıçta reçete incelemesine yardım eden bir ipucu aracıydı: sorgulanan reçetenin kusurlu alanlarını işaretliyordu. Reddedildi: inceleme mekaniğini **tamamen çözen bir oracle** oluyordu — oyuncunun tarihe, kaşeye, imzaya, deftere bakmasına hiç gerek kalmıyordu. Tasarım tamamen söküldü (`hintFields`, `medulaMarks`, işaret çizimi ve ipucu self-test'i kaldırıldı) ve Medula yeni bir **hasta tipi + ödeme gecikmesi** sistemine dönüştürüldü.

**İtibar ödül/ceza kaldıraçlarının büyütülmesi.** %85 doğrulukla oynayan botun ölmesini telafi etmek için `repGainCorrect`, `fakeCatchRepGain` ve `angryRepLoss` yükseltildi. Reddedildi ve **taban değerlere geri alındı**: B'yi kurtarmadı, buna karşılık **C'nin ömrünü 2,6 kat uzattı** (ölmesi gereken oyuncu yaşamaya başladı) ve itibarın tavana yapışmasını geri getirdi. Asıl sebep itibar ekonomisi değil, geç oyundaki stok/nakit sarmalıydı. CONFIG'te bu değerlerin yanında uyarı notu duruyor.

**Hedefi tutturan güne itibar ödülünün tek başına çözüm sanılması.** `goalMetReputation` eklendi ve tek başına yeterli sanıldı. Reddedildi (ödül **kaldırılmadı**, ama tek çözüm olma iddiası düştü): ödül gün ölçeğinde bir tampon veriyor, ama **kırmaya çalıştığı çıkrığın kendisine tabi** — gün büyüdükçe kaybedilen itibar da büyüdüğü için sabit +3'lük ödül geç oyunda anlamsızlaşıyordu. Gerçek çözüm gün büyüklüğüne tavan koymak oldu.

**Vitrin'in reçeteli payını ham hâliyle artırması.** Vitrin'in yeni işlevi ilk hâlinde sadece `prescriptionChance`'ı yükseltiyordu. Reddedildi: reçetelilerin ~%51'i sahte ve sahtenin cirosu sıfır olduğu için bir reçeteli hastanın **beklenen** değeri semptomlunun 0,70 katı — Vitrin Lv3 R'yi **%4,2 düşürüyordu**, yani parası alınan ve ciroyu azaltan bir geliştirmeydi. Sahte seyreltmesi (`vitrinFakeDilution`) eklenerek düzeltildi; şimdi Lv3 R'yi **%5,9 artırıyor**.

**Sabit yüzdeli konsantrasyon tavanı.** Tek hastanın günün cirosundaki payına sabit bir yüzde (ör. %15) tavanı denendi. Reddedildi: **az hastalı günlerde matematiksel olarak sağlanamıyor** — 6 geçerli hastalı bir günde kimsenin %15'in altında kalması imkânsızdır (en iyi ihtimalle herkes eşit olsa bile pay 1/6 = %16,7). Uygulama sonsuz döngüye giriyordu. Tavan **adil paya oranlı** hâle getirildi (`2.2 / validN`, [0.15, 0.40] arası) ve sağlanamayan günlerde (`validN ≤ 2`) hiç uygulanmıyor.

---

## 15. BİLİNEN AÇIK KONULAR

**Geliştirme doyması.** Tüm geliştirmeler A profilinde medyan **12. günde** bitiyor (60/60 koşuda). Kalan 18 gün boyunca paranın harcanacağı yer yok; kasa 30. günde ~41.872₺'ye çıkıyor ve son 5 günde günde ~1.560₺ birikmeye devam ediyor. Tavan bu sorunu bir gün öteledi ama çözmedi. Yeni bir para gideri (personel, kira, ekipman bakımı, ceza/vergi) ya da geliştirme ağacının derinleştirilmesi gerekiyor.

**(ÇÖZÜLDÜ) Tezgahta 5+ ürün doktor defteriyle çakışıyordu.** Ürün tepsisi tamamen kaldırıldı; tezgah yüzeyinde yalnız defter ve PC kaldı. Ölçüldü (390×844): defter x[8–133], PC x[291–391] — kesişmiyorlar ve çakışacak üçüncü nesne yok.

**SATIŞ ekranının sığması dosya içinde denetlenmiyor.** `verifyCounterLayout()` silindi ve yerine boot self-test'ine bir karşılık konmadı. Panel yerleşimi (İSTENEN kutusu %24,5, sepet kutusu kalan alan, 6 satır referanslı satır yüksekliği) yalnız dışarıdan headless ölçümle doğrulandı. Panel oranları ya da `maxPrescriptionItems` değiştirilirse sığma sessizce bozulabilir — ya ölçüm elle tekrarlanmalı ya da boot'a bir yerleşim denetimi eklenmeli.

**`Sprite.rect`'in `"contain-bottom"` modu ölü dal.** Taban hizası yalnız tezgah tepsisi için vardı; tepsi kalkınca çağıranı kalmadı (dokuz `Sprite.draw` çağrısının yedisi `"contain"`, ikisi `"cover"`). Kod duruyor. Silmek mi, ileride kullanmak mı — karar verilmedi; silinirse `Sprite.rect`'in yorum bloğu da sadeleşir.

**Poşet animasyonu görsel olarak doğrulanmadı.** `bagAnim` zamanlaması ve `checkOrder`'ın uçuş sonunda çalıştığı ölçüldü, ama poşetin nasıl göründüğü, nereden nereye kaydığı ve PC rozetinin konumu headless ölçümle görülemez. **Gerçek cihazda bakılmalı.**

**Sepetin kalıcılığı test edilmedi.** Sepet hasta küsünce ve gün geçince temizleniyor (doğrulandı), ama oyuncu SATIŞ ekranını kapatıp DEVAM ET'e ya da menüye giderse sepetin ne olması gerektiği tasarım olarak kararlaştırılmadı. Şu an `startNewGame` temizliyor, menüye gidip DEVAM ET ile dönmek temizlemiyor — bilinçli bir karar değil, mevcut kodun yan etkisi.

**Sabit %85 oynayan oyuncu hiç tehlikeye girmiyor.** B profili 60/60 çıkıyor ve 30 günün hiçbirinde itibar 25'in altına inmiyor. Kompozisyon eksenleri B′'yi (korelasyonlu kötü seriler) vuruyor ama i.i.d. %85'i vurmuyor: izinli hata gün 30'da bile hasta başına 0,10, yani 36 hastalık günde 3,6 hata hakkı var; %85 doğruluk beklenen 5,4 hataya karşılık geliyor, oyuncu hedefi **kaçırıyor** ama hedefi kaçırmanın cezası yok — sadece +3 itibardan mahrum kalıyor.

> Tek kaldıraç **hedefi kaçırmaya bir bedel koymaktır** ve bu **bilinçli olarak yapılmadı** (bkz. 5.2). Yapılırsa önce 4.2'deki miss-maliyeti harmanlaması yapılmalı: sahte hastanın "kaçırma maliyeti" gerçek hastanınkiyle aynı sayılmamalı, yoksa güvenlik bandına takılan %3,8'lik gün dilimi haksız yere cezalandırılır.

---

## 16. Sıradaki İşler

1. **Geliştirme doymasına çözüm** — yeni para gideri ya da daha derin geliştirme ağacı. Açık konuların en somutu; ölçüm zaten hazır (13.6).
2. **Yeni servis akışını cihazda görmek** — poşet animasyonu, karttan PC'ye uçuş ve PC sepet rozeti yalnız kodla doğrulandı; görünüş gerçek cihazda değerlendirilmeli. Aynı turda SATIŞ ekranının sığması için boot'a bir yerleşim denetimi eklenip eklenmeyeceğine karar verilmeli (bkz. 15).
3. **Karar bekleyen: hedefe yaptırım.** Eklenecekse önce miss-maliyeti harmanlaması yapılmalı. Bu karar verilmeden sabit %85 oyuncusu tehlikeye girmez.
4. **Capacitor ile iOS paketleme** — henüz hiç yapılmadı; gerçek cihazda oturum uzunluğu ve dokunma hedefi boyutları ölçülmeli (10 sn/müşteri varsayımı gerçek cihazda doğrulanmadı).
5. **30 günden sonrası tanımsız.** Kampanya ufku 30 gün varsayımıyla dengelendi (`missRateFloorDay` 30, sahte rampası 25. günde doyuyor). 30. günden sonra hiçbir eksen ilerlemiyor — oyun orada bitiyor mu, döngüye mi giriyor, karar verilmedi.

---

## 17. Çalışma Şekli

- Promptlar Claude Code'a (VS Code, Opus, high effort) verilir; sonu hep "Komple güncel index.html ver."
- İterasyon döngüsü: prompt → test → ekran görüntüsü → geri bildirim
- Denge değişiklikleri **ölçülerek** yapılır: headless harness + A/B/B′/C bot profilleri (bkz. 13.1). Değer oynatmadan önce ölç, oynattıktan sonra tekrar ölç.
- Git: her sağlam noktada `git add -A && git commit -m "..." && git push`

## 18. Bilinen Teknik Riskler

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
