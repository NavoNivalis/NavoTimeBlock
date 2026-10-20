const OpenAI = require("openai")

const GENERATE_TASK_PROMPT = `你是一个任务规划助手。把用户的想法或叙述，转化成一个具体、可执行的任务，并填写以下字段。

字段含义：
- name: 简洁的任务名称
- goal: 根本目标是什么
- startAction: 不可能失败的启动动作（最小、立刻能做的一步）
- plan: 最终敲定的方案
- deliverable: 可以交付的东西
- resources: 分配的资源和时间
- startDate: 开始时间
- deadline: 截止时间
- difficulties: 可能遇到的困难
- failureCriteria: 什么情况算失败

只输出一个 JSON 对象，不要输出任何其他内容。JSON 格式：
{"name":"任务名称","goal":"...","startAction":"...","plan":"...","deliverable":"...","resources":"...","startDate":"...","deadline":"...","difficulties":"...","failureCriteria":"..."}

如果用户提供的信息不足以填写某个字段，用合理的推断补全，不要留空字符串。`

const ANALYZE_PROJECT_PROMPT = `你是一个以「外倾思考（Te）」为核心的冷静项目评审官。你的职责是用外部客观、可验证的标准评估一个项目，不关心想法好不好听，只关心能不能产出实物结果。

评估维度（每项都要给出具体、可执行的判断，用产出、效率、资源、时间、数据说话，拒绝空泛形容词）：
- verdict：一句话总评——这个项目能不能成、值不值得继续
- outcome：成果/产出——能不能产出实物结果？具体交付物是什么？
- efficiency：效率——当前任务安排是否高效？有没有重复或低效环节？
- resources：资源消耗——投入的资源和时间是否合理？成本大概多少？
- timeline：交付时间——多久能交付原型/首个可验证成果？关键节点是什么？
- failureNode：失败判定节点——到哪个节点、满足什么条件就判定失败、及时止损？
- relationships：任务关系与变化——项目内各任务方案是否协同？有没有冲突、重复或遗漏？结合任务的创建时间判断方案是收拢聚焦、发散扩散、还是改道转向。

用户会提供项目名和该项目下的任务列表（含每个任务的属性与创建时间）。只基于这些真实数据，不要编造。

只输出一个 JSON 对象，不要输出任何其他内容。JSON 格式：
{"verdict":"...","outcome":"...","efficiency":"...","resources":"...","timeline":"...","failureNode":"...","relationships":"..."}`

function extractJSON(text) {
  if (!text) throw new Error("AI 返回为空")
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 未返回有效 JSON")
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

function createClient(settings) {
  const apiKey = settings["ai.api_key"]
  if (!apiKey) throw new Error("请先在设置中配置 API Key")

  const baseURL = settings["ai.base_url"] || "https://api.deepseek.com/v1"
  const model = settings["ai.model"] || "deepseek-flash"

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 60000,
    maxRetries: 0,
  })

  return { client, model }
}

function wrapError(e) {
  const name = e && typeof e === "object" && "name" in e ? e.name : ""
  if (name === "APIConnectionTimeoutError" || name === "APIConnectionError") {
    return new Error("无法连接 AI 服务，请检查网络或 API 地址（base_url）")
  }
  if (name === "AuthenticationError") {
    return new Error("API Key 无效，请检查设置")
  }
  return e
}

function serializeTasks(tasks) {
  return (tasks || []).map((t, i) => {
    return `任务${i + 1}：${t.name}
- 创建时间：${t.createdAt || "未知"}
- 根本目标：${t.goal || "未填写"}
- 启动动作：${t.startAction || "未填写"}
- 方案：${t.plan || "未填写"}
- 交付物：${t.deliverable || "未填写"}
- 资源/时间：${t.resources || "未填写"}
- 开始：${t.startDate || "未填写"}
- 截止：${t.deadline || "未填写"}
- 困难：${t.difficulties || "未填写"}
- 失败标准：${t.failureCriteria || "未填写"}`
  }).join("\n\n")
}

async function generateTask(text, settings) {
  const { client, model } = createClient(settings)

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: GENERATE_TASK_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices?.[0]?.message?.content
    return extractJSON(content)
  } catch (e) {
    throw wrapError(e)
  }
}

async function analyzeProject(projectName, tasks, settings) {
  const { client, model } = createClient(settings)

  const userContent = `项目名：${projectName}\n\n任务列表：\n${serializeTasks(tasks)}`

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: ANALYZE_PROJECT_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices?.[0]?.message?.content
    return extractJSON(content)
  } catch (e) {
    throw wrapError(e)
  }
}

module.exports = { generateTask, analyzeProject }
