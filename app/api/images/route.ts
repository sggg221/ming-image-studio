import { checkFreeProvider, IMAGE_API, MODELS, providerError } from "@/lib/ming";

const headers = {"Cache-Control":"no-store"};
function fail(error: string, status = 400) {return Response.json({error},{status,headers});}

export async function POST(request: Request) {
  const origin=request.headers.get("origin");
  if (origin && origin!==new URL(request.url).origin) return fail("请求来源不匹配。",403);
  const authorization=request.headers.get("authorization") ?? "";
  if (!/^Bearer sk-or-[A-Za-z0-9_-]{16,190}$/.test(authorization)) return fail("请先配置有效的 OpenRouter API 密钥。",401);
  if (Number(request.headers.get("content-length"))>15*1024*1024) return fail("请求体过大，请压缩图片。",413);
  let input: {task?:unknown;prompt?:unknown;image?:unknown};
  try {
    const body=await request.text();
    if (new TextEncoder().encode(body).length>15*1024*1024) return fail("请求体过大，请压缩图片。",413);
    input=JSON.parse(body);
    if (!input || typeof input!=="object") return fail("请求格式无效。");
  } catch {return fail("请求格式无效。");}
  if (input.task!=="generate" && input.task!=="layers") return fail("请选择有效模型。");
  if (typeof input.prompt!=="string" || !input.prompt.trim() || input.prompt.length>12500) return fail("提示词不能为空，且不能超过 12000 字。");
  const task=input.task, model=MODELS[task];
  if (task==="layers") {
    if (typeof input.image!=="string") return fail("请上传原始图片。");
    const match=input.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length%4!==0) return fail("图片格式无效，请上传 PNG、JPG 或 WebP。");
    if (match[2].length*3/4>10*1024*1024+2) return fail("图片超过 10 MB，请压缩后重试。",413);
  }
  let provider: string;
  try {provider=await checkFreeProvider(model);} catch (err) {
    return fail(err instanceof Error && (err.message.startsWith("当前未找到") || err.message.startsWith("暂时无法")) ? err.message : "无法及时确认免费端点，请稍后重试。",503);
  }
  const payload: Record<string,unknown> = {model,prompt:input.prompt.trim(),output_format:"png",provider:{only:[provider],allow_fallbacks:false}};
  if (task==="layers") payload.input_references=[{type:"image_url",image_url:{url:input.image}}];
  const start=Date.now();
  try {
    const response=await fetch(IMAGE_API,{method:"POST",headers:{Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify(payload),redirect:"manual",signal:AbortSignal.timeout(570000)});
    if (!response.ok) return fail(providerError(response.status),response.status>=400&&response.status<600?response.status:502);
    const raw=await response.text();
    if(raw.length>40*1024*1024) return fail("模型返回的数据过大，请到平台查看结果。",502);
    let data: {error?:{code?:unknown};data?:{b64_json?:unknown}[];usage?:{cost?:unknown;cost_usd?:unknown}};
    try {data=JSON.parse(raw);} catch {return fail("模型没有返回有效的图片数据，请稍后重试。",502);}
    if(data.error) return fail(providerError(Number(data.error.code)||502),502);
    if(!Array.isArray(data.data)||!data.data.length||data.data.length>9) return fail("模型未返回可用图片，请到平台查看请求记录。",502);
    const images=data.data.map((item,index)=>{
      const b64=item.b64_json;
      if(typeof b64!=="string" || b64.length<44 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length%4!==0) throw new Error("invalid_output");
      const first=atob(b64.slice(0,44));
      const bytes=Uint8Array.from(first,c=>c.charCodeAt(0));
      if(bytes[0]!==137 || first.slice(1,8)!=="PNG\r\n\x1a\n" || first.slice(12,16)!=="IHDR") throw new Error("invalid_output");
      const view=new DataView(bytes.buffer), width=view.getUint32(16), height=view.getUint32(20);
      if(width<1||height<1||width>16384||height>16384) throw new Error("invalid_output");
      return {b64,width,height,alpha:[4,6].includes(bytes[25]),filename:`${task==="layers"?"layer":"design"}-${String(index+1).padStart(2,"0")}.png`};
    });
    const reportedCost=data.usage?.cost ?? data.usage?.cost_usd;
    const cost=(typeof reportedCost==="number" || (typeof reportedCost==="string" && reportedCost.trim()!=="")) && Number.isFinite(Number(reportedCost)) ? Number(reportedCost):null;
    return Response.json({images,elapsed:(Date.now()-start)/1000,cost,model},{headers});
  } catch(err) {
    if(err instanceof Error && ["TimeoutError","AbortError"].includes(err.name)) return fail("等待超时，上游是否完成暂时未知。请先查看 OpenRouter 记录，避免重复提交。",504);
    return fail("模型连接中断或返回了无效图片。请查看平台记录后再试。",502);
  }
}

