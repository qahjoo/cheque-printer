// =============================================================================
// main/ipc/updater.js — نظام التحديث التلقائي الإجباري عبر GitHub Releases
// =============================================================================

const { autoUpdater } = require('electron-updater');

module.exports = function registerUpdater(ipcMain, ctx) {
  // إعداد مسار التسجيل (Logging) ليتمكن المبرمج من معرفة الأخطاء إن وجدت
  const log = require('electron-log');
  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  // بما أن التحديث إجباري والمستودع قد يكون Private أو Public
  // نقوم بتعطيل التحميل التلقائي لنقوم بإرسال إشعار للواجهة أولاً إن أردنا،
  // أو نجعله يتم التحميل التلقائي بصمت.
  autoUpdater.autoDownload = true; 
  autoUpdater.autoInstallOnAppQuit = true;

  // السماح بخفض الإصدار للتراجع عن التحديثات إذا لزم الأمر
  autoUpdater.allowDowngrade = true;

  // إرسال الأحداث إلى الواجهة (React) لعرض تقدم التحميل للموظف
  function sendStatusToWindow(text, progressObj = null) {
    const win = ctx.getMainWindow && ctx.getMainWindow();
    if (win) {
      win.webContents.send('updater:message', { text, progressObj });
    }
  }

  // أحداث المُحدّث
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('جاري التحقق من وجود تحديثات...');
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('تم العثور على تحديث جديد! جاري التحميل بصمت...');
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('أنت تستخدم أحدث نسخة.');
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow('خطأ في التحديث: ' + err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow('جاري التحميل...', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('تم اكتمال التحميل. سيتم إعادة التشغيل وتثبيت التحديث الآن!');
    
    // بما أن التحديث "إجباري"، ننتظر 3 ثوانٍ فقط ليقرأ الموظف الرسالة، ثم نعيد تشغيل البرنامج
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 3000);
  });

  // قناة اتصال يدوية إذا أراد المستخدم التحقق من الزر في الإعدادات
  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdatesAndNotify();
    return { ok: true };
  });

  // بدء التحقق بمجرد تشغيل البرنامج (بعد 5 ثوانٍ من الفتح لتجنب التأثير على سرعة الفتح)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      log.error('Failed to check for updates on startup:', err);
    });
  }, 5000);
};
