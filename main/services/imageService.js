// =============================================================================
// main/services/imageService.js — إدارة صور الشيكات محلياً وسحابياً
// =============================================================================

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let imagesDir = '';

function getImagesDir() {
  if (!imagesDir) {
    const userData = app.getPath('userData');
    imagesDir = path.join(userData, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
  }
  return imagesDir;
}

// يحفظ الصورة المرفوعة من الواجهة (Base64) إلى الجهاز المحلي
function saveBase64ImageLocally(base64Data, filename) {
  try {
    const dir = getImagesDir();
    const filePath = path.join(dir, filename);
    
    // إزالة ترويسة base64 إذا كانت موجودة مثل (data:image/jpeg;base64,)
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    fs.writeFileSync(filePath, imageBuffer);
    return true;
  } catch (err) {
    console.error('[imageService] Error saving image locally:', err.message);
    return false;
  }
}

// يقرأ الصورة من الجهاز المحلي ويرجعها كـ Base64 لكي تستخدمها الواجهة
function readImageLocallyAsBase64(filename) {
  try {
    if (!filename) return null;
    const dir = getImagesDir();
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return null;
    
    const ext = path.extname(filename).substring(1) || 'jpeg';
    const data = fs.readFileSync(filePath);
    return `data:image/${ext};base64,${data.toString('base64')}`;
  } catch (err) {
    console.error('[imageService] Error reading image locally:', err.message);
    return null;
  }
}

// رفع الصورة من الجهاز المحلي إلى سحابة Supabase (دفع)
async function uploadToSupabase(filename, supabaseClient) {
  try {
    const dir = getImagesDir();
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return false;

    const fileBuffer = fs.readFileSync(filePath);
    const contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const { data, error } = await supabaseClient
      .storage
      .from('milano')
      .upload(filename, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error('[imageService] Upload error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[imageService] Upload exception:', err.message);
    return false;
  }
}

// تنزيل الصورة من سحابة Supabase إلى الجهاز المحلي (سحب)
async function downloadFromSupabase(filename, supabaseClient) {
  try {
    const dir = getImagesDir();
    const filePath = path.join(dir, filename);
    
    // إذا كانت موجودة مسبقاً، لا داعي لتنزيلها
    if (fs.existsSync(filePath)) return true;

    const { data, error } = await supabaseClient
      .storage
      .from('milano')
      .download(filename);

    if (error) {
      console.error('[imageService] Download error:', error.message);
      return false;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return true;
  } catch (err) {
    console.error('[imageService] Download exception:', err.message);
    return false;
  }
}

module.exports = {
  getImagesDir,
  saveBase64ImageLocally,
  readImageLocallyAsBase64,
  uploadToSupabase,
  downloadFromSupabase
};
