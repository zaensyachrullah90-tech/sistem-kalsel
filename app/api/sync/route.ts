import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Cegah sistem menggunakan cache lama
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { file, kabupaten, kategori, driveApiKey } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Download File (PDF / JPG / PNG)
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${driveApiKey}&supportsAllDrives=true`;
    const fileResponse = await fetch(downloadUrl);
    
    if (!fileResponse.ok) {
       return NextResponse.json({ error: "Gagal mengunduh file. Pastikan file tidak rusak." }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.mimeType || 'application/pdf';

    // 2. PROMPT CERDAS (Memberikan nama file sebagai contekan)
    const prompt = `Anda adalah asisten arsip data yang sangat teliti.
    Nama file asli dokumen/gambar ini adalah: "${file.name}".
    
    Tugas Anda: Ekstrak data dari gambar/dokumen ini. Jika teks di dalam gambar kurang jelas, GUNAKAN INFORMASI DARI NAMA FILE di atas untuk menebak nama sekolah, bulan, dan tahunnya.
    
    Keluarkan data dalam format JSON murni seperti ini:
    {
      "nama_sekolah": "Nama sekolah lengkap (misal: MIN 17 HULU SUNGAI SELATAN / SDN 1 PAKAN DALAM)",
      "kecamatan": "Nama kecamatan, jika tidak tahu isi BELUM TERBACA",
      "bulan": "Nama bulan (Januari-Desember)",
      "tahun": "Tahun dokumen (misal 2024 / 2025). Jika tidak ada, isi tahun saat ini"
    }
    Hanya kembalikan JSON murni, jangan ada teks penjelasan apapun.`;

    const aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);

    let aiText = aiResult.response.text();
    
    // Mengekstrak JSON secara paksa agar aman
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI gagal mengekstrak data JSON." }, { status: 400 });
    }
    
    const extractedData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: {
        ...extractedData,
        kabupaten: kabupaten,
        kategori: kategori, 
        drive_id: file.id,
        drive_url: `https://drive.google.com/file/d/${file.id}/view`
      }
    });

  } catch (error: any) {
    // Menangkap Error 429 dari Google atau Timeout
    const errorMessage = error.message || "Gagal memproses AI.";
    return NextResponse.json({ error: errorMessage }, { status: errorMessage.includes('429') || errorMessage.includes('QUOTA') ? 429 : 500 });
  }
}
