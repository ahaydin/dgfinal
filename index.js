const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios'); // axios'u global olarak ekledik

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
// 1. ADIM: ÖDEME BAŞLATMA SANTRALİ (404 HATASININ SEBEBİ BURASIYDI)
// ---------------------------------------------------------
app.post('/api/odeme-baslat', async (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv, odemeTipi, telefon } = req.body;

        // --- A) VAKIFBANK İŞLEMLERİ ---
        if (odemeTipi === 'vakifbank' || odemeTipi === 'kredi_karti') {
            // ⚠️ DİKKAT: ESKİ VAKIFBANK (XML, HASH) KODLARIN BURADAYDI.
            // Yanlışlıkla sildiğin için şu an boş. Yedeğin varsa bu aralığa yapıştırabilirsin.
            return res.json({ basarili: false, hata: "Vakıfbank kodları henüz eklenmedi." });
        }
        
        // --- B) METROPOL İŞLEMLERİ ---
        else if (odemeTipi === 'metropol') {
            const M_ACCESS_KEY = "4E602A99-50F1-4FAD-96A2-8BD6EA6CD370";
            const M_CONSUMER_ID = "995649";
            const M_USER_NAME = "DIYETIM_GELDI_TEST";
            const M_SALT_KEY = "995649UU995649UU";
            const M_MERCHANT_NO = "0000052983";
            const M_TERMINAL_NO = "0000064998";

            // 1. Güvenli Erişim Verisini Oluşturma
            const accessData = { AccessKey: M_ACCESS_KEY, CreateDate: new Date().toISOString() };
            const key = Buffer.from(M_SALT_KEY, 'utf8');
            const iv = Buffer.alloc(16, 0); 
            const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
            let secureAccessData = cipher.update(JSON.stringify(accessData), 'utf8', 'base64');
            secureAccessData += cipher.final('base64');

            // 2. Metropol'den Token Alma
            const tokenPayload = {
                ConsumerId: M_CONSUMER_ID,
                ConsumerName: M_USER_NAME,
                SecureAccessData: secureAccessData,
                RefNo: siparisNo
            };

            const tokenResponse = await axios.post("http://testapi.metropolcard.com/auth/v1/generatetoken", tokenPayload);

            if (!tokenResponse.data.success) {
                return res.json({ basarili: false, hata: "Metropol Yetki Hatası: " + tokenResponse.data.responseMessage });
            }

            const metropolToken = tokenResponse.data.data.token;

            // 3. Metropol SMS Gönderme
            const otpPayload = {
                MerchantCode: M_MERCHANT_NO,
                TerminalCode: M_TERMINAL_NO,
                UserRefNo: kartNo,
                UserRefType: "1",
                TransactionAmount: Number(tutar) 
            };

            const otpResponse = await axios.post("http://testapi.metropolcard.com/vpos/v3/sale/sendotp", otpPayload, {
                headers: {
                    'Authorization': `Bearer ${metropolToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (otpResponse.data.ResponseCode === 0) {
                return res.json({ 
                    basarili: true, 
                    otpGerekiyor: true, 
                    otpRefCode: otpResponse.data.OtpRefCode,
                    metropolToken: metropolToken,
                    mesaj: "Metropol SMS şifresi gönderildi."
                });
            } else {
                return res.json({ basarili: false, hata: "Metropol SMS Hatası: " + otpResponse.data.ResponseMessage });
            }
        }
    } catch (error) {
        console.error("Santral Hatası:", error);
        res.status(500).json({ basarili: false, hata: "Sunucu hatası." });
    }
});

// ---------------------------------------------------------
// 2. ADIM: METROPOL SMS ONAYLAMA VE PARA ÇEKME
// ---------------------------------------------------------
app.post('/api/metropol-onay', async (req, res) => {
    try {
        const { otpKodu, otpRefCode, metropolToken, siparisNo, tutar, kartNo } = req.body;

        const M_MERCHANT_NO = "0000052983";
        const M_TERMINAL_NO = "0000064998";

        const payload = {
            MerchantCode: M_MERCHANT_NO,
            TerminalCode: M_TERMINAL_NO,
            UserRefNo: kartNo,
            UserRefType: "1",
            ProductId: 1, 
            TransactionAmount: Number(tutar),
            SaleRefCode: siparisNo,
            OtpRefCode: otpRefCode,
            Otp: otpKodu,
            Description: JSON.stringify({ Info1: "Siparis", Info2: siparisNo })
        };

        // HATA BURADAYDI: Multinet linkini silip, doğru Metropol linkini koydum!
        const response = await axios.post("http://testapi.metropolcard.com/vpos/v3/sale/salewithotp", payload, {
            headers: {
                'Authorization': `Bearer ${metropolToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.ResponseCode === 0) {
            res.json({ basarili: true, mesaj: "Metropol ödemesi tamamlandı." });
        } else {
            res.json({ basarili: false, hata: response.data.ResponseMessage });
        }
    } catch (error) {
        console.error("Metropol Onay Hatası:", error);
        res.status(500).json({ basarili: false, hata: "Sunucu onayı başarısız." });
    }
});

// ---------------------------------------------------------
// 3. ADIM: BANKADAN GELEN 3D SMS SONUCUNU KARŞILAMA
// ---------------------------------------------------------
app.post('/api/odeme-sonuc/basarili', (req, res) => {
    console.log("✅ VAKIFBANK'TAN BAŞARILI BİLDİRİMİ GELDİ:", req.body);
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