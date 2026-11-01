import { create } from "zustand";

export type LanguageCode = "EN" | "AR";

export interface Translations {
  // Brand & Tagline
  brandName: string;
  tagline: string;

  // Nav Groups & Items
  nav_workspace: string;
  nav_ai: string;
  nav_insights: string;
  nav_system: string;

  nav_dashboard: string;
  nav_meetings: string;
  nav_lectures: string;
  nav_calendar: string;
  nav_ai_workspace: string;
  nav_transcripts: string;
  nav_mind_maps: string;
  nav_flashcards: string;
  nav_quiz: string;
  nav_reports: string;
  nav_analytics: string;
  nav_notifications: string;
  nav_search: string;
  nav_users: string;
  nav_settings: string;
  nav_profile: string;
  nav_admin: string;

  // Header / Topbar
  searchPlaceholder: string;
  askAi: string;
  newRecording: string;
  proUpgrade: string;
  proDesc: string;
  upgradeBtn: string;
  language: string;
  theme: string;
  notifications: string;
  settings: string;
  profile: string;
  logout: string;

  // Dashboard
  briefingReady: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  startRecording: string;
  viewAiWorkspace: string;
  todaysFocus: string;
  meetingsThisWeek: string;
  lecturesRecorded: string;
  aiActionsExtracted: string;
  hoursSaved: string;
  recentMeetings: string;
  recentLectures: string;
  upcomingSessions: string;
  aiInsights: string;
  weeklyActivity: string;
  pendingTasks: string;

  // Meetings & Lectures
  allMeetings: string;
  allLectures: string;
  searchMeetings: string;
  searchLectures: string;
  filterByStatus: string;
  statusCompleted: string;
  statusProcessing: string;
  statusQueued: string;
  statusFailed: string;
  courseCode: string;
  instructor: string;
  host: string;
  duration: string;
  participants: string;
  studyNotes: string;
  keyConcepts: string;
  examHighlights: string;
  viewTranscript: string;
  openSummary: string;
  generateQuiz: string;
  studyFlashcards: string;
  noRecordingsFound: string;

  // Transcripts
  transcriptViewer: string;
  searchInTranscript: string;
  speakers: string;
  copyTranscript: string;
  exportPdf: string;
  exportTxt: string;
  translateTranscript: string;
  showingOriginal: string;
  showingTranslated: string;
  translationNotice: string;
  jumpToTimestamp: string;
  editTranscript: string;
  saveEdits: string;

  // AI & Q&A
  askAiQuestion: string;
  aiQuestionPlaceholder: string;
  askButton: string;
  groundedAnswer: string;
  citations: string;
  noCitations: string;

  // Quiz & Flashcards
  quizTitle: string;
  quizSubtitle: string;
  startQuiz: string;
  submitQuiz: string;
  score: string;
  retakeQuiz: string;
  explanation: string;
  question: string;
  of: string;
  correct: string;
  incorrect: string;

  flashcardsTitle: string;
  flashcardsSubtitle: string;
  clickToFlip: string;
  markMastered: string;
  needsReview: string;
  resetProgress: string;
  deckComplete: string;

  // Mind Maps
  mindMapsTitle: string;
  mindMapsSubtitle: string;
  centralTopic: string;
  subtopics: string;
  zoomIn: string;
  zoomOut: string;
  resetView: string;

  // Reports & Analytics
  reportsTitle: string;
  reportsSubtitle: string;
  analyticsTitle: string;
  analyticsSubtitle: string;
  audioMinutesProcessed: string;
  taskCompletionRate: string;
  totalDecisions: string;
  exportCsv: string;

  // Common Actions & Form Controls
  cancel: string;
  save: string;
  delete: string;
  confirm: string;
  close: string;
  loading: string;
  processing: string;
  success: string;
  error: string;
  back: string;
  next: string;
  actions: string;
  date: string;
  priority: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  completed: string;
  pending: string;
}

export const translations: Record<LanguageCode, Translations> = {
  EN: {
    brandName: "MeetMind AI",
    tagline: "Your Meetings. Smarter Outcomes.",

    nav_workspace: "Workspace",
    nav_ai: "AI Studio",
    nav_insights: "Insights",
    nav_system: "System",

    nav_dashboard: "Dashboard",
    nav_meetings: "Meetings",
    nav_lectures: "Lectures",
    nav_calendar: "Calendar",
    nav_ai_workspace: "AI Workspace",
    nav_transcripts: "Transcripts",
    nav_mind_maps: "Mind Maps",
    nav_flashcards: "Flashcards",
    nav_quiz: "Quiz Generator",
    nav_reports: "Reports",
    nav_analytics: "Analytics",
    nav_notifications: "Notifications",
    nav_search: "Search",
    nav_users: "Users",
    nav_settings: "Settings",
    nav_profile: "Profile",
    nav_admin: "Admin",

    searchPlaceholder: "Search meetings, lectures, people…",
    askAi: "Ask AI",
    newRecording: "New recording",
    proUpgrade: "Upgrade to Pro",
    proDesc: "Unlimited AI summaries & quizzes",
    upgradeBtn: "Upgrade",
    language: "Language",
    theme: "Theme",
    notifications: "Notifications",
    settings: "Settings",
    profile: "Profile",
    logout: "Sign out",

    briefingReady: "AI briefing ready",
    welcomeTitle: "Welcome to MeetMind AI",
    welcomeSubtitle:
      "Record meetings and educational lectures into structured transcripts, verifiable action items, comprehensive lecture notes, interactive flashcards, and quizzes automatically.",
    startRecording: "Start recording",
    viewAiWorkspace: "View AI workspace",
    todaysFocus: "Today's focus",
    meetingsThisWeek: "Meetings this week",
    lecturesRecorded: "Lectures recorded",
    aiActionsExtracted: "AI actions extracted",
    hoursSaved: "Hours saved",
    recentMeetings: "Recent Meetings",
    recentLectures: "Recent Lectures",
    upcomingSessions: "Upcoming Sessions",
    aiInsights: "AI Insights",
    weeklyActivity: "Weekly Activity",
    pendingTasks: "Pending Tasks",

    allMeetings: "All Meetings",
    allLectures: "All Educational Lectures",
    searchMeetings: "Search meetings by title, host or topic…",
    searchLectures: "Search lectures by course code, professor or topic…",
    filterByStatus: "Filter by status",
    statusCompleted: "Completed",
    statusProcessing: "Processing",
    statusQueued: "Queued",
    statusFailed: "Failed",
    courseCode: "Course Code",
    instructor: "Instructor",
    host: "Host",
    duration: "Duration",
    participants: "Participants",
    studyNotes: "Study Notes",
    keyConcepts: "Key Concepts",
    examHighlights: "Exam Highlights",
    viewTranscript: "View Transcript",
    openSummary: "AI Summary",
    generateQuiz: "Generate Quiz",
    studyFlashcards: "Study Flashcards",
    noRecordingsFound: "No recordings found matching your query.",

    transcriptViewer: "Audio Transcript & Speaker Diarization",
    searchInTranscript: "Search in transcript…",
    speakers: "Speakers",
    copyTranscript: "Copy text",
    exportPdf: "Export PDF",
    exportTxt: "Export TXT",
    translateTranscript: "Translate to Arabic",
    showingOriginal: "Showing Original Transcript (English)",
    showingTranslated: "Showing AI Translated Transcript (Arabic)",
    translationNotice:
      "AI translation generated for convenience. Grounded citations reference original timestamps.",
    jumpToTimestamp: "Seek to",
    editTranscript: "Edit text",
    saveEdits: "Save changes",

    askAiQuestion: "Ask MeetMind AI",
    aiQuestionPlaceholder:
      "Ask anything about this meeting or lecture (e.g. 'What decisions were made about latency?')...",
    askButton: "Ask AI",
    groundedAnswer: "Grounded Answer",
    citations: "Verified Citations",
    noCitations: "No matching transcript citation found.",

    quizTitle: "Knowledge Check & Quiz Generator",
    quizSubtitle:
      "Practice questions auto-generated from your lecture transcripts and textbook concepts.",
    startQuiz: "Take Quiz",
    submitQuiz: "Submit Answers",
    score: "Final Score",
    retakeQuiz: "Retake Quiz",
    explanation: "Explanation",
    question: "Question",
    of: "of",
    correct: "Correct!",
    incorrect: "Incorrect",

    flashcardsTitle: "Interactive Study Flashcards",
    flashcardsSubtitle:
      "Spaced-repetition flashcards synthesized directly from lecture discussions and definitions.",
    clickToFlip: "Click card to flip",
    markMastered: "Mark as Mastered",
    needsReview: "Needs Review",
    resetProgress: "Reset Deck",
    deckComplete: "You've reviewed all cards in this deck!",

    mindMapsTitle: "Concept & Mind Maps",
    mindMapsSubtitle:
      "Hierarchical visualization of lecture topics, sub-themes, and architectural dependencies.",
    centralTopic: "Central Topic",
    subtopics: "Subtopics",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetView: "Reset View",

    reportsTitle: "Executive & Academic Reports",
    reportsSubtitle:
      "Export comprehensive meeting digests, lecture syntheses, and operational compliance logs.",
    analyticsTitle: "System Analytics & Productivity",
    analyticsSubtitle:
      "Track hours saved, transcription accuracy, task completion velocity, and knowledge retention.",
    audioMinutesProcessed: "Audio Minutes Processed",
    taskCompletionRate: "Task Completion Rate",
    totalDecisions: "Decisions Recorded",
    exportCsv: "Export CSV",

    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    confirm: "Confirm",
    close: "Close",
    loading: "Loading…",
    processing: "Processing…",
    success: "Success",
    error: "Error",
    back: "Back",
    next: "Next",
    actions: "Actions",
    date: "Date",
    priority: "Priority",
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityLow: "Low",
    completed: "Completed",
    pending: "Pending",
  },

  AR: {
    brandName: "ميت مايند AI",
    tagline: "اجتماعاتك بذكاء. نتائج أسرع.",

    nav_workspace: "مساحة العمل",
    nav_ai: "استوديو الذكاء الاصطناعي",
    nav_insights: "التحليلات والرؤى",
    nav_system: "النظام والإعدادات",

    nav_dashboard: "لوحة التحكم",
    nav_meetings: "الاجتماعات",
    nav_lectures: "المحاضرات",
    nav_calendar: "التقويم",
    nav_ai_workspace: "مساحة الذكاء الاصطناعي",
    nav_transcripts: "النصوص والتفريغ",
    nav_mind_maps: "الخرائط الذهنية",
    nav_flashcards: "بطاقات الاستذكار",
    nav_quiz: "منشئ الاختبارات",
    nav_reports: "التقارير",
    nav_analytics: "الإحصائيات",
    nav_notifications: "الإشعارات",
    nav_search: "البحث",
    nav_users: "المستخدمون",
    nav_settings: "الإعدادات",
    nav_profile: "الملف الشخصي",
    nav_admin: "لوحة الإدارة",

    searchPlaceholder: "ابحث في الاجتماعات، المحاضرات، الأشخاص…",
    askAi: "اسأل الذكاء الاصطناعي",
    newRecording: "تسجيل جديد",
    proUpgrade: "الترقية إلى برو",
    proDesc: "ملخصات واختبارات ذكية غير محدودة",
    upgradeBtn: "ترقية",
    language: "اللغة",
    theme: "المظهر",
    notifications: "الإشعارات",
    settings: "الإعدادات",
    profile: "الملف الشخصي",
    logout: "تسجيل الخروج",

    briefingReady: "الموجز الذكي جاهز",
    welcomeTitle: "مرحباً بك في ميت مايند AI",
    welcomeSubtitle:
      "تسجيل الاجتماعات والمحاضرات وتحويلها آلياً إلى تفريغ نصي دقيق، ومهام تنفيذية محددة، وملاحظات دراسية، وبطاقات استذكار، واختبارات تفاعلية.",
    startRecording: "بدء التسجيل",
    viewAiWorkspace: "فتح مساحة العمل الذكية",
    todaysFocus: "تركيز اليوم",
    meetingsThisWeek: "اجتماعات هذا الأسبوع",
    lecturesRecorded: "محاضرات مسجلة",
    aiActionsExtracted: "مهام مستخرجة بالذكاء الاصطناعي",
    hoursSaved: "ساعات عمل موفرة",
    recentMeetings: "أحدث الاجتماعات",
    recentLectures: "أحدث المحاضرات",
    upcomingSessions: "الجلسات القادمة",
    aiInsights: "رؤى الذكاء الاصطناعي",
    weeklyActivity: "النشاط الأسبوعي",
    pendingTasks: "المهام المعلقة",

    allMeetings: "جميع الاجتماعات",
    allLectures: "جميع المحاضرات الأكاديمية",
    searchMeetings: "ابحث عن اجتماع بالعنوان، المضيف أو الموضوع…",
    searchLectures: "ابحث عن محاضرة برمز المادة، اسم المحاضر أو الموضوع…",
    filterByStatus: "تصفية حسب الحالة",
    statusCompleted: "مكتمل",
    statusProcessing: "قيد المعالجة",
    statusQueued: "في قائمة الانتظار",
    statusFailed: "تعذر المعالجة",
    courseCode: "رمز المقرر",
    instructor: "المحاضر",
    host: "المضيف",
    duration: "المدة",
    participants: "المشاركون",
    studyNotes: "ملاحظات دراسية",
    keyConcepts: "المفاهيم الأساسية",
    examHighlights: "نقاط هامة للاختبار",
    viewTranscript: "عرض النص المفرغ",
    openSummary: "الملخص الذكي",
    generateQuiz: "إنشاء اختبار",
    studyFlashcards: "مراجعة البطاقات",
    noRecordingsFound: "لم يتم العثور على تسجيلات تطابق استعلامك.",

    transcriptViewer: "التفريغ الصوتي وتحديد المتحدثين",
    searchInTranscript: "ابحث داخل التفريغ النصي…",
    speakers: "المتحدثون",
    copyTranscript: "نسخ النص",
    exportPdf: "تصدير PDF",
    exportTxt: "تصدير نصي TXT",
    translateTranscript: "الترجمة إلى الإنجليزية",
    showingOriginal: "عرض النص الأصلي (العربية)",
    showingTranslated: "عرض النص المترجم بالذكاء الاصطناعي",
    translationNotice: "تم إنشاء الترجمة الآلية للتسهيل؛ وتستند الاقتباسات إلى التوقيت الأصلي.",
    jumpToTimestamp: "الانتقال إلى",
    editTranscript: "تعديل النص",
    saveEdits: "حفظ التعديلات",

    askAiQuestion: "اسأل ميت مايند AI",
    aiQuestionPlaceholder:
      "اسأل أي سؤال عن هذا الاجتماع أو المحاضرة (مثال: 'ما هي القرارات التي تم اتخاذها بخصوص الأداء؟')...",
    askButton: "إرسال السؤال",
    groundedAnswer: "الإجابة المستندة للنص",
    citations: "الاقتباسات الموثقة",
    noCitations: "لا توجد اقتباسات مطابقة في النص.",

    quizTitle: "اختبار الفهم ومنشئ الأسئلة",
    quizSubtitle: "أسئلة تدريبية يتم إنشاؤها تلقائياً من نصوص المحاضرات والمفاهيم الرئيسية.",
    startQuiz: "بدء الاختبار",
    submitQuiz: "تسليم الإجابات",
    score: "النتيجة النهائية",
    retakeQuiz: "إعادة الاختبار",
    explanation: "التفسير والشرح",
    question: "السؤال",
    of: "من",
    correct: "إجابة صحيحة!",
    incorrect: "إجابة خاطئة",

    flashcardsTitle: "بطاقات الاستذكار التفاعلية",
    flashcardsSubtitle: "بطاقات تكرار متباعد مستخلصة مباشرة من نقاشات المحاضرة وتعريفاتها.",
    clickToFlip: "انقر لقلب البطاقة",
    markMastered: "تم الحفظ بنجاح",
    needsReview: "تحتاج إلى مراجعة",
    resetProgress: "إعادة ضبط البطاقات",
    deckComplete: "أحسنت! لقد راجعت جميع بطاقات هذه المجموعة.",

    mindMapsTitle: "الخرائط الذهنية والمفاهيمية",
    mindMapsSubtitle: "عرض تسلسلي بصري لموضوعات المحاضرة، التفرعات الفرعية، والترابط الهندسي.",
    centralTopic: "الموضوع الرئيسي",
    subtopics: "الموضوعات الفرعية",
    zoomIn: "تكبير",
    zoomOut: "تصغير",
    resetView: "إعادة ضبط العرض",

    reportsTitle: "التقارير التنفيذية والأكاديمية",
    reportsSubtitle: "تصدير ملخصات الاجتماعات الشاملة، ومخرجات المحاضرات وسجلات التدقيق.",
    analyticsTitle: "إحصائيات النظام والإنتاجية",
    analyticsSubtitle: "متابعة ساعات العمل الموفرة، دقة التفريغ، وسرعة إنجاز المهام.",
    audioMinutesProcessed: "دقائق الصوت المعالجة",
    taskCompletionRate: "نسبة إنجاز المهام",
    totalDecisions: "القرارات المسجلة",
    exportCsv: "تصدير CSV",

    cancel: "إلغاء",
    save: "حفظ",
    delete: "حذف",
    confirm: "تأكيد",
    close: "إغلاق",
    loading: "جاري التحميل…",
    processing: "جاري المعالجة…",
    success: "تم بنجاح",
    error: "خطأ",
    back: "رجوع",
    next: "التالي",
    actions: "الإجراءات",
    date: "التاريخ",
    priority: "الأولوية",
    priorityHigh: "عالية",
    priorityMedium: "متوسطة",
    priorityLow: "منخفضة",
    completed: "مكتمل",
    pending: "معلق",
  },
};

export const LANG_STORAGE_KEY = "meetmind-lang";

interface I18nStore {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  toggleLanguage: () => void;
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  language:
    (typeof window !== "undefined" && (localStorage.getItem(LANG_STORAGE_KEY) as LanguageCode)) ||
    "EN",
  setLanguage: (language: LanguageCode) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, language);
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "AR" ? "rtl" : "ltr";
      document.documentElement.lang = language === "AR" ? "ar" : "en";
    }
    set({ language });
  },
  toggleLanguage: () => {
    const next = get().language === "AR" ? "EN" : "AR";
    get().setLanguage(next);
  },
}));

export function useTranslation() {
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const toggleLanguage = useI18nStore((s) => s.toggleLanguage);
  const isRtl = language === "AR";

  const t = (key: keyof Translations): string => {
    const current = translations[language];
    if (current && current[key]) {
      return current[key];
    }
    return translations.EN[key] || String(key);
  };

  return { t, language, isRtl, setLanguage, toggleLanguage };
}
