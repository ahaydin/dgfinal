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
app.post('/api/odeme-baslat', async (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv } = req.body;
        
        const basariliUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarili";
        const basarisizUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarisiz";
        const islemTutari = Number(tutar).toFixed(2); 

        const formData = new URLSearchParams();
        formData.append('Pan', kartNo);
        formData.append('ExpiryDate', sonKullanma);
        formData.append('Cvv2', cvv);
        formData.append('MerchantId', MERCHANT_ID);
        formData.append('MerchantPassword', STORE_KEY); 
        formData.append('TerminalNo', TERMINAL_ID);
        formData.append('VerifyEnrollmentRequestId', siparisNo);
        formData.append('PurchaseAmount', islemTutari);
        formData.append('Currency', "949");
        formData.append('SuccessUrl', basariliUrl);
        formData.append('FailureUrl', basarisizUrl);
        formData.append('TransactionType', "Auth");
        formData.append('InstallmentCount', "0");

        // Sunucu çökmesin diye Fetch yerine garantili Axios kullanıyoruz
        const axios = require('axios'); 
        
        const bankaCevabi = await axios.post(POS_URL, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const xmlVerisi = bankaCevabi.data;

        // XML içinden <PaReq> kısmını koparıyoruz
        const paReqEslenme = xmlVerisi.match(/<PaReq>(.*?)<\/PaReq>/);
        
        if (paReqEslenme && paReqEslenme[1]) {
            const sifreliPaReq = paReqEslenme[1];
            
            // Şifreli HTML'i çözüyoruz
            const smsEkraniHtml = Buffer.from(sifreliPaReq, 'base64').toString('utf-8');

            res.json({
                basarili: true,
                html: smsEkraniHtml 
            });
        } else {
            res.json({ basarili: false, hata: "Bankadan onay SMS ekranı alınamadı." });
        }

    } catch (error) {
        // Eğer sunucu tarafında bir hata olursa Render loglarına düşsün diye:
        console.error("Backend Ödeme Hatası:", error.message || error);
        res.status(500).json({ basarili: false, hata: "Sunucu iç hatası: " + (error.message || "Bilinmiyor") });
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