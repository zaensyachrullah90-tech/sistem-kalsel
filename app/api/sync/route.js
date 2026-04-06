import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi Otak AI Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    // 1. Menerima data dari tombol "Simpan & Sync" di halaman depan
    const { folderUrl, kabupaten, driveApiKey } = await req.json();

    // 2. Mengekstrak ID Folder dari Link Drive (Mengambil teks setelah /folders/)
    const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9-_]+)/);
    if (!folderIdMatch) {
      return NextResponse.json({ error: "Link Drive tidak valid. Pastikan formatnya benar." }, { status: 400 });
    }
    const folderId = folderIdMatch[1];

    // 3. Mengambil daftar file PDF dari folder tersebut via Google Drive API
    const driveListUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/pdf'&key=${driveApiKey}`;
    const listResponse = await fetch(driveListUrl);
    const listData = await listResponse.json();

    if (!listData.files || listData.files.length === 0) {
      return NextResponse.json({ error: "Folder kosong atau aksesnya belum diatur ke 'Siapa saja yang memiliki link'." }, { status: 404 });
    }

    // Mengambil 1 file pertama saja untuk mencegah Timeout Vercel (MVP)
    // Untuk 500 file, butuh skenario antrean (batch processing) lanjutan.
    const fileToProcess = listData.files[0];

    // 4. Mengunduh isi PDF tersebut
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileToProcess.id}?alt=media&key=${driveApiKey}`;
    const fileResponse = await fetch(downloadUrl);
    const arrayBuffer = await fileResponse.arrayBuffer();
    
    // Mengubah PDF menjadi format Base64 agar bisa dibaca AI
    const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

    // 5. Menyuruh Gemini 2.5 Flash membaca PDF
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Baca dokumen ini dan ekstrak data berikut dalam format JSON Murni (tanpa markdown).
    {
      "nama_sekolah": "...",
      "kecamatan": "...",
      "bulan": "...",
      "tahun": "..."
    }`;

    const aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Pdf, mimeType: "application/pdf" } }
    ]);

    let aiText = aiResult.response.text();
    // Membersihkan format markdown bawaan AI (jika ada)
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "");
    
    const extractedData = JSON.parse(aiText);

    // Mengembalikan hasil ekstraksi AI ke halaman depan agar disimpan ke Database
    return NextResponse.json({
      success: true,
      data: {
        ...extractedData,
        kabupaten: kabupaten,
        kategori: "VERKOM", // Default, bisa diubah dinamis
        drive_url: `https://drive.google.com/file/d/${fileToProcess.id}/view`
      }
    });

  } catch (error: any) {
    console.error("API ERROR:", error);
    return NextResponse.json({ error: error.message || "Gagal memproses file." }, { status: 500 });
  }
}