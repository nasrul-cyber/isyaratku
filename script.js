/* =========================================================
   SIGNREAD / ISYARATKU - FULL JAVASCRIPT (LOCALSTORAGE + AI + UI + VIDEO KAMUS)
   VERSI GITHUB PAGES: TANPA DATABASE PHP & MYSQL
========================================================= */

/* --- 1. STATE & GLOBAL VARIABLES --- */
let currentUser = null;
let currentWord = ""; // Kunci agar tombol Spasi, Hapus, Salin, TTS bekerja!
let isDarkMode = localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

// MediaPipe States
const videoElement = document.getElementById('input_video'); 
const canvasElement = document.getElementById('output_canvas'); 
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
let camera = null; 
let isCameraRunning = false; 
let hands = null; 
let isProcessing = false;
let holdChar = ""; 
let holdCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    if(isDarkMode) document.documentElement.classList.add('dark');
    checkSession();
});

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    document.getElementById('toastIcon').className = isError ? "fa-solid fa-triangle-exclamation text-red-400" : "fa-solid fa-check-circle text-green-400";
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
}

/* --- 2. LOCALSTORAGE AUTH & SIMULASI BACKEND (MENGGANTIKAN PHP) --- */
function checkSession() {
    // Membaca session aktif dari localStorage
    const sessionUser = localStorage.getItem('currentUser');
    if (sessionUser) {
        currentUser = JSON.parse(sessionUser);
        showApp();
    } else {
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('authView').classList.remove('hidden');
    }
}

function toggleAuth(type) {
    document.getElementById('loginFormContainer').classList.toggle('hidden', type === 'register');
    document.getElementById('registerFormContainer').classList.toggle('hidden', type !== 'register');
}

function handleRegister(e) {
    e.preventDefault();
    const nama = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const p1 = document.getElementById('regPass').value;
    const p2 = document.getElementById('regPassConf').value;

    if (p1 !== p2) return showToast("Password tidak cocok!", true);

    // Mengambil list semua users yang terdaftar di browser ini
    let users = JSON.parse(localStorage.getItem('users')) || [];
    
    // Validasi duplikasi akun
    const isExist = users.some(u => u.email === email || u.username === username);
    if (isExist) {
        return showToast("Email atau Username sudah terdaftar!", true);
    }

    const foto = "https://api.dicebear.com/7.x/avataaars/svg?seed=" + encodeURIComponent(username);
    const newUser = { id: Date.now(), nama_lengkap: nama, email, username, password: p1, foto_profil: foto };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    showToast("Registrasi berhasil!");
    toggleAuth('login');
    document.getElementById('registerForm').reset();
}

function handleLogin(e) {
    e.preventDefault();
    const loginId = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPassword').value;

    let users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => (u.email === loginId || u.username === loginId) && u.password === password);

    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        showApp();
    } else {
        showToast("Email/Username atau Password salah!", true);
    }
}

function handleUpdateProfile(e) {
    e.preventDefault();
    const nama = document.getElementById('editName').value.trim();
    const email = document.getElementById('editEmail').value.trim();

    currentUser.nama_lengkap = nama;
    currentUser.email = email;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    // Perbarui juga datanya di list master users
    let users = JSON.parse(localStorage.getItem('users')) || [];
    users = users.map(u => u.id === currentUser.id ? { ...u, nama_lengkap: nama, email: email } : u);
    localStorage.setItem('users', JSON.stringify(users));

    showToast("Profil Berhasil Diperbarui!");
    
    // Refresh display nama di header dan dashboard
    document.getElementById('headerName').textContent = nama;
    document.getElementById('dashName').textContent = nama.split(' ')[0];
}

function logout() {
    localStorage.removeItem('currentUser');
    if(isCameraRunning) stopMediaPipe();
    location.reload();
}

function loadHistory() {
    const tbody = document.getElementById('historyTableBody'); 
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4">Memuat data...</td></tr>`;
    
    // Ambil data semua riwayat dari localStorage
    let historyData = JSON.parse(localStorage.getItem('appHistory')) || [];
    // Filter khusus riwayat milik user yang sedang login saat ini
    let userHistory = historyData.filter(h => h.user_id === currentUser.id);
    
    tbody.innerHTML = "";
    if(userHistory.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-500 font-medium">Belum ada riwayat aktivitas.</td></tr>`; return; 
    }
    
    // Urutkan dari data riwayat yang paling baru (paling atas)
    [...userHistory].reverse().forEach((r) => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-800 transition border-b border-gray-100 dark:border-slate-700">
                <td class="p-5 whitespace-nowrap text-gray-600 dark:text-gray-400 font-medium">${r.created_at}</td>
                <td class="p-5"><span class="font-bold text-primary dark:text-blue-400 text-base">${r.tipe}</span><br><span class="text-sm text-gray-600 dark:text-gray-300 mt-1 block">${r.keterangan}</span></td>
                <td class="p-5 text-right"><span class="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Tersimpan Lokal</span></td>
            </tr>`;
    });
}

function saveWordToUserHistory() {
    if(!currentWord) return; 
    
    let historyData = JSON.parse(localStorage.getItem('appHistory')) || [];
    const sekarang = new Date();
    const formatWaktu = sekarang.getFullYear() + "-" + 
                        String(sekarang.getMonth() + 1).padStart(2, '0') + "-" + 
                        String(sekarang.getDate()).padStart(2, '0') + " " + 
                        String(sekarang.getHours()).padStart(2, '0') + ":" + 
                        String(sekarang.getMinutes()).padStart(2, '0') + ":" + 
                        String(sekarang.getSeconds()).padStart(2, '0');
    
    historyData.push({
        user_id: currentUser.id,
        tipe: "Terjemahan AI",
        keterangan: currentWord,
        created_at: formatWaktu
    });
    
    localStorage.setItem('appHistory', JSON.stringify(historyData));
    
    showToast("Tersimpan di riwayat lokal!"); 
    currentWord = ""; document.getElementById('constructedWord').textContent = ""; 
    loadHistory();
}

/* --- 3. NAVIGATION & UI --- */
function showApp() {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('headerName').textContent = currentUser.nama_lengkap;
    document.getElementById('dashName').textContent = currentUser.nama_lengkap.split(' ')[0];
    
    // Set value awal di form edit profil
    if(document.getElementById('editName')) document.getElementById('editName').value = currentUser.nama_lengkap;
    if(document.getElementById('editEmail')) document.getElementById('editEmail').value = currentUser.email;
    
    const avatar = currentUser.foto_profil || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`;
    document.getElementById('headerAvatar').src = avatar;
    
    navigate('dashboard'); 
    renderKamus(); 
    loadHistory();
}

function navigate(pageId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${pageId}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-link').forEach(el => {
        el.className = "nav-link block px-5 py-3.5 rounded-r-full text-sm transition-colors nav-item-inactive";
    });
    
    const active = document.querySelector(`.nav-link[data-target="${pageId}"]`);
    if(active) active.className = "nav-link block px-5 py-3.5 rounded-r-full text-sm transition-colors nav-item-active";
    
    if(pageId !== 'translator' && isCameraRunning) stopMediaPipe();
    if(pageId === 'history') loadHistory();
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode; 
    document.documentElement.classList.toggle('dark'); 
    localStorage.theme = isDarkMode ? 'dark' : 'light';
}

/* --- 4. KAMUS SIBI --- */
const hurufSIBI = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function renderKamus() {
    const grid = document.getElementById('kamusGrid'); 
    if(!grid) return;
    grid.innerHTML = "";
    
    hurufSIBI.forEach(h => {
        const imgSrc = `asset/img/${h.toLowerCase()}.png`;
        grid.innerHTML += `
            <div onclick="openKamusDetail('${h}')" class="bg-white dark:bg-darkcard rounded-3xl p-6 text-center shadow-sm border border-gray-100 dark:border-slate-700 card-hover cursor-pointer flex flex-col items-center">
                <div class="w-32 h-32 mb-6 flex items-center justify-center bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-gray-100 dark:border-slate-600">
                    <img src="${imgSrc}" alt="Huruf ${h}" class="w-full h-full object-contain drop-shadow-md transition-transform duration-300 hover:scale-110">
                </div>
                <h4 class="font-black text-2xl text-primary dark:text-blue-400">Huruf ${h}</h4>
            </div>`;
    });
}

function filterKamus() {
    const val = document.getElementById('searchKamus').value.toUpperCase();
    document.querySelectorAll('#kamusGrid > div').forEach(el => { 
        el.style.display = el.textContent.includes(val) ? "flex" : "none"; 
    });
}

function openKamusDetail(h) {
    document.getElementById('detailLetter').textContent = h;
    
    let videoSrc = `asset/video/${h.toLowerCase()}.mp4`;
    const cacheBuster = new Date().getTime();
    const finalVideoPath = `${videoSrc}?v=${cacheBuster}`;
    
    document.getElementById('detailGraphic').innerHTML = `
        <video width="100%" height="100%" autoplay loop muted controls class="w-full h-full object-contain rounded-2xl">
            <source src="${finalVideoPath}" type="video/mp4">
            Maaf, browser Anda tidak mendukung pemutaran video ini.
        </video>
    `;
    
    const desc = {
        'A': 'Kepalan tangan dengan keempat jari melipat rapat ke bawah, sedangkan ibu jari ditegakkan lurus ke atas sejajar di sisi samping ruas jari telunjuk.',
        'B': 'Keempat jari (telunjuk, tengah, manis, kelingking) ditegakkan lurus merapat ke atas secara penuh, sedangkan ibu jari dilipat horizontal di depan telapak tangan.',
        'C': 'Keempat jari merapat and dilengkungkan ke depan, bersamaan dengan ibu jari yang juga melengkung ke atas membentuk setengah rongga lingkaran penuh menyerupai huruf C terbuka.',
        'D': 'Jari telunjuk ditegakkan lurus vertikal ke atas, sementara ibu jari melengkung menyentuh ujung jari tengah, manis, dan kelingking yang ditekuk melingkar ke bawah membentuk rongga/bulatan.',
        'E': 'Semua jari ditekuk rapat (melengkung menyerupai cakar pendek) menempel ketat di atas telapak tangan, bersamaan dengan ibu jari yang dilipat melintang di bagian depan.',
        'F': 'Ujung jari telunjuk ditekuk menyentuh ujung ibu jari membentuk lingkaran (O-ring kecil), sementara jari tengah, manis, dan kelingking ditegakkan lurus ke atas merenggang lebar.',
        'G': 'Jari telunjuk menunjuk lurus secara horizontal ke arah samping luar, dengan ibu jari sejajar lurus di bawahnya, sementara tiga jari lainnya ditekuk rapat ke dalam telapak.',
        'H': 'Jari telunjuk dan jari tengah diluruskan rapat bersamaan ke arah samping secara horizontal, ibu jari ditekuk di bawahnya, sedangkan jari manis dan kelingking ditekuk rapat di dalam telapak.',
        'I': 'Kepalan tangan tertutup rapat menghadap depan, dengan hanya jari kelingking yang ditegakkan lurus vertikal ke atas.',
        'J': 'Jari kelingking diacungkan lurus ke atas menghadap depan, lalu digerakkan melengkung di udara ke bawah dan ke atas membentuk pola huruf J (seperti gerakan mengait).',
        'K': 'Jari telunjuk dan jari tengah ditegakkan lurus ke atas membentuk huruf V terbuka lebar, sementara ujung ibu jari ditegakkan lurus menyentuh bagian tengah ruas pertama jari tengah.',
        'L': 'Jari telunjuk ditegakkan lurus tegak ke atas, sementara ibu jari direntangkan lurus horizontal ke arah samping luar membentuk sudut siku-siku (90 derajat) menyerupai huruf L.',
        'M': 'Ibu jari dilipat masuk ke dalam sela-sela dan diselipkan di bawah tiga ditekuk rapat (telunjuk, tengah, manis), sementara ujung kelingking ditekuk di samping luar ibu jari.',
        'N': 'Ibu jari diselipkan masuk ke bawah dua jari pertama yang ditekuk rapat (telunjuk dan tengah), sedangkan jari manis dan kelingking ditekuk rapat di samping luar ibu jari.',
        'O': 'Semua jari dilengkungkan ke depan dengan ujung telunjuk, tengah, manis, kelingking merapat saling menyentuh ujung ibu jari membentuk lingkaran bulat menyerupai huruf O.',
        'P': 'Tangan dihadapkan ke bawah secara miring, jari telunjuk dan tengah diluruskan ke bawah membentuk huruf V terbalik, sedangkan ibu jari diselipkan tegak di sela-selanya.',
        'Q': 'Tangan dihadapkan ke arah bawah, dengan jari telunjuk dan ibu jari ditekuk setengah melengkung menunjuk ke bawah membentuk gerakan seperti capit menjepit ke arah bawah.',
        'R': 'Jari telunjuk dan jari tengah ditegakkan lurus ke atas dengan posisi saling disilangkan secara ketat (jari telunjuk berada di bagian belakang jari tengah).',
        'S': 'Kepalan tangan tertutup penuh (fist), dengan ibu jari dilipat menyilang horizontal di bagian luar menutupi ruas-ruas jari depan (telunjuk, tengah, manis, kelingking).',
        'T': 'Kepalan tangan tertutup, ibu jari diselipkan masuk ke atas HANYA di bawah lekukan ruas jari telunjuk, sementara jari tengah, manis, dan kelingking mengepal rapat.',
        'U': 'Jari telunjuk dan jari tengah ditegakkan lurus merapat bersamaan ke atas, sementara jari manis, kelingking, dan ibu jari ditekuk rapat menempel di dalam telapak tangan.',
        'V': 'Jari telunjuk dan jari tengah ditegakkan lurus ke atas dengan posisi terbuka lebar membentuk huruf V, sedangkan jari manis, kelingking, dan ibu jari ditekuk mengepal rapat.',
        'W': 'Jari telunjuk, tengah, dan manis ditegakkan lurus merenggang ke atas membentuk huruf W, sedangkan ujung jari kelingking ditekuk rapat di dalam telapak ditahan oleh ibu jari.',
        'X': 'Kepalan tangan tertutup, hanya jari telunjuk yang ditegakkan lalu ditekuk setengah bagian persendiannya membengkok menyerupai bentuk pengait/kait pancing.',
        'Y': 'Ibu jari dan jari kelingking direntangkan lurus mekar ke arah samping luar (gestur telepon), sementara jari telunjuk, tengah, dan manis ditekuk rapat menempel telapak.',
        'Z': 'Jari telunjuk ditegakkan lurus ke atas, lalu digerakkan secara dinamis di udara mengikuti alur garis menulis huruf Z (dari kiri ke kanan, diagonal ke kiri bawah, lalu ke kanan).'
    };
    
    document.getElementById('detailDesc').textContent = desc[h] || "Perhatikan letak jari dan gerakan tangan pada video peragaan ini.";
    document.getElementById('kamusDetailModal').classList.remove('hidden');
}

/* --- 5. LOGIKA LATIHAN GURU (KUIS) --- */
let quizQuestions = [], currentQ = 0, score = 0, timer, timeLeft;

function startQuiz(levelName, count, timeLimit) {
    document.getElementById('quizSetup').classList.add('hidden'); 
    document.getElementById('quizArea').classList.remove('hidden'); 
    document.getElementById('quizLevelBadge').textContent = levelName;
    
    quizQuestions = [];
    for(let i=0; i<count; i++) {
        let ans = hurufSIBI[Math.floor(Math.random()*26)];
        let opts = [ans];
        while(opts.length < 4) { 
            let r = hurufSIBI[Math.floor(Math.random()*26)]; 
            if(!opts.includes(r)) opts.push(r); 
        }
        opts.sort(() => Math.random() - 0.5); 
        quizQuestions.push({ ans: ans, options: opts, time: timeLimit });
    }
    currentQ = 0; score = 0; loadQuestion();
}

function loadQuestion() {
    if(currentQ >= quizQuestions.length) return endQuiz();
    const q = quizQuestions[currentQ];
    document.getElementById('quizProgress').textContent = `Soal ${currentQ+1} / ${quizQuestions.length}`;
    
    const imgSrc = `asset/img/${q.ans.toLowerCase()}.png`;
    document.getElementById('quizGraphicContainer').innerHTML = `<img src="${imgSrc}" alt="Tebak Isyarat" class="w-full h-full object-contain drop-shadow-lg">`;
    
    const optDiv = document.getElementById('quizOptions'); optDiv.innerHTML = "";
    q.options.forEach(opt => { 
        optDiv.innerHTML += `<button onclick="answerQuiz('${opt}')" class="p-6 rounded-2xl border-2 border-gray-200 hover:border-primary hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700 font-black text-3xl transition shadow-sm text-gray-800 dark:text-white">${opt}</button>`; 
    });
    
    timeLeft = q.time; 
    document.getElementById('quizTimer').innerHTML = `<i class="fa-solid fa-clock"></i> ${timeLeft}s`;
    
    clearInterval(timer);
    if(timeLeft < 999) { 
        timer = setInterval(() => { 
            timeLeft--; 
            document.getElementById('quizTimer').innerHTML = `<i class="fa-solid fa-clock"></i> ${timeLeft}s`; 
            if(timeLeft <= 0) { clearInterval(timer); answerQuiz(''); } 
        }, 1000);
    } else { 
        document.getElementById('quizTimer').innerHTML = `<i class="fa-solid fa-infinity"></i> Santai`; 
    }
}

function answerQuiz(selected) { 
    clearInterval(timer); 
    if(selected === quizQuestions[currentQ].ans) score += (100 / quizQuestions.length); 
    currentQ++; 
    loadQuestion(); 
}

function endQuiz() {
    document.getElementById('quizArea').classList.add('hidden'); 
    document.getElementById('quizResult').classList.remove('hidden'); 
    document.getElementById('quizScoreDisplay').textContent = Math.round(score);
    
    let feedback = score === 100 ? "Sempurna! Anda menguasai SIBI dengan sangat baik." : (score >= 80 ? "Luar biasa! Tingkat akurasi Anda sangat tinggi." : "Terus berlatih untuk meningkatkan akurasi komunikasi Anda!");
    document.getElementById('quizFeedback').textContent = feedback;
    
    const level = document.getElementById('quizLevelBadge').textContent;
    
    // Simpan Riwayat Kuis Latihan ke localStorage
    let historyData = JSON.parse(localStorage.getItem('appHistory')) || [];
    const sekarang = new Date();
    const formatWaktu = sekarang.getFullYear() + "-" + 
                        String(sekarang.getMonth() + 1).padStart(2, '0') + "-" + 
                        String(sekarang.getDate()).padStart(2, '0') + " " + 
                        String(sekarang.getHours()).padStart(2, '0') + ":" + 
                        String(sekarang.getMinutes()).padStart(2, '0') + ":" + 
                        String(sekarang.getSeconds()).padStart(2, '0');

    historyData.push({
        user_id: currentUser.id,
        tipe: `Kuis Latihan (${level})`,
        keterangan: `Skor: ${Math.round(score)}`,
        created_at: formatWaktu
    });
    localStorage.setItem('appHistory', JSON.stringify(historyData));

    // Refresh tabel riwayat di dashboard agar langsung update otomatis
    loadHistory();
}

/* --- 6. MEDIAPIPE AI TRANSLATOR --- */
async function startMediaPipe() {
    if(isCameraRunning) return;
    document.getElementById('cameraLoading').classList.remove('hidden'); 
    document.getElementById('btnStartCamera').classList.add('hidden'); 
    document.getElementById('btnStopCamera').classList.remove('hidden'); 
    document.getElementById('cameraContainer').classList.add('camera-active');
    
    try {
        if (!hands) {
            hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`});
            hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
            hands.onResults(onResults);
            await hands.initialize();
        }
        if (!camera) {
            camera = new Camera(videoElement, { 
                onFrame: async () => { 
                    if (isCameraRunning && hands && !isProcessing) {
                        isProcessing = true;
                        try { await hands.send({image: videoElement}); } catch (e) { console.error(e); } finally { isProcessing = false; }
                    }
                }, width: 640, height: 480 
            });
        }
        await camera.start();
        document.getElementById('cameraLoading').classList.add('hidden'); 
        isCameraRunning = true; 
        if(canvasElement) { canvasElement.width = 640; canvasElement.height = 480; }
    } catch (err) { stopMediaPipe(); }
}

function stopMediaPipe() {
    if(camera) { camera.stop(); }
    isCameraRunning = false;
    document.getElementById('btnStartCamera').classList.remove('hidden'); 
    document.getElementById('btnStopCamera').classList.add('hidden'); 
    document.getElementById('cameraContainer').classList.remove('camera-active');
    if(canvasCtx) canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function onResults(results) {
    if (!canvasCtx) return;
    canvasCtx.save(); canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const l = results.multiHandLandmarks[0];
        drawConnectors(canvasCtx, l, HAND_CONNECTIONS, {color: '#0D9488', lineWidth: 4}); 
        drawLandmarks(canvasCtx, l, {color: '#F97316', lineWidth: 2, radius: 4});

        const detected = heuristicDetect(l);
        document.getElementById('currentLetter').textContent = detected;
        
        let acc = detected !== "?" ? Math.min(99, 70 + (holdCount * 2)) : 0; 
        document.getElementById('confidenceTxt').textContent = `Akurasi: ${acc}%`;
        
        if(detected !== "?") {
            if(detected === holdChar) {
                holdCount++;
                if(holdCount >= 15) { 
                    currentWord += detected; 
                    document.getElementById('constructedWord').textContent = currentWord; 
                    holdCount = -15; 
                    document.getElementById('cameraContainer').style.borderColor = "#F97316"; 
                    setTimeout(() => document.getElementById('cameraContainer').style.borderColor = "", 300);
                }
            } else { holdChar = detected; holdCount = 0; }
        }
    } else { 
        document.getElementById('currentLetter').textContent = "--"; 
        document.getElementById('confidenceTxt').textContent = "Tangan Tidak Terdeteksi"; 
        holdCount = 0; 
    }
    canvasCtx.restore();
}

function heuristicDetect(l) {
    const d = (p1, p2) => Math.hypot(l[p1].x - l[p2].x, l[p1].y - l[p2].y);
    const palmSize = d(0, 9); 

    const isUp = (tip, pip, mcp) => l[tip].y < l[pip].y && l[tip].y < l[mcp].y - (palmSize * 0.1);
    const iUp = isUp(8, 6, 5); const mUp = isUp(12, 10, 9); const rUp = isUp(16, 14, 13); const pUp = isUp(20, 18, 17);
    const upCount = [iUp, mUp, rUp, pUp].filter(Boolean).length;

    const iDown = l[8].y > l[5].y + (palmSize * 0.2);
    const mDown = l[12].y > l[9].y + (palmSize * 0.2);
    const iHoriz = Math.abs(l[8].y - l[5].y) < palmSize * 0.6 && d(8, 5) > palmSize * 0.8;
    const mHoriz = Math.abs(l[12].y - l[9].y) < palmSize * 0.6 && d(12, 9) > palmSize * 0.8;

    const tUp = l[4].y < l[5].y; const tOut = d(4, 9) > palmSize * 0.7; 
    const touchThumbIndex = d(4, 8) < palmSize * 0.35; const touchThumbMid = d(4, 12) < palmSize * 0.35;

    const cShape = !iUp && !mUp && d(8, 0) > palmSize * 0.8 && d(4, 8) > palmSize * 0.3 && d(4, 8) < palmSize * 1.2 && l[8].y > l[6].y;
    const isO = touchThumbIndex && touchThumbMid && !iUp && !mUp;
    const isX = !iUp && !mUp && !rUp && !pUp && l[8].y > l[7].y && d(8, 5) > palmSize * 0.5 && !iDown && !iHoriz;
    
    if (iDown && !mDown && !rUp && !pUp && l[4].y > l[3].y) return "Q";
    if (upCount === 1 && iUp && (touchThumbMid || d(4, 12) < palmSize * 0.6 || d(4, 16) < palmSize * 0.6)) return "D"; 

    if (upCount === 4) return "B";
    if (upCount === 3) {
        if (iUp && mUp && rUp) return "W";
        if (!iUp && mUp && rUp && pUp && touchThumbIndex) return "F"; 
    }
    if (upCount === 2) {
        if (iUp && mUp) {
            const dxTips = Math.abs(l[8].x - l[12].x);
            if (l[8].x > l[12].x && l[5].x < l[9].x || l[8].x < l[12].x && l[5].x > l[9].x) { if (dxTips > 0.02) return "R"; }
            if (dxTips > palmSize * 0.35) { if (tUp && l[4].y < l[9].y) return "K"; return "V"; }
            return "U";
        }
    }
    if (upCount === 1) {
        if (iUp) { 
            if (tOut && tUp) return "L"; 
            if (l[8].x > l[6].x + (palmSize * 0.15)) return "Z";
            return "?"; 
        }
        if (pUp) { 
            if (tOut) return "Y"; 
            if (l[20].x < l[19].x) return "J";
            return "I"; 
        }
    }
    if (upCount === 0) {
        if (tUp && tOut && d(4, 8) > palmSize * 0.4) return "A";

        if (cShape) return "C"; if (isO) return "O"; if (isX) return "X";
        if (iHoriz && mHoriz) return "H"; if (iHoriz && !mHoriz) return "G"; if (iDown && mDown) return "P";
        
        if (d(4, 6) < palmSize * 0.35) return "T"; if (d(4, 10) < palmSize * 0.35) return "N";
        if (d(4, 14) < palmSize * 0.35 || d(4, 13) < palmSize * 0.35) return "M"; 
        
        const minX = Math.min(l[5].x, l[17].x); const maxX = Math.max(l[5].x, l[17].x);
        if (d(4, 10) < palmSize * 0.6 && l[4].x > minX && l[4].x < maxX) return "S";
        
        if (l[8].y > l[6].y && l[12].y > l[10].y && l[16].y > l[14].y) return "E";
        
        return "E"; 
    }
    return "?";
}

/* --- 7. TOMBOL AKSI TERJEMAHAN --- */
function deleteLastLetter() { 
    currentWord = currentWord.slice(0, -1); 
    document.getElementById('constructedWord').textContent = currentWord; 
}
function appendSpace() { 
    currentWord += " "; 
    document.getElementById('constructedWord').textContent = currentWord; 
}
function speakText(txt) {
    if(!txt) return; 
    const u = new SpeechSynthesisUtterance(txt); 
    u.lang = 'id-ID'; 
    window.speechSynthesis.speak(u);
}
function copyText() { 
    if(!currentWord) return; 
    navigator.clipboard.writeText(currentWord).then(() => showToast("Teks disalin ke clipboard!")); 
}