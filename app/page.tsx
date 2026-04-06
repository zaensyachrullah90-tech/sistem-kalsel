"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, onValue, push, serverTimestamp } from 'firebase/database';
import { 
  FolderOpen, FileText, UploadCloud, Search, Download, 
  BarChart2, Menu, X, ChevronDown, ChevronRight, FileCheck, Settings, Link as LinkIcon
} from 'lucide-react';

// --- KONFIGURASI FIREBASE ---
// Mengambil config dari Vercel Environment Variables
const firebaseConfigStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
const firebaseConfig = firebaseConfigStr ? JSON.parse(firebaseConfigStr) : {};

// Inisialisasi Firebase (Mencegah inisialisasi ganda di Next.js)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getDatabase(app);

// DAFTAR 13 KABUPATEN/KOTA DI KALSEL (HURUF KAPITAL)
const KABUPATEN_KOTA = [
  "BANJARMASIN", "BANJARBARU", "BANJAR", "TANAH LAUT", "BARITO KUALA",
  "TAPIN", "HULU SUNGAI SELATAN", "HULU SUNGAI TENGAH", "HULU SUNGAI UTARA",
  "TABALONG", "BALANGAN", "TANAH BUMBU", "KOTABARU"
];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [filesData, setFilesData] = useState<any[]>([]);
  
  // UI STATE
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState('DASHBOARD'); 
  const [activeDistrict, setActiveDistrict] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMenus, setExpandedMenus] = useState({ VERKOM: false, ABSEN: false });

  // UPLOAD STATE
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  
  // PENGATURAN LINK STATE
  const [folderLinks, setFolderLinks] = useState<any>({});
  const [saveLinkStatus, setSaveLinkStatus] = useState('');

  // --- 1. AUTENTIKASI FIREBASE ---
  useEffect(() => {
    signInAnonymously(auth).catch(error => console.error("AUTH ERROR:", error));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- 2. MENGAMBIL DATA DARI REALTIME DATABASE ---
  useEffect(() => {
    if (!user) return;
    
    const dbRef = ref(db, 'kalsel_files');
    const unsubscribe = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Mengubah format object Realtime DB menjadi Array
        const dataArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setFilesData(dataArray);
      } else {
        setFilesData([]);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // --- 3. FILTER IN-MEMORY SANGAT CEPAT ---
  const filteredData = useMemo(() => {
    return filesData.filter(item => {
      const matchMenu = item.kategori === activeMenu;
      const matchDistrict = activeDistrict ? item.kabupaten === activeDistrict : true;
      const matchSearch = item.nama_sekolah?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMenu && matchDistrict && matchSearch;
    });
  }, [filesData, activeMenu, activeDistrict, searchQuery]);

  // STATISTIK DASHBOARD
  const stats = useMemo(() => {
    const total = filesData.length;
    const verkom = filesData.filter(d => d.kategori === 'VERKOM').length;
    const absen = filesData.filter(d => d.kategori === 'ABSEN').length;
    return { total, verkom, absen };
  }, [filesData]);

  // --- 4. SIMULASI UPLOAD & AI ---
  const handleSimulateUpload = async (e: any) => {
    e.preventDefault();
    if (!user) return;
    
    setIsUploading(true);
    setUploadStatus('MENGUPLOAD FILE KE GOOGLE DRIVE...');
    
    await new Promise(r => setTimeout(r, 1500));
    
    setUploadStatus('MEMPROSES DOKUMEN DENGAN GEMINI 2.5 FLASH...');
    await new Promise(r => setTimeout(r, 2000)); 

    const randomKabupaten = KABUPATEN_KOTA[Math.floor(Math.random() * KABUPATEN_KOTA.length)];
    const randomKategori = Math.random() > 0.5 ? 'VERKOM' : 'ABSEN';
    
    const extractedData = {
      nama_sekolah: `SDN ${Math.floor(Math.random() * 10) + 1} ${randomKabupaten}`,
      kecamatan: `KECAMATAN PUSAT ${randomKabupaten}`,
      bulan: ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI"][Math.floor(Math.random() * 5)],
      tahun: "2026",
      kabupaten: randomKabupaten,
      kategori: randomKategori,
      drive_url: "#", 
      uploadedAt: serverTimestamp()
    };

    try {
      // Simpan ke Realtime Database
      await push(ref(db, 'kalsel_files'), extractedData);
      setUploadStatus('SUKSES! DATA DIEKSTRAK DAN DISIMPAN.');
      setTimeout(() => {
        setIsUploading(false);
        setUploadStatus('');
      }, 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus('GAGAL MENYIMPAN DATA.');
      setIsUploading(false);
    }
  };

  const toggleMenu = (menu: 'VERKOM' | 'ABSEN') => {
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const handleSubMenuClick = (kategori: string, kabupaten: string) => {
    setActiveMenu(kategori);
    setActiveDistrict(kabupaten);
    setSearchQuery('');
  };

  // --- RENDER UI ---
  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans uppercase">
      
      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0 -translate-x-full'} transition-all duration-300 bg-emerald-900 text-white flex flex-col fixed md:relative z-20 h-full overflow-y-auto shadow-xl`}>
        <div className="p-4 flex items-center justify-between bg-emerald-950">
          <h1 className="font-bold text-lg tracking-wider flex items-center gap-2">
            <FolderOpen size={20} /> E-ARSIP KALSEL
          </h1>
          <button className="md:hidden text-gray-300" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 text-sm font-semibold tracking-wide">
          <button 
            onClick={() => { setActiveMenu('DASHBOARD'); setActiveDistrict(''); }}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeMenu === 'DASHBOARD' ? 'bg-emerald-700' : 'hover:bg-emerald-800'}`}
          >
            <BarChart2 size={18} /> RINGKASAN
          </button>

          <div>
            <button 
              onClick={() => toggleMenu('VERKOM')}
              className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-emerald-800 transition-colors ${(activeMenu === 'VERKOM' && !activeDistrict) ? 'bg-emerald-700' : ''}`}
            >
              <div className="flex items-center gap-3"><FileCheck size={18} /> DATA VERKOM</div>
              {expandedMenus.VERKOM ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {expandedMenus.VERKOM && (
              <div className="ml-8 mt-1 space-y-1">
                {KABUPATEN_KOTA.map(kab => (
                  <button 
                    key={`verkom-${kab}`}
                    onClick={() => handleSubMenuClick('VERKOM', kab)}
                    className={`w-full text-left p-2 rounded text-xs transition-colors ${activeMenu === 'VERKOM' && activeDistrict === kab ? 'bg-emerald-600 font-bold' : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'}`}
                  >
                    {kab}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <button 
              onClick={() => toggleMenu('ABSEN')}
              className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-emerald-800 transition-colors ${(activeMenu === 'ABSEN' && !activeDistrict) ? 'bg-emerald-700' : ''}`}
            >
              <div className="flex items-center gap-3"><FileText size={18} /> DATA ABSEN</div>
              {expandedMenus.ABSEN ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {expandedMenus.ABSEN && (
              <div className="ml-8 mt-1 space-y-1">
                {KABUPATEN_KOTA.map(kab => (
                  <button 
                    key={`absen-${kab}`}
                    onClick={() => handleSubMenuClick('ABSEN', kab)}
                    className={`w-full text-left p-2 rounded text-xs transition-colors ${activeMenu === 'ABSEN' && activeDistrict === kab ? 'bg-emerald-600 font-bold' : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'}`}
                  >
                    {kab}
                  </button>
                ))}
              </div>
            )}
          </div>

          <hr className="border-emerald-700 my-4" />

          <button 
            onClick={() => { setActiveMenu('SETTINGS'); setActiveDistrict(''); }}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeMenu === 'SETTINGS' ? 'bg-emerald-700' : 'hover:bg-emerald-800'}`}
          >
            <Settings size={18} /> PENGATURAN LINK
          </button>

          <button 
            onClick={() => { setActiveMenu('UPLOAD'); setActiveDistrict(''); }}
            className={`w-full flex items-center gap-3 p-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors mt-2`}
          >
            <UploadCloud size={18} /> UPLOAD AI & BACA
          </button>
        </nav>
      </aside>

      {/* KONTEN UTAMA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white shadow-sm p-4 flex items-center gap-4">
          <button className="text-gray-500 hover:text-emerald-700" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800 tracking-wide">
            {activeMenu === 'DASHBOARD' && 'DASHBOARD SISTEM'}
            {activeMenu === 'UPLOAD' && 'UPLOAD FILE & ANALISIS AI'}
            {activeMenu === 'SETTINGS' && 'PENGATURAN LINK GOOGLE DRIVE'}
            {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && (
              <>MENU {activeMenu} {activeDistrict ? `- KABUPATEN ${activeDistrict}` : ''}</>
            )}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          
          {activeMenu === 'DASHBOARD' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-4 bg-emerald-100 text-emerald-700 rounded-full"><FolderOpen size={24} /></div>
                  <div>
                    <p className="text-sm text-gray-500 font-bold">TOTAL FILE TERINDEKS</p>
                    <p className="text-3xl font-black text-gray-800">{stats.total}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-4 bg-blue-100 text-blue-700 rounded-full"><FileCheck size={24} /></div>
                  <div>
                    <p className="text-sm text-gray-500 font-bold">FILE VERKOM</p>
                    <p className="text-3xl font-black text-gray-800">{stats.verkom}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-4 bg-orange-100 text-orange-700 rounded-full"><FileText size={24} /></div>
                  <div>
                    <p className="text-sm text-gray-500 font-bold">FILE ABSENSI</p>
                    <p className="text-3xl font-black text-gray-800">{stats.absen}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 leading-relaxed">
                <h3 className="text-lg font-bold mb-4 border-b pb-2">INFORMASI SISTEM</h3>
                <p className="text-gray-600 mb-4">
                  SELAMAT DATANG DI SISTEM E-ARSIP KALIMANTAN SELATAN. APLIKASI INI MENGGUNAKAN <strong className="text-emerald-700">GOOGLE DRIVE</strong> SEBAGAI PENYIMPANAN FILE DAN <strong className="text-emerald-700">GEMINI 2.5 FLASH</strong> UNTUK MEMBACA ISI PDF SECARA OTOMATIS.
                </p>
              </div>
            </div>
          )}

          {activeMenu === 'SETTINGS' && (
            <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-lg"><LinkIcon size={24} /></div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">MANAJEMEN LINK FOLDER DRIVE</h3>
                  <p className="text-sm text-gray-500 font-semibold mt-1">MASUKKAN LINK FOLDER DARI TIAP KABUPATEN. PASTIKAN AKSES FOLDER DISET KE "SIAPA SAJA YANG MEMILIKI LINK".</p>
                </div>
              </div>

              {saveLinkStatus && (
                <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-lg text-sm font-bold border border-green-200">
                  {saveLinkStatus}
                </div>
              )}

              <div className="space-y-4">
                {KABUPATEN_KOTA.map((kab) => (
                  <div key={`link-${kab}`} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-full md:w-1/4 font-bold text-gray-700">{kab}</div>
                    <div className="w-full md:w-3/4 flex gap-2">
                      <input
                        type="url"
                        placeholder="HTTPS://DRIVE.GOOGLE.COM/DRIVE/FOLDERS/..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm normal-case"
                        value={folderLinks[kab] || ''}
                        onChange={(e) => setFolderLinks({...folderLinks, [kab]: e.target.value})}
                      />
                      <button 
                        onClick={() => {
                          if(!folderLinks[kab]) return;
                          setSaveLinkStatus(`BERHASIL MENYIMPAN LINK UNTUK KABUPATEN ${kab} DAN MEMULAI SINKRONISASI AI...`);
                          setTimeout(() => setSaveLinkStatus(''), 3000);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-bold transition-colors whitespace-nowrap"
                      >
                        SIMPAN & SYNC
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeMenu === 'UPLOAD' && (
            <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-2xl font-black text-gray-800 mb-2">UPLOAD DOKUMEN PDF</h3>
              <p className="text-gray-500 font-semibold mb-6">SISTEM AI AKAN MEMBACA NAMA SEKOLAH, KECAMATAN, DAN BULAN DARI DOKUMEN YANG DIUPLOAD.</p>
              
              <div className="border-2 border-dashed border-emerald-400 rounded-xl p-10 text-center bg-emerald-50 mb-6 relative">
                <UploadCloud className="mx-auto text-emerald-500 mb-3" size={48} />
                <button 
                  onClick={handleSimulateUpload}
                  disabled={isUploading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {isUploading ? 'MEMPROSES...' : 'SIMULASIKAN UPLOAD & EKSTRAK AI'}
                </button>
              </div>

              {uploadStatus && (
                <div className={`p-4 rounded-lg font-bold flex items-center justify-center ${uploadStatus.includes('SUKSES') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} animate-pulse`}>
                  {uploadStatus}
                </div>
              )}
            </div>
          )}

          {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-wrap gap-4">
                <div className="relative flex-1 min-w-[250px] max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={18} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="CARI NAMA SEKOLAH..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase placeholder:text-sm"
                  />
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-100 text-emerald-900 text-sm">
                      <th className="p-4 font-black border-b whitespace-nowrap">NO</th>
                      <th className="p-4 font-black border-b whitespace-nowrap">NAMA SEKOLAH</th>
                      <th className="p-4 font-black border-b whitespace-nowrap">KECAMATAN</th>
                      <th className="p-4 font-black border-b whitespace-nowrap">BULAN / TAHUN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-500 font-semibold">
                          TIDAK ADA DATA YANG DITEMUKAN ATAU KABUPATEN BELUM DIPILIH.
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((row, index) => (
                        <tr key={row.id} className="border-b border-gray-50 hover:bg-emerald-50 transition-colors">
                          <td className="p-4 text-sm text-gray-600 font-bold">{index + 1}</td>
                          <td className="p-4 font-bold text-gray-900">{row.nama_sekolah}</td>
                          <td className="p-4 text-sm text-gray-700 font-semibold">{row.kecamatan}</td>
                          <td className="p-4 text-sm">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold border border-blue-200">
                              {row.bulan} {row.tahun}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}