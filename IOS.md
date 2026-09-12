# ECZACI — iOS paketleme (Capacitor)

Son güncelleme: 2026-09-12. Bu belge DURUM.md'nin eki; oyunun kendisi orada anlatılır,
burada yalnız **tek dosyalık oyunun nasıl bir iOS uygulamasına dönüştüğü** yazılıdır.
Buradaki her satır çalıştırılıp doğrulanmıştır.

---

## 1. Kurulan yapı

```
ECZACI/
  index.html              ← KAYNAK. Geliştirme dosyası. ADMIN blok burada DURUR.
  assets/                 ← 53 PNG
  build.js                ← www/ üretir (yayın derlemesi)
  capacitor.config.json
  package.json
  tools/
    boot-test.js          ← index.html'i jsdom'da gerçekten çalıştırır
    ios-prep.js           ← Info.plist yaması (idempotent)
  www/                    ← TÜREV, .gitignore'da. Elle düzenleme.
  ios/                    ← Xcode projesi (SPM — CocoaPods YOK)
```

Kaynak `index.html`'e yalnız oyun için yazılır; yayın dosyası derlemeyle üretilir.
`www/` ve `ios/App/App/public/` türevdir, git'e girmez.

## 2. Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run build` | `www/` üretir: ADMIN blok silinir, `debugDecisions=false` |
| `npm run build:dev` | `www/` üretir, kaynak **birebir** (ADMIN dahil) — cihazda ADMIN paneliyle test için |
| `npm test` | derler + `index.html` ve `www/index.html`'i jsdom'da boot eder |
| `npm run sync` | derle + `npx cap sync ios` |
| `npm run ios` | derle + sync + Xcode'u aç *(Xcode gerektirir — Mac'te çalıştır)* |

Günlük döngü: kodu `index.html`'de değiştir → `npm test` → `npm run sync` → Xcode'da Run.

## 3. Yayın derlemesi ne çıkarır (build.js)

1. **ADMIN blok** — `ADMIN BLOK BAŞLANGIÇ`/`BİTİŞ` şeritleri arası, satır bazında.
   Sınırlar metinden bulunur, satır numarası gömülü değil: blok büyüse de derleme çalışır.
   Silme sonrası geride `ADMIN_MODE`/`admPanel` referansı kalırsa derleme **hata verip durur**.
   Ölçüldü: 1.047 satır çıkıyor, 403.145 → 351.655 bayt.
2. **`CONFIG.debugDecisions = false`** — her servis kararında konsola teşhis bloğu basılmasın.

Çıkarılmayanlar, bilerek: `window.cheats` (41 adet) yayın derlemesinde **duruyor**. Zararsız
ama App Store'a gitmeden önce karar verilmeli — çıkarılacaksa build.js'e üçüncü bir adım.

## 4. Güvenli alan (çentik / home indicator) — kaynak koda eklendi

`computeLayout()` zaten `window.__safeTop` / `__safeBottom` okuyordu ama **hiçbir yer bunları
yazmıyordu**; yani çentik desteği hazır hookla birlikte ölü duruyordu. Eklenen:

- CSS'te görünmez `#safeprobe` elemanı, padding'lerinde `env(safe-area-inset-*)`
- `readSafeInsets()` bunu `getComputedStyle` ile geri okur (env() yalnız CSS'ten alınabilir)

**Kritik ayrıntı — ham inset'in tamamı eklenmez.** 9:16 kolon dikeyde zaten ortalanmış
durumda, yani üstte/altta `sy` kadar boş letterbox bandı var. Çentik o bandın içinde kalıyorsa
ek itme gerekmez; ham değeri eklemek HUD'ı iki kez aşağı kaydırırdı. Bu yüzden:

```
__safeTop = max(0, hamÜst − sy)
```

390×844'te `sy = 75,3px`; iPhone'un ~59px çentiği letterbox'ın içinde kalıyor, HUD kıpırdamıyor.
100px'lik bir inset ise 24,7px itiyor. Üç vaka (`0 / 59 / 100`) `tools/boot-test.js` içinde denetleniyor.

## 5. Info.plist (tools/ios-prep.js)

`npx cap add ios` sonrası çalışır, tekrar çalıştırılabilir (ikinci kez "değişiklik yok" der).

| Anahtar | Değer | Neden |
|---|---|---|
| `CFBundleDisplayName` | Eczacı | ana ekran adı (capacitor.config.json'dan da gelir) |
| `UISupportedInterfaceOrientations` (+`~ipad`) | yalnız Portrait | 9:16 dikey oyun, yatay hiç tasarlanmadı |
| `UIStatusBarHidden` | true | tam ekran; saat/pil HUD'a biniyor |
| `UIViewControllerBasedStatusBarAppearance` | false | üsttekinin geçerli olması için şart |
| `UIRequiresFullScreen` | true | iPad Split View'da 9:16 kolon bozulur |
| `ITSAppUsesNonExemptEncryption` | false | her yüklemede sorulan ihracat sorusu kapanır |

## 6. Proje ayarları (doğrulandı)

- `PRODUCT_BUNDLE_IDENTIFIER = com.kerem.eczaci`
- `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`
- `IPHONEOS_DEPLOYMENT_TARGET = 15.0`
- **Bağımlılık yönetimi: Swift Package Manager.** Capacitor 8 SPM şablonunu kullandı
  (`ios/App/CapApp-SPM`, `Package.swift`) → **CocoaPods kurulu olmasına gerek yok**,
  `pod install` adımı yok.
- `capacitor.config.json` → `ios.contentInset: "never"`, `scrollEnabled: false`
  (WebView'ın kendi kaydırmasını ve otomatik inset'ini kapatır; layout'u oyun yönetiyor)

## 7. İkon ve açılış ekranı

İkisi de `assets/bg_pharmacy.png`'den kırpıldı — sanat yönü çapasına (sıcak, koyu, amber
vurgulu, yarı-gerçekçi boyalı) sadık kalsın diye yeni görsel üretilmedi.

- `AppIcon-512@2x.png` — 1024×1024, **alfasız RGB** (App Store şartı). Orta lamba, hafif vinyet.
- `splash-2732x2732.png` (×3 ölçek) — LaunchScreen storyboard'u **aspectFill** yapar; 9:19.5
  telefonda karenin yalnız orta ~%46'lık dikey şeridi görünür, o yüzden görsel tam kanama
  (içerik merkeze sıkıştırılmadı, her ekranda ahşap + lamba kalıyor). Oyundan bir tık koyu.

## 8. Mac'te kalan adımlar

`npx cap add ios` ve `sync` **tamamlandı**; `ios/` klasörü hazır. Mac'te yapılacaklar:

```bash
cd ~/Desktop/ECZACI
npm run ios          # derle + sync + Xcode'u aç
```

Xcode'da: App target → Signing & Capabilities → **Team** seç (bundle id `com.kerem.eczaci`
yeni; Apple Developer hesabında ilk Run'da otomatik oluşturulur) → cihazı seç → Run.

## 9. Gerçek cihazda ölçülecekler (henüz yapılmadı)

DURUM.md 14.7'deki oturum uzunluğu tablosu **10 sn/müşteri varsayımına** dayanıyor ve gerçek
cihazda doğrulanmadı. Cihazda bakılacaklar:

1. Müşteri başına gerçek süre → 26 müşterilik blok gerçekten ~4,3 dk mı
2. Dokunma hedefi boyutları — ilaç kartları, sepet `−`/`+` adımlayıcıları, kategori sekmeleri
   (44×44pt Apple asgarisi; 3 sütunlu gridde adımlayıcılar en riskli kalem)
3. Poşet animasyonu ve karttan PC'ye uçuş — görsel olarak hiç bakılmadı (DURUM.md 16)
4. SATIŞ ekranının 6 kalemlik reçetede sığması — yalnız headless ölçüldü, boot denetimi yok
5. Çentikli cihazda HUD ve alt buton şeridi hizası (bölüm 4'teki mantık cihazda doğrulanmalı)
6. 60 FPS tutuyor mu — bg_pharmacy.png 1,7 MB, retina ölçekte her frame çiziliyor
