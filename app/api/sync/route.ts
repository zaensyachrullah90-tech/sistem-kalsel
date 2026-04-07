import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { file, kabupaten, kategori, driveApiKey } = await req.json();

    const GEMINI_KEYS = [
      process.env.GEMINI_API_KEY,    
      process.env.GEMINI_API_KEY_2,  
      process.env.GEMINI_API_KEY_3,  
      process.env.GEMINI_API_KEY_4,  
      process.env.GEMINI_API_KEY_5   
    ].filter(key => key && key.trim() !== "");

    if (GEMINI_KEYS.length === 0) {
      return NextResponse.json({ error: "API Key Vercel Kosong! Bapak WAJIB melakukan REDEPLOY." }, { status: 400 });
    }

    const activeKey = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];
    const genAI = new GoogleGenerativeAI(activeKey as string);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Download File
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${driveApiKey}&supportsAllDrives=true`;
    const fileResponse = await fetch(downloadUrl);
    
    if (!fileResponse.ok) {
       return NextResponse.json({ error: "Gagal mendownload foto dari Google Drive." }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.mimeType || 'application/pdf';

    // 2. PROMPT CERDAS
    const prompt = `Anda adalah asisten arsip data. Nama file asli gambar ini adalah: "${file.name}".
    Ekstrak data dari gambar/dokumen ini. Jika teks kurang jelas, GUNAKAN NAMA FILE di atas untuk menebak nama sekolah, bulan, dan tahunnya.
    Keluarkan data HANYA dalam format JSON murni:
    {
      "nama_sekolah": "Nama sekolah lengkap (misal: MIN 17 HSS / SDN 1 PAKAN DALAM)",
      "kecamatan": "Nama kecamatan, jika tidak tahu isi BELUM TERBACA",
      "bulan": "Nama bulan (Januari-Desember)",
      "tahun": "Tahun dokumen (misal 2026). Jika tidak ada, isi tahun saat ini"
    }`;

    // =====================================================================
    // 🔥 PERBAIKAN FATAL: PROSES AI SEKARANG ADA DI LUAR TRY-CATCH PARSING
    // Jika AI limit (429), errornya akan terlempar ke frontend untuk ganti Key!
    // =====================================================================
    const aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);
    let aiText = aiResult.response.text();

    // 3. PARSING HASIL (Aman dari kegagalan tebakan AI)
    let extractedData = {
      nama_sekolah: "MEMBUTUHKAN EDIT MANUAL",
      kecamatan: "BELUM TERBACA",
      bulan: "BELUM TERBACA",
      tahun: new Date().getFullYear().toString()
    };

    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        const cleanText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        extractedData = JSON.parse(cleanText);
      }
    } catch (parseError) {
      console.log("AI mengembalikan format aneh, menggunakan default untuk: " + file.name);
    }

    // 4. KEMBALIKAN DATA
    return NextResponse.json({
      success: true,
      data: {
        ...extractedData,
        kabupaten: kabupaten,
        kategori: kategori, 
        drive_id: file.id,
        file_name_original: file.name,
        drive_url: `https://drive.google.com/file/d/${file.id}/view`
      }
    });

  } catch (error: any) {
    // 🔥 ERROR LIMIT (429) AKAN TERTANGKAP DI SINI DAN DIKIRIM KE DEPAN
    const errorMessage = error.message || "Gagal memproses.";
    return NextResponse.json({ error: errorMessage }, { status: errorMessage.includes('429') || errorMessage.includes('QUOTA') ? 429 : 500 });
  }
}
