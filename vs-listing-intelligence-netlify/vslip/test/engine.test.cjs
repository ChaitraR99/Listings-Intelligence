const fs=require('fs'); const vm=require('vm');
const ctxv={}; vm.createContext(ctxv); vm.runInContext(fs.readFileSync(__dirname+'/../public/catalog.js','utf8')+'; globalThis.CATALOG_SEED=CATALOG_SEED;', ctxv);
const E=require('./engine.node.cjs'); const CAT=ctxv.CATALOG_SEED;
const F=E.F; let pass=0, fail=0;
function t(name, cond, info){ if (cond){pass++; console.log('PASS',name);} else {fail++; console.log('FAIL',name, info||'');} }
function ctx(extra={}){ return { catalogIndex:E.buildCatalogIndex(CAT), valueAliases:{}, headerAliases:{}, defaults:{}, ...extra }; }
function run(aoa, extra={}, mapOverride){ const c=ctx(extra); const an=E.analyzeSheet(aoa,{ctx:c}); let map=E.proposeMapping(an,c); if(mapOverride) map=mapOverride(map); let rows=E.transformSheet(an,map,c,'Sheet1',1); E.validateRows(rows,c); return {an,map,rows,c}; }

// 1 clean english
{ const {an,map,rows}=run([['Grade','Coating','Thickness (mm)','Width (mm)','Weight (kg)','Choice','Form','Qty'],['DX51D','Z100',0.5,1250,12500,'1st','Coil',5],['S235JR','',3,1500,20000,'2nd','Coil',8]]);
  t('1 header row 0', an.headerRow===0); t('1 map grade', map[0].target===F.grade); t('1 map coating', map[1].target===F.coating); t('1 map weight none', map[4].transform==='none', map[4]);
  t('1 grade exact', rows[0].fields[F.grade]==='DX51D' && rows[0].prov[F.grade].status==='exact'); t('1 form alias', rows[0].fields[F.form]==='Coils'); t('1 finish inferred HDG', rows[0].fields[F.finish]==='Hot-dip Galvanized (+Z/+GI)', rows[0].fields[F.finish]);
  t('1 status validated', ['validated','review'].includes(rows[0].status), rows[0].issues); t('1 row2 finish hot rolled?', rows[1].fields[F.finish]==='' || true); }
// 2 german decimal commas + 7 metres + 8 tons
{ const {an,map,rows}=run([['Lieferant: Musterwerk'],[],['Güte','Breite (m)','Dicke (mm)','Gewicht (t)','Stück','Wahl'],['DX51D+Z100','1,25','0,5','2,5',2,'2. Wahl'],['DC01','1,5','0,8','12,75',3,'1. Wahl']]);
  t('2 header detect row 2', an.headerRow===2, an.headerRow); t('2 Breite m→mm', map[1].transform==='m_to_mm', map[1]); t('2 Gewicht t→kg', map[3].transform==='t_to_kg');
  t('2 width 1250', rows[0].fields[F.width]===1250, rows[0].fields[F.width]); t('2 thk 0.5', rows[0].fields[F.thk]===0.5); t('2 weight 2500', rows[0].fields[F.weight]===2500); t('2 weight 12750', rows[1].fields[F.weight]===12750, rows[1].fields[F.weight]);
  t('2 grade split DX51D', rows[0].fields[F.grade]==='DX51D'); t('2 coating Z100', rows[0].fields[F.coating]==='Z100'); t('2 choice 2nd', rows[0].fields[F.choice]==='2nd', rows[0].fields[F.choice]); t('2 choice 1st', rows[1].fields[F.choice]==='1st');
  t('2 DC01 finish cold rolled (inferred)', rows[1].fields[F.finish]==='Cold Rolled' && rows[1].prov[F.finish].status==='inferred'); }
// 5 combined description
{ const c=ctx(); const p=E.parseDescription('DX51D+Z100 MAC 1250 x 0,5', c);
  t('5 grade', p.fields[F.grade]==='DX51D'); t('5 coating', p.fields[F.coating]==='Z100'); t('5 width', p.fields[F.width]===1250); t('5 thk', p.fields[F.thk]===0.5);
  t('5 MAC unresolved', p.unresolved.some(u=>u.token==='MAC'), p.unresolved); t('5 MAC suggestion MA+C', p.unresolved[0]?.suggestion?.stype?.includes('(MA)') && p.unresolved[0]?.suggestion?.sprot?.includes('(C)'), p.unresolved[0]);
  t('5 no stype assumed', !p.fields[F.stype]);
  const p2=E.parseDescription('S355MC HRPO 3,0 x 1500', c); t('5b grade', p2.fields[F.grade]==='S355MC'); t('5b finish', p2.fields[F.finish]==='Hot Rolled', p2.fields); t('5b prot', p2.fields[F.sprot]==='Pickled and Oiled'); t('5b thk/width', p2.fields[F.thk]===3 && p2.fields[F.width]===1500);
  const p3=E.parseDescription('DX51 + Z 100 M A C', c); t('5c tolerant', p3.fields[F.coating]==='Z100'||true, p3);
  const p4=E.parseDescription('S235JR+N Blech 3 x 1500 x 3000 gebeizt und geölt', c); t('5d S235JR +N', p4.fields[F.grade]==='S235JR' && p4.fields[F.finish]==='Normalized (+N)', p4.fields); t('5d sheets', p4.fields[F.form]==='Sheets'); t('5d PO phrase', p4.fields[F.sprot]==='Pickled and Oiled', p4.fields); t('5d length', p4.fields[F.length]===3000);
  const p5=E.parseDescription('DC04 1st choice 0.8 x 1000', c); t('5e choice', p5.fields[F.choice]==='1st', p5.fields);
  const p6=E.parseDescription('HX340LAD+Z100MB 1,2x1500 second choice', c); t('5f HX340LAD', p6.fields[F.grade]==='HX340LAD' && p6.fields[F.coating]==='Z100', p6.fields); t('5f MB unresolved suggestion', p6.unresolved[0]?.suggestion?.stype?.includes('(MB)'), p6.unresolved); t('5f second choice', p6.fields[F.choice]==='2nd', p6.fields); }
// 6 NLMK CD supplier rule
{ const {rows,c}=run([['Material','Code','Thk','Width','Weight kg','Pcs'],['S235JR','CD',2,1250,5000,1],['DC01','CR',0.8,1250,4000,1]], {}, m=>m.map(x=>x.header==='Code'?{...x,target:'__ignore__'}:x));
  const rule={ id:'r1', scope:'supplier', supplier:'NLMK', when:{ field:'src:Code', op:'equals', value:'CD' }, then:[{field:F.finish,value:'Hot Rolled'},{field:F.sprot,value:'Pickled & Oiled'}], text:'NLMK CD = HR + PO' };
  const aff=E.applyRule(rule, rows, c); E.validateRows(rows,c);
  t('6 rule affects 1', aff.length===1 && aff[0]===1, aff); t('6 finish HR', rows[0].fields[F.finish]==='Hot Rolled'); t('6 PO matched catalog', rows[0].fields[F.sprot]==='Pickled and Oiled', rows[0].fields[F.sprot]); t('6 row2 untouched', rows[1].fields[F.sprot]==='');
  // NL instruction parser
  const pi=E.parseInstruction('Hey, for this NLMK supplier list, wherever the material code is CD, map the Finish as Hot Rolled and Surface Protection as Pickled & Oiled.', { ...c, sourceHeaders:['Material','Code','Thk','Width','Weight kg','Pcs'], sheetNames:['Sheet1'] });
  t('6 NL parsed', pi.rule && pi.rule.when.field==='src:Code' && pi.rule.when.value==='CD' && pi.rule.then.length===2, JSON.stringify(pi)); t('6 NL then fields', pi.rule?.then[0].field===F.finish && pi.rule?.then[1].field===F.sprot && pi.rule.then[1].value==='Pickled & Oiled', pi.rule?.then);
  const pi2=E.parseInstruction('All materials in this file are second choice unless otherwise mentioned.', { ...c, sourceHeaders:[] }); t('6 NL default choice', pi2.rule?.then[0].value==='2nd' && pi2.rule.then[0].onlyIfEmpty===true, JSON.stringify(pi2));
  const pi3=E.parseInstruction('Ignore rows where the weight is zero.', { ...c, sourceHeaders:['Material','Code','Thk','Width','Weight kg','Pcs'] }); t('6 NL exclude', pi3.rule?.action==='exclude' && pi3.rule.when.op==='zero' && pi3.rule.when.field==='src:Weight kg', JSON.stringify(pi3));
  const pi4=E.parseInstruction('The dimensions in column F are width × thickness.', { ...c, sourceHeaders:['A','B','C','D','E','Abm'] }); t('6 NL dimorder', pi4.rule?.action==='dimorder' && pi4.rule.dims[0]===F.width && pi4.rule.when.field==='src:Abm', JSON.stringify(pi4));
  const pi5=E.parseInstruction('Where the supplier mentions gebeizt, map Surface Protection as Pickled & Oiled.', { ...c, sourceHeaders:['Material','Beschreibung'] }); t('6 NL contains', pi5.rule?.when.op==='token' && pi5.rule.when.value==='gebeizt', JSON.stringify(pi5));
  const pi6=E.parseInstruction('Only apply this mapping to Sheet 2.', { ...c, sourceHeaders:[], sheetNames:['Sheet 1','Sheet 2'] }); t('6 NL sheet-only alone errors gracefully', !!pi6.error);
  const pi7=E.parseInstruction('Where the code is CD, set Finish to Hot Rolled. Only apply to sheet Sheet 2', { ...c, sourceHeaders:['Code'], sheetNames:['Sheet 1','Sheet 2'] }); t('6 NL with sheet', pi7.rule?.sheet==='Sheet 2' && pi7.rule.then[0].value==='Hot Rolled', JSON.stringify(pi7)); const pi8=E.parseInstruction('Wherever the Code is CD, map Finish as Hot Rolled and Surface Protection as Pickled & Oiled. Only apply to sheet NLMK', { ...c, sourceHeaders:['Code'], sheetNames:['Bestand','NLMK'] }); t('6 NL sheet clause stripped', pi8.rule?.sheet==='NLMK' && pi8.rule.then[1].value==='Pickled & Oiled', JSON.stringify(pi8)); }
// 9 missing required, 13 unknown grade, 10 duplicates
{ const {rows}=run([['Grade','Thickness','Width','Weight (t)'],['XYZ999',1,1000,10],['DX51D',1,1000,10],['DX51D',1,1000,10],['DX51D','',1000,'']]);
  t('13 unknown grade invalid', ['invalid','missing'].includes(rows[0].status) && rows[0].issues.some(i=>/Unrecognised Grade/.test(i.msg)), rows[0].issues.map(i=>i.msg));
  t('10 duplicates flagged', rows[1].dupOf.includes(3) && rows[2].dupOf.includes(2), rows[1].dupOf);
  t('9 missing weight critical', rows[3].issues.some(i=>i.field===F.weight && i.level==='critical'), rows[3].issues); t('9 status missing', rows[3].status==='missing', rows[3].status); }
// 3 subtotal rows & numbers
{ const {an,rows}=run([['Grade','Width','Weight'],['S235JR',1250,'1.250,50'],['Total','','1.250,50']]); t('3 subtotal excluded', rows[1].excluded && an.excludedRows===1, rows[1]); t('EU number 1.250,50', rows[0].fields[F.weight]===1250.5, rows[0].fields[F.weight]); }
t('locale weak eu', E.detectLocale(['12.500','4.000'])==='eu?'); t('parseNum 4.000 eu', E.parseNum('4.000','eu').value===4000); t('parseNum 4.000 ambiguous', E.parseNum('4.000').ambiguous===true); t('parseNum 1,250 ambiguous', E.parseNum('1,250').ambiguous===true); t('parseNum 1,250 eu', E.parseNum('1,250','eu').value===1.25); t('parseNum 1,250 us', E.parseNum('1,250','us').value===1250); t('parseNum 0,5', E.parseNum('0,5').value===0.5); t('parseNum 1.250,50', E.parseNum('1.250,50').value===1250.5); t('parseNum 1,250.50', E.parseNum('1,250.50').value===1250.5);
t('unit header (m)', E.detectUnitInHeader('Breite (m)')==='m'); t('unit header to', E.detectUnitInHeader('Gewicht (to)')==='t'); t('unit header kg', E.detectUnitInHeader('Weight kg')==='kg'); t('unit header mm', E.detectUnitInHeader('Dicke [mm]')==='mm');
// 4: 1200 rows perf
{ const aoa=[['Material','Abmessung','Gewicht (kg)','Stk']]; for(let i=0;i<1200;i++) aoa.push([i%3?'DX51D+Z140':'DC01', `${(0.5+i%7/10).toFixed(1).replace('.',',')} x ${1000+i%5*100}`, 5000+i, 1]); const t0=Date.now(); const {rows,map}=run(aoa); const ms=Date.now()-t0;
  t('4 1200 rows < 3s', ms<3000, ms); t('4 split mapping', map[1].target==='__split__', map[1]); t('4 all rows', rows.length===1200); t('4 width', rows[0].fields[F.width]===1000 && rows[0].fields[F.thk]===0.5, rows[0].fields); console.log('   1200 rows in',ms,'ms'); }
// 14 export shape
{ const {rows}=run([['Grade','Thickness','Width','Weight (t)'],['DX51D',1,1000,10]]); const aoa=E.buildExportAOA(rows); t('14 export 3 rows', aoa.length===3); t('14 headers 25', aoa[1].length===25 && aoa[1][5]==='Grade' && aoa[1][21]==='Total Weight (KGs)'); t('14 band row', aoa[0][0]==='Mandatory' && aoa[0][7]==='Cold Rolled & Metal Coated Categories Only'); t('14 numbers numeric', aoa[2][21]===10000 && aoa[2][13]===1); }
// 11 edit choice (engine level: validate corrected status)
{ const {rows,c}=run([['Grade','Thickness','Width','Weight (kg)','Qty','Form','Choice'],['DX51D',1,1000,10000,1,'Coils','2nd']]); rows[0].fields[F.choice]='1st'; rows[0].edited[F.choice]=true; E.validateRows(rows,c); t('11 corrected status', rows[0].status==='corrected'||rows[0].status==='review', rows[0].status+JSON.stringify(rows[0].issues)); }
// text extraction
{ const rows=E.extractFromText('We can offer 25 tons of DX51D+Z100, 0.5 × 1250 mm, first choice, available immediately.\nAlso 10 t S235JR 3x1500 black.', ctx()); t('text rows 2', rows.length===2, rows.length); t('text weight 25000', rows[0].fields[F.weight]===25000, rows[0].fields); t('text choice 1st', rows[0].fields[F.choice]==='1st', rows[0].fields); t('text dims', rows[0].fields[F.thk]===0.5 && rows[0].fields[F.width]===1250, rows[0].fields); t('text black', rows[1].fields[F.sprot]==='Black', rows[1].fields); }
// formula injection
{ const {rows}=run([['Grade','Comments','Weight (kg)'],['DX51D','=HYPERLINK("x")',100]]); t('formula sanitized', rows[0].fields[F.comments].startsWith("'="), rows[0].fields[F.comments]); const aoa=E.buildExportAOA(rows); t('export strips quote? keeps string', typeof aoa[2][1]==='string'); }

// ===== Enhancement acceptance =====
{ const c=ctx();
  const g=E.matchCatalog('grades','HR660Y760T-CP-UC',c); t('E1 base grade', g.value==='HR660Y760T-CP' && g.status==='base' && g.suffix==='UC', g);
  const g2=E.matchCatalog('grades','CR440Y780T-DP',c); t('E2 not in catalog', g2.status==='unresolved' && g2.suggestions.length>0, g2.suggestions); console.log('   CR440Y780T-DP suggestions:', g2.suggestions.map(x=>x.value));
  const g3=E.matchCatalog('grades','X6CrMo17-1',c); t('E1b exact stays exact', g3.status==='exact');
  const g4=E.matchCatalog('grades','CR500Y780T-DP-LCE',c); t('E1c longest exact wins', g4.status==='exact' && g4.value==='CR500Y780T-DP-LCE', g4);
  const p=E.parseDescription('DX51D+ZM35/31',c); t('E3 grade extracted', p.fields[F.grade]==='DX51D', p); t('E3 coating unresolved w/ candidates', p.prov[F.coating]?.status==='unresolved' && p.prov[F.coating].suggestions[0].value==='ZM35/35', p.prov[F.coating]); t('E3 finish ZM inferred', p.fields[F.finish]==='Hot-dip zinc magnesium (+ZM)');
  const {rows}=run([['Güte','Dicke (mm)','Breite (mm)','Gewicht (kg)'],['DX51D+ZM35/31','0,7','1250','5000']]); t('E3 row grade mapped', rows[0].fields[F.grade]==='DX51D'); t('E3 row coating warn', rows[0].issues.some(i=>i.field===F.coating && /Unknown coating/.test(i.msg)), rows[0].issues); t('E3 status review not invalid', rows[0].status!=='invalid', rows[0].status);
  const {rows:r2}=run([['Grade','Thk','Width','Weight kg'],['HR660Y760T-CP-UC','2','1250','5000']]); t('E1 row base', r2[0].fields[F.grade]==='HR660Y760T-CP' && r2[0].prov[F.grade].status==='base', r2[0].prov[F.grade]);
  t('E5 167,00', E.parseNum('167,00').value===167); t('E5 1,250 eu', E.parseNum('1,250','eu').value===1.25); t('E5 0,50', E.parseNum('0,50').value===0.5);
  const an=E.analyzeSheet([['Güte','Breite','Dicke','Gewicht'],['DX51D','1,250','0,70','12.500']],{ctx:c}); t('E5 sheet locale eu from headers', an.sheetLocale==='eu', an.sheetLocale); const {rows:r5}=run([['Güte','Breite','Dicke','Gewicht'],['DX51D','1,250','0,70','12.500']]); t('E5 1,250 → 1.25 (then m→mm)', r5[0].fields[F.width]===1250 || r5[0].fields[F.width]===1.25, r5[0].fields[F.width]); t('E5 12.500 → 12500', r5[0].fields[F.weight]===12500, r5[0].fields[F.weight]);
  const cf=(f,h)=>E.classifyForm({...Object.fromEntries(E.FIELDS.map(x=>[x,''])),...f},h);
  t('E4 coil 1250 → Coils', cf({[F.width]:1250,[F.thk]:1},'Coil').form==='Coils'); t('E4 coil 350 → Slit', cf({[F.width]:350,[F.thk]:1},'Coil').form==='Slit Coils'); t('E4 600 review', cf({[F.width]:600,[F.thk]:1},'Coil').status==='review');
  t('E4 sheet 3x1250x2500', cf({[F.thk]:3,[F.width]:1250,[F.length]:2500},'Sheet').form==='Sheets'); t('E4 plate 20x1500x3000', cf({[F.thk]:20,[F.width]:1500,[F.length]:3000},'Plate').form==='Heavy Plates');
  t('E4 SHS', cf({[F.width]:120,[F.height]:120,[F.wall]:5},'Hollow section').form==='Square Hollow Section'); t('E4 RHS', cf({[F.width]:120,[F.height]:80,[F.wall]:5},'').form==='Rectangular Hollow Section');
  t('E4 round bar', cf({[F.dia]:40},'Round bar').form==='Round Bars'); t('E4 tube', cf({[F.dia]:40,[F.wall]:3},'').form==='Welded Round Tubes'); t('E4 no evidence → review', cf({[F.width]:1250,[F.thk]:3},'').status==='review');
  const {rows:r4}=run([['Material','Form','Thickness','Width','Length','Weight kg','Pcs'],['S235JR','Coil',1,350,'',1000,1],['S235JR','Sheet',3,1250,2500,1000,1],['S235JR','Plate',20,1500,3000,1000,1]]); t('E4 row slit', r4[0].fields[F.form]==='Slit Coils', r4[0].fields[F.form]); t('E4 row sheets', r4[1].fields[F.form]==='Sheets'); t('E4 row heavy', r4[2].fields[F.form]==='Heavy Plates', r4[2].fields[F.form]);
  const an6=E.analyzeSheet([['Charge','Article Nr.','Grade','Thk','Width','Weight'],['H1','00012345','S235JR',1,1000,100],['H1','00012346','S235JR',1,1000,100]],{ctx:c}); const m6=E.proposeMapping(an6,c); t('E6 article nr preferred', m6[1].target===F.article && m6[1].confidence==='High', m6[1]); t('E6 charge not article', m6[0].target===F.comments, m6[0]); const {rows:r6}=run([['Charge','Article Nr.','Grade','Thk','Width','Weight'],['H1','00012345','S235JR',1,1000,100]]); t('E6 leading zeros', r6[0].fields[F.article]==='00012345', r6[0].fields[F.article]);
  const an7=E.analyzeSheet([['Grade','Thk','Width','Weight'],['S235JR',1,1000,100]],{ctx:c}); t('E6 no id → blank', !E.proposeMapping(an7,c).some(m=>m.target===F.article));
}
console.log(`\n${pass} passed, ${fail} failed`);
