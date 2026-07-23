// --- A) VAKIFBANK İŞLEMLERİ ---
        if (odemeTipi === 'vakifbank' || odemeTipi === 'kredi_karti') {
            
            const basariliUrl = "http://localhost:5005/api/odeme-sonuc/basarili";
            const basarisizUrl = "http://localhost:5005/api/odeme-sonuc/basarisiz";

            // 1. Verileri URLSearchParams ile form-urlencoded formatına çeviriyoruz (WAF'ı aşmak için)
            const formData = new URLSearchParams();
            formData.append('MerchantId', MERCHANT_ID);
            
            // DİKKAT: Eski Hash yerine doğrudan panelden (Üye İşyeri Yetkileri) alınan şifre
            formData.append('MerchantPassword', "SANA_VERILEN_API_SIFRESI"); 
            
            formData.append('TerminalNo', TERMINAL_ID);
            formData.append('Pan', kartNo);
            
            // Tarih formatı kesinlikle YYMM (veya YYAA) olmalı
            formData.append('ExpiryDate', sonKullanma); 
            
            // Tutar noktasız formatta olmalı
            formData.append('PurchaseAmount', tutar); 
            
            formData.append('Currency', '949');
            formData.append('BrandName', '100');
            formData.append('VerifyEnrollmentRequestId', siparisNo);
            formData.append('SuccessUrl', basariliUrl);
            formData.append('FailureUrl', basarisizUrl);

            // 2. Doğrudan API Gateway adresine form verisi olarak gönderiyoruz
            const vakifResponse = await axios.post(POS_URL, formData.toString(), {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            // 3. Bankadan dönen XML yanıtından PaReq verisini alıp Base64 şifresini çözüyoruz
            const xmlVerisi = vakifResponse.data;
            const paReqEslenme = xmlVerisi.match(/<PaReq>(.*?)<\/PaReq>/);

            if (paReqEslenme && paReqEslenme[1]) {
                const sifreliPaReq = paReqEslenme[1];
                const smsEkraniHtml = Buffer.from(sifreliPaReq, 'base64').toString('utf-8');
                return res.json({ basarili: true, html: smsEkraniHtml });
            } else {
                console.error("Vakıfbank Red Yanıtı:", xmlVerisi); 
                return res.json({ basarili: false, hata: "Bankadan onay SMS ekranı alınamadı. Lütfen geçerli bir kredi kartı girin." });
            }
        }