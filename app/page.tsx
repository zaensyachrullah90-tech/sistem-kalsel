"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, serverTimestamp } from 'firebase/database';
import { 
  FolderOpen, FileText, UploadCloud, Search, Download, 
  BarChart2, Menu, X, ChevronDown, ChevronRight, FileCheck, 
  Settings, Link as LinkIcon, CheckCircle, Loader2, Lock, ShieldCheck, Database, AlertTriangle, Trash2
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

// URUTAN BULAN UNTUK SORTIR KRONOLOGIS
const BULAN_ORDER: Record<string, number> = {
  "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4, "MEI": 5, "JUNI": 6,
  "JULI": 7, "AGUSTUS": 8, "SEPTEMBER": 9, "OKTOBER": 10, "NOVEMBER": 11, "DESEMBER": 12
};

// ============================================================================
// 2. FUNGSI RADAR MENGGALI FOLDER (RECURSIVE)
// ============================================================================
const scanFoldersRecursively = async (folderId: string, apiKey: string): Promise<any[]> => {
  let allPdfs: any[] = [];
  let pageToken = ''; 
  
  try {
    do {
      const query = `('${folderId}' in parents) and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder') and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) break;

      for (const file of data.files || []) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const subPdfs = await scanFoldersRecursively(file.id, apiKey);
          allPdfs = allPdfs.concat(subPdfs);
        } else if (file.mimeType === 'application/pdf') {
          allPdfs.push(file);
        }
      }
      pageToken = data.nextPageToken || ''; 
    } while (pageToken);
  } catch (error) { console.error("Scanner error:", error); }
  return allPdfs;
};

// ============================================================================
// 3. KOMPONEN UTAMA APLIKASI
// ============================================================================
export default function App() {
  const [filesData, setFilesData] = useState<any[]>([]);
  
  // --- UI STATE ---
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState('DASHBOARD'); 
  const [activeDistrict, setActiveDistrict] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMenus, setExpandedMenus] = useState<any>({ VERKOM: false, ABSEN: false });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [latestUploadedCard, setLatestUploadedCard] = useState<any>(null); 
  
  // --- STATE ADMIN & LINK ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [verkomLinks, setVerkomLinks] = useState<any>({});
  const [absenLinks, setAbsenLinks] = useState<any>({});
  
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
        const dataArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setFilesData(dataArray);
      } else {
        setFilesData([]);
      }
    });

    const vLinkRef = ref(db, 'kalsel_links/VERKOM');
    const unsubscribeVLinks = onValue(vLinkRef, (snapshot) => {
      if(snapshot.val()) setVerkomLinks(snapshot.val());
    });

    const aLinkRef = ref(db, 'kalsel_links/ABSEN');
    const unsubscribeALinks = onValue(aLinkRef, (snapshot) => {
      if(snapshot.val()) setAbsenLinks(snapshot.val());
    });

    return () => { unsubscribeFiles(); unsubscribeVLinks(); unsubscribeALinks(); };
  }, []);

  // ============================================================================
  // 5. PENCARIAN & SORTIR CERDAS (A-Z DAN KRONOLOGIS BULAN)
  // ============================================================================
  const filteredData = useMemo(() => {
    let result = filesData.filter(item => {
      const matchMenu = item.kategori === activeMenu;
      const matchDistrict = activeDistrict ? item.kabupaten === activeDistrict : true;
      const matchSearch = item.nama_sekolah?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.kecamatan?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMenu && matchDistrict && matchSearch;
    });

    // LOGIKA SORTIR RAPI: NAMA SEKOLAH -> TAHUN -> BULAN
    result.sort((a, b) => {
      // 1. Sortir Nama Sekolah (A-Z)
      const namaA = (a.nama_sekolah || "").toUpperCase();
      const namaB = (b.nama_sekolah || "").toUpperCase();
      if (namaA < namaB) return -1;
      if (namaA > namaB) return 1;

      // 2. Sortir Tahun
      const tahunA = parseInt(a.tahun) || 0;
      const tahunB = parseInt(b.tahun) || 0;
      if (tahunA !== tahunB) return tahunA - tahunB;

      // 3. Sortir Bulan (Januari -> Desember)
      const bulanA = BULAN_ORDER[(a.bulan || "").toUpperCase()] || 99;
      const bulanB = BULAN_ORDER[(b.bulan || "").toUpperCase()] || 99;
      return bulanA - bulanB;
    });

    return result;
  }, [filesData, activeMenu, activeDistrict, searchQuery]);

  const stats = useMemo(() => {
    const total = filesData.length;
    const verkom = filesData.filter(d => d.kategori === 'VERKOM').length;
    const absen = filesData.filter(d => d.kategori === 'ABSEN').length;
    return { total, verkom, absen };
  }, [filesData]);

  // ============================================================================
  // 6. FUNGSI ADMIN & SINKRONISASI
  // ============================================================================
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === "Kalsel 123") {
      setIsAdmin(true); setAuthError(''); setPassInput('');
    } else {
      setAuthError('PASSWORD SALAH! HANYA ADMIN YANG DIIZINKAN.');
    }
  };

  const handleResetDatabase = async () => {
    const confirmReset = window.confirm("⚠️ PERINGATAN KERAS! ⚠️\n\nApakah Anda yakin ingin MENGHAPUS SELURUH DATA ARSIP (Dashboard)?\nTindakan ini TIDAK BISA DIBATALKAN!");
    if (confirmReset) {
      const confirmTwice = window.confirm("Ketik OK jika Anda benar-benar yakin ingin mereset Database Kalsel.");
      if(confirmTwice) {
        await remove(ref(db, 'kalsel_files'));
        alert("✅ DATABASE TELAH BERHASIL DIRESET! Semua data kembali kosong.");
        setLatestUploadedCard(null);
      }
    }
  };

  const handleSaveLink = async (kabupaten: string, kategori: 'VERKOM' | 'ABSEN') => {
    const currentLink = kategori === 'VERKOM' ? verkomLinks[kabupaten] : absenLinks[kabupaten];
    if(!currentLink || isSyncing) return;
    
    setIsSyncing(true);
    setLatestUploadedCard(null); 
    
    try {
      const folderIdMatch = currentLink.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (!folderIdMatch) throw new Error("Link Drive tidak valid.");
      const rootFolderId = folderIdMatch[1];

      await set(ref(db, `kalsel_links/${kategori}/${kabupaten}`), currentLink);
      
      setSaveLinkStatus(`🔍 MENGGALI FOLDER ${kabupaten} BERLAPIS...`);
      const allFoundPdfs = await scanFoldersRecursively(rootFolderId, DRIVE_API_KEY);
      
      if(allFoundPdfs.length === 0) {
        setSaveLinkStatus(`⚠️ TIDAK DITEMUKAN PDF. Pastikan izin akses folder Publik.`);
        setIsSyncing(false); setTimeout(() => setSaveLinkStatus(''), 6000); return;
      }

      let newlyAddedItems: any[] = []; // Penampung sementara untuk pelacakan ganda di loop yang sama

      for (let i = 0; i < allFoundPdfs.length; i++) {
        const pdfFile = allFoundPdfs[i];
        
        // --- 1. FILTER GANDA PRE-AI (Cek dari Drive ID) ---
        const existingDriveIds = filesData.map(f => f.drive_id);
        if (existingDriveIds.includes(pdfFile.id)) {
          setSaveLinkStatus(`⏭️ SKIP: File "${pdfFile.name}" sudah ada di database.`);
          await new Promise(r => setTimeout(r, 500));
          continue; 
        }

        setSaveLinkStatus(`🤖 AI MEMBACA (${i+1}/${allFoundPdfs.length}): "${pdfFile.name}"...`);

        try {
          const response = await fetch('/api/sync', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: pdfFile, kabupaten, kategori, driveApiKey: DRIVE_API_KEY })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              
              // --- 2. FILTER GANDA POST-AI (Cek Kesamaan Nama Sekolah + Bulan + Tahun + Kategori) ---
              const isDuplicateData = filesData.some(f => 
                f.nama_sekolah === result.data.nama_sekolah && 
                f.bulan === result.data.bulan && 
                f.tahun === result.data.tahun && 
                f.kategori === kategori
              ) || newlyAddedItems.some(f => 
                f.nama_sekolah === result.data.nama_sekolah && f.bulan === result.data.bulan && f.kategori === kategori
              );

              if (isDuplicateData) {
                setSaveLinkStatus(`🚫 DITOLAK: Data ${result.data.nama_sekolah} (${result.data.bulan}) sudah ada!`);
              } else {
                setSaveLinkStatus(`💾 PEREKAMAN: Menyimpan ${result.data.nama_sekolah}...`);
                await push(ref(db, 'kalsel_files'), { ...result.data, uploadedAt: serverTimestamp() });
                newlyAddedItems.push(result.data);
                setLatestUploadedCard(result.data);
              }
            }
          }
        } catch (apiErr) { console.error("Gagal file:", pdfFile.name); }
        await new Promise(r => setTimeout(r, 2500)); // Jeda AI
      }

      setSaveLinkStatus(`✅ SINKRONISASI SELESAI UNTUK ${kabupaten}!`);
    } catch(err: any) {
      setSaveLinkStatus(`❌ GAGAL: ${err.message}`);
    } finally {
      setIsSyncing(false); setTimeout(() => setSaveLinkStatus(''), 8000);
    }
  };

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
      kecamatan: `KECAMATAN UJI COBA`, bulan: "MARET", tahun: "2026",
      kabupaten: randomKab, kategori: Math.random() > 0.5 ? 'VERKOM' : 'ABSEN',
      drive_url: "#", uploadedAt: serverTimestamp()
    };

    setUploadStatus('MEREKAM DATA KE DATABASE...');
    await push(ref(db, 'kalsel_files'), extractedData);
    setUploadStatus('SUKSES! DATA TERSIMPAN.');
    setLatestUploadedCard(extractedData); 
    setTimeout(() => { setIsUploading(false); setUploadStatus(''); }, 2000);
  };

  const toggleMenu = (menu: string) => { setExpandedMenus((prev: any) => ({ ...prev, [menu]: !prev[menu] })); };

  // ============================================================================
  // 7. TAMPILAN ANTARMUKA
  // ============================================================================
  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans uppercase">
      
      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0 -translate-x-full'} transition-all duration-300 bg-emerald-900 text-white flex flex-col fixed md:relative z-20 h-full overflow-y-auto shadow-xl`}>
        <div className="p-4 flex items-center justify-between bg-emerald-950">
          <h1 className="font-bold text-lg tracking-wider flex items-center gap-2">
            <FolderOpen size={20} className="text-orange-400" /> E-ARSIP KALSEL
          </h1>
          <button className="md:hidden text-gray-300" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>

        <nav className="flex-1 p-4 space-y-2 text-sm font-semibold tracking-wide">
          <button onClick={() => { setActiveMenu('DASHBOARD'); setActiveDistrict(''); setLatestUploadedCard(null); }} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeMenu === 'DASHBOARD' ? 'bg-emerald-700' : 'hover:bg-emerald-800'}`}>
            <BarChart2 size={18} /> RINGKASAN
          </button>

          {['VERKOM', 'ABSEN'].map(menu => (
            <div key={menu}>
              <button onClick={() => toggleMenu(menu)} className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-emerald-800 transition-colors ${(activeMenu === menu && !activeDistrict) ? 'bg-emerald-700' : ''}`}>
                <div className="flex items-center gap-3">{menu === 'VERKOM' ? <FileCheck size={18} /> : <FileText size={18}/>} DATA {menu}</div>
                {expandedMenus[menu] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {expandedMenus[menu] && (
                <div className="ml-8 mt-1 space-y-1">
                  {KABUPATEN_KOTA.map(kab => (
                    <button key={`${menu}-${kab}`} onClick={() => {setActiveMenu(menu); setActiveDistrict(kab); setSearchQuery(''); setLatestUploadedCard(null);}} className={`w-full text-left p-2 rounded text-xs transition-colors ${activeMenu === menu && activeDistrict === kab ? 'bg-orange-500 font-bold text-white' : 'text-emerald-200 hover:bg-emerald-800'}`}>
                      {kab}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <hr className="border-emerald-700 my-4" />

          <button onClick={() => { setActiveMenu('SETTINGS'); setActiveDistrict(''); setLatestUploadedCard(null); }} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeMenu === 'SETTINGS' ? 'bg-emerald-700' : 'hover:bg-emerald-800'}`}>
            <Settings size={18} /> PENGATURAN LINK
          </button>
          <button onClick={() => { setActiveMenu('UPLOAD'); setActiveDistrict(''); setLatestUploadedCard(null); }} className={`w-full flex items-center gap-3 p-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors mt-2`}>
            <UploadCloud size={18} /> UPLOAD AI & BACA
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        <header className="bg-white shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="text-gray-500 hover:text-emerald-700" onClick={() => setSidebarOpen(!isSidebarOpen)}><Menu size={24} /></button>
            <h2 className="text-xl font-bold text-gray-800 tracking-wide">
              {activeMenu === 'DASHBOARD' && 'DASHBOARD SISTEM'}
              {activeMenu === 'UPLOAD' && 'UPLOAD FILE & ANALISIS AI'}
              {activeMenu === 'SETTINGS' && 'PENGATURAN LINK & ADMIN'}
              {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && `MENU ${activeMenu} ${activeDistrict ? `- KABUPATEN ${activeDistrict}` : ''}`}
            </h2>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 bg-emerald-100 px-4 py-2 rounded-lg text-emerald-700 text-xs font-bold border border-emerald-200">
              <ShieldCheck size={16}/> ADMIN AKTIF
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          
          {/* DASHBOARD UTUH */}
          {activeMenu === 'DASHBOARD' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-4 bg-emerald-100 text-emerald-700 rounded-full"><FolderOpen size={24} /></div><div><p className="text-sm font-bold text-gray-500">TOTAL FILE</p><p className="text-3xl font-black text-gray-800">{stats.total}</p></div></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-4 bg-blue-100 text-blue-700 rounded-full"><FileCheck size={24} /></div><div><p className="text-sm font-bold text-gray-500">DATA VERKOM</p><p className="text-3xl font-black text-gray-800">{stats.verkom}</p></div></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-4 bg-orange-100 text-orange-700 rounded-full"><FileText size={24} /></div><div><p className="text-sm font-bold text-gray-500">DATA ABSENSI</p><p className="text-3xl font-black text-gray-800">{stats.absen}</p></div></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 leading-relaxed">
                <h3 className="text-lg font-bold mb-4 border-b pb-2">INFORMASI SISTEM</h3>
                <p className="text-gray-600 mb-4">SELAMAT DATANG DI SISTEM E-ARSIP KALIMANTAN SELATAN. APLIKASI INI MENGGUNAKAN <strong className="text-emerald-700">GOOGLE DRIVE</strong> SEBAGAI PENYIMPANAN FILE DAN <strong className="text-emerald-700">GEMINI 2.5 FLASH</strong> UNTUK MEMBACA ISI PDF SECARA OTOMATIS.</p>
                <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg border"><strong>PANDUAN ADMIN:</strong> Masuk ke menu Pengaturan Link, masukkan password admin untuk mengatur link, mensinkronisasi data anti-ganda, dan mereset dashboard.</p>
              </div>
            </div>
          )}

          {/* SETTINGS ADMIN & TOMBOL RESET */}
          {activeMenu === 'SETTINGS' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {!isAdmin ? (
                <div className="bg-white p-10 rounded-xl shadow-sm border border-gray-100 text-center max-w-md mx-auto mt-10">
                  <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-6"><Lock size={40}/></div>
                  <h3 className="text-2xl font-black mb-2 text-gray-800">AKSES DIBATASI</h3>
                  <p className="text-gray-500 text-sm mb-8 font-semibold">Masukkan password admin untuk masuk ke Control Panel.</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <input type="password" placeholder="PASSWORD..." className="w-full p-4 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-center font-bold text-lg" value={passInput} onChange={(e) => setPassInput(e.target.value)} />
                    <button type="submit" className="w-full bg-emerald-600 text-white p-4 rounded-lg font-bold text-lg hover:bg-emerald-700">LOGIN ADMIN</button>
                    {authError && <p className="text-red-500 text-sm font-bold bg-red-50 p-2 rounded">{authError}</p>}
                  </form>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-6 border-b pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-100 text-blue-700 rounded-lg"><LinkIcon size={24} /></div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">CONTROL PANEL ADMIN</h3>
                        <p className="text-sm text-gray-500 font-semibold mt-1">Sistem Otomatis Menolak File Ganda (Duplikat).</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleResetDatabase} className="text-sm font-bold text-white bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2"><Trash2 size={16}/> RESET DASHBOARD</button>
                      <button onClick={() => setIsAdmin(false)} className="text-sm font-bold text-red-500 bg-red-50 px-4 py-2 rounded-lg hover:bg-red-100">LOGOUT</button>
                    </div>
                  </div>

                  {saveLinkStatus && (
                    <div className={`mb-6 p-4 font-bold flex items-center gap-3 rounded-lg border shadow-sm ${saveLinkStatus.includes('GAGAL') || saveLinkStatus.includes('KESALAHAN') ? 'bg-red-100 text-red-800 border-red-200' : saveLinkStatus.includes('DITOLAK') || saveLinkStatus.includes('SKIP') ? 'bg-orange-100 text-orange-800 border-orange-200' : saveLinkStatus.includes('SELESAI') ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse'}`}>
                      {isSyncing && saveLinkStatus.includes('MEREKAM') ? <Database className="animate-bounce" size={20} /> : isSyncing && saveLinkStatus.includes('DITOLAK') ? <AlertTriangle size={20}/> : (isSyncing && <Loader2 className="animate-spin" size={20} />)}
                      {saveLinkStatus}
                    </div>
                  )}

                  <div className="space-y-8">
                    {KABUPATEN_KOTA.map(kab => (
                      <div key={`link-${kab}`} className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <h4 className="font-black text-lg text-emerald-800 mb-4 border-b pb-2">{kab}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-600 flex items-center gap-2"><FileCheck size={14} className="text-emerald-600"/> FOLDER VERKOM</label>
                            <div className="flex flex-col gap-2">
                              <input type="url" placeholder="HTTPS://DRIVE..." className="w-full px-4 py-3 border border-gray-300 rounded-md normal-case text-sm bg-white" value={verkomLinks[kab] || ''} onChange={(e) => setVerkomLinks({...verkomLinks, [kab]: e.target.value})} disabled={isSyncing}/>
                              <button onClick={() => handleSaveLink(kab, 'VERKOM')} disabled={isSyncing || !verkomLinks[kab]} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md disabled:opacity-50 text-sm">
                                {isSyncing ? 'SINKRONISASI...' : 'SYNC VERKOM'}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-600 flex items-center gap-2"><FileText size={14} className="text-blue-600"/> FOLDER ABSENSI</label>
                            <div className="flex flex-col gap-2">
                              <input type="url" placeholder="HTTPS://DRIVE..." className="w-full px-4 py-3 border border-gray-300 rounded-md normal-case text-sm bg-white" value={absenLinks[kab] || ''} onChange={(e) => setAbsenLinks({...absenLinks, [kab]: e.target.value})} disabled={isSyncing}/>
                              <button onClick={() => handleSaveLink(kab, 'ABSEN')} disabled={isSyncing || !absenLinks[kab]} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md disabled:opacity-50 text-sm">
                                {isSyncing ? 'SINKRONISASI...' : 'SYNC ABSENSI'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latestUploadedCard && (
                <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-xl shadow-sm flex items-start gap-4 animate-bounce-short">
                  <CheckCircle className="text-emerald-500 mt-1" size={32} />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-800 mb-1">BERHASIL MEREKAM DATA</h4>
                    <p className="text-2xl font-black text-emerald-900">{latestUploadedCard.nama_sekolah}</p>
                    <p className="text-sm font-semibold text-emerald-700 mt-1">{latestUploadedCard.kecamatan} • {latestUploadedCard.kabupaten} • <span className="bg-emerald-200 px-2 py-1 rounded">{latestUploadedCard.kategori}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* UPLOAD MANUAL */}
          {activeMenu === 'UPLOAD' && (
             <div className="max-w-2xl mx-auto space-y-6">
               <div className="bg-white p-8 rounded-xl text-center border border-gray-100 shadow-sm">
                 <h3 className="text-2xl font-black text-gray-800 mb-2">UPLOAD DOKUMEN PDF</h3>
                 <div className="border-2 border-dashed border-emerald-400 rounded-xl p-12 bg-emerald-50 mb-6 mt-6">
                   <UploadCloud className="mx-auto text-emerald-500 mb-4" size={56} />
                   <button onClick={handleSimulateUpload} disabled={isUploading} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold text-lg disabled:opacity-50">
                     {isUploading ? 'MEMPROSES...' : 'SIMULASIKAN UPLOAD'}
                   </button>
                 </div>
                 {uploadStatus && <div className={`mt-4 p-4 font-bold flex justify-center gap-3 rounded-lg ${uploadStatus.includes('SUKSES') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                   {isUploading && uploadStatus.includes('MEREKAM') ? <Database className="animate-bounce" size={20} /> : (isUploading && <Loader2 className="animate-spin" size={20}/>)}
                   {uploadStatus}
                 </div>}
               </div>
             </div>
          )}

          {/* TABEL DATA LENGKAP DENGAN SORTIR CERDAS */}
          {(activeMenu === 'VERKOM' || activeMenu === 'ABSEN') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-wrap gap-4">
                <div className="relative flex-1 min-w-[300px] max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Search className="text-gray-400" size={20} /></div>
                  <input type="text" placeholder="CARI NAMA SEKOLAH ATAU KECAMATAN..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-semibold text-sm" />
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-100 text-emerald-900 text-sm">
                      <th className="p-4 font-black border-b text-center">NO</th>
                      <th className="p-4 font-black border-b">NAMA SEKOLAH</th>
                      <th className="p-4 font-black border-b">KECAMATAN</th>
                      <th className="p-4 font-black border-b">BULAN / TAHUN</th>
                      <th className="p-4 font-black border-b text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.length === 0 ? (
                      <tr><td colSpan={5} className="p-10 text-center text-gray-500 font-bold text-lg">TIDAK ADA DATA {activeMenu} TERSIMPAN.</td></tr>
                    ) : (
                      filteredData.map((row, i) => (
                        <tr key={row.id} className="border-b hover:bg-emerald-50 transition-colors">
                          <td className="p-4 font-bold text-center text-gray-600">{i + 1}</td>
                          <td className="p-4 font-bold text-gray-900 text-lg">{row.nama_sekolah}</td>
                          <td className="p-4 text-sm font-semibold text-gray-700">{row.kecamatan}</td>
                          <td className="p-4 text-sm">
                            <span className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-md text-xs font-bold border border-emerald-200">
                              {row.bulan} {row.tahun}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <button onClick={() => { if (row.drive_url && row.drive_url !== "#") window.open(row.drive_url, '_blank'); else alert('Data simulasi tidak ada file asli.'); }} className={`inline-flex items-center gap-2 text-xs text-white font-bold px-4 py-2 rounded-lg shadow-sm ${activeMenu === 'VERKOM' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                              <Download size={16} /> UNDUH
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-100 p-4 border-t border-gray-200 text-sm text-gray-600 font-bold flex justify-between">
                <span>TOTAL DATA TAMPIL: {filteredData.length}</span>
                <span>SISTEM E-ARSIP KALSEL V3.0 (SORTED)</span>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
