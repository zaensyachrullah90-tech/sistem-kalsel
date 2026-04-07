import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { file, kabupaten, kategori, driveApiKey } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Download File (Bisa PDF, JPG, atau PNG)
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${driveApiKey}&supportsAllDrives=true`;
    const fileResponse = await fetch(downloadUrl);
    
    if (!fileResponse.ok) {
       return NextResponse.json({ error: "Gagal mengunduh file dari Drive." }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // MENDETEKSI JENIS FILE (Gambar / PDF)
    const mimeType = file.mimeType || 'application/pdf';

    // 2. Baca dengan Gemini AI
    const prompt = `Baca dokumen atau gambar ini. Ekstrak data berikut dalam format JSON murni.
    {
      "nama_sekolah": "...",
      "kecamatan": "...",
      "bulan": "...",
      "tahun": "..."
    }
    Jika data tidak ditemukan, isi dengan "TIDAK ADA". Jawab HANYA dengan JSON murni.`;

    const aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);

    let aiText = aiResult.response.text();
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const extractedData = JSON.parse(aiText);

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
    return NextResponse.json({ error: error.message || "Gagal memproses API." }, { status: 500 });
  }
}
