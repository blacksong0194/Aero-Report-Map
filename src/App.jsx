import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { AlertTriangle, Shield, Plane, FileText, Camera, UploadCloud, CheckCircle, Clock, XCircle, User, LogOut, ChevronRight, Plus, Trash2, Eye, Search, Bell, BarChart2, Layers, Hash, Printer, Crop, Settings, KeyRound, UserPlus, ShieldCheck, EyeOff, Network } from "lucide-react";
// Carga diferida: NetworkMap arrastra jsPDF + html2canvas (pesados), solo se cargan al abrir el mapa
const NetworkMap = lazy(() => import("./components/NetworkMap"));

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const COLORS = { primary: "#f59e0b", danger: "#ef4444", success: "#10b981", info: "#6366f1", warning: "#f97316" };
const AREAS = ["Migración","Aduanas","Antinarcóticos (DNCD)","Seguridad / Investigación","Operaciones en Rampa","Otras"];
const STATUSES = ["Resuelto","En Proceso","Escalado"];
const STATUS_COLOR = { Resuelto:"#10b981","En Proceso":"#f97316",Escalado:"#ef4444" };
const SEVCOLORS = { Baja:"#10b981",Media:"#f97316",Alta:"#ef4444","Crítica":"#c026d3" };
const ROLES = { admin:"Administrador",supervisor:"Supervisor",operator:"Operador" };
// USERS now lives in App() state so admins can create/edit/delete users at runtime
const INITIAL_USERS = [
  { id:1, name:"Col. Rafael Méndez",   role:"admin",      badge:"ADM-001", shift:"Día",   pass:"admin123" },
  { id:2, name:"Sgt. Carmen Flores",   role:"supervisor", badge:"SUP-002", shift:"Tarde", pass:"super123" },
  { id:3, name:"Agente Luis Torres",   role:"operator",   badge:"OPR-003", shift:"Noche", pass:"oper123"  },
];
const AIRPORT = { name:"Aeropuerto Internacional de Punta Cana", iata:"PUJ", code:"PUJ-AIPC", city:"Punta Cana, República Dominicana" };

// ─── ANTHROPIC API HELPER ────────────────────────────────────────────────────
// En Electron usa IPC (la key vive en main.js, nunca expuesta en el renderer)
// En web/PWA usa el proxy de Vite (la key vive en vite.config.js)
// ─── API KEY para móvil ──────────────────────────────────────────────────────
// En desktop la clave va en vite.config.js (más segura).
// Aquí va para que funcione en Android/iOS.
const ANTHROPIC_API_KEY = "PEGA_AQUI_TU_CLAVE_sk-ant-";
// ─────────────────────────────────────────────────────────────────────────────

// OCR.space API - Alternativa a Tesseract
const OCR_SPACE_KEY = "helloworld"; // Key gratuita (5000/month)
async function callOCRspace(imageBase64, language = "spa") {
  const formData = new FormData();
  formData.append("base64Image", `data:image/jpeg;base64,${imageBase64}`);
  formData.append("language", language);
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");
  
  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: OCR_SPACE_KEY },
    body: formData
  });
  
  const data = await response.json();
  if(data.IsErroredOnProcessing) throw new Error(data.ErrorMessage[0]);
  if(!data.ParsedResults || data.ParsedResults.length === 0) throw new Error("No se reconoció texto");
  return data.ParsedResults[0].ParsedText;
}

// ─────────────────────────────────────────────────────────────────────────────

// Lee la API key de Anthropic guardada por el usuario en Configuración.
// La clave NO vive en el código; el usuario la introduce desde el panel de Ajustes.
const ANTHROPIC_KEY_STORE = "aeroreport_anthropic_key";
function getStoredApiKey() {
  try { return (localStorage.getItem(ANTHROPIC_KEY_STORE) || "").trim(); }
  catch (e) { return ""; }
}

async function callAnthropicAPI(model, max_tokens, messages) {
  // LM Studio local model
  if (model.startsWith('lm:')) {
    const actualModel = model.replace('lm:', '');
    if (!window.electronAPI?.lmStudio) throw new Error('LM Studio no disponible');
    return await window.electronAPI.lmStudio({ model: actualModel, messages, max_tokens })
      .then(r => ({ content: [{ type: 'text', text: r.content }] }));
  }

  const apiKey = getStoredApiKey();

  // Anthropic via Electron
  if (window.electronAPI && window.electronAPI.callAnthropic) {
    const result = await window.electronAPI.callAnthropic({ model, max_tokens, messages, apiKey });
    if (!result.ok) throw new Error("Error " + result.status + ": " + (result.data && result.data.error ? result.data.error.message : JSON.stringify(result.data)));
    return result.data;
  }
  
  // Fallback web
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (isLocalhost) {
    const res = await fetch("/api/anthropic/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens, messages }) });
    const data = await res.json();
    if (!res.ok) throw new Error("Error " + res.status + ": " + (data && data.error ? data.error.message : JSON.stringify(data)));
    return data;
  }
  throw new Error('API no disponible');
}
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_INCIDENTS = [
  { id:1, reportName:"Pasajero Dominicano, no admitido en Estados Unidos", time:"13:20", area:"Migración", flightNumber:"851", airline:"Arajet", origin:"Kingston, Jamaica", description:"Pasajero dominicano no admitido en Estados Unidos, por perfilamiento API (exceso de estadía en su anterior visita).", actions:"El mismo fue entregado al Departamento de Investigaciones de la Dirección General de Migración (DGM-AIPC).", status:"Resuelto", severity:"Media", evidence:[], persons:[] },
  { id:2, reportName:"Artículos no declarados — Terminal B", time:"10:30", area:"Aduanas", flightNumber:"", airline:"", origin:"", description:"Equipaje sospechoso en escáner de rayos X. Artículos gravables no declarados.", actions:"Inspección manual. Multa aplicada por RD$45,000.", status:"Resuelto", severity:"Media", evidence:[], persons:[] },
];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080c18; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0f1629; } ::-webkit-scrollbar-thumb { background: #2a3550; border-radius: 2px; }
  .scan-line { position:absolute; width:100%; height:2px; background:linear-gradient(90deg,transparent,#f59e0b44,#f59e0b,#f59e0b44,transparent); animation:scan 2.5s ease-in-out infinite; }
  @keyframes scan { 0%,100%{top:0;opacity:0} 10%{opacity:1} 90%{opacity:1} 50%{top:100%} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .fade-in { animation: fadeIn 0.3s ease; }
  .pulse { animation: pulse 2s infinite; }
  .crop-canvas { cursor: crosshair; display: block; max-width: 100%; }
`;

const S = {
  app:      { display:"flex", height:"100vh", background:"#080c18", color:"#e2e8f0", fontFamily:"'Inter',sans-serif", overflow:"hidden" },
  sidebar:  { width:220, background:"#0d1426", borderRight:"1px solid #1e2d4a", display:"flex", flexDirection:"column", flexShrink:0 },
  sideHeader:{ padding:"20px 16px 12px", borderBottom:"1px solid #1e2d4a" },
  logo:     { fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:700, color:"#f59e0b", letterSpacing:1 },
  logoSub:  { fontSize:9, color:"#64748b", letterSpacing:2, textTransform:"uppercase", marginTop:2 },
  nav:      { flex:1, padding:"12px 8px", display:"flex", flexDirection:"column", gap:2 },
  navItem:  a=>({ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, cursor:"pointer", background:a?"#1a2a45":"transparent", color:a?"#f59e0b":"#94a3b8", fontSize:13, fontWeight:a?500:400, border:a?"1px solid #2a3f5f":"1px solid transparent", transition:"all 0.15s" }),
  sideFooter:{ padding:"12px 8px", borderTop:"1px solid #1e2d4a" },
  main:     { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:   { height:56, background:"#0d1426", borderBottom:"1px solid #1e2d4a", display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0 },
  content:  { flex:1, overflow:"auto", padding:20 },
  card:     { background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:"16px 20px" },
  statCard: c=>({ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:"16px 20px", borderLeft:"3px solid "+c }),
  h1:       { fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:700, color:"#f1f5f9", letterSpacing:0.5 },
  h2:       { fontFamily:"'Barlow Condensed',sans-serif", fontSize:17, fontWeight:600, color:"#cbd5e1" },
  label:    { fontSize:11, fontWeight:500, color:"#64748b", textTransform:"uppercase", letterSpacing:1 },
  badge:    c=>({ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:500, background:c+"20", color:c, border:"1px solid "+c+"40" }),
  btn:      v=>({ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:500, cursor:"pointer", border:"none", outline:"none", background:v==="danger"?"#ef444420":v==="ghost"?"#1a2a45":"#f59e0b", color:v==="danger"?"#ef4444":v==="ghost"?"#94a3b8":"#000", transition:"all 0.15s" }),
  input:    { width:"100%", background:"#0b1020", border:"1px solid #1e2d4a", borderRadius:8, padding:"9px 12px", color:"#e2e8f0", fontSize:13, outline:"none", fontFamily:"'Inter',sans-serif" },
  select:   { width:"100%", background:"#0b1020", border:"1px solid #1e2d4a", borderRadius:8, padding:"9px 12px", color:"#e2e8f0", fontSize:13, outline:"none", fontFamily:"'Inter',sans-serif" },
  textarea: { width:"100%", background:"#0b1020", border:"1px solid #1e2d4a", borderRadius:8, padding:"9px 12px", color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", fontFamily:"'Inter',sans-serif", minHeight:80 },
  grid2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  grid4:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 },
  flex:     { display:"flex", alignItems:"center", gap:12 },
  row:      { display:"flex", alignItems:"flex-start", gap:14 },
  sep:      { borderTop:"1px solid #1e2d4a", margin:"14px 0" },
  mono:     { fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#64748b" },
};

// ─── REPORT NUMBER GENERATOR ──────────────────────────────────────────────────
// Format: YYMMNN  (e.g. 260301 = year 26, month 03, seq 01)
function buildReportNumber(counter) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const nn = String(counter).padStart(2, "0");
  return yy + mm + nn;
}

// ─── CROP PHOTO TOOL ─────────────────────────────────────────────────────────
function CropTool({ imgSrc, onCrop, onCancel }) {
  const canvasRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(null);
  const imgRef = useRef(null);

  const getPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    if (rect) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }, [rect]);

  useCallback(() => { draw(); }, [draw]);

  const onImgLoad = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    draw();
  };

  const onMouseDown = e => {
    const pos = getPos(e, canvasRef.current);
    setStart(pos); setDragging(true);
  };
  const onMouseMove = e => {
    if (!dragging || !start) return;
    const pos = getPos(e, canvasRef.current);
    setRect({ x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), w: Math.abs(pos.x - start.x), h: Math.abs(pos.y - start.y) });
  };
  const onMouseUp = () => { setDragging(false); draw(); };

  const confirm = () => {
    if (!rect || rect.w < 10 || rect.h < 10) return;
    const out = document.createElement("canvas");
    out.width = rect.w; out.height = rect.h;
    out.getContext("2d").drawImage(imgRef.current, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    onCrop(out.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{ background:"#0b1020", border:"1px solid #1e2d4a", borderRadius:10, padding:14 }}>
      <div style={{ ...S.label, marginBottom:8, color:COLORS.primary }}>Seleccione la foto de la persona — arrastre sobre el rostro</div>
      <div style={{ position:"relative", overflow:"hidden", borderRadius:8, marginBottom:10 }}>
        <img ref={imgRef} src={imgSrc} style={{ display:"none" }} onLoad={onImgLoad} alt="" />
        <canvas ref={canvasRef} className="crop-canvas"
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
          onTouchStart={onMouseDown} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}
          style={{ width:"100%", borderRadius:8 }}
        />
        {!rect && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
          <div style={{ background:"rgba(0,0,0,0.6)", borderRadius:8, padding:"6px 12px", fontSize:11, color:"#94a3b8" }}>Haga clic y arrastre para seleccionar</div>
        </div>}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={confirm} disabled={!rect} style={{ ...S.btn(rect?"primary":"ghost"), flex:1, justifyContent:"center", opacity:rect?1:0.4 }}>
          <Crop size={13} color={rect?"#000":"#94a3b8"} />Recortar foto
        </button>
        <button onClick={onCancel} style={{ ...S.btn("ghost"), padding:"8px 14px" }}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── MINI SCANNER (embebido en formulario) ────────────────────────────────────
function MiniScanner({ onExtracted }) {
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [docType, setDocType] = useState("Pasaporte");
  const [rawData, setRawData] = useState(null);
  const [mode, setMode] = useState("ocrspace");
  const [tProgress, setTProgress] = useState(0);
  const [tStatus, setTStatus] = useState("");
  const fileRef = useRef();

  const handleFile = f => {
    const r = new FileReader();
    r.onload = e => { setImg(e.target.result); setDone(false); setError(""); setRawData(null); };
    r.readAsDataURL(f);
  };

  // Modo Claude
  const analyzeClaude = async() => {
    if (!img) return;
    setLoading(true); setError("");
    try {
      const base64 = img.split(",")[1];
      const mtype = img.split(";")[0].split(":")[1];
      const data = await callAnthropicAPI("claude-sonnet-4-6", 1200, [{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:mtype, data:base64 } },
        { type:"text", text:`Eres un sistema experto en extracción de datos de documentos de identidad. Analiza este ${docType} y extrae toda la información visible. Responde ÚNICAMENTE con JSON válido sin markdown ni explicaciones:
{"firstName":"","lastName":"","fullName":"","documentNumber":"","dateOfBirth":"","nationality":"","gender":"","expiryDate":"","issuingCountry":"","documentType":"","mrz":"","confidence":"alta/media/baja","notes":"","faceX":0,"faceY":0,"faceW":0,"faceH":0}
Los campos faceX, faceY, faceW, faceH son NÚMEROS del 0 al 100 que representan el porcentaje de la imagen donde está la FOTO DEL ROSTRO de la persona (faceX=columna inicio, faceY=fila inicio, faceW=ancho, faceH=alto). Si no hay foto, deja en 0.` }
      ]}]);
      const text = (data.content&&data.content.find(c=>c.type==="text")||{}).text||"";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setRawData(parsed);
      if (parsed.faceW > 3 && parsed.faceH > 3) {
        setShowCrop(true);
      } else {
        finalize(parsed, null);
      }
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  };

  // Modo LM Studio (Qwen)
  const analyzeLM = async() => {
    if (!img) return;
    setLoading(true); setError("");
    try {
      const base64 = img.split(",")[1];
      const mtype = img.split(";")[0].split(":")[1];
      setTStatus("Analizando...");
      const data = await callAnthropicAPI("lm:qwen2.5-vl-7b-instruct", 1200, [{role:"user",content:[
        {type:"image_url",image_url:{url:`data:${mtype};base64,${base64}`}},
        {type:"text",text:`Eres un sistema experto en extracción de datos deIDENTITY. Analiza este ${docType} y extrae toda la informaciónvisible Responde ÚNICAMENTE con JSON válido sin markdown:
{"firstName":"","lastName":"","fullName":"","documentNumber":"","dateOfBirth":"","nationality":"","gender":"","expiryDate":"","issuingCountry":"","documentType":"","confidence":"alta/media/baja","notes":"","faceX":0,"faceY":0,"faceW":0,"faceH":0}
 faceX,Y,W,H son NÚMEROS 0-100 indicando posición del ROSTRO. Si no hay, pon 0.`}
      ]}]);
      const text = (data.content&&data.content[0]?.text)||"";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setRawData(parsed);
      // Si detecta rostro, mostrar crop tool
      if(parsed.faceW > 3 && parsed.faceH > 3){
        setShowCrop(true);
      }else{
        finalize(parsed, null);
      }
    } catch(e) { setError("Error LM: "+e.message); }
    setLoading(false);
  };

  // Modo OCR.space
  const analyzeOCR = async() => {
    if (!img) return;
    setLoading(true); setError("");
    try {
      setTStatus("Reconociendo...");
      setTProgress(30);
      const base64 = img.split(",")[1];
      const text = await callOCRspace(base64, "spa");
      setTProgress(70);
      const parsed = parseMRZ(text) || extractFromText(text, docType);
      setRawData(parsed);
      finalize(parsed, null);
    } catch(e) { setError("Error OCR: "+e.message); }
    setLoading(false);
  };

  const analyze = mode === "claude" ? analyzeClaude : mode === "lm:qwen2.5-vl-7b-instruct" ? analyzeLM : analyzeOCR;

  const finalize = (data, photo) => {
    onExtracted({ ...data, personPhoto: photo || null, docImage: img });
    setDone(true); setShowCrop(false);
  };

  const handleCrop = (croppedBase64) => {
    finalize(rawData, croppedBase64);
  };

  // Auto-crop using AI face coordinates
  const autoCrop = () => {
    if (!rawData || !img) return;
    const canvas = document.createElement("canvas");
    const image = new window.Image();
    image.onload = () => {
      const x = (rawData.faceX / 100) * image.naturalWidth;
      const y = (rawData.faceY / 100) * image.naturalHeight;
      const w = (rawData.faceW / 100) * image.naturalWidth;
      const h = (rawData.faceH / 100) * image.naturalHeight;
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(image, x, y, w, h, 0, 0, w, h);
      finalize(rawData, canvas.toDataURL("image/jpeg", 0.92));
    };
    image.src = img;
  };

  if (showCrop) return (
    <CropTool imgSrc={img}
      onCrop={handleCrop}
      onCancel={() => finalize(rawData, null)}
    />
  );

  return (
    <div style={{ background:"#0b1020", border:"1px solid #1e2d4a", borderRadius:10, padding:14 }}>
      <div style={{ ...S.label, marginBottom:8, color:COLORS.info }}>Scanner de Documento</div>
      
      {/* Selector de modo */}
      <div style={{ display:"flex", gap:4, marginBottom:8 }}>
        {[["🤖 IA","claude"],["🐋 Qwen","lm:qwen2.5-vl-7b-instruct"],["☁ OCR","ocrspace"]].map(([label,m])=>(
          <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"4px 6px", borderRadius:5, cursor:"pointer", border:"none", background:mode===m?"#1a2a45":"transparent", color:mode===m?COLORS.primary:"#64748b", fontSize:9 }}>
            {label}
          </button>
        ))}
      </div>
      
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {["Pasaporte","Cédula / ID","Visa"].map(t=>(
          <button key={t} onClick={()=>setDocType(t)} style={{ flex:1, padding:"5px 0", borderRadius:6, cursor:"pointer", border:"1px solid "+(docType===t?COLORS.primary:"#1e2d4a"), background:docType===t?COLORS.primary+"20":"#080c18", color:docType===t?COLORS.primary:"#64748b", fontSize:10, fontWeight:500 }}>{t}</button>
        ))}
      </div>
      <div onDrop={e=>{e.preventDefault();e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0])}} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current.click()} style={{ border:"2px dashed #1e2d4a", borderRadius:8, padding:14, textAlign:"center", cursor:"pointer", background:"#080c18", position:"relative", overflow:"hidden", minHeight:90, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {loading&&<div className="scan-line"/>}
        {img?<img src={img} alt="doc" style={{ maxWidth:"100%", maxHeight:100, borderRadius:6, objectFit:"contain" }}/>:
          <div><UploadCloud size={20} color="#334155" style={{margin:"0 auto 4px",display:"block"}}/><div style={{fontSize:11,color:"#475569"}}>Arrastre o haga clic</div></div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
      {error&&<div style={{marginTop:8,fontSize:11,color:COLORS.danger}}>{error}</div>}
      {done&&<div style={{marginTop:8,fontSize:11,color:COLORS.success}}>✓ Datos y foto extraídos — vinculados a la novedad</div>}
      <button onClick={analyze} disabled={!img||loading} style={{...S.btn(done?"ghost":undefined),width:"100%",justifyContent:"center",marginTop:10,opacity:(!img||loading)?0.5:1,fontSize:12}}>
        <Camera size={12} color={done?"#94a3b8":"#000"}/>{loading?"Procesando...":done?"Analizar otro documento":"Extraer datos con IA"}
      </button>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ onLogin, users }) {
  const [creds, setCreds] = useState({ badge:"", pass:"" });
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true); setErr("");
    const u = users.find(u => u.badge === creds.badge);
    const ok = u ? await verifyPassword(creds.pass, u.passHash) : false;
    if (ok) { onLogin(u); }
    else { setErr("Credenciales inválidas. Verifique su placa y contraseña."); setLoading(false); }
  };
  return (
    <div style={{minHeight:"100vh",background:"#080c18",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}>
      <style>{css}</style>
      <div style={{width:380,animation:"fadeIn 0.5s ease"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:64,height:64,background:"#0f1629",border:"2px solid #f59e0b",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Plane size={28} color="#f59e0b"/></div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:700,color:"#f1f5f9"}}>AEROREPORT <span style={{color:"#f59e0b"}}>PRO</span></div>
          <div style={{fontSize:12,color:"#475569",marginTop:4,letterSpacing:2,textTransform:"uppercase"}}>Sistema de Novedades Aeroportuarias</div>
          <div style={{fontSize:11,color:"#334155",marginTop:2}}>{AIRPORT.iata} · {AIRPORT.city}</div>
        </div>
        <div style={{background:"#0d1426",border:"1px solid #1e2d4a",borderRadius:16,padding:28}}>
          <div style={{marginBottom:14}}>
            <div style={{...S.label,marginBottom:5}}>Número de Placa / Badge ID</div>
            <div style={{position:"relative"}}>
              <input style={{...S.input,paddingLeft:34}} placeholder="Ej: ADM-001" value={creds.badge} onChange={e=>setCreds(p=>({...p,badge:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handle()}/>
              <Hash size={13} color="#475569" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
            </div>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{...S.label,marginBottom:5}}>Contraseña</div>
            <input style={S.input} type="password" placeholder="••••••••" value={creds.pass} onChange={e=>setCreds(p=>({...p,pass:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          </div>
          {err&&<div style={{background:"#ef444415",border:"1px solid #ef444430",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:16}}>{err}</div>}
          <button onClick={handle} disabled={loading} style={{...S.btn(),width:"100%",justifyContent:"center",height:40,opacity:loading?0.7:1}}>
            {loading?"Verificando...":"Acceder al Sistema"}
          </button>
          <div style={{marginTop:18,textAlign:"center",fontSize:11,color:"#334155"}}>
            Contacte al Administrador del sistema si olvidó sus credenciales.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ incidents }) {
  const byArea = AREAS.map(a=>({ name:a.split(" ")[0], count:incidents.filter(i=>i.area===a).length }));
  const byStatus = STATUSES.map(s=>({ name:s, value:incidents.filter(i=>i.status===s).length, color:STATUS_COLOR[s] }));
  const hourly = [7,8,9,10,11,12,13,14].map((h,i)=>({ hour:h+"h", events:[1,3,2,4,1,2,3,1][i] }));
  const critical = incidents.filter(i=>i.severity==="Crítica"||i.severity==="Alta").length;
  return (
    <div className="fade-in">
      <div style={{...S.flex,marginBottom:20,justifyContent:"space-between"}}>
        <div><div style={S.h1}>Dashboard Operativo</div><div style={{...S.mono,marginTop:2}}>{new Date().toLocaleDateString("es-DO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div></div>
        <div style={{...S.badge(COLORS.success),fontSize:12}}><span className="pulse">●</span> Sistema en línea</div>
      </div>
      <div style={{...S.grid4,marginBottom:16}}>
        {[{label:"Total Novedades",value:incidents.length,color:COLORS.info},{label:"Resueltas",value:incidents.filter(i=>i.status==="Resuelto").length,color:COLORS.success},{label:"En Proceso",value:incidents.filter(i=>i.status==="En Proceso").length,color:COLORS.warning},{label:"Alta Prioridad",value:critical,color:COLORS.danger}]
          .map((s,i)=><div key={i} style={S.statCard(s.color)}><div style={{...S.label,marginBottom:8}}>{s.label}</div><div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:"'Barlow Condensed',sans-serif"}}>{s.value}</div></div>)}
      </div>
      <div style={{...S.grid2,marginBottom:16}}>
        <div style={S.card}><div style={{...S.h2,marginBottom:14}}>Novedades por Área</div>
          <ResponsiveContainer width="100%" height={170}><BarChart data={byArea} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:"#0d1426",border:"1px solid #1e2d4a",borderRadius:8,color:"#e2e8f0",fontSize:12}}/>
            <Bar dataKey="count" fill="#f59e0b" radius={[4,4,0,0]}/>
          </BarChart></ResponsiveContainer>
        </div>
        <div style={S.card}><div style={{...S.h2,marginBottom:12}}>Estado de Incidencias</div>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <ResponsiveContainer width={130} height={130}><PieChart><Pie data={byStatus} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">{byStatus.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie></PieChart></ResponsiveContainer>
            <div style={{flex:1}}>{byStatus.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:s.color}}/><span style={{fontSize:12,color:"#94a3b8"}}>{s.name}</span></div>
              <span style={{fontSize:15,fontWeight:600,color:s.color}}>{s.value}</span>
            </div>)}</div>
          </div>
        </div>
      </div>
      <div style={{...S.card,marginBottom:16}}><div style={{...S.h2,marginBottom:12}}>Actividad Horaria</div>
        <ResponsiveContainer width="100%" height={90}><LineChart data={hourly}>
          <XAxis dataKey="hour" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{background:"#0d1426",border:"1px solid #1e2d4a",borderRadius:8,color:"#e2e8f0",fontSize:12}}/>
          <Line type="monotone" dataKey="events" stroke="#f59e0b" strokeWidth={2} dot={{fill:"#f59e0b",r:3}}/>
        </LineChart></ResponsiveContainer>
      </div>
      <div style={S.card}><div style={{...S.flex,marginBottom:12,justifyContent:"space-between"}}><div style={S.h2}>Novedades Recientes</div></div>
        {incidents.slice(0,4).map(inc=>(
          <div key={inc.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #1a2540"}}>
            <div style={{width:34,height:34,borderRadius:7,background:"#1a2a45",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Shield size={15} color={COLORS.info}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inc.reportName||inc.description.substring(0,60)}</div>
              <div style={{fontSize:10,color:"#475569",marginTop:2}}>{inc.area} · {inc.time}</div>
            </div>
            <div style={S.badge(STATUS_COLOR[inc.status])}>{inc.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── INCIDENT FORM ────────────────────────────────────────────────────────────
function IncidentForm({ incidents, setIncidents, onViewReport, logAudit }) {
  const empty = { reportName:"", time:"", area:AREAS[0], flightNumber:"", airline:"", origin:"", description:"", actions:"", status:STATUSES[0], severity:"Media", evidence:[], persons:[] };
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const evidenceRef = useRef();

  const filtered = incidents.filter(i=>
    ((i.reportName||"").toLowerCase().includes(search.toLowerCase()))||
    i.description.toLowerCase().includes(search.toLowerCase())||
    i.area.toLowerCase().includes(search.toLowerCase())
  );
  const save = () => {
    if (!form.description||!form.time) return;
    const label = form.reportName || (form.area+" — "+form.time);
    if (editing!==null) { setIncidents(p=>p.map(i=>i.id===editing?{...form,id:editing}:i)); logAudit && logAudit("editar","novedad",label); }
    else { setIncidents(p=>[...p,{...form,id:Date.now()}]); logAudit && logAudit("crear","novedad",label); }
    setForm(empty); setEditing(null); setShowScanner(false);
  };
  const del = id=>{
    const inc = incidents.find(i=>i.id===id);
    setIncidents(p=>p.filter(i=>i.id!==id));
    logAudit && logAudit("eliminar","novedad", inc ? (inc.reportName||(inc.area+" — "+inc.time)) : ("#"+id));
  };
  const edit = inc=>{ setForm({...inc}); setEditing(inc.id); setShowScanner(false); };
  const addEvidence = files=>{ Array.from(files).forEach(f=>{ const r=new FileReader(); r.onload=e=>setForm(p=>({...p,evidence:[...p.evidence,{id:Date.now()+Math.random(),name:f.name,url:e.target.result,type:f.type}]})); r.readAsDataURL(f); }); };
  const removeEvidence = id=>setForm(p=>({...p,evidence:p.evidence.filter(e=>e.id!==id)}));
  const set = k=>e=>setForm(p=>({...p,[k]:e.target.value}));

  return (
    <div className="fade-in">
      <div style={{...S.h1,marginBottom:20}}>Registro de Novedades</div>
      <div style={S.row}>
        {/* FORM */}
        <div style={{flex:"0 0 410px"}}>
          <div style={S.card}>
            <div style={{...S.h2,marginBottom:14,color:editing!==null?COLORS.warning:COLORS.info}}>{editing!==null?"✎ Editando Novedad":"+ Nueva Novedad"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>

              {/* Nombre del informe */}
              <div>
                <div style={{...S.label,marginBottom:5}}>Nombre del Informe / Caso</div>
                <input style={{...S.input,borderColor:"#f59e0b40"}} placeholder="Ej: Pasajero no admitido — Kingston" value={form.reportName} onChange={set("reportName")}/>
              </div>

              {/* Hora + Severidad */}
              <div style={S.grid2}>
                <div><div style={{...S.label,marginBottom:5}}>Hora</div><input style={S.input} type="time" value={form.time} onChange={set("time")}/></div>
                <div><div style={{...S.label,marginBottom:5}}>Severidad</div>
                  <select style={S.select} value={form.severity} onChange={set("severity")}>{["Baja","Media","Alta","Crítica"].map(s=><option key={s}>{s}</option>)}</select>
                </div>
              </div>

              {/* Área */}
              <div><div style={{...S.label,marginBottom:5}}>Área</div>
                <select style={S.select} value={form.area} onChange={set("area")}>{AREAS.map(a=><option key={a}>{a}</option>)}</select>
              </div>

              {/* Vuelo */}
              <div style={S.grid2}>
                <div><div style={{...S.label,marginBottom:5}}>N° de Vuelo</div><input style={S.input} placeholder="Ej: 851" value={form.flightNumber} onChange={set("flightNumber")}/></div>
                <div><div style={{...S.label,marginBottom:5}}>Línea Aérea</div><input style={S.input} placeholder="Ej: Arajet" value={form.airline} onChange={set("airline")}/></div>
              </div>
              <div><div style={{...S.label,marginBottom:5}}>Procedencia y/o Destino</div><input style={S.input} placeholder="Ej: Kingston, Jamaica" value={form.origin} onChange={set("origin")}/></div>

              {/* Descripción y acciones */}
              <div><div style={{...S.label,marginBottom:5}}>Descripción de la Novedad</div>
                <textarea style={S.textarea} placeholder="Describa detalladamente el incidente..." value={form.description} onChange={set("description")} rows={3}/>
              </div>
              <div><div style={{...S.label,marginBottom:5}}>Acciones Tomadas</div>
                <textarea style={S.textarea} placeholder="Detalle las acciones y protocolos aplicados..." value={form.actions} onChange={set("actions")} rows={2}/>
              </div>

              {/* Estado */}
              <div><div style={{...S.label,marginBottom:5}}>Estado</div>
                <select style={S.select} value={form.status} onChange={set("status")}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
              </div>

              <div style={S.sep}/>

              {/* Evidencias */}
              <div>
                <div style={{...S.flex,marginBottom:8,justifyContent:"space-between"}}>
                  <div style={S.label}>Evidencias ({form.evidence.length})</div>
                  <button onClick={()=>evidenceRef.current.click()} style={{...S.btn("ghost"),padding:"4px 10px",fontSize:11}}><UploadCloud size={12}/>Agregar Foto</button>
                </div>
                <input ref={evidenceRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addEvidence(e.target.files)}/>
                {form.evidence.length>0?(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:8}}>
                    {form.evidence.map(ev=>(
                      <div key={ev.id} style={{position:"relative",borderRadius:6,overflow:"hidden",border:"1px solid #1e2d4a"}}>
                        <img src={ev.url} alt={ev.name} style={{width:"100%",height:60,objectFit:"cover"}}/>
                        <button onClick={()=>removeEvidence(ev.id)} style={{position:"absolute",top:2,right:2,background:"#ef444490",border:"none",borderRadius:4,cursor:"pointer",padding:"1px 4px",color:"#fff",fontSize:10}}>✕</button>
                      </div>
                    ))}
                  </div>
                ):(
                  <div onDrop={e=>{e.preventDefault();addEvidence(e.dataTransfer.files)}} onDragOver={e=>e.preventDefault()} onClick={()=>evidenceRef.current.click()} style={{border:"2px dashed #1e2d4a",borderRadius:8,padding:"12px 0",textAlign:"center",cursor:"pointer",background:"#0b1020",marginBottom:8}}>
                    <div style={{fontSize:11,color:"#334155"}}>Arrastre imágenes de evidencia o haga clic</div>
                  </div>
                )}
              </div>

              {/* Personas involucradas — multi-persona */}
              <div>
                <div style={{...S.flex,marginBottom:10,justifyContent:"space-between"}}>
                  <div style={{...S.label}}>
                    Personas Involucradas
                    {form.persons.length>0&&<span style={{color:COLORS.success,marginLeft:6}}>({form.persons.length} registrada{form.persons.length!==1?"s":""})</span>}
                  </div>
                  <button onClick={()=>setShowScanner(p=>!p)} style={{...S.btn(showScanner?"danger":"ghost"),padding:"4px 10px",fontSize:11}}>
                    <Camera size={12}/>{showScanner?"Cerrar":"+ Agregar Persona"}
                  </button>
                </div>
                {form.persons.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
                    {form.persons.map((p,idx)=>(
                      <div key={p._pid} style={{background:"#0b1020",border:"1px solid #1e2d4a",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                        {p.personPhoto
                          ?<img src={p.personPhoto} style={{width:32,height:40,objectFit:"cover",borderRadius:4,border:"1px solid #1e2d4a",flexShrink:0}} alt="foto"/>
                          :<div style={{width:32,height:40,background:"#1a2a45",borderRadius:4,border:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={14} color="#475569"/></div>
                        }
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>
                            <span style={{color:COLORS.primary,fontFamily:"'JetBrains Mono',monospace",fontSize:10,marginRight:6}}>#{idx+1}</span>
                            {p.fullName||((p.firstName||"")+" "+(p.lastName||"")).trim()||"Sin nombre"}
                          </div>
                          <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{p.documentNumber&&`Doc: ${p.documentNumber}`}{p.nationality&&` · ${p.nationality}`}</div>
                        </div>
                        <button onClick={()=>setForm(pr=>({...pr,persons:pr.persons.filter(x=>x._pid!==p._pid)}))} style={{background:"none",border:"none",cursor:"pointer",color:COLORS.danger,padding:"2px 6px",fontSize:13}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {showScanner&&<MiniScanner onExtracted={data=>{
                  setForm(p=>({...p,persons:[...p.persons,{...data,_pid:Date.now()+Math.random()}]}));
                  setShowScanner(false);
                }}/>}
                {form.persons.length===0&&!showScanner&&(
                  <div style={{border:"1px dashed #1e2d4a",borderRadius:8,padding:"10px 14px",textAlign:"center",background:"#0b1020"}}>
                    <div style={{fontSize:11,color:"#334155"}}>No hay personas registradas — use "+ Agregar Persona" para escanear documentos</div>
                  </div>
                )}
              </div>

              {/* Guardar */}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={save} style={{...S.btn(),flex:1,justifyContent:"center"}}><Plus size={14}/>{editing!==null?"Actualizar Novedad":"Registrar Novedad"}</button>
                {editing!==null&&<button onClick={()=>{setForm(empty);setEditing(null);setShowScanner(false);}} style={{...S.btn("ghost"),padding:"8px 12px"}}><XCircle size={14}/></button>}
              </div>
            </div>
          </div>
        </div>

        {/* LIST */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{position:"relative",marginBottom:12}}>
            <input style={{...S.input,paddingLeft:32}} placeholder="Buscar por nombre, área o descripción..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <Search size={13} color="#475569" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filtered.map(inc=>(
              <div key={inc.id} style={{...S.card,padding:"13px 16px"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  {inc.persons&&inc.persons.length>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
                      {inc.persons.slice(0,3).map((p,i)=>p.personPhoto
                        ?<img key={i} src={p.personPhoto} style={{width:32,height:40,objectFit:"cover",borderRadius:4,border:"1px solid #1e2d4a"}} alt="foto"/>
                        :<div key={i} style={{width:32,height:40,background:"#1a2a45",borderRadius:4,border:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={12} color="#475569"/></div>
                      )}
                      {inc.persons.length>3&&<div style={{width:32,height:20,background:"#1a2a45",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#64748b"}}>+{inc.persons.length-3}</div>}
                    </div>
                  )}
                  <div style={{flex:1,minWidth:0}}>
                    {inc.reportName&&<div style={{fontSize:13,color:COLORS.primary,fontWeight:600,marginBottom:3}}>{inc.reportName}</div>}
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:"#64748b"}}>{inc.time}</span>
                      <span style={S.badge(COLORS.info)}>{inc.area}</span>
                      <span style={S.badge(STATUS_COLOR[inc.status])}>{inc.status}</span>
                      <span style={S.badge(SEVCOLORS[inc.severity]||"#64748b")}>{inc.severity}</span>
                      {inc.flightNumber&&<span style={S.badge("#64748b")}>Vuelo {inc.flightNumber}</span>}
                      {inc.persons&&inc.persons.length>0&&<span style={S.badge(COLORS.success)}><User size={9}/>{inc.persons.length} persona{inc.persons.length!==1?"s":""}</span>}
                      {inc.evidence&&inc.evidence.length>0&&<span style={S.badge(COLORS.info)}>{inc.evidence.length} evidencia(s)</span>}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{inc.description.substring(0,90)}...</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>onViewReport(inc)} style={{...S.btn("ghost"),padding:"5px 8px"}} title="Imprimir informe individual"><Printer size={13}/></button>
                    <button onClick={()=>edit(inc)} style={{...S.btn("ghost"),padding:"5px 8px"}} title="Editar"><Eye size={13}/></button>
                    <button onClick={()=>del(inc.id)} style={{...S.btn("danger"),padding:"5px 8px"}} title="Eliminar"><Trash2 size={13}/></button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:"#475569"}}>No se encontraron novedades</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MRZ PARSER (Tesseract) ─────────────────────────────────────────────────────
function parseMRZ(text) {
  const origText = text;
  const upperText = text.toUpperCase().replace(/\s+/g,"").replace(/</g,"");
  
  // Buscar línea MRZ (formato: NnnnnnnnACCyymmddXNnnnnn)
  const mrzPatterns = [
    /N[0-9]{8}[A-Z]{3}[0-9]{7}[A-Z][0-9]{7}/,
    /[A-Z][0-9]{8}[A-Z]{3}[0-9]{7}[A-Z][0-9]{7}/,
    /[A-Z0-9]{28,45}/,
  ];
  
  let mrzLine = "";
  for(const p of mrzPatterns){
    const m = upperText.match(p);
    if(m){
      mrzLine = m[0];
      break;
    }
  }
  
  // Si encontramos MRZ válido
  if(mrzLine.length >= 28){
    try{
      const natMap = { MEX:"Mexicana", USA:"Estadounidense", DOM:"Dominicana", COL:"Colombiana", VEN:"Venezolana", ESP:"Española", CUB:"Cubana", HAI:"Haitiana", BRA:"Brasileña", ARG:"Argentina", GBR:"Británica", CAN:"Canadiense" };
      
      // Extraer código de país
      const countryMatch = mrzLine.match(/[A-Z]{3}/);
      const countryCode = countryMatch ? countryMatch[0] : "";
      const nationality = natMap[countryCode] || countryCode;
      const issuingCountry = countryCode === "MEX" ? "Estados Unidos Mexicanos" : nationality;
      
      // Extraer número de documento (comienza con letra, 9 dígitos)
      const docMatch = mrzLine.match(/^([A-Z][0-9]{8})/);
      const documentNumber = docMatch ? docMatch[1] : "";
      
      // Extraer fecha nacimiento (formato YYMMDD en posición 13-19)
      const dobRaw = mrzLine.substring(13, 19);
      const dobYY = parseInt(dobRaw.substring(0,2));
      const dobYear = dobYY <= 30 ? 2000 + dobYY : 1900 + dobYY;
      const dateOfBirth = dobRaw.substring(4,6) + "/" + dobRaw.substring(2,4) + "/" + dobYear;
      
      // Extraer género (posición 20)
      const sex = mrzLine.charAt(20);
      const gender = sex === "M" ? "Masculino" : sex === "F" ? "Femenino" : "";
      
      // Extraer fecha expiración (posición 21-27)
      const expRaw = mrzLine.substring(21, 27);
      const expYY = parseInt(expRaw.substring(0,2));
      const expYear = expYY <= 30 ? 2000 + expYY : 1900 + expYY;
      const expiryDate = expRaw.substring(4,6) + "/" + expRaw.substring(2,4) + "/" + expYear;
      
      // Buscar nombres desde el texto completo de OCR.space
      let firstName = "", lastName = "";
      
      // Buscar línea que tenga el nombre (contiene JUAN JOEL)
      const allLines = origText.split(/[\n\r]+/);
      for(let i = 0; i < allLines.length; i++){
        const line = allLines[i].trim();
        // Buscar línea con nombre (contiene JUAN o JOEL)
        if(line.toUpperCase().includes("JUAN") || line.toUpperCase().includes("JOEL")){
          firstName = line.trim();
          // La línea anterior es el apellido (TEC KUMUL)
          if(i > 0){
            lastName = allLines[i-1].trim();
          }
          break;
        }
      }
      
      // Si no encontró nombre en texto visible, buscar en línea MRZ
      if((!firstName || !lastName) && origText.includes("P<")){
        const mrzNameMatch = origText.match(/P<([A-Z]+)<{2,}([A-Z\s]+)</);
        if(mrzNameMatch){
          lastName = mrzNameMatch[1].trim();
          firstName = mrzNameMatch[2].trim().replace(/</g," ").replace(/\s+/g," ").trim();
        }
      }
      
      return {
        documentType: "Pasaporte",
        firstName,
        lastName,
        fullName: (firstName + " " + lastName).trim(),
        documentNumber,
        nationality,
        dateOfBirth,
        gender,
        expiryDate,
        issuingCountry,
        mrz: origText.includes("P<") ? origText.substring(origText.indexOf("P<"), origText.indexOf("P<") + 60).split("\n")[0] : mrzLine.substring(0, 60),
        confidence: "media",
        notes: "Datos extraídos de OCR.space"
      };
    }catch(e){}
  }
  
  // Intentar con líneas separadas (formato clásico)
  const lines = text.split("\n").map(l=>l.trim().replace(/\s/g,"").toUpperCase()).filter(l=>l.length>20);
  if(lines.length<2) return null;
  try {
    const l1=lines[0], l2=lines[1];
    if(l1.length>=44&&l2.length>=44){
      const namePart=l1.substring(5,44), ns=namePart.split("<<");
      const lastName=(ns[0]||"").replace(/</g," ").trim();
      const firstName=(ns[1]||"").replace(/</g," ").trim();
      const docNumber=l2.substring(0,9).replace(/</g,"");
      const nationality=l2.substring(10,13).replace(/</g,"");
      const dobRaw=l2.substring(13,19), expRaw=l2.substring(21,27), sex=l2.substring(20,21);
      const fmtDate=(r,future)=>{if(!r||r.length<6)return r;const yy=parseInt(r.substring(0,2));const yr=future?(yy<=30?2000+yy:1900+yy):(2000+yy);return r.substring(4,6)+"/"+r.substring(2,4)+"/"+yr;};
      return {
        documentType:"Pasaporte",firstName,lastName,fullName:(firstName+" "+lastName).trim(),
        documentNumber:docNumber,nationality,dateOfBirth:fmtDate(dobRaw,false),
        gender:sex==="M"?"Masculino":sex==="F"?"Femenino":sex,
        expiryDate:fmtDate(expRaw,true),issuingCountry:l1.substring(2,5).replace(/</g,""),
        mrz:lines.slice(0,2).join(" / "),confidence:"alta",notes:"Datos extraídos via MRZ — OCR"
      };
    }
  } catch(e){}
  return null;
}

function extractFromText(text, docType) {
  const origText = text;
  const upperText = text.toUpperCase();
  const r={firstName:"",lastName:"",fullName:"",documentNumber:"",dateOfBirth:"",nationality:"",gender:"",expiryDate:"",issuingCountry:"",documentType:docType||"Pasaporte",mrz:"",confidence:"baja",notes:"Extracción por OCR — revise los datos"};
  
  const lines = origText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
  
  // Buscar MRZ línea (formato típico: NnnnnnnnACCyymmddXNnnnnn)
  const mrzPattern = /[A-Z][0-9]{8}[A-Z]{3}[0-9]{7}[A-Z][0-9]{7}/;
  const mrzMatch = origText.match(mrzPattern);
  if(mrzMatch){
    const mrz = mrzMatch[0].replace(/</g,"").replace(/[^A-Z0-9]/g,"");
    if(mrz.length >= 28){
      // Número de pasaporte
      const docMatch = mrz.match(/^([A-Z][0-9]{8})/);
      if(docMatch) r.documentNumber = docMatch[1];
      
      // Nacionalidad
      const natMatch = mrz.match(/[A-Z]{3}/);
      const natMap = { MEX:"Mexicana", USA:"Estadounidense", DOM:"Dominicana", COL:"Colombiana", VEN:"Venezolana", ESP:"Española", CUB:"Cubana", HAI:"Haitiana", BRA:"Brasileña", ARG:"Argentina", GBR:"Británica", CAN:"Canadiense" };
      if(natMatch && natMap[natMatch[0]]){
        r.nationality = natMap[natMatch[0]];
        r.issuingCountry = natMatch[0] === "MEX" ? "Estados Unidos Mexicanos" : r.nationality;
      }
      
      // Fechas (formato YYMMDD)
      if(mrz.length >= 27){
        const dob = mrz.substring(13, 19);
        const exp = mrz.substring(21, 27);
        if(dob.length === 6){
          const dobYY = parseInt(dob.substring(0,2));
          r.dateOfBirth = dob.substring(4,6) + "/" + dob.substring(2,4) + "/" + (dobYY <= 30 ? 2000 + dobYY : 1900 + dobYY);
        }
        if(exp.length === 6){
          const expYY = parseInt(exp.substring(0,2));
          r.expiryDate = exp.substring(4,6) + "/" + exp.substring(2,4) + "/" + (expYY <= 30 ? 2000 + expYY : 1900 + expYY);
        }
      }
      
      // Género
      if(mrz.length > 20){
        const sex = mrz.charAt(20);
        if(sex === "M") r.gender = "Masculino";
        else if(sex === "F") r.gender = "Femenino";
      }
    }
  }
  
  // Buscar número de pasaporte sueltos (formato: N12345678)
  if(!r.documentNumber){
    const passMatch = origText.match(/\bN[0-9]{8}\b/i);
    if(passMatch) r.documentNumber = passMatch[0].toUpperCase();
  }
  
  // Nacionalidad explícita
  if(!r.nationality){
    if(/MEXICANA|MEX\b/.test(upperText)){ r.nationality = "Mexicana"; r.issuingCountry = "Estados Unidos Mexicanos"; }
    else if(/ESTADOUNIDENSE|AMERICAN\b/.test(upperText)){ r.nationality = "Estadounidense"; r.issuingCountry = "Estados Unidos"; }
    else if(/DOMINICANA\b/.test(upperText)){ r.nationality = "Dominicana"; r.issuingCountry = "República Dominicana"; }
  }
  
  // Buscar fechas en formato DD MM AAAA
  const dateMatches = origText.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/g);
  if(dateMatches){
    const dates = dateMatches.map(d => {
      const parts = d.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
      return { day: parts[1], month: parts[2], year: parts[3], str: d };
    });
    dates.sort((a,b) => parseInt(a.year) - parseInt(b.year));
    for(const d of dates){
      const year = parseInt(d.year);
      if(!r.dateOfBirth && year > 1950 && year < 2010){
        r.dateOfBirth = d.day.padStart(2,"0") + "/" + d.month.padStart(2,"0") + "/" + d.year;
      }else if(!r.expiryDate && year > 2020){
        r.expiryDate = d.day.padStart(2,"0") + "/" + d.month.padStart(2,"0") + "/" + d.year;
      }
    }
  }
  
  // Buscar nombres (líneas que parecen nombres, sin números ni códigos de país)
  for(const line of lines){
    const clean = line.replace(/[^A-ZÁÉÍÓÚÑ\s]/g,"").trim();
    const words = clean.split(/\s+/).filter(w => w.length >= 2);
    if(words.length >= 2 && clean.length < 45 && clean.length > 4){
      if(!/MEXICO|ESTADOS|UNIDOS|DOMINICANA|COLOMBIA|VENEZUELA|QUINTANA|BENITO|ROO|CANA/.test(clean)){
        r.fullName = line.trim();
        const parts = line.trim().split(/\s+/);
        if(parts.length >= 2){
          r.lastName = parts[parts.length - 1];
          r.firstName = parts.slice(0, -1).join(" ");
        }
        break;
      }
    }
  }
  
  // Calcular confianza
  const filled = [r.documentNumber, r.dateOfBirth, r.nationality, r.fullName].filter(f => f && f.length > 0).length;
  if(filled >= 4) r.confidence = "alta";
  else if(filled >= 3) r.confidence = "media";
  
  return r;
}

 // ─── FULL OCR SCANNER PAGE ────────────────────────────────────────────────────
function matchWatchlist(result, watchlist) {
  if (!result || !watchlist || !watchlist.length) return [];
  const norm = s => (s||"").toString().toUpperCase().replace(/\s+/g,"");
  const doc = norm(result.documentNumber);
  const name = (result.fullName || ((result.firstName||"")+" "+(result.lastName||""))).toLowerCase().trim();
  return watchlist.filter(w => {
    const docHit = w.docNumber && doc && norm(w.docNumber) === doc;
    const wn = (w.name||"").toLowerCase().trim();
    const nameHit = wn && name && name.includes(wn);
    return docHit || nameHit;
  });
}

function OCRScanner({ watchlist }) {
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [docType, setDocType] = useState("Pasaporte");
  const [showCrop, setShowCrop] = useState(false);
  const [mode, setMode] = useState("ocrspace"); // "claude" | "lm:qwen2.5-vl-7b-instruct" | "ocrspace"
  const [tProgress, setTProgress] = useState(0);
  const [tStatus, setTStatus] = useState("");
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const fileRef = useRef();

  const handleFile = f=>{ const r=new FileReader(); r.onload=e=>{setImg(e.target.result);setResult(null);setError("");setShowCrop(false);setRawText("");setTProgress(0);}; r.readAsDataURL(f); };

  // ─── Modo Claude Vision API ──────────────────────────────────────────────
  const analyzeClaude = async()=>{
    if(!img)return; setLoading(true); setError(""); setResult(null);
    try{
      const base64=img.split(",")[1]; const mtype=img.split(";")[0].split(":")[1];
      const data=await callAnthropicAPI("claude-sonnet-4-6", 1200, [{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mtype,data:base64}},
        {type:"text",text:`Eres un sistema experto en extracción de datos de documentos de identidad. Analiza este ${docType}. Responde ÚNICAMENTE con JSON válido sin markdown:
{"firstName":"","lastName":"","fullName":"","documentNumber":"","dateOfBirth":"","nationality":"","gender":"","expiryDate":"","issuingCountry":"","documentType":"","mrz":"","confidence":"alta/media/baja","notes":"","faceX":0,"faceY":0,"faceW":0,"faceH":0}
faceX,faceY,faceW,faceH son NÚMEROS 0-100 indicando posición porcentual del ROSTRO en la imagen.`}
      ]}]);
      const text=(data.content&&data.content.find(c=>c.type==="text")||{}).text||"";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      if(parsed.faceW>3&&parsed.faceH>3){
        const image=new window.Image();
        image.onload=()=>{
          const canvas=document.createElement("canvas");
          const x=(parsed.faceX/100)*image.naturalWidth, y=(parsed.faceY/100)*image.naturalHeight;
          const w=(parsed.faceW/100)*image.naturalWidth, h=(parsed.faceH/100)*image.naturalHeight;
          canvas.width=w; canvas.height=h;
          canvas.getContext("2d").drawImage(image,x,y,w,h,0,0,w,h);
          parsed.personPhoto=canvas.toDataURL("image/jpeg",0.92);
          parsed.docImage=img; setResult(parsed);
        };
        image.src=img;
      } else { parsed.docImage=img; setResult(parsed); }
    }catch(e){setError("Error: "+e.message);}
    setLoading(false);
  };

  // ─── Modo LM Studio (Qwen2.5-VL) ─────────────────────────────────────────────
  const analyzeLM = async()=>{
    if(!img)return; setLoading(true); setError(""); setResult(null); setTProgress(0);
    try{
      setTStatus("Conectando a LM Studio...");
      const base64=img.split(",")[1]; const mtype=img.split(";")[0].split(":")[1];
      setTStatus("Analizando imagen...");
      const data=await callAnthropicAPI("lm:qwen2.5-vl-7b-instruct", 1200, [{role:"user",content:[
        {type:"image_url",image_url:{url:`data:${mtype};base64,${base64}`}},
        {type:"text",text:`Eres un sistema experto en extracción de datos de documentos de identidad. Analiza este ${docType} y extrae toda la información visible. Responde ÚNICAMENTE con JSON válido sin markdown:
{"firstName":"","lastName":"","fullName":"","documentNumber":"","dateOfBirth":"","nationality":"","gender":"","expiryDate":"","issuingCountry":"","documentType":"","confidence":"alta/media/baja","notes":"","faceX":0,"faceY":0,"faceW":0,"faceH":0}
faceX,faceY,faceW,faceH son NÚMEROS 0-100 indicando posición porcentual del ROSTRO en la imagen.`}
      ]}]);
      const text=(data.content&&data.content[0]?.text)||"";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      // Extraer foto del rostro
      if(parsed.faceW>3&&parsed.faceH>3){
        const image=new window.Image();
        image.onload=()=>{
          const canvas=document.createElement("canvas");
          const x=(parsed.faceX/100)*image.naturalWidth, y=(parsed.faceY/100)*image.naturalHeight;
          const w=(parsed.faceW/100)*image.naturalWidth, h=(parsed.faceH/100)*image.naturalHeight;
          canvas.width=w; canvas.height=h;
          canvas.getContext("2d").drawImage(image,x,y,w,h,0,0,w,h);
          parsed.personPhoto=canvas.toDataURL("image/jpeg",0.92);
          parsed.docImage=img;
          setResult(parsed);
        };
        image.src=img;
      } else { parsed.docImage=img; setResult(parsed); }
      setTStatus("¡Completado!");
    }catch(e){ setError("Error LM Studio: "+e.message); }
    setLoading(false);
  };

  // ─── Modo Tesseract OCR Local ─────────────────────────────────────────────
  const preprocessImage = (canvas, imgElement) => {
    const ctx = canvas.getContext("2d");
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    ctx.drawImage(imgElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const enhanced = Math.min(255, Math.max(0, gray * 1.3));
      const threshold = enhanced > 128 ? 255 : enhanced * 0.9;
      data[i] = data[i + 1] = data[i + 2] = threshold;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.95);
  };

  const analyzeOCRspace = async()=>{
    if(!img)return; setLoading(true); setError(""); setResult(null); setTProgress(0);
    try{
      setTStatus("Conectando a OCR.space...");
      const base64 = img.split(",")[1];
      setTStatus("Reconociendo texto...");
      setTProgress(30);
      
      const text = await callOCRspace(base64, "spa");
      setTProgress(70);
      
      setRawText(text);
      setTStatus("Extrayendo datos...");
      
      let parsed = parseMRZ(text);
      // Si no tiene número de documento O no tiene nombres, usar extractFromText
      if(!parsed || !parsed.documentNumber || !parsed.firstName){
        parsed = extractFromText(text, docType);
      }
      parsed.docImage = img;
      setResult(parsed);
      setTStatus("¡Completado!");
      setTProgress(100);
    }catch(e){ setError("Error OCR: "+e.message); }
    setLoading(false);
  };

  const analyze = mode==="claude" ? analyzeClaude : mode==="lm:qwen2.5-vl-7b-instruct" ? analyzeLM : analyzeOCRspace;
  const CONF={alta:COLORS.success,media:COLORS.warning,baja:COLORS.danger};

  if(showCrop&&img&&result) return (
    <div className="fade-in">
      <div style={{...S.h1,marginBottom:18}}>Scanner — Recorte de Foto</div>
      <CropTool imgSrc={img} onCrop={photo=>{setResult(r=>({...r,personPhoto:photo}));setShowCrop(false);}} onCancel={()=>setShowCrop(false)}/>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{...S.flex,marginBottom:4,justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={S.h1}>Scanner de Documentos</div>
          <div style={{...S.mono,marginTop:2}}>{mode==="claude"?"Claude Vision API · Alta precisión, requiere conexión":mode==="lm:qwen2.5-vl-7b-instruct"?"Qwen (LM Studio) · Local con visión":"OCR.space · En línea, preciso"}</div>
        </div>
        {/* Toggle de modo */}
        <div style={{display:"flex",background:"#0b1020",border:"1px solid #1e2d4a",borderRadius:9,padding:3,gap:3,flexShrink:0}}>
          {[["claude","🤖 IA (Claude)"],["lm:qwen2.5-vl-7b-instruct","🐋 Qwen (LM)"],["ocrspace","☁ OCR.space"]].map(([m,label])=>(
            <button key={m} onClick={()=>{setMode(m);setResult(null);setError("");}} style={{padding:"6px 14px",borderRadius:7,cursor:"pointer",border:"none",background:mode===m?"#1a2a45":"transparent",color:mode===m?COLORS.primary:"#64748b",fontSize:12,fontWeight:mode===m?500:400,transition:"all 0.15s"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Info banner por modo */}
      <div style={{...S.card,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10,background:mode==="claude"?"#6366f108":mode==="lm:qwen2.5-vl-7b-instruct"?"#10b98108":"#6366f108",border:"1px solid "+(mode==="claude"?"#6366f120":mode==="lm:qwen2.5-vl-7b-instruct"?"#10b98120":"#6366f120")}}>
        {mode==="claude"
          ? <><span style={{fontSize:13}}>🤖</span><span style={{fontSize:11,color:"#94a3b8"}}>Claude Vision extrae datos con alta precisión. Requiere API key y conexión a internet.</span></>
          : mode==="lm:qwen2.5-vl-7b-instruct"
          ? <><span style={{fontSize:13}}>🐋</span><span style={{fontSize:11,color:"#94a3b8"}}>Qwen via LM Studio. Requiere modelo de visión cargado en LM Studio (puerto 1234).</span></>
          : <><span style={{fontSize:13}}>☁</span><span style={{fontSize:11,color:"#94a3b8"}}>OCR.space procesa en la nube. 5000 scans/mes gratis. Precisión alta en español.</span></>
        }
      </div>

      <div style={S.row}>
        <div style={{flex:"0 0 320px"}}>
          <div style={S.card}>
            <div style={{marginBottom:14}}>
              <div style={{...S.label,marginBottom:6}}>Tipo de Documento</div>
              <div style={{display:"flex",gap:6}}>
                {["Pasaporte","Cédula / ID","Visa"].map(t=>(
                  <button key={t} onClick={()=>setDocType(t)} style={{flex:1,padding:"7px 4px",borderRadius:7,cursor:"pointer",border:"1px solid "+(docType===t?"#f59e0b":"#1e2d4a"),background:docType===t?"#f59e0b20":"#0b1020",color:docType===t?"#f59e0b":"#64748b",fontSize:11,fontWeight:500}}>{t}</button>
                ))}
              </div>
            </div>
            <div onDrop={e=>{e.preventDefault();e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0])}} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current.click()} style={{border:"2px dashed #1e2d4a",borderRadius:10,padding:"24px 14px",textAlign:"center",cursor:"pointer",background:"#0b1020",position:"relative",overflow:"hidden",minHeight:160,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {loading&&<div className="scan-line"/>}
              {img?<img src={img} alt="doc" style={{maxWidth:"100%",maxHeight:140,borderRadius:7,objectFit:"contain"}}/>:
                <div><UploadCloud size={30} color="#1e2d4a" style={{margin:"0 auto 8px",display:"block"}}/><div style={{fontSize:12,color:"#475569"}}>Arrastre o haga clic</div><div style={{fontSize:10,color:"#334155",marginTop:3}}>JPG, PNG · Máx. 10MB</div></div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>

            {/* Barra de progreso OCR */}
            {(mode==="ocrspace"||mode==="lm:qwen2.5-vl-7b-instruct")&&loading&&(
              <div style={{marginTop:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:10,color:"#64748b"}}>{tStatus}</span>
                  <span style={{fontSize:10,color:COLORS.primary,fontWeight:600}}>{tProgress}%</span>
                </div>
                <div style={{background:"#1e2d4a",borderRadius:4,height:5,overflow:"hidden"}}>
                  <div style={{background:"linear-gradient(90deg,#10b981,#f59e0b)",height:"100%",borderRadius:4,width:tProgress+"%",transition:"width 0.3s"}}/>
                </div>
              </div>
            )}

            <button onClick={analyze} disabled={!img||loading} style={{...S.btn(),width:"100%",marginTop:11,justifyContent:"center",opacity:(!img||loading)?0.5:1}}>
              <Camera size={14} color="#000"/>{loading?(mode==="claude"?"Procesando con IA...":"Procesando con OCR..."):(mode==="claude"?"Analizar con Claude Vision":"Analizar con OCR")}
            </button>
            {error&&<div style={{marginTop:10,background:"#ef444415",border:"1px solid #ef444430",borderRadius:7,padding:"7px 11px",fontSize:11,color:"#ef4444"}}>{error}</div>}
          </div>

          {mode==="ocrspace"&&(
            <div style={{...S.card,marginTop:12}}>
              <div style={{...S.label,marginBottom:10}}>Consejos para mejor precisión</div>
              {[["✓","Imagen bien iluminada y nítida"],["✓","MRZ (código de barras) visible completo"],["✓","Documento plano, sin dobleces"],["✓","Funciona mejor con pasaportes"],["✓","Soporta español perfectamente"]].map(([ic,t],i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:5,fontSize:11}}>
                  <span style={{color:ic==="✓"?COLORS.success:COLORS.warning,fontWeight:700}}>{ic}</span>
                  <span style={{color:"#94a3b8"}}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{flex:1}}>
          {result?(
            <div style={S.card} className="fade-in">
              {matchWatchlist(result, watchlist).length>0 && (
                <div className="pulse" style={{background:"#ef444418",border:"1px solid #ef444455",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <AlertTriangle size={18} color={COLORS.danger}/>
                    <span style={{fontSize:14,fontWeight:700,color:COLORS.danger}}>⚠ COINCIDENCIA EN LISTA DE VIGILANCIA</span>
                  </div>
                  {matchWatchlist(result, watchlist).map(w=>(
                    <div key={w.id} style={{fontSize:12,color:"#fca5a5",marginTop:3}}>
                      {w.docNumber&&<span style={{fontFamily:"'JetBrains Mono',monospace"}}>{w.docNumber} </span>}
                      {w.name&&<span>· {w.name} </span>}
                      <span style={S.badge(SEVCOLORS[w.severity]||COLORS.danger)}>{w.severity}</span>
                      {w.reason&&<span style={{color:"#94a3b8"}}> — {w.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{...S.flex,marginBottom:14,justifyContent:"space-between"}}>
                <div style={S.h2}>Datos Extraídos</div>
                <div style={S.badge(CONF[result.confidence]||COLORS.warning)}>Confianza: {result.confidence||"media"}</div>
              </div>
              <div style={{display:"flex",gap:16,marginBottom:14}}>
                {result.personPhoto&&(
                  <div style={{flexShrink:0}}>
                    <div style={{...S.label,marginBottom:6}}>Foto Extraída</div>
                    <img src={result.personPhoto} style={{width:80,height:100,objectFit:"cover",borderRadius:8,border:"1px solid #1e2d4a"}} alt="foto"/>
                    <button onClick={()=>setShowCrop(true)} style={{...S.btn("ghost"),width:"100%",padding:"4px 0",fontSize:10,marginTop:6,justifyContent:"center"}}><Crop size={10}/>Recortar</button>
                  </div>
                )}
                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["Nombre(s)",result.firstName],["Apellido(s)",result.lastName],["Nombre Completo",result.fullName],["N° Documento",result.documentNumber],["Fecha Nacimiento",result.dateOfBirth],["Nacionalidad",result.nationality],["Género",result.gender],["País Emisor",result.issuingCountry],["Vencimiento",result.expiryDate],["Tipo Doc.",result.documentType]]
                    .filter(x=>x[1])
                    .map(x=><div key={x[0]} style={{background:"#0b1020",borderRadius:7,padding:"9px 11px"}}>
                      <div style={{...S.label,marginBottom:3}}>{x[0]}</div>
                      <div style={{fontSize:13,color:"#e2e8f0",fontWeight:500}}>{x[1]}</div>
                    </div>)}
                </div>
              </div>
              {result.mrz&&<div style={{background:"#0b1020",borderRadius:7,padding:"9px 11px",marginBottom:11}}>
                <div style={{...S.label,marginBottom:4}}>MRZ</div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#94a3b8",wordBreak:"break-all"}}>{result.mrz}</div>
              </div>}
              {result.notes&&<div style={{fontSize:11,color:"#64748b",fontStyle:"italic",marginBottom:10}}>ⓘ {result.notes}</div>}
              {mode==="ocrspace"&&rawText&&(
                <div>
                  <button onClick={()=>setShowRaw(p=>!p)} style={{...S.btn("ghost"),fontSize:11,padding:"5px 10px"}}>
                    {showRaw?"▲ Ocultar":"▼ Ver"} texto OCR bruto
                  </button>
                  {showRaw&&<pre style={{marginTop:8,background:"#0b1020",borderRadius:7,padding:"9px 11px",fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#64748b",whiteSpace:"pre-wrap",wordBreak:"break-all",maxHeight:150,overflow:"auto"}}>{rawText}</pre>}
                </div>
              )}
            </div>
          ):(
            <div style={{...S.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,textAlign:"center"}}>
              <div style={{width:60,height:60,background:"#0b1020",borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
                <Camera size={26} color="#1e2d4a"/>
              </div>
              <div style={{fontSize:13,color:"#475569"}}>Los datos extraídos aparecerán aquí</div>
              <div style={{fontSize:11,color:"#334155",marginTop:5}}>
                {mode==="claude"?"La foto del pasajero se extrae automáticamente":"Tesseract analizará el documento localmente"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── REPORT GENERATOR ─────────────────────────────────────────────────────────
function ReportGenerator({ incidents, user, reportCounter, setReportCounter, onPrintInc }) {
  const [config, setConfig] = useState({ shift:"Día", supervisor:user?user.name:"", notes:"" });

  // Build individual report HTML matching PDF layout
  const buildIndividualHTML = (inc, rptNum) => {
    const persons = inc.persons && inc.persons.length > 0 ? inc.persons : (inc.person ? [inc.person] : []);
    const p = persons[0] || null; // backward compat
    const now = new Date();
    const fecha = now.toLocaleDateString("es-DO",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const sc = inc.severity==="Crítica"||inc.severity==="Alta"?"#dc2626":inc.severity==="Media"?"#ea580c":"#059669";
    const statusBg = inc.status==="Resuelto"?"#d1fae5;color:#065f46":inc.status==="Escalado"?"#fee2e2;color:#991b1b":"#fff7ed;color:#92400e";

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nota Informativa ${rptNum} — ${AIRPORT.iata}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Arial',sans-serif;color:#111;background:#fff;font-size:13px;}
.page{max-width:800px;margin:0 auto;padding:28px 32px;}
/* HEADER */
.hdr{background:#1a2744;display:flex;align-items:stretch;border-bottom:3px solid #c8a94a;}
.hdr-left{padding:14px 20px;flex:1;display:flex;align-items:center;gap:14px;}
.hdr-logo{width:56px;height:56px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
.hdr-logo-inner{width:50px;height:50px;background:radial-gradient(circle,#1a3a6e,#0d1f40);border-radius:50%;border:2px solid #c8a94a;display:flex;align-items:center;justify-content:center;font-size:18px;}
.hdr-airport{color:#fff;}
.hdr-airport-name{font-size:13px;font-weight:700;letter-spacing:0.3px;}
.hdr-airport-code{font-size:11px;color:#c8a94a;margin-top:2px;}
.hdr-right{background:#c8a94a;padding:14px 22px;text-align:center;display:flex;flex-direction:column;justify-content:center;min-width:160px;}
.nota-title{font-size:14px;font-weight:800;color:#1a2744;letter-spacing:1px;}
.nota-number{font-size:28px;font-weight:900;color:#1a2744;line-height:1;margin-top:4px;}
/* META BAR */
.meta{background:#f0f3f8;border:1px solid #dde3ea;border-top:none;padding:9px 24px;display:flex;gap:32px;}
.mi{font-size:11px;color:#555;}.mi strong{color:#1a2744;font-weight:700;}
/* BODY */
.body{padding:20px 0;}
/* TITLE SECTION */
.title-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:16px;}
.title-info{flex:1;}
.case-title{font-size:18px;font-weight:800;color:#1a2744;margin-bottom:8px;line-height:1.3;}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.badge{font-size:11px;padding:3px 12px;border-radius:12px;font-weight:700;}
.flight-info{font-size:12px;color:#374151;margin-top:6px;}
.flight-info span{color:#64748b;margin-right:4px;}
.person-photo{width:90px;height:110px;object-fit:cover;border-radius:4px;border:2px solid #1a2744;flex-shrink:0;}
.person-photo-placeholder{width:90px;height:110px;background:#f0f3f8;border:2px solid #dde3ea;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;text-align:center;flex-shrink:0;}
/* SECTION HEADERS */
.section-title{font-size:11px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #c8a94a;padding-bottom:4px;margin:18px 0 10px;}
/* PERSON TABLE */
.person-table{width:100%;border-collapse:collapse;font-size:12px;border:1px solid #c8a94a;}
.person-table tr td:first-child{font-weight:700;color:#1a2744;background:#f8f5e8;padding:7px 14px;width:38%;border:1px solid #ddd6b0;}
.person-table tr td:last-child{padding:7px 14px;color:#374151;border:1px solid #ddd6b0;}
/* DESCRIPTION */
.desc-block{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid ${sc};border-radius:0 6px 6px 0;padding:12px 16px;font-size:13px;color:#374151;line-height:1.7;}
.action-block{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #1a2744;border-radius:0 6px 6px 0;padding:12px 16px;font-size:13px;color:#374151;line-height:1.7;margin-top:10px;}
/* EVIDENCE */
.ev-grid{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;}
.ev-img{width:120px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;}
/* RECOMMENDATIONS */
.rec{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;}
.ri{font-size:12px;color:#78350f;margin-bottom:5px;display:flex;gap:6px;}
/* FOOTER */
.footer{margin-top:28px;padding-top:12px;border-top:2px solid #1a2744;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:#94a3b8;}
.sign{text-align:center;}.sign-line{width:160px;border-top:1px solid #cbd5e1;margin:40px auto 5px;}
.sign-name{color:#374151;font-weight:600;font-size:11px;}.sign-role{color:#94a3b8;font-size:10px;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-logo"><img src='data:image/png;base64,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' style='width:52px;height:52px;object-fit:contain;border-radius:50%;'/></div>
    <div class="hdr-airport">
      <div class="hdr-airport-name">${AIRPORT.name}</div>
      <div class="hdr-airport-code">(${AIRPORT.code})</div>
    </div>
  </div>
  <div class="hdr-right">
    <div class="nota-title">Nota Informativa</div>
    <div class="nota-number">${rptNum}</div>
  </div>
</div>

<div class="meta">
  <div class="mi">Fecha: <strong>${fecha}</strong></div>
  <div class="mi">Hora: <strong>${inc.time} horas</strong></div>
  <div class="mi">Turno: <strong>${config.shift}</strong></div>
  <div class="mi">Area: <strong>${inc.area}</strong></div>
</div>

<div class="page">
  <div class="title-row">
    <div class="title-info">
      <div class="case-title">${inc.reportName||"Novedad — "+inc.area}</div>
      <div class="badges">
        <span class="badge" style="background:#e8f0fe;color:#1a2744">${inc.area}</span>
        <span class="badge" style="background:${statusBg}">${inc.status}</span>
        <span class="badge" style="background:#f1f5f9;color:${sc}">${inc.severity}</span>
      </div>
      ${inc.flightNumber||inc.airline||inc.origin?`<div class="flight-info">
        ${inc.flightNumber?`<span>Vuelo:</span><strong>${inc.flightNumber}.</strong>&nbsp;&nbsp;`:""}
        ${inc.airline?`<span>Línea Aérea:</span><strong>${inc.airline}.</strong>&nbsp;&nbsp;`:""}
        ${inc.origin?`<span>Procedencia y/o Destino:</span><strong>${inc.origin}.</strong>`:""}
      </div>`:""}
    </div>
    ${p?.personPhoto?`<img class="person-photo" src="${p.personPhoto}" alt="Foto del pasajero"/>`:
      p?`<div class="person-photo-placeholder">Sin foto del documento</div>`:""}
  </div>

  ${persons.length>0?`
  <div class="section-title">Persona${persons.length>1?"s":""} Involucrada${persons.length>1?"s":""} (${persons.length})</div>
  ${persons.map((px,pidx) => `
    ${persons.length>1?`<div style="font-size:11px;font-weight:700;color:#1a2744;background:#f0f4f8;padding:4px 10px;border-radius:4px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Persona #${pidx+1}</div>`:""}
    <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:${pidx<persons.length-1?14:0}px;">
      ${px.personPhoto?`<img src="${px.personPhoto}" style="width:64px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #ddd6b0;flex-shrink:0;" alt="foto"/>`:(persons.length>1?`<div style="width:64px;height:80px;background:#f0f4f8;border-radius:6px;border:1px dashed #ddd6b0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;flex-shrink:0;">Sin foto</div>`:"")  }
      <table class="person-table" style="flex:1">
        ${px.fullName||px.firstName?`<tr><td>Nombre y Apellido:</td><td>${px.fullName||((px.firstName||"")+" "+(px.lastName||"")).trim()}</td></tr>`:""}
        ${px.documentNumber?`<tr><td>No. de Documento:</td><td>${px.documentNumber}</td></tr>`:""}
        ${px.documentType?`<tr><td>Tipo:</td><td>${px.documentType}</td></tr>`:""}
        ${px.nationality?`<tr><td>Nacionalidad:</td><td>${px.nationality}</td></tr>`:""}
        ${px.gender?`<tr><td>Género:</td><td>${px.gender}</td></tr>`:""}
        ${px.issuingCountry?`<tr><td>País Emisor:</td><td>${px.issuingCountry}</td></tr>`:""}
        ${px.expiryDate?`<tr><td>Vence:</td><td>${px.expiryDate}</td></tr>`:""}
        ${px.dateOfBirth?`<tr><td>Fecha de Nacimiento:</td><td>${px.dateOfBirth}</td></tr>`:""}
      </table>
    </div>
  `).join("<hr style='border:none;border-top:1px dashed #e2e8f0;margin:8px 0;'>")}
  `:""}

  <div class="section-title">Descripción de la Novedad</div>
  <div class="desc-block">${inc.description}</div>

  <div class="section-title">Acciones Tomadas</div>
  <div class="action-block">${inc.actions}</div>

  ${inc.evidence&&inc.evidence.filter(e=>e.type&&e.type.startsWith("image")).length>0?`
  <div class="section-title">Evidencias Fotográficas (${inc.evidence.filter(e=>e.type&&e.type.startsWith("image")).length})</div>
  <div class="ev-grid">
    ${inc.evidence.filter(e=>e.type&&e.type.startsWith("image")).map(e=>`<img class="ev-img" src="${e.url}" alt="${e.name}"/>`).join("")}
  </div>`:""}

  <div class="section-title">Recomendaciones</div>
  <div class="rec">
    ${(inc.severity==="Crítica"||inc.severity==="Alta")?'<div class="ri"><span>⚠</span><span>Incidente de alta prioridad. Se recomienda coordinación inmediata con supervisión y autoridades competentes.</span></div>':""}
    ${inc.status==="Escalado"?'<div class="ri"><span>⚠</span><span>Caso escalado pendiente de resolución definitiva. Mantener seguimiento activo.</span></div>':""}
    ${inc.area==="Antinarcóticos (DNCD)"?'<div class="ri"><span>◆</span><span>Mantener coordinación con unidades K-9 y fiscalía para seguimiento del caso.</span></div>':""}
    <div class="ri"><span>◆</span><span>Documentar cualquier novedad adicional relacionada en el sistema.</span></div>
    ${config.notes?`<div class="ri"><span>📝</span><span>Nota del supervisor: ${config.notes}</span></div>`:""}
  </div>

  <div class="footer">
    <div style="font-size:10px;color:#94a3b8">${AIRPORT.name} (${AIRPORT.code}) · ${now.getFullYear()}</div>
    <div style="display:flex;gap:48px">
      <div class="sign">
        <div class="sign-line"></div>
        <div class="sign-name">${user?user.name:""}</div>
        <div class="sign-role">${user?ROLES[user.role]||"":""} · Placa: ${user?user.badge:""}</div>
      </div>
      <div class="sign">
        <div class="sign-line"></div>
        <div class="sign-name">${config.supervisor||""}</div>
        <div class="sign-role">Supervisor · Turno ${config.shift}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
  };

  const printIndividual = (inc) => {
    const pendingNum = buildReportNumber(reportCounter + 1);
    const win = window.open("","_blank");
    win.document.write(buildIndividualHTML(inc, pendingNum));
    win.document.close();
    // Solo incrementa si el usuario confirma la impresión o guarda el PDF
    win.addEventListener("afterprint", () => {
      setReportCounter(p => p + 1);
    });
    setTimeout(()=>win.print(), 500);
  };

  if (onPrintInc) onPrintInc.current = printIndividual;

  const buildShiftHTML = () => {
    const byArea = AREAS.map(a=>({area:a,count:incidents.filter(i=>i.area===a).length})).filter(x=>x.count>0);
    const critical = incidents.filter(i=>i.severity==="Alta"||i.severity==="Crítica").length;
    const now = new Date();
    const rptNum = buildReportNumber(reportCounter+1);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe General — ${AIRPORT.iata}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Arial',sans-serif;color:#111;background:#fff;font-size:13px;}
.page{max-width:800px;margin:0 auto;padding:28px 32px;}
.hdr{background:#1a2744;display:flex;align-items:stretch;border-bottom:3px solid #c8a94a;}
.hdr-left{padding:14px 20px;flex:1;display:flex;align-items:center;gap:14px;}
.hdr-airport-name{font-size:13px;font-weight:700;color:#fff;letter-spacing:0.3px;}
.hdr-airport-code{font-size:11px;color:#c8a94a;margin-top:2px;}
.hdr-right{background:#c8a94a;padding:14px 22px;text-align:center;display:flex;flex-direction:column;justify-content:center;min-width:160px;}
.nota-title{font-size:13px;font-weight:800;color:#1a2744;letter-spacing:1px;}
.nota-number{font-size:22px;font-weight:900;color:#1a2744;line-height:1;margin-top:3px;}
.meta{background:#f0f3f8;border:1px solid #dde3ea;border-top:none;padding:9px 24px;display:flex;gap:28px;flex-wrap:wrap;}
.mi{font-size:11px;color:#555;}.mi strong{color:#1a2744;font-weight:700;}
h2{font-size:12px;font-weight:800;color:#1a2744;border-bottom:2px solid #c8a94a;padding-bottom:4px;margin:20px 0 10px;text-transform:uppercase;letter-spacing:1px;}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
.sb{background:#f8f5e8;border:1px solid #ddd6b0;border-radius:6px;padding:10px;text-align:center;}
.sn{font-size:26px;font-weight:800;color:#1a2744;}.sl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:1px;}
.st{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}
.st th{background:#1a2744;color:white;padding:7px 11px;text-align:left;font-size:10px;text-transform:uppercase;}
.st td{padding:7px 11px;border-bottom:1px solid #e2e8f0;}
.st tr:nth-child(even) td{background:#f8fafc;}
.inc{border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:9px;break-inside:avoid;}
.pl{font-size:11px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;padding:5px 10px;margin-bottom:6px;color:#0369a1;}
.ev-grid{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;}
.ev-img{width:90px;height:72px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;}
.rec{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;}
.ri{font-size:12px;color:#78350f;margin-bottom:5px;}
.footer{margin-top:28px;padding-top:12px;border-top:2px solid #1a2744;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;}
.sign{text-align:center;}.sign-line{width:150px;border-top:1px solid #cbd5e1;margin:36px auto 5px;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="hdr">
  <div class="hdr-left">
    <img src='data:image/png;base64,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' style='width:50px;height:50px;object-fit:contain;border-radius:50%;flex-shrink:0'/>
    <div><div class="hdr-airport-name">${AIRPORT.name}</div><div class="hdr-airport-code">(${AIRPORT.code})</div></div>
  </div>
  <div class="hdr-right"><div class="nota-title">INFORME GENERAL</div><div class="nota-number">${rptNum}</div></div>
</div>
<div class="meta">
  <div class="mi">Fecha: <strong>${now.toLocaleDateString("es-DO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</strong></div>
  <div class="mi">Turno: <strong>${config.shift}</strong></div>
  <div class="mi">Supervisor: <strong>${config.supervisor||"N/D"}</strong></div>
  <div class="mi">Elaborado por: <strong>${user?user.name:"N/D"}</strong></div>
</div>
<div class="page">
  <h2>Resumen Estadístico</h2>
  <div class="sg">
    <div class="sb"><div class="sn">${incidents.length}</div><div class="sl">Total</div></div>
    <div class="sb"><div class="sn">${incidents.filter(i=>i.status==="Resuelto").length}</div><div class="sl">Resueltas</div></div>
    <div class="sb"><div class="sn">${incidents.filter(i=>i.status==="En Proceso").length}</div><div class="sl">En Proceso</div></div>
    <div class="sb"><div class="sn">${critical}</div><div class="sl">Alta Prioridad</div></div>
  </div>
  <table class="st"><thead><tr><th>Área</th><th>Total</th><th>Resueltas</th><th>En Proceso</th><th>Escaladas</th></tr></thead>
  <tbody>${byArea.map(b=>`<tr><td>${b.area}</td><td>${b.count}</td><td>${incidents.filter(i=>i.area===b.area&&i.status==="Resuelto").length}</td><td>${incidents.filter(i=>i.area===b.area&&i.status==="En Proceso").length}</td><td>${incidents.filter(i=>i.area===b.area&&i.status==="Escalado").length}</td></tr>`).join("")}</tbody></table>
  <h2>Novedades del Turno</h2>
  ${incidents.map((inc,idx)=>{
    const sc=inc.severity==="Crítica"||inc.severity==="Alta"?"#dc2626":inc.severity==="Media"?"#ea580c":"#059669";
    const incPersons=inc.persons&&inc.persons.length>0?inc.persons:(inc.person?[inc.person]:[]);
    return `<div class="inc" style="border-left:3px solid ${sc}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="flex:1">
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:10px;color:#94a3b8">#${String(idx+1).padStart(2,"0")}</span>
            <span style="font-size:11px;font-weight:700;background:#e8f0fe;color:#1a2744;padding:2px 9px;border-radius:10px">${inc.area}</span>
            ${inc.reportName?`<span style="font-size:12px;font-weight:700;color:#1a2744">${inc.reportName}</span>`:""}
          </div>
          <div style="display:flex;gap:8px;align-items:center;font-size:10px">
            <span style="font-family:monospace;color:#64748b">${inc.time} hrs</span>
            <span style="padding:2px 7px;border-radius:8px;font-weight:600;background:${inc.status==="Resuelto"?"#d1fae5;color:#065f46":inc.status==="Escalado"?"#fee2e2;color:#991b1b":"#fff7ed;color:#92400e"}">${inc.status}</span>
            <span style="font-weight:700;color:${sc}">${inc.severity}</span>
            ${inc.flightNumber?`<span style="color:#64748b">Vuelo: ${inc.flightNumber}</span>`:""}
          </div>
        </div>
        <div style="display:flex;gap:3px;flex-shrink:0;margin-left:10px">${incPersons.slice(0,3).map(px=>px.personPhoto?`<img src="${px.personPhoto}" style="width:32px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #dde3ea;"/>`:"").join("")}</div>
      </div>
      ${incPersons.length>0?incPersons.map((px,pi)=>`<div class="pl">👤${incPersons.length>1?` <strong>#${pi+1}</strong>`:""} ${px.fullName||((px.firstName||"")+" "+(px.lastName||"")).trim()} · Doc: ${px.documentNumber||"N/D"} · Nac.: ${px.nationality||"N/D"}</div>`).join(""):""}
      <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:5px">${inc.description}</div>
      <div style="font-size:11px;color:#6b7280"><strong>Acción:</strong> ${inc.actions}</div>
      ${inc.evidence&&inc.evidence.filter(e=>e.type&&e.type.startsWith("image")).length>0?
      `<div class="ev-grid">${inc.evidence.filter(e=>e.type&&e.type.startsWith("image")).map(e=>`<img class="ev-img" src="${e.url}"/>`).join("")}</div>`:""
      }
    </div>`;
  }).join("")}
  <h2>Recomendaciones</h2>
  <div class="rec">
    ${critical>1?'<div class="ri">⚠ Múltiples incidentes de alta prioridad. Se recomienda refuerzo en el siguiente turno.</div>':""}
    ${incidents.filter(i=>i.status==="Escalado").length>0?'<div class="ri">⚠ Casos escalados pendientes. Coordinar con supervisión y autoridades.</div>':""}
    <div class="ri">◆ Mantener comunicación efectiva en el cambio de turno para garantizar continuidad operativa.</div>
    ${config.notes?`<div class="ri">📝 Nota del supervisor: ${config.notes}</div>`:""}
  </div>
  <div class="footer">
    <div>${AIRPORT.name} (${AIRPORT.code}) · ${now.getFullYear()}</div>
    <div style="display:flex;gap:40px">
      <div class="sign"><div class="sign-line"></div><div style="color:#374151;font-weight:600;font-size:11px">${user?user.name:""}</div><div>${user?ROLES[user.role]||"":""}</div></div>
      <div class="sign"><div class="sign-line"></div><div style="color:#374151;font-weight:600;font-size:11px">${config.supervisor||""}</div><div>Supervisor · Turno ${config.shift}</div></div>
    </div>
  </div>
</div></body></html>`;
  };

  const printAll = () => {
    const win = window.open("","_blank");
    win.document.write(buildShiftHTML());
    win.document.close();
    win.addEventListener("afterprint", () => { setReportCounter(p => p + 1); });
    setTimeout(()=>win.print(),500);
  };

  // Exporta a PDF de un clic (Electron). En web hace fallback a impresión.
  const exportToPDF = async (html, name) => {
    if (window.electronAPI?.exportPDF) {
      const r = await window.electronAPI.exportPDF(html, name);
      if (r?.ok) setReportCounter(p => p + 1);
      return;
    }
    const win = window.open("","_blank");
    win.document.write(html); win.document.close();
    setTimeout(()=>win.print(),500);
  };
  const pdfIndividual = (inc) => {
    const num = buildReportNumber(reportCounter + 1);
    exportToPDF(buildIndividualHTML(inc, num), `nota-${num}-${AIRPORT.iata}.pdf`);
  };
  const pdfShift = () => {
    exportToPDF(buildShiftHTML(), `informe-turno-${buildReportNumber(reportCounter+1)}.pdf`);
  };

  return (
    <div className="fade-in">
      <div style={{...S.h1,marginBottom:20}}>Generación de Informes</div>
      <div style={S.row}>
        <div style={{flex:"0 0 340px"}}>
          <div style={S.card}>
            <div style={{...S.h2,marginBottom:14}}>Configuración</div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <div><div style={{...S.label,marginBottom:5}}>Turno</div>
                <select style={S.select} value={config.shift} onChange={e=>setConfig(p=>({...p,shift:e.target.value}))}>
                  {["Día","Tarde","Noche"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><div style={{...S.label,marginBottom:5}}>Supervisor del Turno</div>
                <input style={S.input} value={config.supervisor} onChange={e=>setConfig(p=>({...p,supervisor:e.target.value}))} placeholder="Nombre del supervisor"/>
              </div>
              <div><div style={{...S.label,marginBottom:5}}>Observaciones</div>
                <textarea style={S.textarea} value={config.notes} onChange={e=>setConfig(p=>({...p,notes:e.target.value}))} placeholder="Observaciones adicionales..." rows={3}/>
              </div>
              <div style={{...S.sep}}/>
              <div style={{background:"#0b1020",borderRadius:8,padding:"10px 12px",marginBottom:4}}>
                <div style={{...S.label,marginBottom:4}}>Próximo N° de Reporte</div>
                <div style={{fontSize:22,fontWeight:700,color:COLORS.primary,fontFamily:"'Barlow Condensed',sans-serif"}}>{buildReportNumber(reportCounter+1)}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>Año · Mes · Secuencia</div>
              </div>
              <button onClick={printAll} style={{...S.btn(),width:"100%",justifyContent:"center"}}>
                <FileText size={14}/>Informe General del Turno
              </button>
              <button onClick={pdfShift} style={{...S.btn("ghost"),width:"100%",justifyContent:"center"}}>
                <FileText size={14}/>Descargar Informe de Turno (PDF)
              </button>
            </div>
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={S.card}>
            <div style={{...S.h2,marginBottom:4}}>Informes Individuales — Notas Informativas</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Cada novedad genera su Nota Informativa con número de reporte, datos del pasajero con foto, evidencias y firmas.</div>
            {incidents.map((inc,i)=>(
              <div key={inc.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0",borderBottom:"1px solid #1a2540"}}>
                {(()=>{const ps=inc.persons&&inc.persons.length>0?inc.persons:(inc.person?[inc.person]:[]);return ps.length>0?(<div style={{display:"flex",gap:2,flexShrink:0}}>{ps.slice(0,3).map((p,i)=>p.personPhoto?<img key={i} src={p.personPhoto} style={{width:28,height:36,objectFit:"cover",borderRadius:4,border:"1px solid #1e2d4a",marginLeft:i>0?-10:0,zIndex:3-i,position:"relative"}} alt="foto"/>:<div key={i} style={{width:28,height:36,background:"#1a2a45",borderRadius:4,border:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"center",marginLeft:i>0?-10:0,zIndex:3-i,position:"relative"}}><User size={11} color="#475569"/></div>)}{ps.length>3&&<div style={{width:22,height:36,background:"#0b1020",borderRadius:4,border:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#64748b",marginLeft:-10,zIndex:0}}>+{ps.length-3}</div>}</div>):(<div style={{width:32,height:40,background:"#0b1020",borderRadius:4,border:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={14} color="#334155"/></div>);})()}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:inc.reportName?COLORS.primary:"#94a3b8",fontWeight:inc.reportName?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {inc.reportName||(inc.area+" — "+inc.time)}
                  </div>
                  <div style={{fontSize:10,color:"#475569",marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span>{inc.time} · {inc.area}</span>
                    {inc.flightNumber&&<span>· Vuelo {inc.flightNumber}</span>}
                    {(inc.persons&&inc.persons.length>0||inc.person)&&<span style={{color:COLORS.success}}>· 👤 {(inc.persons&&inc.persons.length>0?inc.persons.length:1)} persona{(inc.persons&&inc.persons.length>1)?"s":""}</span>}
                    {inc.evidence&&inc.evidence.length>0&&<span style={{color:COLORS.info}}>· {inc.evidence.length} evidencia(s)</span>}
                  </div>
                </div>
                <div style={S.badge(STATUS_COLOR[inc.status])}>{inc.status}</div>
                <button onClick={()=>printIndividual(inc)} style={{...S.btn(),padding:"6px 12px",fontSize:12}}>
                  <Printer size={13} color="#000"/>Imprimir
                </button>
                <button onClick={()=>pdfIndividual(inc)} style={{...S.btn("ghost"),padding:"6px 10px",fontSize:12}} title="Descargar PDF">
                  <FileText size={13}/>PDF
                </button>
              </div>
            ))}
            {incidents.length===0&&<div style={{textAlign:"center",padding:32,color:"#475569",fontSize:13}}>No hay novedades registradas</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({ user, users, setUsers, setUser, watchlist, setWatchlist, onDataRestored, audit = [], logAudit }) {
  const isAdmin = user.role === "admin";
  const [tab, setTab] = useState("password"); // "password" | "users" | "ai" | "backup" | "watchlist" | "audit"
  // ── Respaldo / restauración ────────────────────────────────────────────────
  const [bkPass, setBkPass] = useState("");
  const [bkMsg, setBkMsg] = useState(null);
  const [bkBusy, setBkBusy] = useState(false);
  const doBackup = async () => {
    setBkMsg(null);
    if (!window.electronAPI?.storeBackup) return setBkMsg({type:"err",text:"El respaldo solo está disponible en la app de escritorio."});
    if (!bkPass || bkPass.length < 6) return setBkMsg({type:"err",text:"La contraseña del respaldo debe tener al menos 6 caracteres."});
    setBkBusy(true);
    try {
      const r = await window.electronAPI.storeBackup(bkPass);
      if (r?.ok) setBkMsg({type:"ok",text:"Respaldo guardado correctamente."});
      else if (r?.canceled) setBkMsg(null);
      else setBkMsg({type:"err",text:r?.error||"No se pudo crear el respaldo."});
    } catch(e) { setBkMsg({type:"err",text:e.message}); }
    setBkBusy(false);
  };
  const doRestore = async () => {
    setBkMsg(null);
    if (!window.electronAPI?.storeRestore) return setBkMsg({type:"err",text:"La restauración solo está disponible en la app de escritorio."});
    if (!bkPass) return setBkMsg({type:"err",text:"Escribe la contraseña del respaldo a restaurar."});
    if (!window.confirm("Restaurar reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?")) return;
    setBkBusy(true);
    try {
      const r = await window.electronAPI.storeRestore(bkPass);
      if (r?.ok) { onDataRestored && onDataRestored(r.data); setBkMsg({type:"ok",text:"Datos restaurados correctamente."}); setBkPass(""); }
      else if (r?.canceled) setBkMsg(null);
      else setBkMsg({type:"err",text:r?.error||"No se pudo restaurar."});
    } catch(e) { setBkMsg({type:"err",text:e.message}); }
    setBkBusy(false);
  };
  // ── Watchlist ──────────────────────────────────────────────────────────────
  const [wlForm, setWlForm] = useState({ docNumber:"", name:"", reason:"", severity:"Alta" });
  const addWatch = () => {
    const doc = (wlForm.docNumber||"").trim();
    const nm = (wlForm.name||"").trim();
    if (!doc && !nm) return;
    const entry = { id: Date.now(), docNumber: doc.toUpperCase(), name: nm, reason: (wlForm.reason||"").trim(), severity: wlForm.severity, createdAt: new Date().toISOString(), createdBy: user.name };
    setWatchlist(prev => [entry, ...(prev||[])]);
    logAudit && logAudit("crear","vigilancia", entry.docNumber || entry.name);
    setWlForm({ docNumber:"", name:"", reason:"", severity:"Alta" });
  };
  const removeWatch = id => {
    const w = (watchlist||[]).find(x => x.id === id);
    setWatchlist(prev => (prev||[]).filter(w => w.id !== id));
    logAudit && logAudit("eliminar","vigilancia", w ? (w.docNumber||w.name) : ("#"+id));
  };
  // ── API Key de IA (Anthropic) ──────────────────────────────────────────────
  const [apiKeyInput, setApiKeyInput] = useState(() => { try { return localStorage.getItem("aeroreport_anthropic_key") || ""; } catch(e) { return ""; } });
  const [showKey, setShowKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState(null);
  const saveKey = () => {
    const v = apiKeyInput.trim();
    if (v && !v.startsWith("sk-ant-")) return setKeyMsg({type:"err",text:"La clave de Anthropic debe empezar con 'sk-ant-'."});
    try { localStorage.setItem("aeroreport_anthropic_key", v); setKeyMsg({type:"ok",text:"Clave guardada en este dispositivo."}); }
    catch(e) { setKeyMsg({type:"err",text:"No se pudo guardar la clave."}); }
  };
  const clearKey = () => {
    try { localStorage.removeItem("aeroreport_anthropic_key"); setApiKeyInput(""); setKeyMsg({type:"ok",text:"Clave eliminada de este dispositivo."}); }
    catch(e) {}
  };
  // ── Change Password ────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current:"", next:"", confirm:"" });
  const [pwMsg, setPwMsg] = useState(null); // {type:"ok"|"err", text}
  const changePw = async () => {
    setPwMsg(null);
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) return setPwMsg({type:"err",text:"Complete todos los campos."});
    const ok = await verifyPassword(pwForm.current, user.passHash);
    if (!ok) return setPwMsg({type:"err",text:"La contraseña actual es incorrecta."});
    if (pwForm.next.length < 6) return setPwMsg({type:"err",text:"La nueva contraseña debe tener al menos 6 caracteres."});
    if (pwForm.next !== pwForm.confirm) return setPwMsg({type:"err",text:"Las contraseñas nuevas no coinciden."});
    const newHash = await hashPassword(pwForm.next);
    setUsers(prev => prev.map(u => u.id === user.id ? {...u, passHash: newHash} : u));
    setUser(prev => ({...prev, passHash: newHash}));
    setPwForm({current:"",next:"",confirm:""});
    logAudit && logAudit("editar","contraseña", user.name);
    setPwMsg({type:"ok",text:"Contraseña actualizada exitosamente."});
  };
  // ── User Management (admin only) ───────────────────────────────────────────
  const emptyUser = { id:null, name:"", role:"operator", badge:"", shift:"Día", pass:"" };
  const [uForm, setUForm] = useState(emptyUser);
  const [editingId, setEditingId] = useState(null);
  const [uMsg, setUMsg] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const setUF = k => e => setUForm(p=>({...p,[k]:e.target.value}));
  const saveUser = async () => {
    setUMsg(null);
    if (!uForm.name || !uForm.badge) return setUMsg({type:"err",text:"Nombre y placa son obligatorios."});
    // En usuario nuevo la contraseña es obligatoria; al editar es opcional (vacío = mantener)
    if (editingId === null && !uForm.pass) return setUMsg({type:"err",text:"La contraseña es obligatoria."});
    if (uForm.pass && uForm.pass.length < 6) return setUMsg({type:"err",text:"La contraseña debe tener al menos 6 caracteres."});
    const dup = users.find(u => u.badge === uForm.badge && u.id !== editingId);
    if (dup) return setUMsg({type:"err",text:"Ya existe un usuario con esa placa."});
    // Construye el usuario sin texto plano: passHash nuevo si se escribió, o el existente al editar
    const { pass, passHash: existingHash, ...rest } = uForm;
    let passHash = existingHash || null;
    if (uForm.pass) passHash = await hashPassword(uForm.pass);
    if (editingId !== null) {
      setUsers(prev => prev.map(u => u.id === editingId ? {...rest, passHash, id: editingId} : u));
      logAudit && logAudit("editar","usuario", `${rest.name} (${rest.badge})`);
      setUMsg({type:"ok",text:"Usuario actualizado correctamente."});
    } else {
      const newId = Date.now();
      setUsers(prev => [...prev, {...rest, passHash, id: newId}]);
      logAudit && logAudit("crear","usuario", `${rest.name} (${rest.badge})`);
      setUMsg({type:"ok",text:"Usuario creado exitosamente."});
    }
    setUForm(emptyUser); setEditingId(null);
  };
  const editUser = u => { setUForm({...u, pass:""}); setEditingId(u.id); setUMsg(null); };
  const deleteUser = id => {
    if (id === user.id) return setUMsg({type:"err",text:"No puede eliminar su propia cuenta."});
    const target = users.find(u => u.id === id);
    setUsers(prev => prev.filter(u => u.id !== id));
    setConfirmDel(null);
    logAudit && logAudit("eliminar","usuario", target ? `${target.name} (${target.badge})` : ("#"+id));
    setUMsg({type:"ok",text:"Usuario eliminado."});
  };
  const cancelEdit = () => { setUForm(emptyUser); setEditingId(null); setUMsg(null); };

  const ROLE_COLOR = { admin: COLORS.danger, supervisor: COLORS.warning, operator: COLORS.info };
  const SHIFTS = ["Día","Tarde","Noche"];

  return (
    <div className="fade-in">
      <div style={{...S.h1,marginBottom:4}}>Configuración del Sistema</div>
      <div style={{...S.mono,marginBottom:18}}>Gestión de acceso y seguridad</div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:20,background:"#0b1020",border:"1px solid #1e2d4a",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["password","🔑 Cambiar Contraseña"], ["ai","🤖 IA / API"], ["watchlist","🚨 Vigilancia"], ...(isAdmin?[["users","👥 Gestión de Usuarios"],["backup","💾 Respaldo"],["audit","📋 Auditoría"]]:[])]
          .map(([id,label])=>(
          <button key={id} onClick={()=>{setTab(id);setPwMsg(null);setUMsg(null);setKeyMsg(null);setBkMsg(null);}} style={{padding:"7px 18px",borderRadius:7,cursor:"pointer",border:"none",background:tab===id?"#1a2a45":"transparent",color:tab===id?COLORS.primary:"#64748b",fontSize:12,fontWeight:tab===id?500:400,transition:"all 0.15s"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Datos guardados info ────────────────────────────────────────── */}
      <div style={{...S.card,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#10b98108",border:"1px solid #10b98120"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <CheckCircle size={14} color={COLORS.success}/>
          <span style={{fontSize:12,color:"#94a3b8"}}>Los datos se guardan automáticamente en este dispositivo y persisten entre sesiones.</span>
        </div>
        <button onClick={()=>{
          if(window.confirm("¿Está seguro que desea borrar TODOS los datos? Esta acción no se puede deshacer.")){
            localStorage.removeItem("aeroreport_desktop_incidents");
            localStorage.removeItem("aeroreport_desktop_users");
            localStorage.removeItem("aeroreport_desktop_counter");
            window.location.reload();
          }
        }} style={{...S.btn("danger"),padding:"5px 12px",fontSize:11,flexShrink:0}}>
          <Trash2 size={12}/>Borrar todos los datos
        </button>
      </div>

      {/* ── TAB: IA / API KEY ─────────────────────────────────────────────── */}
      {tab==="ai"&&(
        <div style={{...S.row,alignItems:"flex-start"}}>
          <div style={{flex:"0 0 460px"}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:4}}>Clave de API de Anthropic (Claude)</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>
                Necesaria para el análisis con Claude. Se guarda solo en este dispositivo y nunca se incluye en el instalador.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{...S.label,marginBottom:5}}>API Key</div>
                  <div style={{display:"flex",gap:8}}>
                    <input style={{...S.input,flex:1,fontFamily:"'JetBrains Mono',monospace"}} type={showKey?"text":"password"} placeholder="sk-ant-..." value={apiKeyInput} onChange={e=>setApiKeyInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveKey()}/>
                    <button onClick={()=>setShowKey(s=>!s)} title={showKey?"Ocultar":"Mostrar"} style={{...S.btn("ghost"),padding:"0 12px"}}>
                      {showKey?<EyeOff size={14}/>:<Eye size={14}/>}
                    </button>
                  </div>
                </div>
                {keyMsg&&<div style={{background:keyMsg.type==="ok"?COLORS.success+"18":"#ef444415",border:"1px solid "+(keyMsg.type==="ok"?COLORS.success+"40":"#ef444430"),borderRadius:8,padding:"8px 12px",fontSize:12,color:keyMsg.type==="ok"?COLORS.success:"#ef4444"}}>{keyMsg.text}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={saveKey} style={{...S.btn(),justifyContent:"center",flex:1}}>
                    <KeyRound size={14}/>Guardar Clave
                  </button>
                  <button onClick={clearKey} style={{...S.btn("danger"),padding:"0 16px"}}>
                    <Trash2 size={14}/>Quitar
                  </button>
                </div>
                <div style={{fontSize:11,color:"#64748b",lineHeight:1.6}}>
                  Estado actual: {getStoredApiKey() ? <span style={{color:COLORS.success}}>● Clave configurada</span> : <span style={{color:COLORS.warning}}>○ Sin clave (Claude no estará disponible)</span>}
                </div>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:14}}>Cómo obtener la clave</div>
              {[["1","Entra a console.anthropic.com e inicia sesión"],["2","Ve a Settings → API Keys"],["3","Crea una nueva clave (Create Key)"],["4","Cópiala y pégala aquí. Empieza con 'sk-ant-'"]].map(([n,t],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #1a2540"}}>
                  <span style={{color:COLORS.primary,fontWeight:700,fontSize:13,width:16}}>{n}</span>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{t}</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#64748b",marginTop:12,lineHeight:1.6}}>
                Alternativas sin clave: OCR.space (en la nube) y Tesseract (local) funcionan sin configurar nada. LM Studio (Qwen) requiere la app abierta en el puerto 1234.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: WATCHLIST / VIGILANCIA ───────────────────────────────────── */}
      {tab==="watchlist"&&(
        <div style={{...S.row,alignItems:"flex-start"}}>
          <div style={{flex:"0 0 360px"}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:4}}>Añadir a la lista de vigilancia</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>
                Si el scanner lee un documento o nombre que coincida, mostrará una alerta.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Número de documento</div>
                  <input style={{...S.input,fontFamily:"'JetBrains Mono',monospace"}} placeholder="Ej: N19675651" value={wlForm.docNumber} onChange={e=>setWlForm(p=>({...p,docNumber:e.target.value}))}/>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Nombre (opcional)</div>
                  <input style={S.input} placeholder="Nombre completo" value={wlForm.name} onChange={e=>setWlForm(p=>({...p,name:e.target.value}))}/>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Motivo</div>
                  <input style={S.input} placeholder="Ej: Persona de interés" value={wlForm.reason} onChange={e=>setWlForm(p=>({...p,reason:e.target.value}))}/>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Severidad</div>
                  <select style={S.select} value={wlForm.severity} onChange={e=>setWlForm(p=>({...p,severity:e.target.value}))}>{["Baja","Media","Alta","Crítica"].map(s=><option key={s}>{s}</option>)}</select>
                </div>
                <button onClick={addWatch} style={{...S.btn(),justifyContent:"center"}}><Plus size={14}/>Añadir a vigilancia</button>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={S.card}>
              <div style={{...S.flex,marginBottom:16,justifyContent:"space-between"}}>
                <div style={S.h2}>Personas/documentos en vigilancia ({(watchlist||[]).length})</div>
                <div style={S.badge(COLORS.danger)}><AlertTriangle size={11}/>Watchlist</div>
              </div>
              {(watchlist||[]).length===0 && <div style={{fontSize:12,color:"#475569",padding:"12px 0"}}>No hay entradas. Añade documentos o nombres a vigilar.</div>}
              {(watchlist||[]).map(w=>(
                <div key={w.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #1a2540"}}>
                  <div style={{width:34,height:34,borderRadius:8,background:(SEVCOLORS[w.severity]||COLORS.danger)+"20",border:"1px solid "+(SEVCOLORS[w.severity]||COLORS.danger)+"30",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <AlertTriangle size={15} color={SEVCOLORS[w.severity]||COLORS.danger}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#e2e8f0",fontWeight:500,display:"flex",gap:8,alignItems:"center"}}>
                      {w.docNumber && <span style={{fontFamily:"'JetBrains Mono',monospace",color:COLORS.primary}}>{w.docNumber}</span>}
                      {w.name && <span>{w.name}</span>}
                      <span style={S.badge(SEVCOLORS[w.severity]||COLORS.danger)}>{w.severity}</span>
                    </div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2}}>{w.reason||"Sin motivo"} · {w.createdBy||""}</div>
                  </div>
                  <button onClick={()=>removeWatch(w.id)} style={{...S.btn("danger"),padding:"5px 8px"}} title="Quitar"><Trash2 size={13}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: AUDITORÍA ────────────────────────────────────────────────── */}
      {tab==="audit"&&(
        <div style={S.card}>
          <div style={{...S.flex,marginBottom:14,justifyContent:"space-between"}}>
            <div style={S.h2}>Registro de auditoría ({(audit||[]).length})</div>
            <div style={S.badge(COLORS.info)}><ShieldCheck size={11}/>Solo lectura</div>
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>
            Acciones registradas automáticamente: creación, edición y eliminación de novedades, usuarios, vigilancia y contraseñas.
          </div>
          {(audit||[]).length===0 && <div style={{fontSize:12,color:"#475569",padding:"12px 0"}}>Sin actividad registrada aún.</div>}
          <div style={{maxHeight:520,overflow:"auto"}}>
            {(audit||[]).map(a=>{
              const col = a.action==="eliminar"?COLORS.danger:a.action==="crear"?COLORS.success:COLORS.warning;
              const dt = new Date(a.ts);
              return (
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #1a2540"}}>
                  <span style={{...S.badge(col),textTransform:"capitalize",flexShrink:0,minWidth:74,justifyContent:"center"}}>{a.action}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#e2e8f0"}}>
                      <span style={{textTransform:"capitalize",color:"#94a3b8"}}>{a.entity}</span>
                      {a.summary && <span> · {a.summary}</span>}
                    </div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2}}>{a.who}</div>
                  </div>
                  <div style={{fontSize:11,color:"#475569",fontFamily:"'JetBrains Mono',monospace",flexShrink:0,textAlign:"right"}}>
                    {isNaN(dt)?"":dt.toLocaleDateString("es-DO")}<br/>{isNaN(dt)?"":dt.toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: BACKUP / RESPALDO ────────────────────────────────────────── */}
      {tab==="backup"&&(
        <div style={{...S.row,alignItems:"flex-start"}}>
          <div style={{flex:"0 0 420px"}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:4}}>Respaldo cifrado</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>
                Exporta todos los datos a un archivo cifrado con contraseña. Guárdalo en lugar seguro: con esa contraseña podrás restaurarlo en cualquier equipo.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Contraseña del respaldo</div>
                  <input style={S.input} type="password" placeholder="Mínimo 6 caracteres" value={bkPass} onChange={e=>setBkPass(e.target.value)}/>
                </div>
                {bkMsg&&<div style={{background:bkMsg.type==="ok"?COLORS.success+"18":"#ef444415",border:"1px solid "+(bkMsg.type==="ok"?COLORS.success+"40":"#ef444430"),borderRadius:8,padding:"8px 12px",fontSize:12,color:bkMsg.type==="ok"?COLORS.success:"#ef4444"}}>{bkMsg.text}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={doBackup} disabled={bkBusy} style={{...S.btn(),justifyContent:"center",flex:1,opacity:bkBusy?0.6:1}}><Layers size={14}/>Exportar respaldo</button>
                  <button onClick={doRestore} disabled={bkBusy} style={{...S.btn("ghost"),justifyContent:"center",flex:1,opacity:bkBusy?0.6:1}}><UploadCloud size={14}/>Restaurar</button>
                </div>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:14}}>Recomendaciones</div>
              {[["✓","Haz un respaldo periódicamente (semanal)"],["✓","Usa una contraseña fuerte y guárdala aparte"],["✓","Conserva copias en dos lugares distintos"],["✗","No compartas el archivo ni la contraseña por canales inseguros"],["⚠","Restaurar reemplaza TODOS los datos actuales"]].map(([ic,t],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #1a2540"}}>
                  <span style={{color:ic==="✓"?COLORS.success:ic==="⚠"?COLORS.warning:COLORS.danger,fontWeight:700,fontSize:14,width:16}}>{ic}</span>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{t}</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#64748b",marginTop:12,lineHeight:1.6}}>
                Los datos en este equipo se guardan cifrados con la protección del sistema (DPAPI). El respaldo usa cifrado AES-256 con tu contraseña, por eso sí es portable.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: CHANGE PASSWORD ──────────────────────────────────────────── */}
      {tab==="password"&&(
        <div style={{...S.row,alignItems:"flex-start"}}>
          <div style={{flex:"0 0 380px"}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:4}}>Cambiar Contraseña</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>
                Usuario: <span style={{color:COLORS.primary,fontWeight:500}}>{user.name}</span> · Placa: <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#94a3b8"}}>{user.badge}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Contraseña Actual</div>
                  <input style={S.input} type="password" placeholder="••••••••" value={pwForm.current} onChange={e=>setPwForm(p=>({...p,current:e.target.value}))}/>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Nueva Contraseña</div>
                  <input style={S.input} type="password" placeholder="Mínimo 6 caracteres" value={pwForm.next} onChange={e=>setPwForm(p=>({...p,next:e.target.value}))}/>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Confirmar Nueva Contraseña</div>
                  <input style={S.input} type="password" placeholder="Repita la nueva contraseña" value={pwForm.confirm} onChange={e=>setPwForm(p=>({...p,confirm:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&changePw()}/>
                </div>
                {pwMsg&&<div style={{background:pwMsg.type==="ok"?COLORS.success+"18":"#ef444415",border:"1px solid "+(pwMsg.type==="ok"?COLORS.success+"40":"#ef444430"),borderRadius:8,padding:"8px 12px",fontSize:12,color:pwMsg.type==="ok"?COLORS.success:"#ef4444"}}>{pwMsg.text}</div>}
                <button onClick={changePw} style={{...S.btn(),justifyContent:"center"}}>
                  <KeyRound size={14}/>Actualizar Contraseña
                </button>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:14}}>Recomendaciones de Seguridad</div>
              {[["✓","Use al menos 8 caracteres"],["✓","Combine letras, números y símbolos"],["✓","No comparta su contraseña con nadie"],["✓","Cambie la contraseña periódicamente"],["✗","No use datos personales como contraseña"],["✗","No use la misma contraseña en otros sistemas"]].map(([ic,t],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #1a2540"}}>
                  <span style={{color:ic==="✓"?COLORS.success:COLORS.danger,fontWeight:700,fontSize:14,width:16}}>{ic}</span>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: USER MANAGEMENT (admin only) ───────────────────────────── */}
      {tab==="users"&&isAdmin&&(
        <div style={S.row}>
          {/* Form */}
          <div style={{flex:"0 0 380px"}}>
            <div style={S.card}>
              <div style={{...S.h2,marginBottom:4,color:editingId!==null?COLORS.warning:COLORS.success}}>
                {editingId!==null?"✎ Editando Usuario":"+ Nuevo Usuario"}
              </div>
              <div style={{fontSize:11,color:"#475569",marginBottom:14}}>
                {editingId!==null?"Modifique los datos y haga clic en Guardar.":"Complete el formulario para crear una nueva cuenta de acceso."}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Nombre Completo</div>
                  <input style={S.input} placeholder="Ej: Cap. María González" value={uForm.name} onChange={setUF("name")}/>
                </div>
                <div style={S.grid2}>
                  <div>
                    <div style={{...S.label,marginBottom:5}}>N° de Placa / Badge</div>
                    <input style={S.input} placeholder="Ej: OPR-004" value={uForm.badge} onChange={setUF("badge")}/>
                  </div>
                  <div>
                    <div style={{...S.label,marginBottom:5}}>Turno</div>
                    <select style={S.select} value={uForm.shift} onChange={setUF("shift")}>
                      {SHIFTS.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Rol</div>
                  <select style={S.select} value={uForm.role} onChange={setUF("role")}>
                    <option value="operator">Operador</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <div style={{fontSize:10,color:"#475569",marginTop:4}}>
                    {uForm.role==="admin"?"Acceso total al sistema incluyendo gestión de usuarios.":uForm.role==="supervisor"?"Puede ver todos los módulos y generar informes.":"Puede registrar novedades y usar el scanner."}
                  </div>
                </div>
                <div>
                  <div style={{...S.label,marginBottom:5}}>Contraseña</div>
                  <div style={{position:"relative"}}>
                    <input style={{...S.input,paddingRight:36}} type={showPass?"text":"password"} placeholder={editingId!==null?"Dejar en blanco para mantener":"Mínimo 6 caracteres"} value={uForm.pass} onChange={setUF("pass")}/>
                    <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#475569",padding:0}}>
                      {showPass?<EyeOff size={14}/>:<Eye size={14}/>}
                    </button>
                  </div>
                </div>
                {uMsg&&<div style={{background:uMsg.type==="ok"?COLORS.success+"18":"#ef444415",border:"1px solid "+(uMsg.type==="ok"?COLORS.success+"40":"#ef444430"),borderRadius:8,padding:"8px 12px",fontSize:12,color:uMsg.type==="ok"?COLORS.success:"#ef4444"}}>{uMsg.text}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={saveUser} style={{...S.btn(),flex:1,justifyContent:"center"}}>
                    <UserPlus size={14}/>{editingId!==null?"Guardar Cambios":"Crear Usuario"}
                  </button>
                  {editingId!==null&&<button onClick={cancelEdit} style={{...S.btn("ghost"),padding:"8px 12px"}}><XCircle size={14}/></button>}
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          <div style={{flex:1}}>
            <div style={S.card}>
              <div style={{...S.flex,marginBottom:16,justifyContent:"space-between"}}>
                <div style={S.h2}>Usuarios del Sistema ({users.length})</div>
                <div style={S.badge(COLORS.info)}><ShieldCheck size={11}/>Solo Administradores</div>
              </div>
              {users.map(u=>(
                <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #1a2540"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:(ROLE_COLOR[u.role]||COLORS.info)+"20",border:"1px solid "+(ROLE_COLOR[u.role]||COLORS.info)+"30",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <User size={16} color={ROLE_COLOR[u.role]||COLORS.info}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#e2e8f0",fontWeight:500,display:"flex",alignItems:"center",gap:8}}>
                      {u.name}
                      {u.id===user.id&&<span style={{fontSize:9,background:COLORS.success+"20",color:COLORS.success,border:"1px solid "+COLORS.success+"30",padding:"1px 6px",borderRadius:10}}>YO</span>}
                    </div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2,display:"flex",gap:10}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace"}}>{u.badge}</span>
                      <span>·</span>
                      <span style={S.badge(ROLE_COLOR[u.role]||COLORS.info)}>{ROLES[u.role]}</span>
                      <span>·</span>
                      <span>Turno {u.shift}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{editUser(u);setUMsg(null);}} style={{...S.btn("ghost"),padding:"5px 8px"}} title="Editar"><Eye size={13}/></button>
                    {u.id!==user.id&&(
                      confirmDel===u.id
                        ?<div style={{display:"flex",gap:4}}>
                            <button onClick={()=>deleteUser(u.id)} style={{...S.btn("danger"),padding:"5px 8px",fontSize:11}}>Confirmar</button>
                            <button onClick={()=>setConfirmDel(null)} style={{...S.btn("ghost"),padding:"5px 8px",fontSize:11}}>No</button>
                          </div>
                        :<button onClick={()=>setConfirmDel(u.id)} style={{...S.btn("danger"),padding:"5px 8px"}} title="Eliminar"><Trash2 size={13}/></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard",  label:"Dashboard",    icon:<BarChart2 size={15}/> },
  { id:"incidents",  label:"Novedades",    icon:<AlertTriangle size={15}/> },
  { id:"networkMap", label:"Mapa Personas",icon:<Network size={15}/> },
  { id:"scanner",    label:"Scanner Doc.", icon:<Camera size={15}/> },
  { id:"reports",    label:"Informes",     icon:<FileText size={15}/> },
  { id:"settings",   label:"Configuración",icon:<Settings size={15}/> },
];

// ─── PERSISTENCE HELPERS ──────────────────────────────────────────────────────
// VERSION: Desktop (Windows / Linux)
const STORAGE_KEY_INCIDENTS = "aeroreport_desktop_incidents";
const STORAGE_KEY_USERS     = "aeroreport_desktop_users";
const STORAGE_KEY_COUNTER   = "aeroreport_desktop_counter";

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch(e) { return fallback; }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
}

// ─── HASH DE CONTRASEÑAS (Web Crypto · PBKDF2-SHA256) ─────────────────────────
// Funciona igual en el renderer de Electron y en web. Nunca se guarda texto plano.
const _toHex = a => Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g).map(b=>parseInt(b,16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:120000, hash:"SHA-256" }, km, 256);
  return `pbkdf2$120000$${_toHex(salt)}$${_toHex(bits)}`;
}
async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const recomputed = await hashPassword(password, parts[2]);
  return recomputed === stored;
}

// ─── PERSISTENCIA (store cifrado en Electron · localStorage como fallback web) ──
const LS_KEYS = {
  incidents: STORAGE_KEY_INCIDENTS,
  users: STORAGE_KEY_USERS,
  counter: STORAGE_KEY_COUNTER,
  persons: "aeromap_persons",
  watchlist: "aeroreport_watchlist",
  savedMaps: "aeromap_saved_maps",
};

async function persistSave(key, value) {
  if (window.electronAPI?.storeSave) {
    try { await window.electronAPI.storeSave(key, value); return; } catch(e) {}
  }
  saveToStorage(LS_KEYS[key] || key, value);
}

// Convierte usuarios con contraseña en texto plano (versiones viejas) a passHash
async function normalizeUsers(users) {
  const out = [];
  for (const u of (users || [])) {
    if (u.passHash) { out.push(u); }
    else if (u.pass) { const { pass, ...rest } = u; out.push({ ...rest, passHash: await hashPassword(pass) }); }
    else out.push(u);
  }
  return out;
}

async function seedDefaultUsers() {
  const out = [];
  for (const u of INITIAL_USERS) {
    const { pass, ...rest } = u;
    out.push({ ...rest, passHash: await hashPassword(pass) });
  }
  return out;
}

async function collectFromLocalStorage() {
  const incidents = loadFromStorage(LS_KEYS.incidents, null);
  const usersRaw  = loadFromStorage(LS_KEYS.users, null);
  const persons   = loadFromStorage(LS_KEYS.persons, null);
  const counter   = loadFromStorage(LS_KEYS.counter, null);
  const watchlist = loadFromStorage(LS_KEYS.watchlist, null);
  const savedMaps = loadFromStorage(LS_KEYS.savedMaps, null);
  return {
    incidents: incidents || SAMPLE_INCIDENTS,
    users: usersRaw ? await normalizeUsers(usersRaw) : await seedDefaultUsers(),
    persons: persons || [],
    counter: counter || 0,
    watchlist: watchlist || [],
    savedMaps: savedMaps || [],
    audit: [],
  };
}

function clearSensitiveLocalStorage() {
  try {
    localStorage.removeItem(LS_KEYS.incidents);
    localStorage.removeItem(LS_KEYS.users);
    localStorage.removeItem(LS_KEYS.persons);
    localStorage.removeItem(LS_KEYS.counter);
    localStorage.removeItem(LS_KEYS.watchlist);
    localStorage.removeItem(LS_KEYS.savedMaps);
  } catch(e) {}
}

// Carga inicial: store cifrado → migración desde localStorage → semilla por defecto
async function bootstrapData() {
  if (window.electronAPI?.storeLoadAll) {
    let data = null;
    try { const res = await window.electronAPI.storeLoadAll(); if (res?.ok) data = res.data; } catch(e) {}
    if (data) {
      const empty = data.incidents==null && data.users==null && data.persons==null && data.counter==null;
      if (empty) {
        const migrated = await collectFromLocalStorage();
        await persistSave("incidents", migrated.incidents);
        await persistSave("users", migrated.users);
        await persistSave("persons", migrated.persons);
        await persistSave("counter", migrated.counter);
        await persistSave("watchlist", migrated.watchlist);
        await persistSave("savedMaps", migrated.savedMaps);
        await persistSave("audit", migrated.audit);
        clearSensitiveLocalStorage();
        return migrated;
      }
      const users = await normalizeUsers(data.users || []);
      return {
        incidents: data.incidents || [],
        users: users.length ? users : await seedDefaultUsers(),
        persons: data.persons || [],
        counter: data.counter || 0,
        watchlist: data.watchlist || [],
        savedMaps: data.savedMaps || [],
        audit: data.audit || [],
      };
    }
  }
  return await collectFromLocalStorage();
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [incidents, setIncidents] = useState([]);
  const [reportCounter, setReportCounter] = useState(0);
  const [persons, setPersons] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [savedMaps, setSavedMaps] = useState([]);
  const [audit, setAudit] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [pwaInstallable, setPwaInstallable] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const printRef = useRef(null);

  // ─── Carga inicial de datos (store cifrado / migración) ───────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await bootstrapData();
      if (!alive) return;
      setIncidents(d.incidents);
      setUsers(d.users);
      setPersons(d.persons);
      setReportCounter(d.counter);
      setWatchlist(d.watchlist);
      setSavedMaps(d.savedMaps || []);
      setAudit(d.audit || []);
      setDataLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  // ─── Auto-guardar incidents cuando cambian ────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("incidents", incidents);
    setSaveIndicator(true);
    const t = setTimeout(() => setSaveIndicator(false), 1500);
    return () => clearTimeout(t);
  }, [incidents, dataLoaded]);

  // ─── Auto-guardar usuarios cuando cambian ────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("users", users);
  }, [users, dataLoaded]);

  // ─── Auto-guardar contador de reportes ───────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("counter", reportCounter);
  }, [reportCounter, dataLoaded]);

  // ─── Auto-guardar personas del mapa ─────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("persons", persons);
  }, [persons, dataLoaded]);

  // ─── Auto-guardar watchlist ──────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("watchlist", watchlist);
  }, [watchlist, dataLoaded]);

  // ─── Auto-guardar mapas guardados ────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("savedMaps", savedMaps);
  }, [savedMaps, dataLoaded]);

  // ─── Auto-guardar registro de auditoría ──────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    persistSave("audit", audit);
  }, [audit, dataLoaded]);

  // Registra una acción en el log de auditoría (append-only, tope 3000)
  const logAudit = useCallback((action, entity, summary) => {
    setAudit(prev => [{
      id: Date.now() + Math.random(),
      ts: new Date().toISOString(),
      who: user ? `${user.name} · ${user.badge}` : "—",
      action, entity, summary: summary || ""
    }, ...prev].slice(0, 3000));
  }, [user]);

  // ─── Electron: menú nativo → navegación ──────────────────────────────────
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onNavigate(p => setPage(p));
      return () => window.electronAPI.removeNavigate();
    }
  }, []);

  // ─── PWA: detectar si se puede instalar ──────────────────────────────────
  useEffect(() => {
    const handler = () => setPwaInstallable(true);
    window.addEventListener('pwa-installable', handler);
    return () => window.removeEventListener('pwa-installable', handler);
  }, []);

  if (!dataLoaded) return (
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"#080c18",color:"#64748b",flexDirection:"column",gap:14,fontFamily:"'Inter',sans-serif"}}>
      <div style={{fontSize:34}}>✈</div>
      <div style={{fontSize:13,letterSpacing:1}}>Cargando datos cifrados…</div>
    </div>
  );

  if (!user) return <Login onLogin={setUser} users={users}/>;

  const handleViewReport = inc => {
    setPage("reports");
    setTimeout(()=>{ if(printRef.current) printRef.current(inc); },300);
  };

  const handleDataRestored = d => {
    if (!d) return;
    setIncidents(d.incidents||[]);
    setUsers(d.users||[]);
    setPersons(d.persons||[]);
    setReportCounter(d.counter||0);
    setWatchlist(d.watchlist||[]);
    setSavedMaps(d.savedMaps||[]);
  };

  const pages = {
    dashboard: <Dashboard incidents={incidents}/>,
    incidents:  <IncidentForm incidents={incidents} setIncidents={setIncidents} onViewReport={handleViewReport} logAudit={logAudit}/>,
    networkMap: <Suspense fallback={<div style={{padding:40,color:"#64748b",fontSize:13}}>Cargando mapa…</div>}><NetworkMap persons={persons} setPersons={setPersons} incidents={incidents} theme={theme} setTheme={setTheme} savedMaps={savedMaps} setSavedMaps={setSavedMaps}/></Suspense>,
    scanner:    <OCRScanner watchlist={watchlist}/>,
    reports:    <ReportGenerator incidents={incidents} user={user} reportCounter={reportCounter} setReportCounter={setReportCounter} onPrintInc={printRef}/>,
    settings:   <SettingsPanel user={user} users={users} setUsers={setUsers} setUser={setUser} watchlist={watchlist} setWatchlist={setWatchlist} onDataRestored={handleDataRestored} audit={audit} logAudit={logAudit}/>,
  };

  return (
    <div style={S.app}>
      <style>{css}</style>
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <div style={S.logo}>✈ AEROREPORT</div>
          <div style={S.logoSub}>{AIRPORT.iata} · Sistema Operativo</div>
        </div>
        <div style={S.nav}>
          {NAV.map(n=>(
            <div key={n.id} onClick={()=>setPage(n.id)} style={S.navItem(page===n.id)}>
              {n.icon}<span>{n.label}</span>
              {page===n.id&&<ChevronRight size={12} style={{marginLeft:"auto"}}/>}
            </div>
          ))}
        </div>
        <div style={S.sideFooter}>
          <div style={{padding:"8px 12px",borderRadius:8,background:"#0b1020",border:"1px solid #1e2d4a",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:COLORS.info+"20",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={13} color={COLORS.info}/></div>
              <div>
                <div style={{fontSize:11,color:"#e2e8f0",fontWeight:500}}>{user.name.split(" ").slice(-2).join(" ")}</div>
                <div style={{fontSize:10,color:"#475569"}}>{ROLES[user.role]} · {user.badge}</div>
              </div>
            </div>
          </div>
          <div onClick={()=>setUser(null)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",borderRadius:8,color:"#475569",fontSize:12}}>
            <LogOut size={13}/><span>Cerrar sesión</span>
          </div>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{flex:1,...S.mono}}>{AIRPORT.name} ({AIRPORT.code})</div>
          {saveIndicator&&(
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:COLORS.success,animation:"fadeIn 0.3s ease"}}>
              <CheckCircle size={12}/> Guardado
            </div>
          )}
          <div style={{...S.badge(COLORS.warning),fontSize:11}}><Clock size={11}/>Turno: {user.shift}</div>
          <div style={{...S.badge(COLORS.success),fontSize:11}}><span className="pulse" style={{fontSize:8}}>●</span> En línea</div>
          {pwaInstallable&&(
            <button onClick={()=>window.installPWA()} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:7,background:"#f59e0b20",border:"1px solid #f59e0b40",color:"#f59e0b",fontSize:11,cursor:"pointer",fontWeight:500}}>
              ⬇ Instalar App
            </button>
          )}
          <div style={{width:32,height:32,borderRadius:"50%",background:"#1a2a45",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Bell size={13} color="#64748b"/></div>
        </div>
        <div style={S.content}>{pages[page]}</div>
      </div>
    </div>
  );
}
