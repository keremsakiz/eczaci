# Eczacı — Claude notları

- Kerem'e Türkçe, kısa yanıt. Parantez içindeki notlar talimattır. Ayrıntılı durum `DURUM.md`'de.

## ⚠️ KVKK / GİZLİLİK — YAYIN ÖNCESİ KONTROL (ATLAMA)
Kerem (2026-11-23): "Kesinlikle ceza yemek istemeyiz." Her mağaza sürümünden önce hepsi ✅ olmalı (hukuki tavsiye değil, teknik kontrol):
1. **Dışarıya istek yok:** `grep -E "https?://"` yayın paketinde yalnız `w3.org`/`apple.com` gibi ad alanları çıkmalı. Google Fonts/CDN yok; yazı tipleri dosyaya gömülü.
2. **Gizlilik politikası yayında:** TR + EN, herkese açık URL (örnek: `keremsakiz.github.io/telefoncu/privacy.html`), App Store Connect'e girilmiş. Yeni oyun için Telefoncu'nun sayfasını kopyala; içerik koda uymalı.
3. **Veri toplanmıyor beyanı doğru:** analiz, reklam, crash raporu, cihaz kimliği, hesap yok. Bunlardan biri eklenirse: aydınlatma metni + açık rıza ekranı + App Privacy etiketleri + `PrivacyInfo.xcprivacy` güncellenir.
4. **Reklam (AdMob vb.) eklenirse:** ATT izin ekranı (`NSUserTrackingUsageDescription`), rıza ekranı, gizlilik politikası ve App Privacy güncellemesi ZORUNLU. (AdMob agree.exe'de denendi, ileride tekrar denenecek.)
5. **Sunucu/bulut kaydı eklenirse (Supabase vb.):** RLS açık, gizli anahtar istemcide yok, `get_advisors` temiz; gizlilik metnine ne saklandığı yazılır.
6. **Pazarlama yok:** e-posta/bildirim izinsiz gönderilmez. Bildirim eklenirse izin istenir.
7. **Satış:** Ücretli/IAP satışı Apple yapar (ön bilgilendirme Apple'da). Mağaza açıklaması ve fiyat doğru olmalı; oyun içi satın alma eklenirse fiyat ve içerik satın almadan önce açıkça gösterilir.
- **Eczacı durumu (2026-11-23):** ✅ dışarıya istek yok, fontlar gömülü, kayıt yalnız cihazda, Game Center yalnız Apple'da. Gizlilik sayfası `privacy.html` repoda var; ⚠️ herkese açık bir URL'de yayında olduğunu ve App Store Connect'e girildiğini yayından önce doğrula.
