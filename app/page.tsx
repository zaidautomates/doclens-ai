"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface RiskItem { text: string; page: string; }
interface Analysis {
  summary: string;
  risks: RiskItem[];
  dates: RiskItem[];
  stakeholders: RiskItem[];
  keyClause: string;
}
interface ChatMessage { role: "user" | "ai"; text: string; isStreaming?: boolean; }

/* ── tiny animation hook ── */
function useFadeIn(trigger: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (trigger) { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); } else { setVisible(false); } }, [trigger]);
  return visible;
}

/* ── Badge ── */
const BADGE_STYLES = {
  red:     { wrap: "bg-red-950/50 border border-red-500/25 text-red-300",     dot: "bg-red-400",     label: "text-red-400/60" },
  blue:    { wrap: "bg-blue-950/50 border border-blue-500/25 text-blue-300",   dot: "bg-blue-400",    label: "text-blue-400/60" },
  emerald: { wrap: "bg-emerald-950/50 border border-emerald-500/25 text-emerald-300", dot: "bg-emerald-400", label: "text-emerald-400/60" },
};

function Badge({ item, color, delay = 0 }: { item: RiskItem; color: "red" | "blue" | "emerald"; delay?: number }) {
  const s = BADGE_STYLES[color];
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-xs ${s.wrap} hover:brightness-125 transition-all duration-200 cursor-default`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${s.dot} shrink-0 opacity-70`} />
        <p className="leading-relaxed flex-1">{item.text}</p>
      </div>
      <p className={`mt-1.5 ml-3.5 text-[10px] font-mono ${s.label}`}>{item.page}</p>
    </div>
  );
}

/* ── Section Card ── */
function SectionCard({ title, icon, children, accent, delay = 0 }: {
  title: string; icon: string; children: React.ReactNode; accent: string; delay?: number;
}) {
  return (
    <div
      className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 flex flex-col gap-3 hover:border-white/[0.14] transition-colors duration-300"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 ${accent}`}>
        <span>{icon}</span>{title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/* ── Stat Pill ── */
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${color}`}>
      <span className="font-bold text-sm">{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

/* ── Chat Message Bubble with Streaming Text ── */
function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const { displayed, isComplete } = useStreamingText(
    message.text,
    12,
    message.role === "ai" && message.isStreaming === true
  );

  const isUser = message.role === "user";

  return (
    <div
      className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap transition-all ${
        isUser
          ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-50 ml-4 border border-emerald-500/20"
          : "bg-white/[0.04] text-white/75 mr-4 border border-white/[0.07]"
      }`}
    >
      {!isUser && (
        <span className="text-[10px] text-white/25 block mb-1 font-mono">DocLens AI</span>
      )}
      <span className={!isComplete && !isUser ? "border-r-2 border-emerald-400/60 animate-pulse" : ""}>
        {displayed}
      </span>
      {!isComplete && !isUser && (
        <span className="inline-block w-0 h-0" />
      )}
    </div>
  );
}

/* ── LOADING STEPS ── */
const LOAD_STEPS = [
  { icon: "📂", text: "Reading your PDF…" },
  { icon: "🧠", text: "Running AI analysis…" },
  { icon: "🔍", text: "Extracting risks, dates & stakeholders…" },
  { icon: "✨", text: "Almost done…" },
];

/* ── Streaming Text Hook ── */
function useStreamingText(text: string, speed: number = 15, isStreaming: boolean = false) {
  const [displayed, setDisplayed] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const textRef = useRef(text);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(text);
      setIsComplete(true);
      return;
    }
    
    textRef.current = text;
    indexRef.current = 0;
    setDisplayed("");
    setIsComplete(false);

    const interval = setInterval(() => {
      if (indexRef.current < textRef.current.length) {
        setDisplayed(textRef.current.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, isStreaming]);

  return { displayed, isComplete };
}

export default function Home() {
  const [analysis, setAnalysis]       = useState<Analysis | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [pageCount, setPageCount]     = useState(0);
  const [fileName, setFileName]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [loadStep, setLoadStep]       = useState(0);
  const [chat, setChat]               = useState<ChatMessage[]>([]);
  const [question, setQuestion]       = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError]             = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [dragOver, setDragOver]       = useState(false);

  const fileRef    = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const dashVisible = useFadeIn(!!analysis && !loading);

  // Only scroll the chat messages container, not the whole page
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [chat, chatLoading]);

  /* ── process a File object ── */
  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") { setError("Please upload a valid PDF file."); return; }
    setError("");
    setFileName(file.name);
    setLoading(true);
    setAnalysis(null);
    setChat([]);
    setSuggestedQuestions([]);
    setLoadStep(0);

    const interval = setInterval(() => setLoadStep((p) => Math.min(p + 1, LOAD_STEPS.length - 1)), 2200);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res  = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
        setDocumentText(data.documentText);
        setPageCount(data.pageCount);
        setSuggestedQuestions(data.suggestedQuestions ?? []);
      } else {
        setError(data.error || "Analysis failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      clearInterval(interval);
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  async function handleAsk(q?: string) {
    const userMsg = (q ?? question).trim();
    if (!userMsg || !documentText || chatLoading) return;
    setQuestion("");
    setChat((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: userMsg, documentText }) });
      const data = await res.json();
      // Add AI message with streaming flag
      setChat((prev) => [...prev, { role: "ai", text: data.answer || "No answer returned.", isStreaming: true }]);
    } catch {
      setChat((prev) => [...prev, { role: "ai", text: "Error reaching the AI. Please try again.", isStreaming: true }]);
    } finally {
      setChatLoading(false);
    }
  }

  const totalFindings = analysis ? analysis.risks.length + analysis.dates.length + analysis.stakeholders.length : 0;

  // Prevent body scroll when analysis is shown
  useEffect(() => {
    if (analysis && !loading) {
      document.body.style.overflow = "hidden";
      document.body.style.height = "100vh";
    } else {
      document.body.style.overflow = "";
      document.body.style.height = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.height = "";
    };
  }, [analysis, loading]);

  return (
    <main className="h-screen bg-[#07080f] text-white font-sans overflow-hidden">

      {/* ── AMBIENT BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.04] blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-blue-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[500px] h-[300px] rounded-full bg-violet-500/[0.03] blur-3xl" />
      </div>

      {/* ── HEADER ── */}
      <header className="relative z-20 border-b border-white/[0.06] bg-[#07080f]/70 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Logo glow */}
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-emerald-400/20 blur-md" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 border border-emerald-500/30 flex items-center justify-center text-lg">
              ⚖️
            </div>
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight leading-none">
              DocLens <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">AI</span>
            </h1>
            <p className="text-[10px] text-white/30 mt-0.5 leading-none tracking-wide">Legal Document Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {analysis && (
            <span className="hidden md:inline-flex items-center gap-2 text-xs text-white/40 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              {fileName.length > 30 ? fileName.slice(0, 30) + "…" : fileName}
            </span>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="relative px-5 py-2 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 overflow-hidden group bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-900/40"
          >
            <span className="relative z-10">{analysis ? "↑ New PDF" : "+ Upload PDF"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
        </div>
      </header>

      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="relative z-10 mx-5 mt-4 px-4 py-3 rounded-2xl bg-red-950/60 border border-red-500/30 text-red-300 text-sm flex items-center justify-between backdrop-blur-sm">
          <span className="flex items-center gap-2"><span className="text-base">⚠️</span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400/60 hover:text-red-200 ml-4 text-lg leading-none transition-colors">✕</button>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="relative z-10 flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-8">
          {/* Spinning rings */}
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/10" />
            <div className="absolute inset-0 rounded-full border-2 border-t-emerald-400 border-r-emerald-400/40 border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-t-transparent border-r-transparent border-b-teal-400/60 border-l-teal-400/60 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">⚖️</div>
          </div>

          {/* Step indicators */}
          <div className="flex flex-col items-center gap-3">
            {LOAD_STEPS.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-2 rounded-full text-sm transition-all duration-500 ${
                  i === loadStep
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-white scale-105"
                    : i < loadStep
                    ? "text-white/25 scale-95"
                    : "text-white/15 scale-90"
                }`}
              >
                <span>{step.icon}</span>
                <span className={i === loadStep ? "animate-pulse" : ""}>{step.text}</span>
                {i < loadStep && <span className="text-emerald-400 text-base">✓</span>}
              </div>
            ))}
          </div>

          <p className="text-white/20 text-xs tracking-widest uppercase">Powered by Groq · Llama 3.3</p>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && !analysis && (
        <div
          className={`relative z-10 flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-6 px-4 cursor-pointer group transition-all duration-300 ${dragOver ? "scale-[1.01]" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Drop zone */}
          <div className={`relative w-40 h-40 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all duration-300 ${dragOver ? "border-emerald-400/80 bg-emerald-500/10 scale-105" : "border-white/12 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/[0.03]"}`}>
            <div className={`absolute inset-0 rounded-3xl bg-emerald-400/5 blur-xl transition-opacity duration-300 ${dragOver ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
            <span className="text-5xl relative z-10 transition-transform duration-300 group-hover:scale-110">📄</span>
            <span className="text-[10px] text-white/30 relative z-10">{dragOver ? "Drop it!" : "PDF"}</span>
          </div>

          <div className="text-center flex flex-col gap-2">
            <p className="text-white/70 text-base font-semibold">Drop a PDF or click to upload</p>
            <p className="text-white/25 text-xs max-w-sm">Contracts · NDAs · Legal Agreements · Research Papers</p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-sm">
            {[
              { icon: "🚨", label: "Risk Detection",    color: "border-red-500/20 text-red-400/60 bg-red-950/20" },
              { icon: "📅", label: "Date Extraction",   color: "border-blue-500/20 text-blue-400/60 bg-blue-950/20" },
              { icon: "👤", label: "Stakeholders",      color: "border-emerald-500/20 text-emerald-400/60 bg-emerald-950/20" },
              { icon: "💬", label: "Cited Q&A",         color: "border-violet-500/20 text-violet-400/60 bg-violet-950/20" },
            ].map((f) => (
              <span key={f.label} className={`text-xs px-3 py-1.5 rounded-full border ${f.color} flex items-center gap-1.5`}>
                {f.icon} {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {!loading && analysis && (
        <div
          className={`relative z-10 p-5 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 h-[calc(100vh-80px)] overflow-hidden transition-all duration-700 ${dashVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          {/* ══ LEFT ══ */}
          <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2">

            {/* File + stats bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-emerald-400 text-lg shrink-0">✓</span>
                <span className="text-white/60 truncate text-sm">{fileName}</span>
                <span className="shrink-0 text-white/25 text-xs font-mono ml-1">{pageCount}p</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <StatPill label="Risks"        value={analysis.risks.length}        color="border-red-500/25 text-red-300 bg-red-950/30" />
                <StatPill label="Dates"        value={analysis.dates.length}        color="border-blue-500/25 text-blue-300 bg-blue-950/30" />
                <StatPill label="Stakeholders" value={analysis.stakeholders.length} color="border-emerald-500/25 text-emerald-300 bg-emerald-950/30" />
                <StatPill label="Findings"     value={totalFindings}                color="border-white/15 text-white/40 bg-white/[0.03]" />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 hover:border-white/[0.12] transition-colors duration-300">
              <h2 className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span>📋</span> Document Summary
              </h2>
              <p className="text-white/75 text-sm leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Key Clause */}
            <div className="relative rounded-2xl p-px overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20" />
              <div className="relative rounded-2xl bg-[#07080f] p-5">
                <h2 className="text-[11px] font-bold text-emerald-400/70 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span>⭐</span> Key Clause
                </h2>
                <p className="text-emerald-100/80 text-sm leading-relaxed">{analysis.keyClause}</p>
              </div>
            </div>

            {/* 3-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SectionCard title="Risks" icon="🚨" accent="text-red-400/80" delay={0}>
                {analysis.risks.length === 0
                  ? <p className="text-white/20 text-xs py-2">None identified</p>
                  : analysis.risks.map((item, i) => <Badge key={i} item={item} color="red" delay={i * 60} />)
                }
              </SectionCard>

              <SectionCard title="Dates" icon="📅" accent="text-blue-400/80" delay={80}>
                {analysis.dates.length === 0
                  ? <p className="text-white/20 text-xs py-2">None identified</p>
                  : analysis.dates.map((item, i) => <Badge key={i} item={item} color="blue" delay={i * 60} />)
                }
              </SectionCard>

              <SectionCard title="Stakeholders" icon="👤" accent="text-emerald-400/80" delay={160}>
                {analysis.stakeholders.length === 0
                  ? <p className="text-white/20 text-xs py-2">None identified</p>
                  : analysis.stakeholders.map((item, i) => <Badge key={i} item={item} color="emerald" delay={i * 60} />)
                }
              </SectionCard>
            </div>
          </div>

          {/* ══ RIGHT: CHAT ══ */}
          <div className="flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.02] lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-90px)] backdrop-blur-sm">
            {/* Chat header */}
            <div className="px-4 py-3.5 border-b border-white/[0.06] shrink-0 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>💬</span> Ask the Document
                  </h2>
                  <p className="text-[11px] text-white/30 mt-0.5">Every answer cites a page number</p>
                </div>
                {chat.length > 0 && (
                  <button
                    onClick={() => setChat([])}
                    className="text-[10px] text-white/20 hover:text-white/50 border border-white/10 hover:border-white/20 px-2 py-1 rounded-lg transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-[280px] scroll-smooth">
              {/* Suggested questions */}
              {chat.length === 0 && suggestedQuestions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-white/25 text-[11px] mb-0.5 flex items-center gap-1.5">
                    <span>✦</span> Suggested for this document
                  </p>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={q}
                      onClick={() => handleAsk(q)}
                      className="text-left px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-emerald-500/10 text-white/50 hover:text-white/80 text-xs transition-all duration-200 border border-white/[0.05] hover:border-emerald-500/25 group"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <span className="group-hover:text-emerald-400 mr-1.5 transition-colors">→</span>{q}
                    </button>
                  ))}
                </div>
              )}

              {/* Skeleton while waiting for questions */}
              {chat.length === 0 && suggestedQuestions.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-white/20 text-[11px] mb-0.5">Loading suggestions…</p>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 rounded-xl bg-white/[0.03] border border-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                  ))}
                </div>
              )}

              {/* Chat messages */}
              {chat.map((msg, i) => (
                <ChatMessageBubble key={i} message={msg} />
              ))}

              {/* Typing indicator with enhanced animation */}
              {chatLoading && (
                <div className="flex gap-1.5 items-center px-4 py-3.5 mr-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] w-fit">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div 
                        key={i} 
                        className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" 
                        style={{ 
                          animationDelay: `${i * 200}ms`,
                          animationDuration: "1s"
                        }} 
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-white/30 ml-1">Thinking...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/[0.06] shrink-0 flex gap-2 bg-white/[0.01]">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                placeholder="Ask anything about this document…"
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-emerald-500/40 focus:bg-emerald-500/[0.04] transition-all"
              />
              <button
                onClick={() => handleAsk()}
                disabled={chatLoading || !question.trim()}
                className="px-3.5 py-2 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-25 disabled:cursor-not-allowed text-black rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg shadow-emerald-900/30"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      {!analysis && !loading && (
        <footer className="relative z-10 mt-12 pb-6 text-center text-[10px] text-white/[0.12] tracking-widest uppercase">
          DocLens AI · Next.js · Groq · Llama 3.3 · DecodeLabs 2026
        </footer>
      )}
    </main>
  );
}
