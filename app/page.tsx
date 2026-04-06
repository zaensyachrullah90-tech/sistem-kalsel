"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, serverTimestamp } from 'firebase/database';
import { 
  FolderOpen, 
  FileText, 
  UploadCloud, 
  Search, 
  Download, 
  BarChart2, 
  Menu, 
  X, 
  ChevronDown, 
  ChevronRight, 
  FileCheck, 
  Settings, 
  Link as LinkIcon, 
  CheckCircle, 
  Loader2 
} from 'lucide-react';

// ============================================================================
// 1. KONFIGURASI FIREBASE
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDStGoBoQXhwkwA-XFntQqO5tyFxQAY9_I",
  authDomain: "arsip-pkhkalsel.firebaseapp.com",
  databaseURL: "https://arsip-pkhkalsel-default-rtdb.firebaseio.com",
  projectId: "arsip-pkhkalsel",
  storageBucket: "arsip-pkhkalsel.firebasestorage.app",
  messagingSenderId: "430469760045",
  appId: "1:430469760045:web:6d2469b40730098bb4e4a4"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getDatabase(app);

const DRIVE_API_KEY = "AIzaSyAXULPE6AodS8J80BGcOygeB0ek0pAakgQ";

const KABUPATEN_KOTA = [
  "BANJARMASIN", "BANJARBARU", "BANJAR", "TANAH LAUT", "BARITO KUALA",
  "TAPIN", "HULU SUNGAI SELATAN", "HULU SUNGAI TENGAH", "HULU SUNGAI UTARA",
  "TABALONG", "BALANGAN", "TANAH BUMBU", "KOTABARU"
];

// ============================================================================
// 2. FUNGSI RADAR: MENCARI FILE PDF DI DALAM FOLDER YANG BERLAPIS-LAPIS
// ============================================================================
const scanFoldersRecursively = async (folderId: string, apiKey: string): Promise<any[]> => {
  let allPdfs: any[] = [];
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&key=${apiKey}&fields=files(id,name,mimeType)`;
    const res = await fetch(url);
    const data = await res.json();

    for (const file of data.files || []) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Jika menemukan Folder lagi, selami folder tersebut! (Rekursif)
        const subPdfs = await scanFoldersRecursively(file.id, apiKey);
        allPdfs = allPdfs.concat(subPdfs);
      } else if (file.mimeType === 'application/pdf') {
        // Jika menemukan PDF, kumpulkan!
        allPdfs.push(file);
      }
    }
  } catch (error) {
    console.error("Gagal scanning folder", error);
  }
  return allPdfs;
};

// ============================================================================
// 3. KOMPONEN UTAMA APLIKASI
// ============================================================================
export default function App() {
  // --- DATABASE STATE ---
  const [filesData, setFilesData] = useState<any[]>([]);
  
  // --- UI NAVIGATION STATE ---
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState('DASHBOARD'); 
  const [activeDistrict, setActiveDistrict] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMenus, setExpandedMenus] = useState<any>({ VERKOM: false, ABSEN: false });

  // --- UPLOAD STATE ---
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [latestUploadedCard, setLatestUploadedCard] = useState<any>(null); 
  
  // --- SETTINGS (LINK DRIVE) STATE ---
  const [folderLinks, setFolderLinks] = useState<any>({});
  const [saveLinkStatus, setSaveLinkStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // ============================================================================
  // 4. MENGAMBIL DATA FIREBASE
  // ============================================================================
  useEffect(() => {
    const dbRef = ref(db, 'kalsel_files');
    const unsubscribeFiles = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const dataArray = Object.keys(data).map(key => ({ 
          id: key, 
          ...data[key] 
        }));
        setFilesData(dataArray);
      } else {
        setFilesData([]);
      }
    });

    const linkRef = ref(db, 'kalsel_links');
    const unsubscribeLinks = onValue(linkRef, (snapshot) => {
      if(snapshot.val()) {
        setFolderLinks(snapshot.val());
      }
    });

    return () => { 
      unsubscribeFiles(); 
      unsubscribeLinks(); 
    };
  }, []);

  // ============================================================================
  // 5. PENCARIAN CEPAT (IN-MEMORY)
  // ============================================================================
  const filteredData = useMemo(() => {
    return filesData.filter(item => {
      const matchMenu = item.kategori === activeMenu;
      const matchDistrict = activeDistrict ? item.kabupaten === activeDistrict : true;
      const matchSearch = item.nama_sekolah?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.kecamatan?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMenu && matchDistrict && matchSearch;
    });
  }, [filesData, activeMenu, activeDistrict, searchQuery]);

  const stats = useMemo(() => {
    const total = filesData.length;
    const verkom = filesData.filter(d => d.kategori === 'VERKOM').length;
    const absen = filesData.filter(d => d.kategori === 'ABSEN').length;
    return { total, verkom, absen };
  }, [filesData]);

  // ============================================================================
  // 6. LOGIKA UTAMA: PENARIKAN DATA BERLAPIS (ORCHESTRATOR)
  // ============================================================================
  const handleSaveLink = async (kabupaten: string) => {
    if(!folderLinks[kabupaten] || isSyncing) return;
    
    setIsSyncing(true);
    setLatestUploadedCard(null); 
    
    try {
      // 1. Ekstrak ID Folder dari URL
      const folderIdMatch = folderLinks[kabupaten].match(/folders\/([a-zA-Z0-9-_]+)/);
      if (!folderIdMatch) throw new Error("Link Drive tidak valid.");
      const rootFolderId = folderIdMatch[1];

      // Simpan link ke database
      await set(ref(db, `kalsel_links/${kabupaten}`), folderLinks[kabupaten]);
      
      // 2. RADAR MENYELAM: Cari semua PDF di folder dan sub-folder
      setSaveLinkStatus(`🔍 MENYELAMI FOLDER ${kabupaten} BERLAPIS... (MENCARI PDF)`);
      const allFoundPdfs = await scanFoldersRecursively(rootFolderId, DRIVE_API_KEY);
      
      if(allFoundPdfs.length === 0) {
        setSaveLinkStatus(`⚠️ TIDAK DITEMUKAN PDF DI FOLDER ATAU SUB-FOLDER ${kabupaten}.`);
        setIsSyncing(false);
        setTimeout(() => setSaveLinkStatus(''), 5000);
        return;
      }

      // 3. PROSES SATU PER SATU (Anti Timeout Vercel)
      let processedCount = 0;
      for (const pdfFile of allFoundPdfs) {
        processedCount++;
        setSaveLinkStatus(`🤖 AI MEMBACA FILE ${processedCount} DARI ${allFoundPdfs.length}... (${pdfFile.name})`);

        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            file: pdfFile, 
            kabupaten: kabupaten, 
            driveApiKey: DRIVE_API_KEY 
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Masukkan ke Database
            await push(ref(db, 'kalsel_files'), { 
              ...result.data, 
              uploadedAt: serverTimestamp() 
            });
            // Update Card di Tampilan Langsung
            setLatestUploadedCard(result.data);
          }
        }
      }

      setSaveLinkStatus(`✅ SELESAI! ${allFoundPdfs.length} FILE DARI ${kabupaten} TERSIMPAN DI DATABASE.`);
    } catch(err: any) {
      setSaveLinkStatus(`❌ GAGAL: ${err.message || 'KESALAHAN JARINGAN SAAT SINKRONISASI.'}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSaveLinkStatus(''), 8000);
    }
  };

  // ============================================================================
  // 7. FUNGSI SIMULASI UPLOAD
  // ============================================================================
  const handleSimulateUpload = async () => {
    setIsUploading(true);
    setUploadStatus('MENGUPLOAD FILE...');
    setLatestUploadedCard(null); 
    
    await new Promise(r => setTimeout(r, 1000));
    setUploadStatus('MEMBACA DENGAN AI...');
    await new Promise(r => setTimeout(r, 1500)); 

    const randomKab = KABUPATEN_KOTA[Math.floor(Math.random() * KABUPATEN_KOTA.length)];
    const extractedData = {
      nama_sekolah: `SDN CONTOH AI ${Math.floor(Math.random() * 99)}`,
      kecamatan: `KECAMATAN UJI COBA`,
      bulan: "MARET", 
      tahun: "2026",
      kabupaten: randomKab,
      kategori: Math.random() > 0.5 ? 'VERKOM' : 'ABSEN',
      drive_url: "#", 
      uploadedAt: serverTimestamp()
    };

    try {
      await push(ref(db, 'kalsel_files'), extractedData);
      setUploadStatus('SUKSES! DATA TERSIMPAN.');
      setLatestUploadedCard(extractedData); 
    } catch (err) {
      setUploadStatus('GAGAL MENYIMPAN KE DATABASE.');
    } finally {
      setTimeout(() => { 
        setIsUploading(false); 
        setUploadStatus(''); 
      }, 2000);
    }
  };

  const toggleMenu = (menu: string) => { 
    setExpandedMenus((prev: any) => ({ 
      ...prev, 
      [menu]: !prev[menu] 
    })); 
  };

  // ============================================================================
  // TAMPILAN ANTARMUKA (UI)
  // ============================================================================
  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans uppercase">
      
      {/* ----------------- SIDEBAR KIRI ----------------- */}
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

          {['VERKOM', 'ABSEN'].map(menu => (
            <div key={menu}>
              <button 
                onClick={() => toggleMenu(menu)} 
                className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-emerald-800 transition-colors ${(activeMenu === menu && !activeDistrict) ? 'bg-emerald-700' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {menu === 'VERKOM' ? <FileCheck size={18} /> : <FileText size={18}/>} DATA {menu}
                </div>
                {expandedMenus[menu] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {expandedMenus[menu] && (
                <div className="ml-8 mt-1 space-y-1">
                  {KABUPATEN_KOTA.map(kab => (
                    <button 
                      key={`${menu}-${kab}`} 
                      onClick={() => {
                        setActiveMenu(menu); 
                        setActiveDistrict(kab); 
                        setSearchQuery('');
                      }} 
                      className={`w-full text-left p-2 rounded text-xs transition-colors ${activeMenu === menu && activeDistrict === kab ? 'bg-emerald-600 font-bold' : 'text-emerald-200 hover:bg-emerald-800'}`}
                    >
                      {kab}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <hr className="border-emerald-700 my-4" />

          <button 
            onClick={() => { 
              setActiveMenu('SETTINGS'); 
              setActiveDistrict(''); 
              setLatestUploadedCard(null); 
            }} 
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeMenu === 'SETTINGS' ? 'bg-emerald-700' : 'hover:bg-emerald-800'}`}
          >
            <Settings size={18} /> PENGATURAN LINK
          </button>

          <button 
            onClick={() => { 
              setActiveMenu('UPLOAD'); 
              setActiveDistrict(''); 
              setLatestUploadedCard(null); 
            }} 
            className={`w-full flex items-center gap-3 p-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors mt-2`}
          >
            <UploadCloud size={18} /> UPLOAD AI & BACA
          </button>
        </nav>
      </aside>

      {/* ----------------- KONTEN KANAN ----------------- */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white shadow-sm p-4 flex items-center gap-4">
          <button className="text-gray-500 hover:text-emerald-700" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800 tracking-wide">
            {activeMenu === 'DASHBOARD' && 'DASHBOARD SISTEM'}
            {activeMenu === 'UPLOAD' && 'UPLOAD FILE & ANALISIS AI'}
            {activeMenu === 'SETTINGS' && 'PENGATURAN LINK GOOGLE DRIVE'}
            {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && `MENU ${activeMenu} ${activeDistrict ? `- KABUPATEN ${activeDistrict}` : ''}`}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          
          {/* ================= TAMPILAN DASHBOARD ================= */}
          {activeMenu === 'DASHBOARD' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-emerald-100 text-emerald-700 rounded-full">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">TOTAL FILE</p>
                  <p className="text-3xl font-black text-gray-800">{stats.total}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-blue-100 text-blue-700 rounded-full">
                  <FileCheck size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">DATA VERKOM</p>
                  <p className="text-3xl font-black text-gray-800">{stats.verkom}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-orange-100 text-orange-700 rounded-full">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">DATA ABSENSI</p>
                  <p className="text-3xl font-black text-gray-800">{stats.absen}</p>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAMPILAN SETTINGS LINK ================= */}
          {activeMenu === 'SETTINGS' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6 border-b pb-4">
                  <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
                    <LinkIcon size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">MANAJEMEN LINK FOLDER DRIVE</h3>
                    <p className="text-sm text-gray-500 font-semibold mt-1">SISTEM AKAN MEMBACA FOLDER BERLAPIS HINGGA KE AKARNYA.</p>
                  </div>
                </div>

                {saveLinkStatus && (
                  <div className={`mb-4 p-4 font-bold flex items-center gap-3 rounded-lg border ${
                    saveLinkStatus.includes('GAGAL') || saveLinkStatus.includes('KESALAHAN') 
                      ? 'bg-red-100 text-red-800 border-red-200' 
                      : saveLinkStatus.includes('SELESAI') 
                        ? 'bg-green-100 text-green-800 border-green-200' 
                        : 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse'
                  }`}>
                    {isSyncing && <Loader2 className="animate-spin" size={20} />}
                    {saveLinkStatus}
                  </div>
                )}

                <div className="space-y-4">
                  {KABUPATEN_KOTA.map(kab => (
                    <div key={`link-${kab}`} className="flex flex-col md:flex-row gap-4 p-4 border border-gray-100 rounded-lg items-center hover:bg-gray-50 transition-colors">
                      <div className="w-full md:w-1/4 font-bold text-gray-700">{kab}</div>
                      <input 
                        type="url" 
                        placeholder="HTTPS://DRIVE.GOOGLE.COM/FOLDERS/..." 
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-md normal-case text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                        value={folderLinks[kab] || ''} 
                        onChange={(e) => setFolderLinks({...folderLinks, [kab]: e.target.value})} 
                        disabled={isSyncing}
                      />
                      <button 
                        onClick={() => handleSaveLink(kab)} 
                        disabled={isSyncing || !folderLinks[kab]} 
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md disabled:opacity-50 flex items-center justify-center min-w-[160px]"
                      >
                        {isSyncing ? 'SINKRONISASI...' : 'SIMPAN & SYNC'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* CARD MUNCUL SETELAH SYNC / UPLOAD BERHASIL */}
              {latestUploadedCard && (
                <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-xl shadow-sm flex items-start gap-4">
                  <CheckCircle className="text-emerald-500 mt-1" size={32} />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-800 mb-1">BERHASIL DITAMBAHKAN KE DATABASE</h4>
                    <p className="text-2xl font-black text-emerald-900">{latestUploadedCard.nama_sekolah}</p>
                    <p className="text-sm font-semibold text-emerald-700 mt-1">
                      {latestUploadedCard.kecamatan} • {latestUploadedCard.kabupaten} • {latestUploadedCard.kategori}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAMPILAN UPLOAD AI ================= */}
          {activeMenu === 'UPLOAD' && (
             <div className="max-w-2xl mx-auto space-y-6">
               <div className="bg-white p-8 rounded-xl text-center border border-gray-100 shadow-sm">
                 <h3 className="text-2xl font-black text-gray-800 mb-2">UPLOAD DOKUMEN PDF</h3>
                 
                 <div className="border-2 border-dashed border-emerald-400 rounded-xl p-12 bg-emerald-50 mb-6 mt-6">
                   <UploadCloud className="mx-auto text-emerald-500 mb-4" size={56} />
                   <button 
                     onClick={handleSimulateUpload} 
                     disabled={isUploading} 
                     className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold text-lg disabled:opacity-50"
                   >
                     {isUploading ? 'MEMPROSES DENGAN AI...' : 'SIMULASIKAN UPLOAD'}
                   </button>
                 </div>

                 {uploadStatus && (
                   <div className="mt-4 p-4 font-bold rounded-lg bg-blue-100 text-blue-800">
                     {uploadStatus}
                   </div>
                 )}
               </div>

               {/* CARD MUNCUL SETELAH UPLOAD BERHASIL */}
               {latestUploadedCard && (
                 <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-xl shadow-sm flex items-start gap-4">
                   <CheckCircle className="text-emerald-500 mt-1" size={32} />
                   <div>
                     <h4 className="text-sm font-bold text-emerald-800 mb-1">DATA BARU TERDETEKSI</h4>
                     <p className="text-2xl font-black text-emerald-900">{latestUploadedCard.nama_sekolah}</p>
                     <p className="text-sm font-semibold text-emerald-700 mt-1">
                       {latestUploadedCard.kecamatan} • {latestUploadedCard.kabupaten}
                     </p>
                   </div>
                 </div>
               )}
             </div>
          )}

          {/* ================= TAMPILAN TABEL DATA ================= */}
          {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
              
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-wrap gap-4">
                <div className="relative flex-1 min-w-[300px] max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="text-gray-400" size={20} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="CARI NAMA SEKOLAH ATAU KECAMATAN..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-semibold text-sm" 
                  />
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-100 text-emerald-900 text-sm">
                      <th className="p-4 font-black border-b text-center">NO</th>
                      <th className="p-4 font-black border-b">NAMA SEKOLAH</th>
                      <th className="p-4 font-black border-b">KECAMATAN</th>
                      <th className="p-4 font-black border-b text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-gray-500 font-bold">
                          TIDAK ADA DATA.
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((row, i) => (
                        <tr key={row.id} className="border-b hover:bg-emerald-50">
                          <td className="p-4 font-bold text-center">{i + 1}</td>
                          <td className="p-4 font-bold text-gray-900 text-lg">{row.nama_sekolah}</td>
                          <td className="p-4 text-sm font-semibold">{row.kecamatan}</td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => { 
                                if (row.drive_url && row.drive_url !== "#") {
                                  window.open(row.drive_url, '_blank'); 
                                } else {
                                  alert('File asli belum tersedia. Ini adalah data simulasi.'); 
                                }
                              }} 
                              className="inline-flex items-center gap-2 text-xs bg-gray-800 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg"
                            >
                              <Download size={16} /> UNDUH
                            </button>
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