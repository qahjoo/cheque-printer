import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function CheckFormIncoming() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    check_number: '',
    drawer_name: '',
    drawer_phone: '',
    bank_name: '',
    amount: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    received_date: new Date().toISOString().split('T')[0],
    status: 'received',
    notes: '',
    imageBase64: '',
  });

  // Convert File to Base64
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('عذراً، حجم الصورة يجب أن لا يتجاوز 5 ميغابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, imageBase64: event.target.result, removeImage: false }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (id) {
      window.api.incomingChecks.get(id).then(data => {
        if (data) {
          setFormData({
            check_number: data.check_number,
            drawer_name: data.drawer_name,
            drawer_phone: data.drawer_phone || '',
            bank_name: data.bank_name,
            amount: String(data.amount),
            issue_date: data.issue_date,
            due_date: data.due_date,
            received_date: data.received_date,
            status: data.status,
            notes: data.notes || '',
            imageBase64: data.imageBase64 || '',
            removeImage: false,
          });
        }
      });
    }
  }, [id]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...formData, amount: Number(formData.amount) };
      if (id) {
        await window.api.incomingChecks.update({ id, ...payload });
      } else {
        await window.api.incomingChecks.create(payload);
      }
      navigate('/incoming-checks');
    } catch (err) {
      alert('خطأ في الحفظ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold">{id ? 'تعديل شيك وارد' : 'إضافة شيك وارد'}</h1>
        <p className="text-sm text-slate-500 mt-1">تسجيل بيانات الشيك المستلم</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">رقم الشيك *</label>
              <input required name="check_number" value={formData.check_number} onChange={handleChange} className="input-field" placeholder="مثال: 1002345" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">المبلغ *</label>
              <input required type="number" step="0.001" min="0" name="amount" value={formData.amount} onChange={handleChange} className="input-field text-left font-mono" placeholder="0.000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">الساحب (العميل) *</label>
              <input required name="drawer_name" value={formData.drawer_name} onChange={handleChange} className="input-field" placeholder="اسم الشركة أو الشخص" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">رقم الهاتف</label>
              <input name="drawer_phone" value={formData.drawer_phone} onChange={handleChange} className="input-field" placeholder="رقم هاتف العميل للتواصل" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">البنك المسحوب عليه *</label>
            <input required name="bank_name" value={formData.bank_name} onChange={handleChange} className="input-field" placeholder="مثال: البنك الإسلامي الأردني" />
          </div>

          <div className="grid grid-cols-3 gap-4 border-y border-slate-800 py-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">تاريخ الإصدار *</label>
              <input required type="date" name="issue_date" value={formData.issue_date} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">تاريخ الاستحقاق *</label>
              <input required type="date" name="due_date" value={formData.due_date} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">تاريخ الاستلام *</label>
              <input required type="date" name="received_date" value={formData.received_date} onChange={handleChange} className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">حالة الشيك</label>
              <select name="status" value={formData.status} onChange={handleChange} className="input-field">
                <option value="received">مستلم</option>
                <option value="under_collection">قيد التحصيل</option>
                <option value="collected">مُحصّل</option>
                <option value="returned">مرتجع</option>
                <option value="endorsed">مُجيّر</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">ملاحظات</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} className="input-field h-24" placeholder="أي تفاصيل إضافية..." />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">صورة الشيك (اختياري)</label>
            
            {formData.imageBase64 ? (
              <div className="relative mt-2 inline-block rounded-lg border border-slate-700 bg-slate-900 p-2">
                <img 
                  src={formData.imageBase64} 
                  alt="صورة الشيك" 
                  className="h-32 w-auto rounded object-contain shadow-sm cursor-pointer hover:opacity-90"
                  onClick={() => window.open(formData.imageBase64, '_blank')}
                />
                <button 
                  type="button" 
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow hover:bg-rose-700"
                  onClick={() => setFormData(prev => ({ ...prev, imageBase64: '', removeImage: true }))}
                  title="حذف الصورة"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="mt-2 flex w-full max-w-sm items-center justify-center">
                <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/50 hover:bg-slate-800">
                  <div className="flex flex-col items-center justify-center pb-6 pt-5">
                    <span className="mb-2 text-2xl text-slate-400">📷</span>
                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">اضغط لرفع صورة</span> أو استخدم الكاميرا</p>
                    <p className="text-xs text-slate-500">JPG, PNG (الحد الأقصى 5MB)</p>
                  </div>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => navigate('/incoming-checks')} className="btn-secondary">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'جاري الحفظ...' : 'حفظ الشيك الوارد'}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  );
}
