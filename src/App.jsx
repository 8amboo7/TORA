import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const initialBomData = {
  aws: [],
  azure: [],
  huawei: [],
};
const MODEL_ID = "ft:gpt-4o-2024-08-06:bamboofernfoo:final:CUH4BvSo";
const GENERIC_API_ERROR =
  "ระบบ API ตอบกลับไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า Vercel Functions และลองใหม่อีกครั้ง";

const parseApiResponse = async (res) => {
  const raw = await res.text();
  if (!raw) return { data: null, raw: "" };

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      return { data: JSON.parse(raw), raw };
    } catch {
      return { data: null, raw };
    }
  }

  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};

const formatApiFailure = (res, raw) => {
  const sample = (raw || "").replace(/\s+/g, " ").slice(0, 120);
  const hint = sample ? ` (${sample}${sample.length >= 120 ? "..." : ""})` : "";
  return `${GENERIC_API_ERROR} [HTTP ${res.status}]${hint}`;
};

export default function App() {
  const [currentView, setCurrentView] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("aws");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeProcessType, setActiveProcessType] = useState(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [bomData, setBomData] = useState(initialBomData);
  const [chatHistory, setChatHistory] = useState([]);
  const [textareaKey, setTextareaKey] = useState(0);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);
  const [isChatWaiting, setIsChatWaiting] = useState(false);
  const [isChatTyping, setIsChatTyping] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatWaiting, isChatTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, [textareaKey]);

  const adjustTextareaHeight = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const scrollHeight = textareaRef.current.scrollHeight;
    const maxHeight = 200;

    if (scrollHeight <= maxHeight) {
      textareaRef.current.style.height = `${scrollHeight}px`;
      textareaRef.current.style.overflowY = "hidden";
    } else {
      textareaRef.current.style.height = `${maxHeight}px`;
      textareaRef.current.style.overflowY = "auto";
    }
  };

  const getTotal = (cloud) => {
    if (!bomData[cloud]) return "0.00";
    return bomData[cloud]
      .reduce((sum, item) => sum + parseFloat(item.total || 0), 0)
      .toFixed(2);
  };

  const getYearlyTotal = (cloud) =>
    (parseFloat(getTotal(cloud)) * 12).toFixed(2);

  const getCheapestProvider = () => {
    const providers = ["aws", "azure", "huawei"];
    const candidates = providers
      .map((id) => ({
        id,
        total: parseFloat(getTotal(id)),
        hasItems: (bomData[id] || []).length > 0,
      }))
      .filter((p) => p.hasItems && !Number.isNaN(p.total) && p.total > 0);

    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (a.total < b.total ? a : b)).id;
  };

  const OCR_LANG = "eng+tha";
  const OCR_MIN_TEXT = 80;
  const OCR_MAX_PAGES = 6;
  const OCR_MAX_IMAGES = 6;

  const readTextFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => reject(reader.error || new Error("Read failed"));
      reader.readAsText(file);
    });

  const getFileExtension = (name = "") => {
    const parts = name.split(".");
    if (parts.length < 2) return "";
    return parts[parts.length - 1].toLowerCase();
  };

  const buildFallbackExtractedText = (file) => {
    const ext = getFileExtension(file.name);
    return [
      `ไฟล์: ${file.name}`,
      `ชนิดไฟล์: ${ext || "ไม่ทราบ"}`,
      "",
      "ระบบยังไม่สามารถดึงข้อความได้จากไฟล์นี้",
      "โปรดแปลงเป็น .txt หรือคัดลอกเนื้อหา TOR มาวางที่นี่เพื่อแก้ไข",
    ].join("\n");
  };

  const ocrImage = async (image) => {
    const result = await Tesseract.recognize(image, OCR_LANG);
    return (result?.data?.text || "").trim();
  };

  const extractTextFromPdf = async (file) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages || 0;
    const textChunks = [];
    for (let i = 1; i <= totalPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = (content.items || [])
        .map((item) => item.str || "")
        .join(" ");
      if (pageText.trim()) textChunks.push(pageText.trim());
    }
    const text = textChunks.join("\n\n").trim();
    if (text.length >= OCR_MIN_TEXT) {
      return { text, warning: null };
    }

    let warning = "ข้อความจาก PDF น้อยเกินไป ระบบจะพยายาม OCR จากหน้าเอกสาร";
    const pagesToOcr = Math.min(totalPages, OCR_MAX_PAGES);
    const ocrTexts = [];
    for (let i = 1; i <= pagesToOcr; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const ocr = await ocrImage(canvas);
      if (ocr) ocrTexts.push(ocr);
    }
    if (totalPages > OCR_MAX_PAGES) {
      warning = `${warning} (จำกัด OCR แค่ ${OCR_MAX_PAGES} หน้าแรก)`;
    }
    const ocrText = ocrTexts.join("\n\n");
    return { text: [text, ocrText].filter(Boolean).join("\n\n"), warning };
  };

  const extractTextFromDocx = async (file) => {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result?.value || "").trim();
    if (text.length >= OCR_MIN_TEXT) {
      return { text, warning: null };
    }

    let warning = "ข้อความจาก DOCX น้อยเกินไป ระบบจะพยายาม OCR จากรูปภาพในเอกสาร";
    try {
      const zip = await JSZip.loadAsync(buffer);
      const mediaFiles = Object.keys(zip.files).filter((name) =>
        name.startsWith("word/media/")
      );
      const limited = mediaFiles.slice(0, OCR_MAX_IMAGES);
      if (limited.length === 0) {
        return { text, warning: "ไม่พบรูปภาพสำหรับ OCR ในไฟล์ DOCX" };
      }
      const ocrTexts = [];
      for (const name of limited) {
        const blob = await zip.files[name].async("blob");
        const ocr = await ocrImage(blob);
        if (ocr) ocrTexts.push(ocr);
      }
      if (mediaFiles.length > OCR_MAX_IMAGES) {
        warning = `${warning} (จำกัด OCR ${OCR_MAX_IMAGES} รูปแรกเท่านั้น)`;
      }
      const ocrText = ocrTexts.join("\n\n");
      return { text: [text, ocrText].filter(Boolean).join("\n\n"), warning };
    } catch (error) {
      return { text, warning: `OCR DOCX ล้มเหลว: ${error.message}` };
    }
  };

  const processUploadedFile = async (file) => {
    if (!file) return;
    setProjectTitle(file.name);
    setActiveProcessType("upload");
    setIsProcessing(true);

    try {
      const ext = getFileExtension(file.name);
      const isPlainText = ["txt", "md", "csv", "json"].includes(ext);
      let result = { text: "", warning: null };

      if (isPlainText) {
        result.text = await readTextFile(file);
      } else if (ext === "pdf") {
        result = await extractTextFromPdf(file);
      } else if (ext === "docx") {
        result = await extractTextFromDocx(file);
      } else {
        result.text = buildFallbackExtractedText(file);
      }

      const warning = result?.warning ? `หมายเหตุ: ${result.warning}\n\n` : "";
      const extracted = `${warning}${result?.text || ""}`.trim();
      setExtractedText(extracted || buildFallbackExtractedText(file));
      setCurrentView("review");
    } catch (error) {
      const ext = getFileExtension(file.name);
      const isPlainText = ["txt", "md", "csv", "json"].includes(ext);
      const fallback = isPlainText ? await readTextFile(file) : null;
      setExtractedText(
        fallback ||
          `ไม่สามารถอ่านไฟล์ได้: ${error.message}\n\nโปรดคัดลอกเนื้อหา TOR มาวางที่นี่เพื่อแก้ไข`
      );
      setCurrentView("review");
    } finally {
      setIsProcessing(false);
      setActiveProcessType(null);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processUploadedFile(file);
  };

  const handleConfirmAnalysis = async () => {
    setIsProcessing(true);
    setCurrentView("workspace");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractedText,
          model: MODEL_ID,
        }),
      });
      const { data, raw } = await parseApiResponse(res);
      if (data?.bom) {
        setBomData(data.bom);
      }
      const serverError = data?.error;
      const serverDetails = data?.details;
      const fallbackError =
        !res.ok && !serverError && !serverDetails
          ? formatApiFailure(res, raw)
          : null;
      setChatHistory([
        {
          role: "assistant",
          content:
            serverDetails ||
            serverError ||
            data?.summary ||
            data?.message ||
            (res.ok ? "Analysis complete." : "Analysis failed."),
        },
      ]);
      setCurrentView("workspace");
    } catch (error) {
      setChatHistory([
        {
          role: "assistant",
          content: `Unable to reach OpenAI. ${error.message}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartChat = () => {
    setActiveProcessType("chat");
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setActiveProcessType(null);
      setProjectTitle("Interactive Session");
      setBomData(initialBomData);
      setChatHistory([
        {
          role: "assistant",
          content:
            "Hello! Interactive Mode is ready. Tell me your requirements and I will refine the BOM.",
        },
      ]);
      setTextareaKey((prev) => prev + 1);
      setCurrentView("workspace");
    }, 1000);
  };

  const handleSendMessage = async () => {
    const currentValue = textareaRef.current?.value || "";
    if (!currentValue.trim()) return;

    const userMsg = currentValue;
    setTextareaKey((prev) => prev + 1);

    const newHistory = [...chatHistory, { role: "user", content: userMsg }];
    setChatHistory(newHistory);
    setIsChatWaiting(true);
    setIsChatTyping(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory.map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          })),
          bom: bomData,
          model: MODEL_ID,
        }),
      });
      const { data, raw } = await parseApiResponse(res);
      const serverError = data?.error;
      const serverDetails = data?.details;
      const fallbackError =
        !res.ok && !serverError && !serverDetails
          ? formatApiFailure(res, raw)
          : null;
      if (data?.bom) {
        setBomData(data.bom);
      }

      const replyText =
        serverDetails ||
        serverError ||
        data?.message ||
        fallbackError ||
        (res.ok ? "Noted." : "Unable to process the request.") ||
        "Noted. I can adjust compute sizing, storage, or redundancy levels if you want a different cost profile.";

      setIsChatWaiting(false);
      setIsChatTyping(true);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      let targetIndex = null;
      setChatHistory((prev) => {
        targetIndex = prev.length;
        return [...prev, { role: "assistant", content: "" }];
      });

      let charIndex = 0;
      const step = () => {
        charIndex += 2;
        const nextText = replyText.slice(0, charIndex);
        setChatHistory((prev) => {
          if (targetIndex === null || targetIndex >= prev.length) return prev;
          const next = [...prev];
          next[targetIndex] = { ...next[targetIndex], content: nextText };
          return next;
        });
        if (charIndex < replyText.length) {
          typingTimerRef.current = setTimeout(step, 18);
        } else {
          typingTimerRef.current = null;
          setIsChatTyping(false);
        }
      };
      step();
    } catch (error) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setIsChatWaiting(false);
      setIsChatTyping(false);
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    }
  };

  const handleExport = () => {
    const headers = [
      "Category",
      "Service",
      "Specification",
      "Unit",
      "Qty",
      "Price/Unit",
      "Total Price",
    ];
    const rows = bomData[activeTab].map((item) => [
      item.category,
      item.service,
      item.spec,
      item.unit,
      item.qty,
      item.price,
      item.total,
    ]);

    const sheetData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BOM");
    XLSX.writeFile(
      workbook,
      `BOM_Export_${activeTab.toUpperCase()}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  const Navbar = () => (
    <nav className="bg-white/95 backdrop-blur-md border-b border-gray-200 h-16 flex items-center justify-between px-6 fixed w-full z-50">
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setCurrentView("dashboard")}
      >
        <div className="w-9 h-9 bg-[#0f172a] rounded-lg flex items-center justify-center text-white shadow-md">
          <i className="fas fa-cube"></i>
        </div>
        <div className="flex flex-col">
          <h1 className="font-bold text-lg tracking-tight text-gray-900 leading-none">
            TORA
          </h1>
          <span className="text-[10px] text-gray-500 font-medium tracking-wide">
            CLOUD PROCUREMENT PLATFORM
          </span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="hidden md:flex gap-4 text-sm font-medium text-gray-500">
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setCurrentView("documentation");
            }}
            className={`transition-colors ${
              currentView === "documentation"
                ? "text-[#0f172a] font-semibold"
                : "hover:text-gray-900"
            }`}
          >
            Documentation
          </a>
          <a href="#" className="hover:text-gray-900 transition-colors">
            Pricing Data
          </a>
        </div>
        <div className="h-4 w-px bg-gray-300 hidden md:block"></div>
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold border border-gray-300">
          AD
        </div>
      </div>
    </nav>
  );

  const DocumentationView = () => (
    <div className="pt-20 min-h-screen bg-gray-50 text-gray-800 fade-in">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-10 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-bold text-[#0f172a] mb-2">
            Platform Documentation
          </h1>
          <p className="text-gray-500 text-lg">
            Comprehensive guide for integrating and using TORA Enterprise
            Platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-1">
            <a
              href="#getting-started"
              className="block px-3 py-2 rounded-md bg-white font-medium text-[#0f172a] border border-gray-200 shadow-sm"
            >
              Getting Started
            </a>
            <a
              href="#core-features"
              className="block px-3 py-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Core Features
            </a>
            <a
              href="#api-reference"
              className="block px-3 py-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              API Reference
            </a>
            <a
              href="#support"
              className="block px-3 py-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Support & FAQ
            </a>
          </div>

          <div className="md:col-span-3 space-y-12">
            <section id="getting-started" className="scroll-mt-24">
              <h2 className="text-2xl font-bold text-[#0f172a] mb-4 flex items-center gap-2">
                <i className="fas fa-play-circle text-[#0f172a]"></i> Getting
                Started
              </h2>
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
                <p className="text-gray-600">
                  TORA simplifies the complex process of cloud procurement by
                  automating the conversion of Terms of Reference (TOR)
                  documents into precise Bill of Materials (BOM).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  {[
                    {
                      title: "Upload TOR",
                      body:
                        "Upload PDF or DOCX file containing technical requirements.",
                    },
                    {
                      title: "AI Analysis",
                      body:
                        "Our engine extracts specs and matches them with cloud services.",
                    },
                    {
                      title: "Export BOM",
                      body:
                        "Download the comparative cost analysis in CSV/Excel format.",
                    },
                  ].map((step, index) => (
                    <div
                      key={step.title}
                      className="p-4 bg-gray-50 rounded border border-gray-100 text-center hover:border-[#0f172a]/30 transition-colors"
                    >
                      <div className="w-8 h-8 bg-slate-100 text-[#0f172a] rounded-full flex items-center justify-center mx-auto mb-2 font-bold">
                        {index + 1}
                      </div>
                      <h4 className="font-semibold text-gray-800">
                        {step.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">{step.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="core-features" className="scroll-mt-24">
              <h2 className="text-2xl font-bold text-[#0f172a] mb-4 flex items-center gap-2">
                <i className="fas fa-microchip text-[#0f172a]"></i> Technology
                Stack
              </h2>
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <ul className="space-y-4 text-sm text-gray-600">
                  {[
                    {
                      title: "Hybrid AI Engine",
                      body:
                        "Combines prompt engineering for broad understanding and fine-tuned models for specific government/enterprise terminology.",
                    },
                    {
                      title: "Real-time Pricing (RAG)",
                      body:
                        "Retrieval-Augmented Generation ensures pricing data is fetched from the latest vector database indices of AWS, Azure, and Huawei Cloud.",
                    },
                    {
                      title: "Multi-Cloud Comparison",
                      body:
                        "Automatically normalizes specifications across providers to ensure a fair comparison.",
                    },
                  ].map((item) => (
                    <li key={item.title} className="flex gap-3">
                      <i className="fas fa-check-circle text-green-600 mt-1"></i>
                      <div>
                        <strong className="text-gray-900 block">
                          {item.title}
                        </strong>
                        {item.body}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section id="api-reference" className="scroll-mt-24">
              <h2 className="text-2xl font-bold text-[#0f172a] mb-4 flex items-center gap-2">
                <i className="fas fa-code text-[#0f172a]"></i> API Integration
              </h2>
              <div className="bg-[#1e1e1e] rounded-lg overflow-hidden shadow-lg border border-gray-800">
                <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
                  <span className="text-xs text-gray-400 font-mono">
                    POST /api/v1/analyze
                  </span>
                  <span className="text-xs text-gray-500">Node.js</span>
                </div>
                <div className="p-4 overflow-x-auto">
                  <pre>
                    <code className="language-javascript text-sm font-mono text-gray-300">
                      {`const axios = require('axios');\nconst fs = require('fs');\n\nasync function analyzeTOR() {\n  const form = new FormData();\n  form.append('file', fs.createReadStream('./tor-document.pdf'));\n  \n  try {\n    const response = await axios.post('https://api.tora.platform/v1/analyze', form, {\n      headers: {\n        'Authorization': 'Bearer YOUR_API_KEY',\n        ...form.getHeaders()\n      }\n    });\n\n    console.log('Analysis Result:', response.data.bom_comparison);\n  } catch (error) {\n    console.error('Error:', error.message);\n  }\n}\n\nanalyzeTOR();`}
                    </code>
                  </pre>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Authentication requires an Enterprise API Key. Rate limits apply
                based on your subscription tier.
              </p>
            </section>

            <section id="support" className="scroll-mt-24">
              <h2 className="text-2xl font-bold text-[#0f172a] mb-4">
                Support & FAQ
              </h2>
              <div className="space-y-4">
                {["How often is pricing data updated?", "Can I customize the export format?"]
                  .map((question, index) => (
                    <details
                      key={question}
                      className="group bg-white rounded-lg border border-gray-200"
                    >
                      <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-4 group-open:bg-gray-50 transition-colors">
                        <span>{question}</span>
                        <span className="transition group-open:rotate-180">
                          <i className="fas fa-chevron-down text-gray-400"></i>
                        </span>
                      </summary>
                      <div className="text-gray-600 text-sm p-4 pt-0 border-t border-transparent group-open:border-gray-100 group-open:pt-4">
                        {index === 0
                          ? "Our pricing index is refreshed daily for all supported cloud providers."
                          : "Yes, Enterprise users can define custom CSV/JSON schemas or integrate with ERP systems."}
                      </div>
                    </details>
                  ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  const ReviewView = () => (
    <div className="pt-20 min-h-screen flex flex-col items-center p-6 bg-white fade-in">
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#0f172a]">
              Review Extracted Data
            </h2>
            <p className="text-gray-500">
              Please verify the text extracted from your document before
              analysis.
            </p>
          </div>
          <button
            onClick={() => setCurrentView("dashboard")}
            className="text-gray-400 hover:text-[#0f172a]"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex justify-between items-center rounded-t-lg">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <i className="fas fa-file-alt mr-2"></i> {projectTitle}
            </span>
          </div>
          <textarea
            value={extractedText}
            onChange={(event) => setExtractedText(event.target.value)}
            className="w-full h-[50vh] p-6 text-sm text-gray-700 font-mono focus:outline-none resize-none"
            spellCheck="false"
          />
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={() => setCurrentView("dashboard")}
            className="px-6 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-50 border border-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmAnalysis}
            className="px-6 py-2.5 rounded-lg bg-[#0f172a] text-white font-medium hover:bg-[#1e293b] shadow-lg shadow-gray-200 transition-all flex items-center gap-2"
          >
            <i className="fas fa-magic"></i> Confirm & Analyze
          </button>
        </div>
      </div>
    </div>
  );

  const DashboardView = () => (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-gray-50 to-white -z-10"></div>
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-20 left-0 w-[500px] h-[500px] bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

        <div className="max-w-6xl mx-auto text-center fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0f172a]/5 border border-[#0f172a]/10 text-[#0f172a] text-xs font-bold tracking-wider uppercase mb-6">
            <span className="w-2 h-2 rounded-full bg-[#0f172a]"></span>
            Enterprise Grade Solution
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-[#0f172a] mb-8 tracking-tight leading-tight">
            Smart Procurement <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0f172a] to-blue-600">
              Simplified by AI.
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            TORA converts complex TOR documents into accurate cloud BOM
            comparisons in seconds, supporting AWS, Azure, and Huawei Cloud.
          </p>

          <div className="flex justify-center gap-4">
            <button
              onClick={() =>
                document
                  .getElementById("action-section")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="px-8 py-4 bg-[#0f172a] text-white rounded-xl font-semibold shadow-lg hover:bg-[#1e293b] hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              Start Now
            </button>
            <button
              onClick={() => setCurrentView("documentation")}
              className="px-8 py-4 bg-white text-[#0f172a] border border-gray-200 rounded-xl font-semibold shadow-sm hover:bg-gray-50 transition-all"
            >
              Learn More
            </button>
          </div>
        </div>
      </div>

      <div className="py-20 bg-white border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[#0f172a] mb-4">Why TORA?</h2>
            <p className="text-gray-500">
              Cut expert procurement time by more than 80% with automation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                icon: "fas fa-brain",
                color: "text-blue-600",
                bg: "bg-blue-100",
                title: "AI-Powered Analysis",
                body:
                  "Analyze TOR documents with advanced LLMs that understand technical and procurement-specific language.",
              },
              {
                icon: "fas fa-tags",
                color: "text-purple-600",
                bg: "bg-purple-100",
                title: "Real-time Pricing",
                body:
                  "Connect to the latest pricing data from AWS, Azure, and Huawei Cloud through RAG for maximum accuracy.",
              },
              {
                icon: "fas fa-table",
                color: "text-green-600",
                bg: "bg-green-100",
                title: "Instant BOM",
                body:
                  "Generate BOM tables with automatic cost comparison and export-ready outputs.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="p-8 bg-gray-50 rounded-2xl hover:shadow-lg transition-all duration-300"
              >
                <div
                  className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center ${card.color} text-xl mb-6`}
                >
                  <i className={card.icon}></i>
                </div>
                <h3 className="text-xl font-bold text-[#0f172a] mb-3">
                  {card.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="action-section" className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0f172a]">
              Ready to Optimize Cost?
            </h2>
            <p className="text-gray-500 mt-2">Choose how you want to start.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="group bg-white rounded-2xl p-8 shadow-xl shadow-gray-200/50 border border-gray-100 hover:border-[#0f172a]/30 transition-all duration-300 relative overflow-hidden cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -mr-16 -mt-16 transition-all group-hover:bg-[#0f172a]/5"></div>

              <div className="relative z-10">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-2xl text-[#0f172a] mb-6 group-hover:scale-110 transition-transform">
                  <i className="fas fa-file-upload"></i>
                </div>
                <h3 className="text-2xl font-bold text-[#0f172a] mb-2">
                  Upload TOR
                </h3>
                <p className="text-gray-500 mb-8 min-h-[48px]">
                  For users with TOR documents (PDF/DOCX) who want automated
                  analysis.
                </p>

                <div className="relative">
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.doc"
                  />
                  <button className="w-full py-4 bg-[#0f172a] text-white rounded-xl font-semibold shadow-lg group-hover:shadow-xl transition-all flex items-center justify-center gap-2">
                    <i className="fas fa-cloud-upload-alt"></i> Upload & Analyze
                  </button>
                </div>
              </div>

              {isProcessing && activeProcessType === "upload" && (
                <div className="absolute inset-0 bg-white/95 z-30 flex flex-col items-center justify-center backdrop-blur-sm">
                  <div className="w-16 h-16 border-4 border-gray-200 border-t-[#0f172a] rounded-full animate-spin mb-4"></div>
                  <p className="text-[#0f172a] font-bold text-lg">
                    Processing Document...
                  </p>
                  <p className="text-gray-500 text-sm">
                    Analyzing technical requirements
                  </p>
                </div>
              )}
            </div>

            <div
              className="group bg-white rounded-2xl p-8 shadow-xl shadow-gray-200/50 border border-gray-100 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden cursor-pointer"
              onClick={handleStartChat}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-16 -mt-16 transition-all group-hover:bg-blue-100/50"></div>

              <div className="relative z-10">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-2xl text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                  <i className="fas fa-comments"></i>
                </div>
                <h3 className="text-2xl font-bold text-[#0f172a] mb-2">
                  Interactive Chat
                </h3>
                <p className="text-gray-500 mb-8 min-h-[48px]">
                  For users without documents who want to describe requirements
                  directly with AI.
                </p>

                <button className="w-full py-4 bg-white border-2 border-blue-600 text-blue-700 rounded-xl font-semibold hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                  <i className="fas fa-play"></i> Start Chat Session
                </button>
              </div>

              {isProcessing && activeProcessType === "chat" && (
                <div className="absolute inset-0 bg-white/95 z-30 flex flex-col items-center justify-center backdrop-blur-sm">
                  <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-blue-600 font-bold text-lg">
                    Preparing Session...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="bg-white border-t border-gray-200 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0f172a] rounded-lg flex items-center justify-center text-white">
              <i className="fas fa-cube text-xs"></i>
            </div>
            <span className="font-bold text-[#0f172a] tracking-tight">
              TORA Platform
            </span>
          </div>
          <div className="text-sm text-gray-500">
            © 2024 Enterprise Cloud Procurement. All rights reserved.
          </div>
          <div className="flex gap-6 text-gray-400">
            <a href="#" className="hover:text-[#0f172a]">
              <i className="fab fa-github"></i>
            </a>
            <a href="#" className="hover:text-[#0f172a]">
              <i className="fab fa-linkedin"></i>
            </a>
            <a href="#" className="hover:text-[#0f172a]">
              <i className="fas fa-envelope"></i>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );

  const WorkspaceView = () => {
    const cheapest = getCheapestProvider();

    return (
      <div className="pt-16 h-screen flex flex-col bg-gray-50/50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-600">
              Project:{" "}
              <span className="text-gray-900 font-semibold">
                {projectTitle || "Untitled Project"}
              </span>
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCurrentView("dashboard")}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-md transition-all"
            >
              New Analysis
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-md shadow-sm flex items-center gap-2 transition-all"
            >
              <i className="fas fa-download"></i> Export BOM
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-[400px] bg-white border-r border-gray-200 flex flex-col z-20">
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-white">
              {chatHistory.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] p-4 rounded-lg text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "chat-bubble-user rounded-tr-sm"
                        : "chat-bubble-ai rounded-tl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isChatWaiting && (
                <div className="flex justify-start">
                  <div className="chat-bubble-ai p-4 rounded-lg rounded-tl-sm text-gray-400 flex gap-1 items-center h-12">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="relative">
                <textarea
                  key={textareaKey}
                  ref={textareaRef}
                  onInput={() => requestAnimationFrame(adjustTextareaHeight)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type to refine the BOM (e.g. add 1TB storage...)"
                  rows={1}
                  wrap="soft"
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#0f172a] focus:border-[#0f172a] outline-none text-sm transition-all resize-none"
                  style={{
                    minHeight: "44px",
                    maxHeight: "200px",
                    overflowY: "auto",
                    wordWrap: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                />
                <input
                  type="file"
                  id="chat-file-upload"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      processUploadedFile(file);
                      event.target.value = "";
                    }
                  }}
                />
                <label
                  htmlFor="chat-file-upload"
                  className="absolute left-2 top-2 p-1.5 text-gray-400 hover:text-[#0f172a] transition-colors w-8 h-8 flex items-center justify-center cursor-pointer"
                  title="Upload file"
                >
                  <i className="fas fa-paperclip text-sm"></i>
                </label>
                <button
                  onClick={handleSendMessage}
                  className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-[#0f172a] transition-colors w-8 h-8 flex items-center justify-center"
                >
                  <i className="fas fa-paper-plane text-sm"></i>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-[#F8FAFC]">
            <div className="bg-white border-b border-gray-200 px-8 pt-4 flex gap-6">
              {[
                {
                  id: "aws",
                  label: "AWS",
                  icon: "fab fa-aws",
                  color: "text-[#FF9900]",
                },
                {
                  id: "azure",
                  label: "Microsoft Azure",
                  icon: "fab fa-microsoft",
                  color: "text-[#0089D6]",
                },
                {
                  id: "huawei",
                  label: "Huawei Cloud",
                  icon: "fas fa-cloud",
                  color: "text-[#C7000B]",
                },
              ].map((cloud) => (
                <button
                  key={cloud.id}
                  onClick={() => setActiveTab(cloud.id)}
                  className={`pb-3 text-sm font-medium transition-all relative border-b-2 flex items-center gap-2 ${
                    activeTab === cloud.id
                      ? "border-[#0f172a] text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <i className={`${cloud.icon} ${cloud.color}`}></i> {cloud.label}
                  {cheapest === cloud.id && (
                    <span className="ml-1 bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      BEST PRICE
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 p-8 overflow-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-semibold text-gray-800 text-sm">
                    Bill of Materials (BOM)
                  </h3>
                  <span className="text-xs text-gray-500">
                    Region: Asia Pacific (Singapore)
                  </span>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3 font-semibold w-32">Category</th>
                      <th className="px-6 py-3 font-semibold">Service Name</th>
                      <th className="px-6 py-3 font-semibold">Specification</th>
                      <th className="px-6 py-3 text-center font-semibold w-24">
                        Qty
                      </th>
                      <th className="px-6 py-3 text-right font-semibold w-32">
                        Unit Price
                      </th>
                      <th className="px-6 py-3 text-right font-semibold w-32">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bomData[activeTab]?.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-gray-500">
                          {item.category}
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-800">
                          {item.service}
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                          {item.spec}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-800">
                          {item.qty}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">
                          {item.price}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-900">
                          {item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-4 text-right text-gray-600 font-medium"
                      >
                        Monthly Estimated Cost:
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`text-xl font-bold ${
                            activeTab === cheapest
                              ? "text-green-600"
                              : "text-gray-900"
                          }`}
                        >
                          ${getTotal(activeTab)}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-4 text-right text-gray-600 font-medium"
                      >
                        Yearly Estimated Cost:
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-semibold text-gray-900">
                          ${getYearlyTotal(activeTab)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 flex gap-4">
                <div className="flex-1 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
                    Cost Optimization Insight
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    <i className="fas fa-lightbulb text-yellow-500 mr-2"></i>
                    {!cheapest
                      ? "ยังไม่มีข้อมูลราคาครบทุกเจ้า กรุณาระบุสเปกหรือจำนวนเพิ่มเติมเพื่อเปรียบเทียบต้นทุนได้แม่นยำขึ้น"
                      : cheapest === "huawei"
                      ? "Huawei Cloud offers the most competitive pricing for Compute instances in this region."
                      : cheapest === "aws"
                      ? "AWS provides the best value for Storage-heavy workloads."
                      : "Azure Hybrid Benefit could further reduce costs if you have existing Windows licenses."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans text-gray-900 bg-[#F8FAFC]">
      <Navbar />
      {currentView === "dashboard" && <DashboardView />}
      {currentView === "workspace" && <WorkspaceView />}
      {currentView === "review" && <ReviewView />}
      {currentView === "documentation" && <DocumentationView />}
      {isProcessing && activeProcessType === "upload" && (
        <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-[#0f172a] rounded-full animate-spin mb-4"></div>
          <p className="text-[#0f172a] font-bold text-lg">
            Processing document...
          </p>
          <p className="text-gray-500 text-sm">Please wait a moment</p>
        </div>
      )}
    </div>
  );
}
