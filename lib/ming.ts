export const MODELS = {
  generate: "inclusionai/ming-image-0.1-design",
  layers: "inclusionai/ming-image-0.1-design-layer",
} as const;
export const IMAGE_API = "https://openrouter.ai/api/v1/images";

function zeroPrice(value: unknown) {
  return (typeof value === "number" && Number.isFinite(value) && value === 0) ||
    (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) === 0);
}

export async function checkFreeProvider(model: string) {
  const response = await fetch(`${IMAGE_API}/models/${model}/endpoints`, {signal: AbortSignal.timeout(20000), cache:"no-store", redirect:"manual"});
  if (!response.ok) throw new Error("暂时无法确认模型价格，请稍后重试。");
  const data = await response.json() as {endpoints?: {provider_tag?:string;pricing?:{cost_usd?:unknown}[]}[]};
  const endpoints = data.endpoints?.filter(e => e.provider_tag === "novita") ?? [];
  if (!endpoints.length || !endpoints.every(e=>Array.isArray(e.pricing) && e.pricing.length>0 && e.pricing.every(p=>zeroPrice(p.cost_usd)))) {
    throw new Error("当前未找到可确认免费的 Novita 端点，已停止提交。请到 OpenRouter 查看模型可用状态。");
  }
  return "novita";
}

export function providerError(status: number) {
  const messages: Record<number,string> = {
    400:"模型未接受这次请求，请检查提示词与输入图片。",
    401:"OpenRouter 密钥无效或已过期，请重新配置。",
    402:"OpenRouter 账户或密钥额度不足，请到平台检查。",
    403:"此密钥无权调用该模型，请检查平台权限。",
    404:"模型接口暂时不可用，请稍后重试。",
    413:"输入图片过大，请压缩后重试。",
    429:"平台请求频率或并发已达上限，请稍后再试。",
    502:"上游模型服务暂时异常，请稍后再试。",
    524:"上游等待超时，是否生成完成暂时未知。请先查看平台记录。",
    529:"上游服务繁忙，请稍后再试。",
  };
  return messages[status] ?? "模型请求未成功，请稍后再试或查看 OpenRouter 请求记录。";
}

