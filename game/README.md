# Flappy Bird — Yeşil Vadi

Oyunu açmak için **index.html** dosyasına çift tıklayın. Kurulum, internet bağlantısı veya derleme gerekmez. `index.html`, `style.css`, `game.js` ve `img` klasörünü birlikte tutun.

- **Masaüstü:** Boşluk / yukarı ok / fare tıklaması ile kanat çırpın. ESC ile duraklatıp menüye dönün.
- **Telefon:** Oyun alanına dokunarak kanat çırpın. Sol üstteki durdur butonu menüyü açar.
- **Menü:** Oyunu başlat, Devam et, Kostümler, Hakkında. Devam et, yalnızca duraklatılmış bir uçuş varsa etkinleşir. Yeniden başlat, mevcut uçuşu sıfırlar.
- **Hedef:** Borulara, yere veya ekranın üstüne çarpmadan 15 boru çiftini geçin. Tek bölüm vardır; zorluk sabittir.
- **Kostümler:** `img/1.png`–`img/5.png` görsellerinden beş karakter. Tüm kostümlerin çarpışma alanı ve uçuş fiziği aynıdır.
- **Ses:** Sağ üstteki ses butonuyla açılıp kapatılır. Efektler Web Audio ile üretilir.
- **Kayıt:** En iyi skor, kostüm ve ses tercihi tarayıcının yerel depolamasına kaydedilir. Yerel depolama kapalı olsa da oyun çalışır.

Sekme değiştirilince, pencere odağını kaybedince veya oyun alanının oranı değişince oyun otomatik duraklar. Devam ederken kısa bir geri sayım gösterilir.

Geliştirici: **Onur Arda Özcan**  
Teknolojiler: HTML, CSS, JavaScript, Canvas 2D.

Geliştirme kontrolleri: `node --test tests/game.test.cjs`
