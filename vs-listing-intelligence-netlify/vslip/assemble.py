a=open('/home/claude/build/app1.js').read(); b=open('/home/claude/build/app2.js').read()
a=a.replace("""let sampleFn=null, downloadsNs=null, aiChecked=false;
(async()=>{ try{ if (window.claude && claude.use){ sampleFn = await claude.use('sample'); downloadsNs = await claude.use('downloads'); } }catch(e){} aiChecked=true; renderAiStatus(); })();
function aiLive(){ return !!sampleFn && S.settings.ai!==false; }
function renderAiStatus(){ const el=$('#aiStatus'); if(!el) return; el.innerHTML = aiChecked ? (sampleFn ? `AI: <span class="ai-live">Claude available</span> (instruction panel)` : `AI: <span class="ai-local">not connected</span> — local rules engine`) : 'AI: checking…'; }""","let sampleFn=null, downloadsNs=null, aiChecked=false;")
assert "renderAiStatus" not in a.split("let sampleFn=null")[1][:600]
a=a.replace("closeModal(); persistDraft(); go('workspace'); toast(`Generated ${J.rows.length} rows in ${ms} ms`);","closeModal(); persistDraft(); go('workspace'); toast(`Generated ${J.rows.length} rows in ${ms} ms`); if(aiLive() && S.settings.aiExtract!==false) setTimeout(()=>aiExtractionPass({silent:true}), 300);")
b=b.replace("$('#btnResolve').onclick=()=>resolvePanel();","$('#btnResolve').onclick=()=>resolvePanel();\n$('#btnAI').onclick=()=>aiExtractionPass();")
b=b.replace("$('#aiToggle').onchange=e=>{ S.settings.ai=e.target.checked; save(); renderAiStatus(); };","$('#aiToggle').onchange=e=>{ S.settings.ai=e.target.checked; save(); renderAiStatus(); };\n$('#aiExtractToggle').onchange=e=>{ S.settings.aiExtract=e.target.checked; save(); };\n$('#appTokenInput').onchange=e=>{ try{ sessionStorage.setItem('vs-app-token', e.target.value.trim()); AI.token=e.target.value.trim(); }catch(err){} toast('Access token stored for this session'); };")
b=b.replace("$('#adminToggle').checked=!!S.settings.admin; $('#aiToggle').checked=S.settings.ai!==false; updateStorageInfo();","$('#adminToggle').checked=!!S.settings.admin; $('#aiToggle').checked=S.settings.ai!==false; $('#aiExtractToggle').checked=S.settings.aiExtract!==false; $('#appTokenRow').style.display=AI.authRequired?'':'none'; updateStorageInfo();")
old="['Claude reasoning layer', aiChecked?(sampleFn?'LIVE':'NOT CONNECTED'):'CHECKING','Instruction → rule conversion, EN-equivalent grade candidates, coating interpretation. Runs through the claude.ai artifact runtime on the viewer\\'s own account: no API key exists in this page, browser storage or the download. Production (Phase 2) needs a backend proxy: server-side key, model config, JSON schema validation, retries, rate limits, usage logging — the frontend calls stay identical.']"
assert old in b
b=b.replace(old,"['Claude reasoning layer', aiChecked?(AI.live?'LIVE':'NOT CONNECTED'):'CHECKING', AI.mode==='proxy'?`Connected through the secure server-side proxy (/api/claude, model ${AI.model}). The API key lives only in the Netlify environment; the browser never sees it. Does: AI extraction pass after generation, instruction → rule conversion, EN-equivalent and coating candidates.`:'Deploy with ANTHROPIC_API_KEY set in Netlify to enable the AI extraction pass, instruction interpretation and equivalent-grade candidates.']")
b=b.replace("load(); reindex(); applyTheme(); renderNav();","load(); reindex(); applyTheme(); renderNav(); initAI();")
js=(a+'\n'+b).replace("${p.status==='inferred'?'inferred':''}\" title=","${p.status==='inferred'?'inferred':p.status==='ai'?'ai':''}\" title=")
open('public/app.js','w').write(js)
h=open('/home/claude/build/app-body.html').read()
h=h.replace('<button class="btn sm" id="btnResolve">Resolve unknowns</button>','<button class="btn sm" id="btnAI">Run AI extraction</button><button class="btn sm" id="btnResolve">Resolve unknowns</button>')
h=h.replace('<label class="switch sp"><input type="checkbox" id="aiToggle" checked> Use Claude for instruction interpretation when available</label>','<label class="switch sp"><input type="checkbox" id="aiToggle" checked> Use Claude when available</label><label class="switch sp"><input type="checkbox" id="aiExtractToggle" checked> Run the AI extraction pass automatically after generation</label><div class="field sp" id="appTokenRow" style="display:none"><label class="lbl">App access token (set by your admin in Netlify)</label><input type="text" id="appTokenInput" placeholder="paste token"></div>')
assert 'btnAI' in h and 'aiExtractToggle' in h
css=open('public/app.css').read()
if '.b-ai' not in css: css+="\n.b-ai{background:var(--info-bg);color:var(--info)}table.g td.ai{font-style:italic}\n"
open('public/app.css','w').write(css)
e=open('public/engine.js').read()
if "p.status==='ai'" not in e: e=e.replace("      if (p.status==='inferred') add(t.key,'info',`Inferred: ${p.note}`);","      if (p.status==='inferred') add(t.key,'info',`Inferred: ${p.note}`);\n      if (p.status==='ai') add(t.key,'warning',`AI-inferred — approve: ${p.note}`);")
open('public/engine.js','w').write(e)
html='''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vanilla Steel · Listing Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<link rel="stylesheet" href="app.css">
</head>
<body>
'''+h+'''
<script src="catalog.js"></script><script src="engine.js"></script><script src="ai.js"></script><script src="app.js"></script>
</body>
</html>'''
open('public/index.html','w').write(html)
print('assembled')
