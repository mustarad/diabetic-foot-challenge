/*
 * الأسئلة المعتمدة — لا تُعدَّل صياغتها العربية.
 * Approved questions. The Arabic wording is the approved text and must not be changed.
 * كل خيار يحمل علامة correct لاستخدامها في الاحتساب فقط، ولا تُعرض أثناء التحدي.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QUESTIONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    {
      id: 'q1',
      type: 'multi',
      text: {
        ar: 'ما العوامل التي قد تسبب جروحًا وقرحًا في القدم السكرية؟',
        en: 'Which factors may cause wounds and ulcers in the diabetic foot?'
      },
      hint: {
        ar: 'اختر جميع الإجابات الصحيحة.',
        en: 'Select all the correct answers.'
      },
      options: [
        { id: 'q1o1', correct: true, ar: 'حذاء ضيق.', en: 'Tight shoes.' },
        { id: 'q1o2', correct: true, ar: 'ضعف الدورة الدموية.', en: 'Poor blood circulation.' },
        { id: 'q1o3', correct: true, ar: 'المشي حافي القدمين.', en: 'Walking barefoot.' },
        { id: 'q1o4', correct: true, ar: 'ارتفاع السكر.', en: 'High blood sugar.' },
        { id: 'q1o5', correct: true, ar: 'حذاء سيئ التهوية.', en: 'Poorly ventilated shoes.' },
        { id: 'q1o6', correct: true, ar: 'التعرض للأجسام الحادة.', en: 'Exposure to sharp objects.' },
        { id: 'q1o7', correct: true, ar: 'فقدان الإحساس بالقدم.', en: 'Loss of sensation in the foot.' },
        { id: 'q1o8', correct: true, ar: 'إهمال الجروح الصغيرة.', en: 'Neglecting small wounds.' },
        { id: 'q1o9', correct: true, ar: 'جفاف وتشقق الجلد.', en: 'Dry, cracked skin.' }
      ]
    },
    {
      id: 'q2',
      type: 'single',
      text: {
        ar: 'كيف يمكن الوقاية من القدم السكرية؟',
        en: 'How can diabetic foot be prevented?'
      },
      options: [
        { id: 'q2a', correct: true, ar: 'فحص القدمين يوميًا وارتداء حذاء مناسب.', en: 'Checking the feet daily and wearing suitable shoes.' },
        { id: 'q2b', correct: false, ar: 'إهمال الجروح الصغيرة.', en: 'Neglecting small wounds.' },
        { id: 'q2c', correct: false, ar: 'المشي حافي القدمين.', en: 'Walking barefoot.' },
        { id: 'q2d', correct: false, ar: 'ارتداء الأحذية الضيقة.', en: 'Wearing tight shoes.' }
      ]
    },
    {
      id: 'q3',
      type: 'single',
      text: {
        ar: 'لماذا قد تكون القدم السكرية خطيرة؟',
        en: 'Why can diabetic foot be dangerous?'
      },
      options: [
        { id: 'q3a', correct: false, ar: 'لأنها تسبب التعب فقط.', en: 'Because it only causes fatigue.' },
        { id: 'q3b', correct: true, ar: 'لأنها قد تؤدي إلى تقرحات والتهابات وقد تصل إلى البتر.', en: 'Because it may lead to ulcers and infections, and may even lead to amputation.' },
        { id: 'q3c', correct: false, ar: 'لأنها تسبب تغير لون الأظافر فقط.', en: 'Because it only causes nail discolouration.' },
        { id: 'q3d', correct: false, ar: 'لأنها تسبب ألمًا مؤقتًا.', en: 'Because it causes temporary pain.' }
      ]
    }
  ];
});
