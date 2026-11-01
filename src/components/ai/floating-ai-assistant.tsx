import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Sparkles, X, Loader2, Quote, Trash2, Copy, Check, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { api, GroundedAnswer } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  citations?: { speaker: string; timestamp: string; quote: string }[];
}

export function FloatingAIAssistant() {
  const open = useUIStore((s) => s.aiDockOpen);
  const setOpen = useUIStore((s) => s.setAiDockOpen);
  const { t, language } = useTranslation();
  const isArabic = language === "ar";

  const defaultGreeting: ChatMessage = {
    role: "assistant",
    text: isArabic
      ? "مرحباً بك! أنا مساعد MeetMind AI الذكي. يمكنني تلخيص الاجتماعات والمحاضرات، استخراج المهام، توليد الأسئلة والاختبارات، والإجابة عن أي تفاصيل موثقة من التسجيلات."
      : "Hello! I am your MeetMind AI Assistant. I can summarize meetings and lectures, extract action items, generate quizzes, and answer questions grounded in your verified transcripts.",
  };

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([defaultGreeting]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const suggestions = isArabic
    ? [
        "السلام عليكم",
        "لخص لي آخر محاضرة",
        "اعمل لي 10 أسئلة على المحاضرة",
        "إيه المهام اللي اتطلبت؟",
        "ما هي نقاط التركيز للاختبار؟",
      ]
    : [
        "Hello",
        "Summarize the latest lecture",
        "Create 10 quiz questions",
        "What action items were assigned?",
        "What are the exam focus points?",
      ];

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success(isArabic ? "تم نسخ الرد" : "Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleClear = () => {
    setMessages([defaultGreeting]);
    toast.info(isArabic ? "تم مسح المحادثة" : "Chat cleared");
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || isLoading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", text: q }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const historyPayload = newMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        text: m.text,
      }));

      const res: GroundedAnswer = await api.askQuestion(q, undefined, historyPayload);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer,
          citations: res.citations,
        },
      ]);
    } catch {
      toast.error(isArabic ? "تعذر استرجاع الإجابة" : "Failed to retrieve response");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: isArabic
            ? "حدث خطأ أثناء التواصل مع محرك الذكاء الاصطناعي. يرجى التأكد من تشغيل الجلسة أو المحاولة لاحقاً."
            : "An error occurred while communicating with the AI engine. Please ensure your recording transcript is ready.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed bottom-5 right-5 z-40 md:bottom-6 md:right-6">
        <div className="pointer-events-auto relative">
          <motion.button
            aria-label="Ask MeetMind AI"
            onClick={() => setOpen(!open)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            className="relative grid h-14 w-14 place-items-center rounded-full gradient-primary text-primary-foreground shadow-glow cursor-pointer"
          >
            <motion.span
              className="absolute inset-0 rounded-full gradient-primary"
              animate={{ opacity: [0.6, 0.25, 0.6], scale: [1, 1.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "blur(14px)" }}
            />
            <Sparkles className="relative h-6 w-6" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            dir={isArabic ? "rtl" : "ltr"}
            className="fixed bottom-24 right-5 z-40 w-[min(460px,calc(100vw-2rem))] max-h-[600px] flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-2xl md:right-6"
          >
            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-border/60 p-3 bg-secondary/40">
              <div className="flex items-center gap-2.5">
                <div className="relative grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold flex items-center gap-1.5">
                    <span>{isArabic ? "مساعد MeetMind الذكي" : "MeetMind AI Assistant"}</span>
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-mono text-primary font-semibold">
                      Gemini
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {isArabic
                      ? "مدعوم بنصوص الجلسات والتحليل الفوري"
                      : "Grounded in verified transcripts"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleClear}
                  title={isArabic ? "مسح المحادثة" : "Clear conversation"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[380px]">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`group relative rounded-xl p-3 text-xs leading-relaxed transition-all ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground ml-6 shadow-sm"
                      : "bg-secondary/70 border border-border/60 mr-4 text-foreground"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1">
                      {m.role === "user" ? (
                        <>
                          <User className="h-3 w-3" />
                          <span>{isArabic ? "أنت" : "You"}</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3 text-primary" />
                          <span className="text-primary">
                            {isArabic ? "MeetMind AI" : "Assistant"}
                          </span>
                        </>
                      )}
                    </div>

                    {m.role === "assistant" && (
                      <button
                        onClick={() => handleCopy(m.text, idx)}
                        className="opacity-60 hover:opacity-100 transition p-1 text-muted-foreground rounded hover:bg-background/60"
                        title={isArabic ? "نسخ الرد" : "Copy text"}
                      >
                        {copiedIdx === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="whitespace-pre-line">{m.text}</div>

                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                        <Quote className="h-2.5 w-2.5" />
                        <span>
                          {isArabic ? "استشهادات موثقة من التسجيل:" : "Verified Citations:"}
                        </span>
                      </div>
                      {m.citations.map((c, cIdx) => (
                        <div
                          key={cIdx}
                          className="rounded-lg bg-background/70 border border-border/40 p-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between text-muted-foreground font-mono text-[10px] mb-0.5">
                            <span className="font-semibold text-foreground">{c.speaker}</span>
                            <span>{c.timestamp}</span>
                          </div>
                          <div className="italic text-muted-foreground">"{c.quote}"</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground p-3 rounded-xl bg-secondary/40 border border-border/40">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    {isArabic
                      ? "جاري التفكير وتحليل بيانات الجلسات والتسجيلات..."
                      : "Analyzing session transcripts and synthesizing answer..."}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Arabic Suggestions */}
            <div className="px-3 pb-2 pt-1 border-t border-border/40 flex flex-wrap gap-1.5 bg-background/40">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-foreground hover:bg-card cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="border-t border-border/60 p-2.5 bg-background/70"
            >
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 focus-within:border-primary/50 transition">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isArabic
                      ? "اسأل أي سؤال حول المحاضرات أو الاجتماعات أو اطلب تلخيصاً..."
                      : "Ask any question or request a summary..."
                  }
                  className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 text-xs"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="h-8 w-8 gradient-primary text-primary-foreground shrink-0 rounded-lg cursor-pointer shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
