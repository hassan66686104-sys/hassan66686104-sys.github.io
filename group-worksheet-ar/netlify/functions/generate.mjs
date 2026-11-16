import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = "https://pqkaotqtwdaoolbjzpyk.supabase.co";
const SUPABASE_KEY = "sb_publishable_6TUp8IMl-Br4lmWOxZ-JHQ_hVFHr85v";
const MODELS = ["claude-haiku-4-5-20251001", "claude-haiku-4-5", "claude-sonnet-4-5-20250929"];
const LEVEL_AR = { low: "أساسي (سهل)", mid: "متوسط", high: "متقدم (تفكير عليا)" };

async function pinOk(pin) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_teacher`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_pin: pin, p_action: "check", p_data: {} }),
  });
  return r.ok;
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const body = await req.json().catch(() => null);
  if (!body?.lesson || !Array.isArray(body.groups)) return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  if (!(await pinOk(body.pin))) return Response.json({ error: "رمز المعلم غير صحيح" }, { status: 401 });
  if (!process.env.ANTHROPIC_BASE_URL && !process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "خدمة التوليد غير مفعّلة بعد على الموقع. اكتب الأسئلة يدويًا." }, { status: 503 });

  const spec = body.groups.map((g) => `المجموعة ${g.group_no}: ${g.levels.length} أسئلة بالمستويات بالترتيب: ${g.levels.map((l) => LEVEL_AR[l] || l).join("، ")}`).join("\n");
  const prompt = `أنت معلم خبير تُعد ورقة عمل جماعية باللغة العربية.
الدرس: ${String(body.lesson).slice(0, 200)}
${body.grade ? `المادة والصف: ${String(body.grade).slice(0, 120)}` : ""}
${body.notes ? `ملاحظات المعلم: ${String(body.notes).slice(0, 400)}` : ""}
${body.avoid ? String(body.avoid).slice(0, 300) : ""}

المطلوب لكل مجموعة عدد من الأسئلة بالمستويات المحددة بالترتيب نفسه:
${spec}

الشروط:
- حدّد لكل مجموعة هدفًا تعليميًا واحدًا من أهداف الدرس، مختلفًا عن أهداف المجموعات الأخرى، وصغه بصيغة «أن يـ…». واجعل كل أسئلة المجموعة تخدم هدفها.
- نوع السؤال يحدده مستوى الطالب:
  • الأساسي: سؤال واحد فيه عدة نقاط (4 نقاط)، إما type "mcq" اختيار من متعدد (لكل نقطة q وchoices من 4 خيارات)، أو type "tf" صح أو خطأ (لكل نقطة q عبارة). نوّع بينهما داخل المجموعة. ضع نقاط السؤال في items، وفي prompt تعليمات قصيرة، وفي solution إجابة كل نقطة مرقمة (1) ... 2) ...) مع تصحيح العبارة الخاطئة.
  • المتوسط والمتقدم: سؤال مقالي يجيب عنه الطالب كتابةً، ونوّع بين: write = اكتب أو اشرح، why = علّل، compare = قارن، classify = صنّف مع التعليل.
- المقالي المتوسط يحتاج شرحًا وتطبيقًا، والمتقدم يحتاج تحليلًا أو تفسيرًا أو رأيًا معللًا.
- أعطِ حلًا نموذجيًا مختصرًا لكل سؤال.
أعد JSON فقط بهذا الشكل دون أي نص آخر:
{"groups":[{"group_no":1,"objective":"أن يـ...","questions":[{"type":"mcq","prompt":"اختر الإجابة الصحيحة لكل مما يأتي:","items":[{"q":"...","choices":["...","...","...","..."]}],"solution":"1) ..."},{"type":"tf","prompt":"ضع صح أو خطأ:","items":[{"q":"..."}],"solution":"1) صح ..."},{"type":"why","prompt":"علّل: ...","solution":"..."}]}]}`;

  const client = new Anthropic();
  let lastErr;
  for (const model of MODELS) {
    try {
      const msg = await client.messages.create({ model, max_tokens: 3000, messages: [{ role: "user", content: prompt }] });
      const text = msg.content.map((c) => c.text || "").join("");
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const groups = Array.isArray(json.groups) ? json.groups : Array.isArray(json.questions) ? [json] : Array.isArray(json) ? json : null;
      if (!groups || !groups.length || !Array.isArray(groups[0].questions)) {
        console.log("unexpected shape", model, text.slice(0, 500));
        throw new Error("unexpected shape");
      }
      return Response.json({ groups });
    } catch (e) {
      lastErr = e;
      console.log("generate failed", model, String(e));
    }
  }
  return Response.json({ error: "تعذّر توليد الأسئلة الآن. اكتبها يدويًا أو حاول لاحقًا.", detail: String(lastErr) }, { status: 502 });
};

export const config = { path: "/api/generate" };
