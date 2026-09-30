"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Layers3, Download, KeyRound, LockKeyhole, Upload, LoaderCircle, CircleAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadImage, downloadZip } from "@/lib/download";
import { checkFreeProvider, IMAGE_API, MODELS, providerError } from "@/lib/ming";

type Mode = "generate" | "layers";
type OutputImage = {url: string; filename: string; width: number; height: number; alpha: boolean; label?: string};
type Result = {images: OutputImage[]; elapsed: number; cost: number | null; sample?: boolean};
type Source = {url: string; name: string; width: number; height: number};
const initialPrompt = `一张高冲击力、专业商业摄影风格的无线耳机电商信息图。竖版画幅，产品清晰锐利，浅景深。\n前景：一只手把打开的光滑白色充电盒举向镜头，盒内两只白色耳机带黑色扬声器，正面绿色 LED。\n中景：有雀斑、粉色波浪头发的微笑年轻女性，酸橙绿针织帽，黑白条纹长袖衬衫，耳朵戴白色耳机。\n背景：浅灰渐变影棚、对角线彩虹棱镜光晕、柔和漏光，几只虚化的白色耳机漂浮。\n白色无衬线排版：顶部巨大 AIRPODS 在模特后方；右上 Apple Pods Pro 3；中左“优质音效与降噪”；中右大号“30”及“小时的电池续航。”；右下大号“1”及“年保修。”。\n保持精致构图、真实产品质感、鲜艳但协调的配色。`;
const initialRoles = `1. 所有广告文字与数字\n2. 前景手、充电盒、盒内耳机与 LED\n3. 模特的脸、皮肤、雀斑与五官\n4. 模特的头发、帽子、衬衫与佩戴的耳机\n5. 背景中漂浮的白色耳机\n6. 背景、彩虹光晕与漏光`;
const labels = ["文字与数字", "手与充电盒", "模特头部", "模特与服饰", "漂浮耳机", "背景与光效"];
const sampleDesign: Result = {images: [{url: "examples/earbuds-design.png", filename: "ming-design.png", width: 1440, height: 2560, alpha: false}], elapsed: 36.959, cost: 0, sample: true};
const sampleLayers: Result = {images: labels.map((label, i) => ({url: `examples/earbuds-layer-${i+1}.png`, filename: `layer-${String(i+1).padStart(2,"0")}.png`, width:768, height:1365, alpha:true, label})), elapsed:54.229, cost:0, sample:true};

const staticDeployment = typeof window !== "undefined" &&
  (window.location.hostname.endsWith(".github.io") || window.location.pathname.startsWith("/ming-image-studio"));

type ImageResponse = {error?: string; images: {b64: string; filename: string; width: number; height: number; alpha: boolean}[]; elapsed: number; cost: number | null};

async function requestStaticImages(task: Mode, prompt: string, image: string | undefined, key: string): Promise<ImageResponse> {
  const model = MODELS[task];
  const provider = await checkFreeProvider(model);
  const payload: Record<string, unknown> = {model, prompt, output_format: "png", provider: {only: [provider], allow_fallbacks: false}};
  if (task === "layers") payload.input_references = [{type: "image_url", image_url: {url: image}}];
  const started = Date.now();
  const response = await fetch(IMAGE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.href,
      "X-Title": "Ming Image Studio",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error(providerError(response.status));
  let data: {error?: {code?: unknown}; data?: {b64_json?: unknown}[]; usage?: {cost?: unknown; cost_usd?: unknown}};
  try {data = await response.json();} catch {throw new Error("模型没有返回有效的图片数据，请稍后重试。");}
  if (data.error) throw new Error(providerError(Number(data.error.code) || 502));
  if (!Array.isArray(data.data) || !data.data.length || data.data.length > 9) throw new Error("模型未返回可用图片，请到 OpenRouter 查看请求记录。");
  const images = data.data.map((item, index) => {
    const b64 = item.b64_json;
    if (typeof b64 !== "string" || b64.length < 44 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) throw new Error("模型返回了无效图片。");
    const first = atob(b64.slice(0, 44));
    const bytes = Uint8Array.from(first, c => c.charCodeAt(0));
    if (bytes[0] !== 137 || first.slice(1, 8) !== "PNG\r\n\x1a\n" || first.slice(12, 16) !== "IHDR") throw new Error("模型返回的不是有效 PNG。");
    const view = new DataView(bytes.buffer);
    const width = view.getUint32(16), height = view.getUint32(20);
    if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new Error("模型返回了无效图片尺寸。");
    return {b64, width, height, alpha: [4, 6].includes(bytes[25]), filename: `${task === "layers" ? "layer" : "design"}-${String(index + 1).padStart(2, "0")}.png`};
  });
  const reportedCost = data.usage?.cost ?? data.usage?.cost_usd;
  const cost = (typeof reportedCost === "number" || (typeof reportedCost === "string" && reportedCost.trim() !== "")) && Number.isFinite(Number(reportedCost)) ? Number(reportedCost) : null;
  return {images, elapsed: (Date.now() - started) / 1000, cost};
}

function readImage(url: string): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({width: image.naturalWidth, height: image.naturalHeight});
    image.onerror = () => reject(new Error("图片无法读取，请换一张图片。")); image.src = url;
  });
}
async function asDataUrl(url: string) {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error("原图加载失败，请重试。");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败。")); reader.readAsDataURL(blob);
  });
}

export default function Studio() {
  const [mode, setMode] = useState<Mode>("generate");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [ratio, setRatio] = useState("9:16");
  const [roles, setRoles] = useState(initialRoles);
  const [count, setCount] = useState("6");
  const [source, setSource] = useState<Source | null>({url:sampleDesign.images[0].url, name:"耳机广告 · 实测示例", width:1440, height:2560});
  const [results, setResults] = useState<Record<Mode, Result>>({generate: sampleDesign, layers:sampleLayers});
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [zoom, setZoom] = useState<OutputImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(0);
  const uploadPending = useRef(false);
  const [zipBusy, setZipBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const pendingAction = useRef<Mode | null>(null);
  const objectUrls = useRef<string[]>([]);
  const stateRef = useRef({mode, prompt, busy, results});
  stateRef.current = {mode, prompt, busy, results};
  const result = results[mode];

  useEffect(() => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    const active = new Set([...results.generate.images, ...results.layers.images].map(image=>image.url));
    if(source) active.add(source.url);
    if(zoom) active.add(zoom.url);
    objectUrls.current = objectUrls.current.filter(url=>{if(active.has(url))return true;URL.revokeObjectURL(url);return false;});
  }, [results, source, zoom]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(); setElapsed(0);
    const interval = setInterval(() => setElapsed((Date.now()-start)/1000), 1000);
    return () => clearInterval(interval);
  }, [busy]);
  useEffect(() => {
    type Tool = {name:string;description:string;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};inputSchema:object;execute:(input: Record<string, unknown>) => Promise<unknown>};
    const context = (document as Document & {modelContext?: {registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if (!context?.registerTool) return;
    const lifecycle=new AbortController();
    const tools: Tool[] = [
      {name:"read_ming_studio",description:"读取当前模式、提示词和输出信息；不会读取密钥。",annotations:{readOnlyHint:true,untrustedContentHint:true},inputSchema:{type:"object",properties:{},additionalProperties:false},execute:async()=>({mode:stateRef.current.mode,prompt:stateRef.current.prompt,busy:stateRef.current.busy,outputs:stateRef.current.results[stateRef.current.mode].images.map(({width,height,alpha})=>({width,height,alpha}))})},
      {name:"stage_design_prompt",description:"填写设计提示词供用户审核；不会自动生成或收费。",annotations:{readOnlyHint:false,untrustedContentHint:true},inputSchema:{type:"object",properties:{prompt:{type:"string",maxLength:12000}},required:["prompt"],additionalProperties:false},execute:async(input)=>{
        if(stateRef.current.busy) return {error:"正在生成，请稍后再编辑。"};
        if(typeof input.prompt!=="string" || !input.prompt.trim() || input.prompt.length>12000) return {error:"请输入有效提示词。"};
        setPrompt(input.prompt); setMode("generate");
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
        return {staged:true};
      }}
    ];
    for(const tool of tools) {try {void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});} catch {/* Tool support is optional; the visible controls remain available. */}}
    return () => lifecycle.abort();
  }, []);

  async function selectFile(file?: File) {
    if (!file || busyRef.current) return;
    setError("");
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {setError("请选择 PNG、JPG 或 WebP 图片。"); return;}
    if (file.size > 10*1024*1024) {setError("图片超过 10 MB，请压缩后上传。"); return;}
    const ticket=++uploadRef.current; uploadPending.current=true; setUploading(true);
    try {
      const url = await new Promise<string>((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const size = await readImage(url); if(ticket===uploadRef.current) setSource({url, name:file.name,...size});
    } catch {if(ticket===uploadRef.current) setError("图片读取失败，请重试。");}
    finally {if(ticket===uploadRef.current){uploadPending.current=false;setUploading(false);}}
  }

  async function run(task: Mode, explicitKey?: string) {
    if (busyRef.current) return;
    if (uploadPending.current) {setError("图片仍在读取，请稍后提交。");return;}
    setError("");
    if (task === "generate" && !prompt.trim()) {setError("请填写设计提示词。"); return;}
    if (task === "layers" && !source) {setError("请先上传或选择一张图片。"); return;}
    const key = explicitKey ?? apiKey;
    if (!key) {pendingAction.current=task; setKeyOpen(true); return;}
    busyRef.current=true; setBusy(true);
    let createdUrls: string[]=[];
    try {
      const fullPrompt = task === "generate" ? `${prompt.trim()}${ratio === "auto" ? "" : `\n画幅比例：${ratio}。`}` : `请将输入图片拆分为 ${count} 张独立透明 RGBA PNG 图层。严格保留原图画布坐标、比例、排版位置、颜色、光影和元素外观。不要改字或添加新元素。\n按以下语义角色拆分：\n${roles}\n每层只保留对应角色，其余区域使用真正透明 alpha。保留自然边缘，避免白边、黑边、背景残留与元素重复。所有输出图层使用完全相同的画布尺寸，便于叠加编辑。`;
      const input = task === "layers" ? await asDataUrl(source!.url) : undefined;
      let data: ImageResponse;
      if (staticDeployment) {
        data = await requestStaticImages(task, fullPrompt, input, key);
      } else {
        const response = await fetch("/api/images", {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({task,prompt:fullPrompt,image:input}),signal:AbortSignal.timeout(600000)});
        if (!(response.headers.get("content-type")??"").includes("application/json")) throw new Error("服务暂时未就绪，请稍后重试。");
        data = await response.json() as ImageResponse;
        if(!response.ok || data.error) throw new Error(data.error || "请求失败，请稍后重试。");
      }
      const images: OutputImage[] = data.images.map((img: {b64:string;filename:string;width:number;height:number;alpha:boolean}) => {
        const binary=atob(img.b64), bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
        const url=URL.createObjectURL(new Blob([bytes],{type:"image/png"})); createdUrls.push(url);
        return {url,filename:img.filename,width:img.width,height:img.height,alpha:img.alpha};
      });
      await Promise.all(images.map(async image=>{
        const decoded=await readImage(image.url);
        if(decoded.width!==image.width || decoded.height!==image.height) throw new Error("模型返回的图片尺寸不一致，请到平台查看记录。");
      }));
      objectUrls.current.push(...createdUrls); createdUrls=[];
      setResults(old=>({...old,[task]:{images,elapsed:data.elapsed,cost:data.cost}}));
    } catch (err) {
      setError(err instanceof DOMException && (err.name==="TimeoutError" || err.name==="AbortError") ? "等待超时，上游是否完成暂时未知。请稍后查看平台记录，避免立即重复提交。" : err instanceof Error ? err.message : "请求失败，请稍后重试。");
    } finally {createdUrls.forEach(url=>URL.revokeObjectURL(url));busyRef.current=false; setBusy(false);}
  }
  function useForLayers(image: OutputImage) {
    setSource({url:image.url,name:image.filename,width:image.width,height:image.height}); setMode("layers"); setError("");
  }
  async function download(image: OutputImage) {try {await downloadImage(image.url,image.filename);} catch {setError("下载失败，请重试。");}}
  async function zip() {setZipBusy(true);try {await downloadZip(results.layers.images);} catch {setError("打包下载失败，请重试。");} finally {setZipBusy(false);}}
  function openKey() {pendingAction.current=null; setKeyDraft(apiKey); setKeyOpen(true);}

  return <>
    <header className="studio-header">
      <div className="brand"><span className="brand-mark"><Layers3 size={22}/></span>Ming Image Studio</div>
      <div className="flex items-center gap-3"><span className="hidden sm:inline-flex badge"><LockKeyhole size={12}/>私人工作台</span><Button variant="outline" size="sm" onClick={openKey} disabled={busy}><KeyRound size={15}/>{apiKey?"密钥已配置":"连接 OpenRouter"}</Button></div>
    </header>
    <main className="studio-shell">
      <div className="intro"><div><h1>生图与图层拆分</h1><p className="subtitle">从设计想法到透明图层，在一个工作台里完成。</p></div><span className="badge hidden md:inline-flex">两个模型 · 一个工作流</span></div>
      <Tabs value={mode} onValueChange={v=>{if(!busy){setMode(v as Mode);setError("");}}}>
        <TabsList className="bg-[#e9edf3] h-11 p-1"><TabsTrigger disabled={busy} value="generate" className="px-5 text-sm"><ImagePlus size={16}/>文字生图</TabsTrigger><TabsTrigger disabled={busy} value="layers" className="px-5 text-sm"><Layers3 size={16}/>图片拆层</TabsTrigger></TabsList>
        <TabsContent value={mode}>
          <div className="work-grid">
            <section className="panel control-panel" aria-label="模型输入">
              <p className="eyebrow">{mode==="generate"?"DESIGN":"DESIGN-LAYER"}</p>
              <h2 className="model-heading">Ming-Image-0.1-{mode==="generate"?"Design":"Design-Layer"}</h2>
              <p className="model-sub">{mode==="generate"?"用文字生成海报、UI、信息图与设计素材。":"把现有图片拆成可单独保存的透明图层。"}</p>
              {mode==="generate" ? <>
                <div className="form-field"><label className="field-label" htmlFor="prompt">设计提示词<span className="font-normal text-xs text-[#8a96a8]">{prompt.length} / 12000</span></label><textarea id="prompt" className="editor min-h-[290px]" value={prompt} maxLength={12000} onChange={e=>setPrompt(e.target.value)} disabled={busy}/><p className="helper">描述主体、构图、配色和需要精确呈现的文字。</p></div>
                <div className="form-field"><label className="field-label" htmlFor="ratio">画幅比例</label><Select value={ratio} onValueChange={setRatio} disabled={busy}><SelectTrigger id="ratio" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">由模型决定</SelectItem><SelectItem value="1:1">1:1 · 方形</SelectItem><SelectItem value="9:16">9:16 · 竖版</SelectItem><SelectItem value="16:9">16:9 · 横版</SelectItem></SelectContent></Select><p className="helper">比例会写入提示词，最终尺寸由模型返回。</p></div>
              </> : <>
                <div className="form-field"><label className="field-label">原始图片{source&&<button className="text-xs text-[#245bdf]" disabled={busy} onClick={()=>fileInput.current?.click()}>更换图片</button>}</label><div className={`source-box ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void selectFile(e.dataTransfer.files[0]);}}>{source?<img src={source.url} alt="待拆分的原始图片"/>:<button className="source-empty" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={24}/><span className="text-sm">点击上传，或拖入图片</span></button>}</div><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>{void selectFile(e.target.files?.[0]);e.target.value="";}}/><div className="helper flex justify-between gap-2">{source?<><span className="source-name" title={source.name}>{source.name}</span><span>{source.width} × {source.height}</span></>:<span>PNG / JPG / WebP，最大 10 MB</span>}</div></div>
                <div className="form-field"><label className="field-label" htmlFor="layer-count">目标图层数</label><Select value={count} onValueChange={setCount} disabled={busy}><SelectTrigger id="layer-count" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[2,3,4,5,6,7,8,9].map(n=><SelectItem key={n} value={String(n)}>{n} 层</SelectItem>)}</SelectContent></Select></div>
                <div className="form-field"><label className="field-label" htmlFor="roles">拆分要求</label><textarea id="roles" className="editor min-h-[180px]" value={roles} maxLength={9000} onChange={e=>setRoles(e.target.value)} disabled={busy}/><p className="helper">按视觉角色填写。实际层数、尺寸与边界可能与要求不同；修改层数时请同步调整要求。</p></div>
              </>}
              <Button className="mt-6 w-full h-11" disabled={busy||uploading} onClick={()=>void run(mode)}>{busy||uploading?<LoaderCircle className="animate-spin" size={17}/>:mode==="generate"?<ImagePlus size={17}/>:<Layers3 size={17}/>} {uploading?"图片读取中…":busy?"模型处理中…":mode==="generate"?"生成设计图":"拆分透明图层"}</Button>
              <p className="helper">使用当前会话密钥。仅在检测到免费 Novita 端点时提交。</p>
              {busy&&<div className="status-box" role="status"><LoaderCircle className="mt-1 shrink-0 animate-spin" size={16}/><div>已等待 {Math.floor(elapsed)} 秒<p className="text-xs">请求正在处理，请保持页面打开。</p></div></div>}
              {error&&<div className="status-box status-error" role="alert"><CircleAlert className="mt-1 shrink-0" size={16}/>{error}</div>}
            </section>
            <section className="panel" aria-label="模型输出">
              <div className="result-header"><div className="flex items-center gap-3"><h2 className="result-title">{mode==="generate"?"设计预览":"透明图层"}</h2><span className="badge">{result.sample?"实测示例":"本次结果"}{mode==="layers"?` · ${result.images.length} 层`:""}</span></div><div className="flex items-center gap-2">{mode==="generate"?<><Button variant="outline" size="sm" disabled={busy} onClick={()=>useForLayers(result.images[0])}>送去拆层<ArrowRight size={14}/></Button><Button variant="ghost" size="sm" onClick={()=>void download(result.images[0])} aria-label="下载原图"><Download size={16}/></Button></>:<Button variant="outline" size="sm" disabled={zipBusy} onClick={()=>void zip()}>{zipBusy?<LoaderCircle size={15} className="animate-spin"/>:<Download size={15}/>}下载全部</Button>}</div></div>
              {mode==="generate"?<div className="canvas"><button className="canvas-button" onClick={()=>setZoom(result.images[0])} aria-label="放大设计图"><img className="design-image" src={result.images[0].url} alt="Ming Design 生成的无线耳机广告或本次设计图"/></button></div>:<div className="layer-grid">{result.images.map((image,i)=><div className="layer-card" key={image.url}><button className="layer-preview checkerboard" onClick={()=>setZoom(image)} aria-label={`放大图层 ${i+1}`}><img src={image.url} alt={image.label||`透明图层 ${i+1}`}/></button><div className="layer-card-footer"><span>{String(i+1).padStart(2,"0")} · {image.label||"透明图层"}</span><Button size="icon" variant="ghost" className="size-7" aria-label={`下载图层 ${i+1}`} onClick={()=>void download(image)}><Download size={14}/></Button></div></div>)}</div>}
              <div className="stats"><span>尺寸<b>{result.images[0].width} × {result.images[0].height}</b></span><span>API 往返<b>{result.elapsed.toFixed(1)} s</b></span><span>API 报告费用<b>{result.cost===null?"未报告":`$${result.cost}`}</b></span><span>格式<b>{result.images.every(image=>image.alpha)?"PNG · Alpha":"PNG"}</b></span></div>
              {mode==="layers"&&result.sample&&<p className="px-6 pb-4 text-xs text-[#778190] leading-6">示例返回 6 层，头部与服饰层存在部分重叠。棋盘格仅用于预览透明区域。</p>}
            </section>
          </div>
        </TabsContent>
      </Tabs>
      <footer className="studio-footer"><span>密钥仅保留在当前页面内存，刷新后清除。</span><div className="flex gap-5"><a href="https://openrouter.ai/inclusionai/ming-image-0.1-design" target="_blank" rel="noreferrer">Design 模型 ↗</a><a href="https://openrouter.ai/inclusionai/ming-image-0.1-design-layer" target="_blank" rel="noreferrer">Design-Layer 模型 ↗</a></div></footer>
    </main>
    <Dialog open={keyOpen} onOpenChange={open=>{setKeyOpen(open);if(!open){pendingAction.current=null;setKeyDraft("");}}}><DialogContent><DialogHeader><DialogTitle>连接 OpenRouter</DialogTitle><DialogDescription className="leading-6">输入你的 OpenRouter API 密钥。密钥只用于本次会话，{staticDeployment?"从浏览器直接发送到 OpenRouter":"通过本站服务端转发到 OpenRouter"}。</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();const key=keyDraft.trim();if(!key.startsWith("sk-or-")||key.length<20)return;const task=pendingAction.current;setApiKey(key);setKeyOpen(false);setKeyDraft("");pendingAction.current=null;if(task)void run(task,key);}}><label htmlFor="api-key" className="field-label">API 密钥</label><input className="secret-input" id="api-key" type="password" autoComplete="off" value={keyDraft} placeholder="sk-or-v1-…" onChange={e=>setKeyDraft(e.target.value)} maxLength={200} required/><p className="helper">需要 sk-or- 开头的密钥。页面不保存密钥；免费端点不可用时会停止请求。</p><div className="flex gap-2 justify-end mt-5">{apiKey&&<Button type="button" variant="ghost" onClick={()=>{setApiKey("");setKeyDraft("");setKeyOpen(false);}}>清除密钥</Button>}<Button type="submit" disabled={!keyDraft.trim().startsWith("sk-or-")||keyDraft.trim().length<20}>{pendingAction.current?"连接并继续":"连接"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!zoom} onOpenChange={open=>{if(!open)setZoom(null);}}><DialogContent className="sm:max-w-[900px] max-h-[92vh] overflow-auto"><DialogHeader><DialogTitle>{zoom?.label||zoom?.filename}</DialogTitle><DialogDescription>{zoom?.width} × {zoom?.height} · PNG{zoom?.alpha?" · Alpha":""}</DialogDescription></DialogHeader>{zoom&&<div className={zoom.alpha?"checkerboard rounded-lg":"bg-[#f4f5f7] rounded-lg"}><img className="max-h-[70vh] max-w-full mx-auto object-contain" src={zoom.url} alt={zoom.label||"输出图片放大预览"}/></div>}<Button variant="outline" onClick={()=>zoom&&void download(zoom)}><Download size={16}/>下载 PNG</Button></DialogContent></Dialog>
  </>;
}

