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
app.post('/api/odeme-baslat', async (req, res) => { // DİKKAT: async ekledik
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv } = req.body;
        
        const basariliUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarili";
        const basarisizUrl = "https://dgfinal.onrender.com/api/odeme-sonuc/basarisiz";
        const islemTutari = Number(tutar).toFixed(2); 

        // 1. Bankaya gidecek verileri paketliyoruz
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

        // 2. İsteği React'ten değil, doğrudan Backend'den bankaya gönderiyoruz!
        const bankaCevabi = await fetch(POS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        // 3. Bankadan gelen XML cevabını alıyoruz
        const xmlVerisi = await bankaCevabi.text();

        // 4. XML'in içindeki <PaReq>...</PaReq> arasındaki şifreli kodu cımbızla çekiyoruz
        const paReqEslenme = xmlVerisi.match(/<PaReq>(.*?)<\/PaReq>/);
        
        if (paReqEslenme && paReqEslenme[1]) {
            const sifreliPaReq = paReqEslenme[1];
            
            // 5. Şifreyi kırıp (Base64'ten) normal HTML sayfasına dönüştürüyoruz
            const smsEkraniHtml = Buffer.from(sifreliPaReq, 'base64').toString('utf-8');

            // 6. Hazır olan ekranı React'e yolluyoruz
            res.json({
                basarili: true,
                html: smsEkraniHtml // React sadece bu HTML'i alıp gösterecek
            });
        } else {
            // Eğer PaReq yoksa, işlemde bir hata vardır
            res.json({ basarili: false, hata: "Bankadan onay SMS ekranı alınamadı." });
        }

    } catch (error) {
        console.error("Ödeme başlatma hatası:", error);
        res.status(500).json({ basarili: false, hata: "Sunucu hatası." });
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