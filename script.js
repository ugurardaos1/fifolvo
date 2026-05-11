let users = JSON.parse(localStorage.getItem('fifo_users')) || [];
let currentUser = null;
let isLoginMode = true;
let loginAttempts = 0;
let isLocked = false;
let myChart = null;
let selectedChartType = 'doughnut'; // Varsayılan grafik tipi

// BINLIK AYIRICI (1.250,00 TL)
function formatPara(sayi) {
    if (isNaN(sayi) || sayi === null) return "0,00";
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sayi);
}

// AUTH MANTIĞI
function toggleAuth() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('auth-title');
    const mainBtn = document.getElementById('auth-main-btn');
    const toggleText = document.getElementById('toggle-text');

    if (isLoginMode) {
        title.innerText = "Hoş Geldiniz";
        mainBtn.innerText = "Giriş Yap";
        toggleText.innerHTML = "Hesabınız yok mu? <span>Kayıt Olun</span>";
    } else {
        title.innerText = "Yeni Hesap Aç";
        mainBtn.innerText = "Hesap Oluştur";
        toggleText.innerHTML = "Zaten hesabınız var mı? <span>Giriş Yapın</span>";
    }
}

function handleAuth() {
    if (isLocked) return;
    const u = document.getElementById('auth-user').value.trim();
    const p = document.getElementById('auth-pass').value.trim();
    if (!u || !p) return alert("Lütfen alanları doldurun.");

    if (isLoginMode) {
        const found = users.find(x => x.username === u && x.password === p);
        if (found) { currentUser = found; loginSuccess(); }
        else { 
            loginAttempts++; 
            if (loginAttempts >= 3) lockSystem(); 
            else alert(`Hatalı giriş! Deneme: ${loginAttempts}/3`); 
        }
    } else {
        if (users.find(x => x.username === u)) return alert("Bu isim zaten alınmış.");
        users.push({ username: u, password: p, data: { alimlar: [], satislar: [], giderler: [] } });
        localStorage.setItem('fifo_users', JSON.stringify(users));
        alert("Hesap başarıyla oluşturuldu."); toggleAuth();
    }
}

function loginSuccess() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    if(currentUser.username === "admin") {
        document.getElementById('admin-panel').style.display = 'block';
        updateAdminTable();
    }
    document.getElementById('user-display').innerText = currentUser.username;
    updateUI();
}

// FIFO VE HESAPLAMA
function updateUI() {
    if (!currentUser) return;
    const tbody = document.querySelector('#stok-table tbody');
    tbody.innerHTML = "";

    // Stoklar
    currentUser.data.alimlar.filter(x => x.kalan > 0).forEach(x => {
        tbody.innerHTML += `<tr><td>📦 ${x.urun}</td><td>${x.kalan} Adet</td><td>${formatPara(x.maliyet)} TL</td><td>${x.tarih}</td></tr>`;
    });

    // Giderler
    currentUser.data.giderler.forEach(g => {
        tbody.innerHTML += `<tr style="color:#ef4444"><td>💸 ${g.ad}</td><td>${g.kat}</td><td>${formatPara(g.tutar)} TL</td><td>${g.tarih}</td></tr>`;
    });

    // Finansallar (NaN Hatası Önleme)
    const stokV = currentUser.data.alimlar.reduce((s, x) => s + (x.kalan * x.maliyet), 0) || 0;
    const ciroV = currentUser.data.satislar.reduce((s, x) => s + (x.miktar * x.fiyat * (1+x.kdv)), 0) || 0;
    const brutKar = currentUser.data.satislar.reduce((s, x) => s + (x.miktar * x.fiyat) - x.maliyet, 0) || 0;
    const giderV = currentUser.data.giderler.reduce((s, x) => s + x.tutar, 0) || 0;
    const netKar = brutKar - giderV;

    document.getElementById('stok-val').innerText = formatPara(stokV) + " TL";
    document.getElementById('ciro-val').innerText = formatPara(ciroV) + " TL";
    document.getElementById('kar-val').innerText = formatPara(netKar) + " TL";

    renderChart(brutKar, giderV);
}

function stokEkle() {
    const n = document.getElementById('input-adi').value;
    const m = parseFloat(document.getElementById('input-miktar').value);
    const f = parseFloat(document.getElementById('input-fiyat').value);
    if (!n || isNaN(m)) return alert("Geçerli veri girin.");
    currentUser.data.alimlar.push({ urun: n, miktar: m, kalan: m, maliyet: f, tarih: new Date().toLocaleDateString() });
    saveAndRefresh();
}

function satisYap() {
    const n = document.getElementById('input-adi').value;
    let m = parseFloat(document.getElementById('input-miktar').value);
    const f = parseFloat(document.getElementById('input-fiyat').value);
    const kdv = parseFloat(document.getElementById('kdv-oran').value);
    let stoklar = currentUser.data.alimlar.filter(x => x.urun === n && x.kalan > 0);
    if (stoklar.reduce((s, x) => s + x.kalan, 0) < m) return alert("Yetersiz stok!");
    
    let smm = 0; let mik = m;
    for (let s of currentUser.data.alimlar) {
        if (s.urun === n && s.kalan > 0 && mik > 0) {
            let dus = Math.min(s.kalan, mik);
            smm += dus * s.maliyet;
            s.kalan -= dus; mik -= dus;
        }
    }
    currentUser.data.satislar.push({ urun: n, miktar: m, fiyat: f, kdv, maliyet: smm });
    saveAndRefresh();
}

function giderEkle() {
    const n = document.getElementById('gider-adi').value;
    const t = parseFloat(document.getElementById('gider-tutar').value);
    const k = document.getElementById('gider-kat').value;
    if (!n || isNaN(t)) return alert("Gider bilgilerini girin.");
    currentUser.data.giderler.push({ ad: n, tutar: t, kat: k, tarih: new Date().toLocaleDateString() });
    saveAndRefresh();
}

function saveAndRefresh() {
    const idx = users.findIndex(x => x.username === currentUser.username);
    users[idx] = currentUser;
    localStorage.setItem('fifo_users', JSON.stringify(users));
    updateUI();
}

function renderChart(kar, gider) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Kâr', 'Giderler'],
            datasets: [{ data: [kar < 0 ? 0 : kar, gider], backgroundColor: ['#10b981', '#ef4444'] }]
        },
        options: { maintainAspectRatio: false }
    });
}

async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('main-app');
    const btns = document.querySelectorAll('button');
    btns.forEach(b => b.style.display = 'none');
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save("Smart-FIFO_Rapor.pdf");
    btns.forEach(b => b.style.display = 'inline-block');
}

function logout() { location.reload(); }
function resetData() { if(confirm("Tüm veriler silinsin mi?")) { currentUser.data = { alimlar: [], satislar: [], giderler: [] }; saveAndRefresh(); } }

function importExcel() {
    const fileInput = document.getElementById('excel-file');
    const file = fileInput.files[0];

    if (!file) {
        return alert("Lütfen bir dosya seçin.");
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // İlk sayfayı seç
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // JSON formatına çevir (Başlık satırına göre)
        // Beklenen Excel formatı: Ürün Adı | Miktar | Fiyat
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Başlık satırını atla ve döngüye gir
        let eklenenAdet = 0;
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row.length < 3) continue; // Boş satır kontrolü

            const urunAdi = row[0];
            const miktar = parseFloat(row[1]);
            const maliyet = parseFloat(row[2]);

            if (urunAdi && !isNaN(miktar) && !isNaN(maliyet)) {
                currentUser.data.alimlar.push({
                    urun: urunAdi,
                    miktar: miktar,
                    kalan: miktar,
                    maliyet: maliyet,
                    tarih: new Date().toLocaleDateString()
                });
                eklenenAdet++;
            }
        }

        if (eklenenAdet > 0) {
            saveAndRefresh();
            alert(`${eklenenAdet} adet yeni stok başarıyla içe aktarıldı.`);
            fileInput.value = ""; // Inputu temizle
        } else {
            alert("Uygun veri bulunamadı. Lütfen Excel formatını kontrol edin (Ürün, Miktar, Fiyat).");
        }
    };

    reader.readAsArrayBuffer(file);
}
// updateUI içindeki stok listeleme kısmını bu mantıkla güncelle:
currentUser.data.alimlar.filter(x => x.kalan > 0).forEach(x => {
    // Eğer stok 5'ten azsa 'stock-warning' sınıfını kullan, değilse boş bırak
    const warningClass = x.kalan < 5 ? 'stock-warning' : '';
    
    tbody.innerHTML += `
        <tr class="${warningClass}">
            <td>📦 ${x.urun} ${x.kalan < 5 ? '(KRİTİK!)' : ''}</td>
            <td>${x.kalan} Adet</td>
            <td>${formatPara(x.maliyet)} TL</td>
            <td>${x.tarih}</td>
        </tr>`;
});
// 1. ÜRÜN ARAMA FONKSİYONU
function tablodaAra() {
    const input = document.getElementById("tablo-arama");
    const filter = input.value.toUpperCase();
    const table = document.getElementById("stok-table");
    const tr = table.getElementsByTagName("tr");

    for (let i = 1; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName("td")[0]; // Açıklama sütunu
        if (td) {
            const textValue = td.textContent || td.innerText;
            tr[i].style.display = textValue.toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
}

// 2. YAPAY ZEKA TİCARİ DANIŞMAN FONKSİYONU
function aiAnalizYap() {
    if (!currentUser) return;
    
    const alimlar = currentUser.data.alimlar;
    const satislar = currentUser.data.satislar;
    const giderler = currentUser.data.giderler;
    
    const toplamGider = giderler.reduce((s, x) => s + x.tutar, 0);
    const toplamCiro = satislar.reduce((s, x) => s + (x.miktar * x.fiyat), 0);
    const kritikStoklar = alimlar.filter(x => x.kalan > 0 && x.kalan < 3);
    
    let tavsiye = "";

    // Senaryo tabanlı analizler
    if (toplamGider > toplamCiro * 0.5) {
        tavsiye = "⚠️ Giderleriniz cironuzun %50'sini aşmış durumda. Operasyonel maliyetleri gözden geçirmelisiniz.";
    } else if (kritikStoklar.length > 0) {
        tavsiye = `📉 ${kritikStoklar[0].urun} dahil olmak üzere bazı ürünlerin stoğu bitmek üzere. Tedarik planı yapın!`;
    } else if (toplamCiro > 0 && toplamGider < toplamCiro * 0.1) {
        tavsiye = "🚀 Harika gidiyorsunuz! Gider oranınız çok düşük, reklam vererek büyümeyi deneyebilirsiniz.";
    } else {
        tavsiye = "✅ İşletmeniz şu an dengeli görünüyor. Nakit akışınızı takip etmeye devam edin.";
    }

    document.getElementById('ai-suggestion').innerText = tavsiye;
}
// updateUI fonksiyonunu şu şekilde güncelleyin:
function updateUI() {
    if (!currentUser) return;
    
    // 1. Stok Listesi (Mevcut olan)
    const tbodyStok = document.querySelector('#stok-table tbody');
    tbodyStok.innerHTML = "";
    currentUser.data.alimlar.filter(x => x.kalan > 0).forEach(x => {
        const warningClass = x.kalan < 5 ? 'stock-warning' : '';
        tbodyStok.innerHTML += `
            <tr class="${warningClass}">
                <td>📦 ${x.urun} ${x.kalan < 5 ? '(KRİTİK!)' : ''}</td>
                <td>${x.kalan} Adet</td>
                <td>${formatPara(x.maliyet)} TL</td>
                <td>${x.tarih}</td>
            </tr>`;
    });

    // 2. Satılan Stoklar Listesi (Yeni eklenen)
    const tbodySatis = document.querySelector('#satis-table tbody');
    tbodySatis.innerHTML = "";
    currentUser.data.satislar.forEach(s => {
        const toplamCiro = s.miktar * s.fiyat * (1 + s.kdv);
        const kar = (s.miktar * s.fiyat) - s.maliyet;
        
        tbodySatis.innerHTML += `
            <tr>
                <td>🏷️ ${s.urun}</td>
                <td>${s.miktar} Adet</td>
                <td>${formatPara(s.fiyat)} TL</td>
                <td>${formatPara(toplamCiro)} TL</td>
                <td style="color: ${kar >= 0 ? '#10b981' : '#ef4444'}">
                    ${kar >= 0 ? '+' : ''}${formatPara(kar)} TL
                </td>
            </tr>`;
    });

    // 3. Finansal Kartlar (Mevcut olan)
    const stokV = currentUser.data.alimlar.reduce((s, x) => s + (x.kalan * x.maliyet), 0) || 0;
    const ciroV = currentUser.data.satislar.reduce((s, x) => s + (x.miktar * x.fiyat * (1+x.kdv)), 0) || 0;
    const brutKar = currentUser.data.satislar.reduce((s, x) => s + (x.miktar * s.fiyat) - x.maliyet, 0) || 0;
    const giderV = currentUser.data.giderler.reduce((s, x) => s + x.tutar, 0) || 0;
    const netKar = brutKar - giderV;

    document.getElementById('stok-val').innerText = formatPara(stokV) + " TL";
    document.getElementById('ciro-val').innerText = formatPara(ciroV) + " TL";
    document.getElementById('kar-val').innerText = formatPara(netKar) + " TL";
    
    renderChart(brutKar, giderV);
}

// Piyasa Ekranı Geçiş Fonksiyonu
function toggleMarketView() {
    const dash = document.querySelector('.main-grid');
    const market = document.getElementById('market-section');
    
    if (market.style.display === 'none') {
        dash.style.display = 'none';
        market.style.display = 'block';
    } else {
        dash.style.display = 'grid';
        market.style.display = 'none';
    }
}
/**
 * Kullanıcı yazdıkça binlik ayırıcı ekleyen ve görsel geri bildirim veren fonksiyon
 */
function formatliGiris(input) {
    // Sadece rakamları al
    let deger = input.value.replace(/\D/g, "");
    
    // Sayıya çevir (Boşsa 0 kabul et)
    let sayisalDeger = parseFloat(deger) || 0;
    
    // Ekranda binlik ayırıcı ile göster (1.250 gibi)
    input.value = sayisalDeger.toLocaleString('tr-TR');
    
    // Alt taraftaki küçük önizleme metnini güncelle
    const onizleme = document.getElementById('fiyat-onizleme');
    onizleme.innerText = formatPara(sayisalDeger) + " TL";
}

/**
 * Mevcut stokEkle ve satisYap fonksiyonlarında fiyatı okurken 
 * noktaları temizlememiz gerekir çünkü JS noktayı ondalık sanabilir.
 */
function temizFiyatGetir() {
    const hamDeger = document.getElementById('input-fiyat').value;
    // Noktaları temizle ve sayıya çevir
    return parseFloat(hamDeger.replace(/\./g, "")) || 0;
}
function setChartType(type) {
    selectedChartType = type;
    // Buton görünümlerini güncelle
    document.getElementById('btn-doughnut').classList.toggle('active', type === 'doughnut');
    document.getElementById('btn-line').classList.toggle('active', type === 'line');
    // UI'yı yenileyerek grafiği tekrar çiz
    updateUI();
}