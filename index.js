const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto'); 
const edenredHafiza = {};


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
// ⚙️ VAKIFBANK AYARLARI
// =========================================================
const VAKIFBANK_API_URL = "https://inbound.apigateway.vakifbank.com.tr:8443/threeDGateway/ProcessEnrollment";
const MERCHANT_ID = "000000056817349";
const TERMINAL_ID = "V3805394";
const MERCHANT_PASSWORD = "Ep6o1RKs";

const BASARILI_URL = "https://dgfinal.onrender.com/api/odeme-sonuc/basarili";
const BASARISIZ_URL = "https://dgfinal.onrender.com/api/odeme-sonuc/basarisiz";

// =========================================================
// ⚙️ METROPOL AYARLARI
// =========================================================
const M_ACCESS_KEY = "4E602A99-50F1-4FAD-96A2-8BD6EA6CD370";
const M_CONSUMER_ID = "995649";
const M_USER_NAME = "DIYETIM_GELDI_TEST";
const M_SALT_KEY = "995649UU995649UU";
const M_MERCHANT_NO = "0000052983";
const M_TERMINAL_NO = "0000064998";

// =========================================================
// ⚙️ EDENRED (TICKET) AYARLARI (Dokümandaki Test Bilgileri)
// =========================================================
const E_API_URL = "https://vpos-api-test.edenred.com.tr/api/Sales"; // Test URL
const E_MERCHANT_NO = 17;
const E_TERMINAL_NO = 300051;
const E_PASSWORD = "WCE6nGxCKdxtCR(";
const E_HASH_KEY = "DsM2KhGcyY2H39rCs4A)(mmjVHiNFCXFV?7g8vuRx?y[Kti)8]";

// Edenred Özel Şifreleme (Hash) Fonksiyonu
const generateEdenredHash = (hashData) => {
    return crypto.createHash('sha256').update(hashData, 'utf8').digest('hex');
};

// =========================================================
// 💳 1. ADIM: ÖDEME BAŞLATMA UÇ NOKTASI (SANTRAL)
// =========================================================
app.post('/api/odeme-baslat', async (req, res) => {
    try {
        const { siparisNo, tutar, kartNo, sonKullanma, cvv, odemeTipi } = req.body;

        // -----------------------------------------------------
        // A) VAKIFBANK İŞLEMLERİ (DOKUNULMADI)
        // -----------------------------------------------------
        if (odemeTipi === 'vakifbank' || odemeTipi === 'kredi_karti') {
            const kurusTutar = Math.round(Number(tutar) * 100).toString();
            const temizTarih = sonKullanma.replace(/[^0-9]/g, '');
            const vakifTarihi = temizTarih.substring(2, 4) + temizTarih.substring(0, 2);

            const payload = {
                MerchantId: MERCHANT_ID,
                MerchantPassword: MERCHANT_PASSWORD,
                TerminalNo: TERMINAL_ID,
                Pan: kartNo.replace(/\s+/g, ''),
                ExpiryDate: vakifTarihi,
                PurchaseAmount: kurusTutar,
                Currency: "949",
                BrandName: "100",
                VerifyEnrollmentRequestId: siparisNo,
                SuccessUrl: BASARILI_URL,
                FailureUrl: BASARISIZ_URL
            };

            try {
                const bankaYaniti = await axios.post(VAKIFBANK_API_URL, payload, {
                    headers: { 
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                const data = bankaYaniti.data;
                const sonuc = data.ProcessEnrollmentResult || data;
                const paReq = sonuc.Pareq || sonuc.PaReq || sonuc.PAREQ;

                if (paReq) {
                    const smsHtml = Buffer.from(paReq, 'base64').toString('utf-8');
                    return res.json({ basarili: true, html: smsHtml });
                } else {
                    return res.json({ basarili: false, hata: "Kart bilgileri hatalı veya banka reddetti." });
                }

            } catch (bankaHatasi) {
                if (typeof bankaHatasi.response?.data === 'string' && bankaHatasi.response.data.includes('Request Rejected')) {
                    return res.json({ basarili: false, hata: "Sunucu IP adresi banka tarafından engellendi (WAF)." });
                }
                return res.json({ basarili: false, hata: "Bankaya ulaşılamadı." });
            }
        }
        
        // -----------------------------------------------------
        // B) METROPOL İŞLEMLERİ (DOKUNULMADI)
        // -----------------------------------------------------
        else if (odemeTipi === 'metropol') {
            console.log("🚀 Metropol ödemesi başlatılıyor...");
            try {
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
                console.log("✅ Metropol Token Alındı!");

                const otpPayload = {
                    MerchantCode: M_MERCHANT_NO,
                    TerminalCode: M_TERMINAL_NO,
                    UserRefNo: kartNo.replace(/\s+/g, ''),
                    UserRefType: "1",
                    TransactionAmount: Number(tutar) 
                };

                const otpResponse = await axios.post("http://testapi.metropolcard.com/vpos/v3/sale/sendotp", otpPayload, {
                    headers: { 'Authorization': `Bearer ${metropolToken}`, 'Content-Type': 'application/json' }
                });

                if (otpResponse.data.ResponseCode === 0) {
                    console.log("✅ Metropol SMS Gönderildi!");
                    return res.json({ basarili: true, otpGerekiyor: true, otpRefCode: otpResponse.data.OtpRefCode, metropolToken: metropolToken });
                } else {
                    return res.json({ basarili: false, hata: "Metropol Red: " + otpResponse.data.ResponseMessage });
                }
            } catch (metropolHatasi) {
                return res.json({ basarili: false, hata: "Metropol sunucusuna ulaşılamadı." });
            }
        }

        // -----------------------------------------------------
        // C) EDENRED (TICKET) İŞLEMLERİ
        // -----------------------------------------------------
        else if (odemeTipi === 'ticket' || odemeTipi === 'edenred') {
            console.log("🚀 Edenred (Ticket) ödemesi başlatılıyor...");
            
            try {
                const kurusTutar = Math.round(Number(tutar) * 100); // 10.25 TL -> 1025
                const refId = Date.now(); // Edenred Int64 benzersiz numara istiyor
                const temizKart = Number(kartNo.replace(/\s+/g, ''));

                // 1. Edenred Güvenlik Hash'i Oluşturma (Dokümandaki sıra)
                const hashData = `${E_MERCHANT_NO}${E_TERMINAL_NO}${E_PASSWORD}${refId}${refId}1000${kurusTutar}${E_HASH_KEY}`;
                const hashSifre = generateEdenredHash(hashData);

                // 2. Api Üzerinden Satış İsteği (Perform)
                const payload = {
                    MerchantNo: E_MERCHANT_NO,
                    TerminalNo: E_TERMINAL_NO,
                    Password: E_PASSWORD,
                    SalesReferenceId: refId,
                    ReferenceId: refId,
                    ServiceId: 1000, // Ticket Restaurant Kodu
                    TransactionAmount: kurusTutar,
                    CardNo: temizKart,
                    UserAccountId: "",
                    CardToken: "",
                    Hash: hashSifre
                };

                const response = await axios.post(`${E_API_URL}/Perform`, payload, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const data = response.data;
                console.log("Edenred Satış Yanıtı:", data);

                // Status 0: OTP Doğrulaması Gerekiyor
                // Status 0: OTP Doğrulaması Gerekiyor
                if (data.Success && data.Status === 0) {
                    console.log("✅ Edenred SMS Talebi Başarılı!");
                    
                    // 🎯 HARİKA HAMLE: ID'leri React'i yormadan backend'de sipariş numarasıyla hafızaya alıyoruz
                    edenredHafiza[siparisNo] = {
                        id: data.Id,
                        refId: refId
                    };

                    return res.json({ 
                        basarili: true, 
                        otpGerekiyor: true 
                    });
                }
                // Status 1: OTP'siz Doğrudan Çekim Başarılı
                else if (data.Success && data.Status === 1) {
                    console.log("✅ Edenred Ödemesi Başarıyla Çekildi (OTP'siz)!");
                    return res.json({ basarili: true, mesaj: "Ödeme anında tamamlandı." });
                } 
                else {
                    return res.json({ basarili: false, hata: "Edenred Red: " + (data.Message || "İşlem onaylanmadı.") });
                }

            } catch (edenredHatasi) {
                console.error("Edenred Bağlantı Hatası:", edenredHatasi.message);
                return res.json({ basarili: false, hata: "Edenred sunucusuna ulaşılamadı." });
            }
        }
        
        else {
            return res.json({ basarili: false, hata: "Geçersiz ödeme yöntemi." });
        }

    } catch (sunucuHatasi) {
        console.error("Santral Hatası:", sunucuHatasi);
        res.status(500).json({ basarili: false, hata: "Sunucu hatası oluştu." });
    }
});

// =========================================================
// 📱 2. ADIM: SMS ONAYLAMA UÇ NOKTALARI
// =========================================================

// ---> METROPOL ONAY
app.post('/api/metropol-onay', async (req, res) => {
    try {
        const { otpKodu, otpRefCode, metropolToken, siparisNo, tutar, kartNo } = req.body;
        const payload = {
            MerchantCode: M_MERCHANT_NO,
            TerminalCode: M_TERMINAL_NO,
            UserRefNo: kartNo.replace(/\s+/g, ''),
            UserRefType: "1",
            ProductId: 1, 
            TransactionAmount: Number(tutar),
            SaleRefCode: siparisNo,
            OtpRefCode: otpRefCode,
            Otp: otpKodu,
            Description: JSON.stringify({ Info1: "Siparis", Info2: siparisNo })
        };

        const response = await axios.post("http://testapi.metropolcard.com/vpos/v3/sale/salewithotp", payload, {
            headers: { 'Authorization': `Bearer ${metropolToken}`, 'Content-Type': 'application/json' }
        });

        if (response.data.ResponseCode === 0) {
            res.json({ basarili: true, mesaj: "Ödeme tamamlandı." });
        } else {
            res.json({ basarili: false, hata: response.data.ResponseMessage });
        }
    } catch (error) {
        res.status(500).json({ basarili: false, hata: "Onay işlemi başarısız." });
    }
});

// ---> EDENRED (TICKET) ONAY
// ---> EDENRED (TICKET) ONAY
app.post('/api/ticket-onay', async (req, res) => {
    try {
        // React'ten gelen temel bilgiler
        const { otpKodu, siparisNo } = req.body;

        // Backend hafızasından o siparişe ait Edenred ID'lerini çekiyoruz
        const sakliBilgiler = edenredHafiza[siparisNo];

        if (!sakliBilgiler) {
            return res.json({ basarili: false, hata: "Sipariş hafızada bulunamadı, işlemi baştan başlatın." });
        }

        const payload = {
            MerchantNo: E_MERCHANT_NO,
            TerminalNo: E_TERMINAL_NO,
            Password: E_PASSWORD,
            Id: sakliBilgiler.id,
            SalesReferenceId: sakliBilgiler.refId,
            ReferenceId: sakliBilgiler.refId,
            OtpVerifyCode: otpKodu
        };

        const response = await axios.post(`${E_API_URL}/OtpVerify`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const data = response.data;
        console.log("Edenred Onay Yanıtı:", data);

        // Status 1: Başarılı
        if (data.Success && data.Status === 1) {
            console.log("✅ Edenred Ödemesi (SMS ile) Başarıyla Çekildi!");
            // İşlem bitince hafızayı temizle
            delete edenredHafiza[siparisNo];
            res.json({ basarili: true, mesaj: "Ödeme tamamlandı." });
        } else {
            res.json({ basarili: false, hata: "Edenred Hata: " + (data.Message || "Doğrulama başarısız.") });
        }

    } catch (error) {
        console.error("Edenred Onay Hatası:", error.message);
        res.status(500).json({ basarili: false, hata: "Onay işlemi başarısız." });
    }
});
// =========================================================
// 🎯 3. ADIM: VAKIFBANK DÖNÜŞLERİNİ KARŞILAMA
// =========================================================
app.post('/api/odeme-sonuc/basarili', (req, res) => {
    res.send("<h1>ÖDEME BAŞARILI!</h1><script>setTimeout(() => window.location.href='/', 3000)</script>");
});

app.post('/api/odeme-sonuc/basarisiz', (req, res) => {
    res.send("<h1>ÖDEME BAŞARISIZ!</h1><script>setTimeout(() => window.location.href='/', 3000)</script>");
});

// Sunucuyu Başlat
const PORT = 5005;
app.listen(PORT, () => {
    console.log(`🚀 Yeni ve Temiz Ödeme Santrali ${PORT} portunda aktif!`);
});
