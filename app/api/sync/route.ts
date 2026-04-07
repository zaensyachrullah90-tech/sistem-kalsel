import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { file, kabupaten, kategori, driveApiKey } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Download File (PDF / JPG / PNG) dari Drive API
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${driveApiKey}&supportsAllDrives=true`;
    const fileResponse = await fetch(downloadUrl);
    
    if (!fileResponse.ok) {
       return NextResponse.json({ error: "Gagal mengunduh file. Format tidak didukung / File terlalu besar." }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    
    // Pastikan mimetype sesuai dengan file yang dikirim
    const mimeType = file.mimeType || 'application/pdf';

    // 2. Baca dengan Gemini AI (Prompt Super Kuat)
    const prompt = `Anda adalah asisten arsip. Baca dokumen/gambar ini dan ekstrak data berikut dalam format JSON murni.
    {
      "nama_sekolah": "Nama sekolah di dokumen (misal: SDN 1 CONTOH), jika tidak terbaca isi dengan BELUM TERBACA",
      "kecamatan": "Nama kecamatan, jika tidak terbaca isi dengan BELUM TERBACA",
      "bulan": "Nama bulan (Januari-Desember), jika tidak terbaca isi dengan BELUM TERBACA",
      "tahun": "Tahun (misal: 2024), jika tidak terbaca isi dengan BELUM TERBACA"
    }
    Hanya kembalikan JSON murni, jangan ada teks lain.`;

    const aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);

    let aiText = aiResult.response.text();
    
    // EKSTRAKTOR JSON ANTI-GAGAL (Memaksa mengambil data di dalam kurung kurawal)
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI gagal menemukan teks yang bisa dibaca pada gambar/dokumen ini." }, { status: 400 });
    }
    
    const extractedData = JSON.parse(jsonMatch[0]);

    // 3. Kembalikan Hasil ke Frontend
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
    return NextResponse.json({ error: error.message || "Timeout Vercel / Gagal memproses AI." }, { status: 500 });
  }
}
