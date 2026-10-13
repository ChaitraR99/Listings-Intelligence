process.env.ANTHROPIC_API_KEY='test-key'; process.env.APP_ACCESS_TOKEN='tok';
globalThis.fetch = async (url, init) => { const body=JSON.parse(init.body); return { ok:true, status:200, json: async()=>({ content:[{type:'text', text:'```json\n{"echo":'+JSON.stringify(body.model)+'}\n```'}], usage:{input_tokens:10,output_tokens:5} }) }; };
const { default: handler } = await import('../netlify/functions/claude.mjs');
const req = (path, opts={}) => new Request('http://x'+path, opts);
let r = await handler(req('/api/claude/health')); console.log('health', (await r.json()));
r = await handler(req('/api/claude', { method:'POST', body:'{"prompt":"hi"}' })); console.log('no token →', r.status);
r = await handler(req('/api/claude', { method:'POST', headers:{'x-app-token':'tok'}, body:'{"prompt":"hi","tier":"quick"}' })); console.log('ok →', r.status, await r.json());
