const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
// ⚠️ VAKIFBANK GİZLİ BİLGİLERİ (CANLI ORTAM)
// =========================================================
const MERCHANT_ID = "000000056817349"; 
const STORE_KEY = "Ep6o1RKs"; 
const TERMINAL_ID = "V3805394"; 
const POS_URL = "https://inbound.apigateway.vakifbank.com.tr:8443/threeDGateway/Enrollment";

// ---------------------------------------------------------
// 1. ADIM: REACT'TEN GELEN İSTEĞİ KARŞILAMA VE ŞİFRELEME
// ---------------------------------------------------------
app.post('/api/odeme-baslat', (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv } = req.body;
        
        const basariliUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarili";
        const basarisizUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarisiz";

        // Yeni API Gateway standart ondalıklı format ister (Örn: "1.00")
        // Tutar KESİNLİKLE "1.00" gibi noktalı string formatında olmalıdır.
const islemTutari = Number(tutar).toFixed(2); 
        const islemTipi = "Auth"; 
        const taksit = "0"; 
        const rnd = Math.random().toString(36).substring(2, 15); 

        const hashString = `${MERCHANT_ID}${siparisNo}${islemTutari}${basariliUrl}${basarisizUrl}${islemTipi}${taksit}${rnd}${STORE_KEY}`;
        const hash = crypto.createHash('sha512').update(hashString).digest('base64');

        res.json({
            basarili: true,
            bankaUrl: POS_URL,
            formData: {
                Pan: kartNo,
                ExpiryDate: sonKullanma, 
                Cvv2: cvv,
                MerchantId: MERCHANT_ID,
                TerminalNo: TERMINAL_ID, 
                VerifyEnrollmentRequestId: siparisNo,
                PurchaseAmount: islemTutari, // <-- DOĞRU VE TAM PARAMETRE ADI
                Currency: "949",
                SuccessUrl: basariliUrl,
                FailureUrl: basarisizUrl,
                TransactionType: islemTipi,
                InstallmentCount: taksit,
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
    console.log("✅ VAKIFBANK'TAN BAŞARILI BİLDİRİMİ GELDİ:", req.body);
    // Burası Frontend'in (Netlify) başarı sayfasına yönlendirmelidir.
    // Şimdilik test için Render'da kalsın, ekranda hata görmemek için:
    res.send("<h1>ÖDEME BAŞARILI! SMS DOĞRULANDI.</h1>");
});

app.post('/api/odeme-sonuc/basarisiz', (req, res) => {
    console.log("❌ VAKIFBANK'TAN BAŞARISIZ BİLDİRİMİ GELDİ:", req.body);
    res.send("<h1>ÖDEME BAŞARISIZ OLDU.</h1>");
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 POS Arka Plan Sunucusu (Backend) ${PORT} portunda çalışıyor!`);
});