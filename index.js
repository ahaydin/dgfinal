const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
// React'in bu sunucuya istek atabilmesi için güvenlik izni (CORS)
app.use(cors()); 
// Bankadan ve React'ten gelen verileri okuyabilmek için
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
// ⚠️ VAKIFBANK GİZLİ BİLGİLERİ (CANLI ORTAM)
// =========================================================
const MERCHANT_ID = "000000056817349"; 
const STORE_KEY = "Ep6o1RKs"; 
const TERMINAL_ID = "V3805394"; 
const POS_URL = "https://sanalpos.vakifbank.com.tr/UI/VPos3D/3DHost.aspx";

// ---------------------------------------------------------
// 1. ADIM: REACT'TEN GELEN İSTEĞİ KARŞILAMA VE ŞİFRELEME (HASH)
// ---------------------------------------------------------
app.post('/api/odeme-baslat', (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv } = req.body;
const basariliUrl = "https://www.diyetimgeldi.com/basarili";
const basarisizUrl = "https://www.diyetimgeldi.com/hata";

        // Bankalar tutarı kuruşlu formatta ister (Örn: 1500 TL -> 1500.00)
        const islemTutari = Number(tutar).toFixed(2); 
        const islemTipi = "Auth"; // Standart Satış İşlemi
        const taksit = ""; // Tek çekim için boş bırakılır
        const rnd = Math.random().toString(36).substring(2, 15); // Güvenli rastgele kelime

        // 🔐 HASH (ŞİFRE) OLUŞTURMA: Bankanın istediği kesin sıralama
        // Banka der ki: Şifreyi ve sipariş bilgilerini uca uca ekle, sonra SHA-512 ile şifrele!
        const hashString = `${MERCHANT_ID}${siparisNo}${islemTutari}${basariliUrl}${basarisizUrl}${islemTipi}${taksit}${rnd}${STORE_KEY}`;
        
        // SHA-512 ile şifreleyip Base64 formatına çeviriyoruz
        const hash = crypto.createHash('sha512').update(hashString).digest('base64');

        // Şifrelenmiş pakedi React'e (Ön yüze) geri gönderiyoruz
        res.json({
            basarili: true,
            bankaUrl: POS_URL,
            formData: {
                Pan: kartNo,
                Expiry: sonKullanma, // YYMM formatında istenir (Örn: 2026 Aralık -> 2612)
                Cvv2: cvv,
                MerchantId: MERCHANT_ID,
                VerifyEnrollmentRequestId: siparisNo,
                Amount: islemTutari,
                Currency: "949", // TL'nin uluslararası para kodu
                SuccessUrl: basariliUrl,
                FailureUrl: basarisizUrl,
                TransactionType: islemTipi,
                InstallmentCount: "0",
                Rnd: rnd,
                Hash: hash
            }
        });

    } catch (error) {
        console.error("Ödeme başlatma hatası:", error);
        res.status(500).json({ basarili: false, hata: "Sunucu şifreleme hatası." });
    }
});


// ---------------------------------------------------------
// 2. ADIM: BANKADAN GELEN 3D SMS SONUCUNU KARŞILAMA
// ---------------------------------------------------------
app.post('/api/odeme-sonuc/basarili', (req, res) => {
    // Müşteri SMS kodunu doğru girerse banka otomatik olarak buraya sinyal gönderir.
    console.log("✅ VAKIFBANK'TAN BAŞARILI BİLDİRİMİ GELDİ:", req.body);
    
    // İşlem başarılı! Müşteriyi sitemizdeki sipariş başarılı sayfasına geri fırlatıyoruz:
    res.redirect("http://localhost:5173/siparis-basarili");
});

app.post('/api/odeme-sonuc/basarisiz', (req, res) => {
    // SMS hatalıysa, limit yetersizse veya müşteri iptal ederse banka buraya sinyal atar.
    console.log("❌ VAKIFBANK'TAN BAŞARISIZ BİLDİRİMİ GELDİ:", req.body);
    
    // Müşteriyi sitemizdeki başarısız sayfasına fırlatıyoruz:
    res.redirect("http://localhost:5173/siparis-basarisiz");
});


// Sunucuyu Başlat
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 POS Arka Plan Sunucusu (Backend) ${PORT} portunda çalışıyor!`);
    console.log(`Bekleniyor... React'ten gelecek istekler izleniyor.`);
});