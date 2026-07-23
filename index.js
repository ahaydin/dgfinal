const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

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
// 1. ADIM: ÖDEME BAŞLATMA SANTRALİ (MAKAS)
// ---------------------------------------------------------
app.post('/api/odeme-baslat', async (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv, odemeTipi, telefon } = req.body;

        // --- A) VAKIFBANK İŞLEMLERİ ---
        // --- A) VAKIFBANK İŞLEMLERİ ---
       // --- A) VAKIFBANK İŞLEMLERİ ---
     // --- A) VAKIFBANK İŞLEMLERİ ---
        if (odemeTipi === 'vakifbank' || odemeTipi === 'kredi_karti') {
            
            const basariliUrl = "http://localhost:5005/api/odeme-sonuc/basarili";
            const basarisizUrl = "http://localhost:5005/api/odeme-sonuc/basarisiz";
            const YENI_POS_URL = "https://inbound.apigateway.vakifbank.com.tr:8443/threeDGateway/ProcessEnrollment";

            // 🎯 ÇÖZÜM: TARIH FORMATINI HAVADA ÇEVİRME (AAYY -> YYAA)
            let temizTarih = sonKullanma.replace(/[^0-9]/g, ''); // Sadece rakamları al (Örn: 12/25 -> 1225)
            let vakifTarihFormatli = sonKullanma; 
            
            if (temizTarih.length === 4) {
                // 1225 geldiyse -> 2512 yap
                vakifTarihFormatli = temizTarih.substring(2, 4) + temizTarih.substring(0, 2);
            } else if (temizTarih.length === 6) {
                // 122025 geldiyse -> 2512 yap
                vakifTarihFormatli = temizTarih.substring(4, 6) + temizTarih.substring(0, 2);
            }

            // 2. Saf JSON objesi olarak hazırlıyoruz
            const payload = {
                MerchantId: MERCHANT_ID,
                MerchantPassword: "Ep6o1RKs", // Bankanın verdiği o doğru şifre
                TerminalNo: TERMINAL_ID,
                Pan: kartNo,
                ExpiryDate: vakifTarihFormatli, // YENİ: Takla attırılmış doğru tarih formatı
                PurchaseAmount: tutar,
                Currency: "949",
                BrandName: "100",
                VerifyEnrollmentRequestId: siparisNo,
                SuccessUrl: basariliUrl,
                FailureUrl: basarisizUrl
            };

            try {
                const vakifResponse = await axios.post(YENI_POS_URL, payload, {
                    headers: { 
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                console.log("✅ Bankadan Gelen JSON Yanıtı:", vakifResponse.data);

                const paReq = vakifResponse.data.PaReq || vakifResponse.data.paReq || vakifResponse.data.PAREQ;

                if (paReq) {
                    const smsEkraniHtml = Buffer.from(paReq, 'base64').toString('utf-8');
                    return res.json({ basarili: true, html: smsEkraniHtml });
                } else {
                    console.error("Vakıfbank Red Sebebi:", vakifResponse.data); 
                    return res.json({ basarili: false, hata: "Banka işlemi onaylamadı. Lütfen geçerli bir kart girin." });
                }
            } catch (err) {
                console.error("Sunucu İstek Hatası:", err.response ? err.response.data : err.message);
                return res.json({ basarili: false, hata: "Bankaya ulaşılamadı. Terminal loglarına bakın." });
            }
        }
        // --- B) METROPOL İŞLEMLERİ ---
        else if (odemeTipi === 'metropol') {
            const M_ACCESS_KEY = "4E602A99-50F1-4FAD-96A2-8BD6EA6CD370";
            const M_CONSUMER_ID = "995649";
            const M_USER_NAME = "DIYETIM_GELDI_TEST";
            const M_SALT_KEY = "995649UU995649UU";
            const M_MERCHANT_NO = "0000052983";
            const M_TERMINAL_NO = "0000064998";

            const accessData = { AccessKey: M_ACCESS_KEY, CreateDate: new Date().toISOString() };
            const key = Buffer.from(M_SALT_KEY, 'utf8');
            const iv = Buffer.alloc(16, 0); 
            const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
            let secureAccessData = cipher.update(JSON.stringify(accessData), 'utf8', 'base64');
            secureAccessData += cipher.final('base64');

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

// SUNUCU PORTU 5005
const PORT = 5005;
app.listen(PORT, () => {
    console.log(`🚀 POS Arka Plan Sunucusu (Backend) ${PORT} portunda çalışıyor!`);
});
