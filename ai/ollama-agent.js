'use strict';

const actions = ['attack', 'defend', 'retreat', 'support'];

// Server-side entry point for a future low-frequency tactical scheduler.
async function infer(state, {
  fetchImpl = fetch,
  model = process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  endpoint = process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  timeout = Number(process.env.OLLAMA_TIMEOUT_MS || 15000)
} = {}) {
  const targets = ['', ...state.allowedTargets];
  const response = await fetchImpl(endpoint.replace(/\/$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      model, stream: false,
      format: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: actions },
          target: { type: 'string', enum: targets },
          say: { type: 'string' }
        },
        required: ['action', 'target', 'say']
      },
      messages: [
        { role: 'system', content: '你是地下城團隊死鬥的戰術指揮。依隊伍可見資訊決定戰術，target 填合法敵方 ID 或空字串。使用繁體中文簡述戰術。' },
        { role: 'user', content: JSON.stringify(state) }
      ]
    })
  });
  if (!response.ok) throw new Error('Ollama HTTP ' + response.status);
  const result = await response.json();
  const decision = JSON.parse(result.message.content);
  if (!decision || !actions.includes(decision.action) || !targets.includes(decision.target) ||
      typeof decision.say !== 'string') throw new Error('Invalid Ollama tactical decision');
  return { action: decision.action, target: decision.target, say: decision.say.slice(0, 180) };
}

module.exports = { infer };
