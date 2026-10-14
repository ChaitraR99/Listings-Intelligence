/* ===== Vanilla Steel Listing Intelligence — Transformation Engine =====
   Pure, deterministic. No DOM. Pipeline:
   deterministic rules → supplier rules → catalog matching → (AI) → validation
*/
const ENGINE = (() => {

/* ---------- Template schema (from Listing_Template_Input_Sheet.xlsx, row 1 + row 2) ---------- */
const TEMPLATE = [
  { key:'Product Location (UUID)', band:'Mandatory', type:'text', req:'warn' },
  { key:'Comments', band:'Optional', type:'text' },
  { key:'Article ID (internal)', band:'Mandatory', type:'text', req:'warn' },
  { key:'Form', band:'Mandatory', type:'catalog', list:'forms', req:'critical' },
  { key:'Choice', band:'Mandatory', type:'catalog', list:'choices', req:'critical' },
  { key:'Grade', band:'Mandatory', type:'catalog', list:'grades', req:'critical' },
  { key:'Finish_1', band:'Mandatory', type:'catalog', list:'finishes', req:'critical' },
  { key:'Coating', band:'Cold Rolled & Metal Coated Categories Only', type:'catalog', list:'coatings', req:'conditional' },
  { key:'Surface Type', band:'', type:'catalog', list:'surfaceTypes' },
  { key:'Surface Protection', band:'', type:'catalog', list:'surfaceProtections' },
  { key:'Length (mm)', band:'Mandatory based on form', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Width (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Height (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Thickness (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'(Outer) Diameter (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Wall Thickness (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Web Thickness (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Flange Thickness (mm)', band:'', type:'num', fmt:'#,##0.00', req:'form' },
  { key:'Certificates', band:'', type:'catalog', list:'certs' },
  { key:'Description per Line Item', band:'Optional', type:'text' },
  { key:'Quantity', band:'Mandatory', type:'num', req:'critical' },
  { key:'Total Weight (KGs)', band:'Mandatory', type:'num', fmt:'#,##0', req:'critical' },
  { key:'Minimum Price', band:'Mandatory', type:'num', fmt:'#,##0.00', req:'warn' },
  { key:'Tensile Strength, Rm (MPa)', band:'Optional', type:'num' },
  { key:'Yield Strength, ReH (MPa)', band:'Optional', type:'num' },
];
const T = Object.fromEntries(TEMPLATE.map(t=>[t.key,t]));
const FIELDS = TEMPLATE.map(t=>t.key);
const F = {
  loc:'Product Location (UUID)', comments:'Comments', article:'Article ID (internal)', form:'Form', choice:'Choice',
  grade:'Grade', finish:'Finish_1', coating:'Coating', stype:'Surface Type', sprot:'Surface Protection',
  length:'Length (mm)', width:'Width (mm)', height:'Height (mm)', thk:'Thickness (mm)', dia:'(Outer) Diameter (mm)',
  wall:'Wall Thickness (mm)', web:'Web Thickness (mm)', flange:'Flange Thickness (mm)', certs:'Certificates',
  desc:'Description per Line Item', qty:'Quantity', weight:'Total Weight (KGs)', price:'Minimum Price',
  rm:'Tensile Strength, Rm (MPa)', reh:'Yield Strength, ReH (MPa)'
};
const SPECIAL_TARGETS = { '__split__':'Split material description', '__ignore__':'Ignore column' };

/* Dimension requirements by form (used for "Mandatory based on form") */
const FORM_DIMS = {
  'Coils':[F.thk,F.width], 'Slit Coils':[F.thk,F.width], 'Strips':[F.thk,F.width],
  'Sheets':[F.thk,F.width,F.length], 'Plates':[F.thk,F.width,F.length], 'Heavy Plates':[F.thk,F.width,F.length],
  'Cut Plates':[F.thk,F.width,F.length], 'Blanks':[F.thk,F.width,F.length], 'Offcuts':[F.thk,F.width,F.length],
  'Assorted Sheets':[F.thk], 'Semi-Assorted Sheets':[F.thk], 'Unassorted Sheets':[F.thk],
  'Round Bars':[F.dia,F.length], 'Round Billets':[F.dia,F.length], 'Wire Rods':[F.dia],
  'Seamless Round Tubes':[F.dia,F.wall,F.length], 'Welded Round Tubes':[F.dia,F.wall,F.length],
  'Square Tubes':[F.width,F.wall,F.length], 'Rectangular Tubes':[F.width,F.height,F.wall,F.length],
  'Flat Bars':[F.thk,F.width,F.length], 'Square Bars':[F.width,F.length], 'Hexagonal Bars':[F.width,F.length],
  'Rebars':[F.dia,F.length], 'Slabs':[F.thk,F.width,F.length],
  'H-Sections':[F.height,F.width,F.web,F.flange,F.length], 'I-Sections':[F.height,F.width,F.web,F.flange,F.length],
  'U-Sections':[F.height,F.width,F.web,F.flange,F.length], 'Equal Angles':[F.width,F.thk,F.length], 'Unequal Angles':[F.width,F.height,F.thk,F.length],
};

/* ---------- Normalization helpers ---------- */
const DIA = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss','é':'e','è':'e','ê':'e','à':'a','â':'a','ç':'c','ô':'o','î':'i','ï':'i','ù':'u','û':'u','ł':'l','ś':'s','ż':'z','ź':'z','ń':'n','ó':'o','ą':'a','ę':'e','ć':'c','í':'i','á':'a','ú':'u','ñ':'n' };
function norm(s){ return String(s==null?'':s).toLowerCase().replace(/[äöüßéèêàâçôîïùûłśżźńóąęćíáúñ]/g,c=>DIA[c]||c).replace(/[^a-z0-9%€/+.]+/g,' ').replace(/\s+/g,' ').trim(); }
function normKey(s){ return String(s==null?'':s).toUpperCase().replace(/\s+/g,''); }
function isBlank(v){ return v==null || String(v).trim()===''; }

/* ---------- Header aliases (multilingual). Extendable at runtime via ctx.headerAliases ---------- */
const HEADER_ALIASES = {
  [F.width]: ['width','breite','br','b','largeur','larg','larghezza','breedte','ancho','szerokosc','szer','w','wdt','width mm'],
  [F.thk]: ['thickness','thk','dicke','staerke','stark','dk','d','epaisseur','ep','spessore','sp','dikte','espesor','grubosc','gr','t','th','thick'],
  [F.length]: ['length','laenge','lg','l','longueur','lunghezza','lengte','longitud','dlugosc','dl','len'],
  [F.height]: ['height','hoehe','h','hauteur','altezza','hoogte','altura','wysokosc'],
  [F.dia]: ['diameter','durchmesser','od','outer diameter','diametre','diametro','doorsnede','srednica','dia'],
  [F.wall]: ['wall thickness','wandstaerke','wanddicke','wall','ws'],
  [F.weight]: ['weight','gewicht','gew','poids','peso','waga','kg','tonnage','tons','tonnen','total weight','net weight','nettogewicht','gesamtgewicht','wgt','weight kg','weight t','menge kg','qty kg','quantity kg','mass','masse'],
  [F.grade]: ['grade','guete','gute','werkstoff','qualitaet','qualitat','quality','steel grade','material','nuance','qualite','qualita','materiale','acciaio','kwaliteit','staalsoort','gatunek','jakosc','stahlsorte','stahlguete','norm','werkstoffnummer','ws nr','material no','steel','sorte','güte'],
  [F.coating]: ['coating','beschichtung','auflage','zinkauflage','zink','revetement','rivestimento','zincatura','coating mass','zn','zinc','verzinkung','coat','oberflaechenauflage','coating weight'],
  [F.form]: ['form','product','produkt','product form','type','art','typ','product type','produktart','forma','forme','vorm','material form','shape','form type'],
  [F.choice]: ['choice','wahl','choix','scelta','keuze','quality class','klasse','class','qualitaetsklasse','cat','categoria','selection','sortierung','qual','choice class'],
  [F.qty]: ['quantity','qty','menge','stueck','stk','st','anzahl','quantite','quantita','aantal','pcs','pieces','coils','bunde','stuks','ilosc','szt','number','no of coils','anz','count','pz','pezzi'],
  [F.price]: ['price','preis','prix','prezzo','prijs','cena','€/t','eur/t','price €/t','price eur','preis €/t','unit price','min price','minimum price','vk preis','sales price','price per ton','€'],
  [F.desc]: ['description','beschreibung','bezeichnung','designation','descrizione','omschrijving','artikel','material description','materialbezeichnung','position','pos','item','artikelbezeichnung','opis','descripcion','spec','specification','text','bemerkung material','produktbezeichnung','warenbezeichnung','denomination'],
  [F.stype]: ['surface type','surface','oberflaeche','oberflaechenart','surface finish','superficie','oppervlak','surface treatment','powierzchnia','oberfl'],
  [F.sprot]: ['surface protection','protection','schutz','oelung','oiling','oberflaechenschutz','oil','olio','huilage','conservation','konservierung'],
  [F.finish]: ['finish','ausfuehrung','zustand','condition','behandlung','treatment','lieferzustand','delivery condition','stato','etat','finish 1','finish1','execution','afwerking'],
  [F.certs]: ['certificate','certificates','zeugnis','cert','certificat','certificato','attest','pruefzeugnis','apz','3.1','certyfikat','certs'],
  [F.article]: ['article id','artikelnummer','art nr','art.nr','artikel nr','id','coil no','coil nr','coil number','bund nr','bundnr','coilnr','coil id','lot','charge','heat no','schmelze','ref','reference','sku','item no','pos nr','no','nr','number','num','n'],
  [F.comments]: ['comments','comment','bemerkung','bemerkungen','kommentar','remarks','remark','note','notes','hinweis','anmerkung','observations','commento','opmerking','uwagi'],
  [F.loc]: ['location','lager','standort','warehouse','lagerort','site','werk','plant','depot','magazzino','entrepot','locatie','stock location'],
  [F.rm]: ['tensile strength','zugfestigkeit','rm','rm mpa','tensile','resistance'],
  [F.reh]: ['yield strength','streckgrenze','re','reh','rp0.2','rp 0.2','yield','limite elastique','snervamento','rp0,2'],
  '__split__': ['abmessung','abmessungen','dimension','dimensions','dim','format','size','maße','masse mm','abm','dimensioni','afmeting','afmetingen','wymiary','material spec','grade dims','description dims','spec'],
};
/* Order matters: exact alias match before token-based fuzzy */
function headerCandidates(header, ctx){
  const h = norm(String(header==null?'':header).replace(/\(.*?\)|\[.*?\]/g,' ')).trim();
  const hRaw = norm(header);
  const out = [];
  // supplier/global learned aliases first
  const learned = (ctx && ctx.headerAliases) || {};
  if (learned[hRaw]) out.push({ target: learned[hRaw].target, confidence:'High', reason:'Approved supplier header alias' });
  for (const [target, list] of Object.entries(HEADER_ALIASES)){
    for (const a of list){
      if (h === a || hRaw === a) { out.push({ target, confidence:'High', reason:`Header "${header}" matches alias "${a}"` }); }
    }
  }
  if (!out.length){
    for (const [target, list] of Object.entries(HEADER_ALIASES)){
      for (const a of list){
        if (a.length>=4 && (h.startsWith(a) || h.split(' ').includes(a) || (a.includes(' ') && h.includes(a)))) out.push({ target, confidence:'Medium', reason:`Header "${header}" contains "${a}"` });
      }
    }
  }
  // dedupe keep first
  const seen=new Set(); return out.filter(o=>!seen.has(o.target)&&seen.add(o.target));
}

/* ---------- Units & numbers ---------- */
function detectUnitInHeader(header){
  const h = String(header||'').toLowerCase();
  const m = h.match(/[\(\[\s/](mm|cm|m|t|to|tons?|tonnen|tonnes|kg|kgs|inch|in|")[\)\]\s]*$/) || h.match(/[\(\[](mm|cm|m|t|to|tons?|tonnen|tonnes|kg|kgs|inch|in|")[\)\]]/);
  if (!m) { if (/€\s*\/\s*t|eur\s*\/\s*t|per ton/.test(h)) return '€/t'; if (/\bkg\b/.test(h)) return 'kg'; if (/\b(t|to|tons?|tonnen)\b/.test(h)) return 't'; if (/\bmm\b/.test(h)) return 'mm'; if (/\bcm\b/.test(h)) return 'cm'; return null; }
  const u = m[1]; if (['to','ton','tons','tonnen','tonnes'].includes(u)) return 't'; if (u==='kgs') return 'kg'; if (u==='"'||u==='in'||u==='inch') return 'inch'; return u;
}
/* locale: 'eu' (1.250,50) | 'us' (1,250.50) | null */
function detectLocale(values){
  let eu=0, us=0, euW=0, usW=0;
  for (const v of values){
    if (typeof v !== 'string') continue;
    const s=v.trim();
    if (/^-?0,\d+$/.test(s)) { eu++; continue; }            // 0,400 can only be a decimal comma
    if (/^-?0\.\d+$/.test(s)) { us++; continue; }           // 0.400 can only be a decimal point
    if (/^-?\d{1,3}\.\d{3}$/.test(s)) euW++; else if (/^-?\d{1,3},\d{3}$/.test(s)) usW++;
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) eu++;
    else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) us++;
    else if (/^-?\d+,\d{1,2}$/.test(s)) eu++;           // 0,5  1,25 → decimal comma
    else if (/^-?\d+\.\d{1,2}$/.test(s)) us++;          // 0.5  1.25 → decimal point
    else if (/^-?\d+,\d{4,}$/.test(s)) eu++;
    else if (/^-?\d+\.\d{4,}$/.test(s)) us++;
  }
  if (eu>us) return 'eu'; if (us>eu) return 'us'; if (euW>usW) return 'eu?'; if (usW>euW) return 'us?'; return null;
}
function parseNum(v, locale){
  if (locale) locale = String(locale).replace('?','');
  if (v==null || v==='') return { value:null, ok:false };
  if (typeof v === 'number') return { value:v, ok:isFinite(v) };
  let s = String(v).trim().replace(/\s/g,'').replace(/^[~≈]/,'');
  const unitM = s.match(/(mm|cm|kg|m|t|to|€|eur|pcs|stk)$/i); if (unitM) s = s.slice(0, -unitM[0].length);
  if (!/^-?[\d.,]+$/.test(s)) return { value:null, ok:false, note:'not numeric' };
  const hasC = s.includes(','), hasD = s.includes('.');
  let note;
  if (hasC && hasD){
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = dec===',' ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
    note = 'mixed separators: last one treated as decimal';
  } else if (hasC){
    const parts = s.split(',');
    if (parts.length===2 && parts[1].length===3 && locale==='us') { s = s.replace(',',''); note='comma treated as thousands (US locale)'; }
    else if (parts.length===2 && parts[1].length===3 && !locale) { s = s.replace(',','.'); note='AMBIGUOUS: "x,xxx" — treated as decimal comma; verify'; return { value:parseFloat(s), ok:true, note, ambiguous:true }; }
    else if (parts.length>2) { s = s.replace(/,/g,''); note='multiple commas treated as thousands'; }
    else { s = s.replace(',','.'); note='decimal comma → point'; }
  } else if (hasD){
    const parts = s.split('.');
    if (parts.length===2 && parts[1].length===3 && locale==='eu') { s = s.replace('.',''); note='point treated as thousands (EU locale)'; }
    else if (parts.length===2 && parts[1].length===3 && !locale) { note='AMBIGUOUS: "x.xxx" — treated as decimal point; verify'; return { value:parseFloat(s), ok:true, note, ambiguous:true }; }
    else if (parts.length>2) { s = s.replace(/\./g,''); note='multiple points treated as thousands'; }
  }
  const n = parseFloat(s); return { value: isFinite(n)?n:null, ok:isFinite(n), note };
}
const UNIT_FACTORS = { m_to_mm:1000, cm_to_mm:10, inch_to_mm:25.4, t_to_kg:1000, g_to_kg:0.001, none:1 };
function suggestUnitTransform(target, headerUnit, samples, locale){
  const nums = samples.map(s=>parseNum(s, locale).value).filter(n=>n!=null);
  const med = nums.length ? nums.sort((a,b)=>a-b)[Math.floor(nums.length/2)] : null;
  const isDim = [F.width,F.length,F.height,F.dia,F.thk,F.wall,F.web,F.flange].includes(target);
  if (isDim){
    if (headerUnit==='m') return { t:'m_to_mm', conf:'High', reason:'Header unit is metres → ×1000' };
    if (headerUnit==='cm') return { t:'cm_to_mm', conf:'High', reason:'Header unit is centimetres → ×10' };
    if (headerUnit==='inch') return { t:'inch_to_mm', conf:'High', reason:'Header unit is inches → ×25.4' };
    if (headerUnit==='mm') return { t:'none', conf:'High', reason:'Header unit is mm' };
    if (med!=null && target!==F.thk && target!==F.wall && med < 5) return { t:'m_to_mm', conf:'Medium', reason:`No unit in header; values look like metres (median ${med}) → ×1000 proposed — verify` };
    return { t:'none', conf: med==null?'Low':'Medium', reason:'No unit in header; values assumed to be mm' };
  }
  if (target===F.weight){
    if (headerUnit==='t') return { t:'t_to_kg', conf:'High', reason:'Header unit is tonnes → ×1000' };
    if (headerUnit==='kg') return { t:'none', conf:'High', reason:'Header unit is kg' };
    if (med!=null && med < 100) return { t:'t_to_kg', conf:'Medium', reason:`No unit in header; values look like tonnes (median ${med}) → ×1000 proposed — verify` };
    return { t:'none', conf:'Medium', reason:'No unit in header; values assumed to be kg' };
  }
  return { t:'none', conf:'High', reason:'' };
}

/* ---------- Catalog matching ---------- */
function buildCatalogIndex(catalog){
  const idx = {};
  for (const list of ['forms','finishes','coatings','certs','choices','surfaceTypes','surfaceProtections','grades']){
    const m = new Map(); const codes = new Map();
    for (const v of catalog[list]||[]){
      m.set(normKey(v), v);
      const c = String(v).match(/\(([^()]+)\)\s*$/); if (c) { for (const code of c[1].split('/')) codes.set(normKey(code.replace(/^\+/,'')), v); }
    }
    idx[list] = { map:m, codes };
  }
  return idx;
}
/* Built-in value aliases (steel-industry / multilingual). Shown in the Catalog screen as "built-in — verify". */
const VALUE_ALIASES = {
  finishes: {
    'HR':'Hot Rolled','HOT ROLLED':'Hot Rolled','WARMGEWALZT':'Hot Rolled','WARMBAND':'Hot Rolled','LAMINE A CHAUD':'Hot Rolled','LAMINATO A CALDO':'Hot Rolled','WARMGEWALST':'Hot Rolled','HRC':'Hot Rolled','HRPO':'Hot Rolled','HRP':'Hot Rolled',
    'CR':'Cold Rolled','COLD ROLLED':'Cold Rolled','KALTGEWALZT':'Cold Rolled','KALTBAND':'Cold Rolled','LAMINE A FROID':'Cold Rolled','LAMINATO A FREDDO':'Cold Rolled','KOUDGEWALST':'Cold Rolled','CRC':'Cold Rolled',
    'HDG':'Hot-dip Galvanized (+Z/+GI)','GI':'Hot-dip Galvanized (+Z/+GI)','VERZINKT':'Hot-dip Galvanized (+Z/+GI)','FEUERVERZINKT':'Hot-dip Galvanized (+Z/+GI)','BANDVERZINKT':'Hot-dip Galvanized (+Z/+GI)','GALVANISE':'Hot-dip Galvanized (+Z/+GI)','ZINCATO':'Hot-dip Galvanized (+Z/+GI)','GALVANIZED':'Hot-dip Galvanized (+Z/+GI)','GALVANISED':'Hot-dip Galvanized (+Z/+GI)','GALVANIZED HOT DIP':'Hot-dip Galvanized (+Z/+GI)',
    'EG':'Electro-Galvanized (+ZE)','ELEKTROLYTISCH VERZINKT':'Electro-Galvanized (+ZE)','ELECTROGALVANIZED':'Electro-Galvanized (+ZE)','ELO':'Electro-Galvanized (+ZE)',
    'GA':'Galvannealed (+ZF/+GA)','GALVANNEALED':'Galvannealed (+ZF/+GA)',
    'ZM':'Hot-dip zinc magnesium (+ZM)','ZINC MAGNESIUM':'Hot-dip zinc magnesium (+ZM)','MAGNELIS':'Hot-dip zinc magnesium (+ZM)',
    'AZ':'Aluzinc (+AZ)','ALUZINC':'Aluzinc (+AZ)','GALVALUME':'Aluzinc (+AZ)','AS':'Aluminized (+AS/+AL)','ALUMINIZED':'Aluminized (+AS/+AL)','ALUSI':'Aluminized (+AS/+AL)','ZA':'Galfan (+ZA)','GALFAN':'Galfan (+ZA)',
    'PPGI':'Prepainted (PPGI)','PREPAINTED':'Prepainted (PPGI)','BANDBESCHICHTET':'Prepainted (PPGI)','PRELAQUE':'Prepainted (PPGI)','PREVERNICIATO':'Prepainted (PPGI)','COIL COATED':'Prepainted (PPGI)',
    'N':'Normalized (+N)','NORMALISIERT':'Normalized (+N)','NORMALIZED':'Normalized (+N)','QT':'Quenched and Tempered (+QT)','VERGUETET':'Quenched and Tempered (+QT)','M':'Thermomechanically Rolled (+M)','AR':'As Rolled (+AR)','A':'Soft Annealed (+A)','C':'Cold Drawn / Hard (+C)','LC':'Cold Drawn / Soft (+LC)','AT':'Solution Annealed (+AT)','PE':'Peeled (+PE)','U':'Untreated (+U)','FH':'Full Hard','FULL HARD':'Full Hard','CHEQUERED':'Chequered','TRAENENBLECH':'Chequered','RIFFELBLECH':'Chequered','LARMES':'Chequered','TEARDROP':'Teardrop pattern','METAL COATED':'Metal Coated','COATED':'Metal Coated',
  },
  surfaceProtections: {
    'PO':'Pickled and Oiled','P&O':'Pickled and Oiled','P+O':'Pickled and Oiled','P/O':'Pickled and Oiled','HRPO':'Pickled and Oiled','PICKLED AND OILED':'Pickled and Oiled','PICKLED & OILED':'Pickled and Oiled','PICKLED OILED':'Pickled and Oiled','GEBEIZT UND GEOELT':'Pickled and Oiled','GEBEIZT GEOELT':'Pickled and Oiled','GEBEIZT':'Pickled and Oiled','GEB GEOELT':'Pickled and Oiled','DECAPE HUILE':'Pickled and Oiled','DECAPE ET HUILE':'Pickled and Oiled','DECAPATO E OLIATO':'Pickled and Oiled','DECAPATO OLIATO':'Pickled and Oiled','GEBEITST EN GEOLIED':'Pickled and Oiled','GEBEITST':'Pickled and Oiled','TRAWIONE OLEJOWANE':'Pickled and Oiled',
    'PICKLED':'Pickled','DECAPE':'Pickled','DECAPATO':'Pickled','PICKLED DRY':'Pickled','GEBEIZT TROCKEN':'Pickled',
    'OILED':'Oiled (O)','GEOELT':'Oiled (O)','GEF':'Oiled (O)','GEFETTET':'Oiled (O)','EINGEFETTET':'Oiled (O)','GEFETTET.':'Oiled (O)','GEOELT.':'Oiled (O)','GEÖLT':'Oiled (O)','FETT':'Oiled (O)','HUILE':'Oiled (O)','OLIATO':'Oiled (O)','GEOLIED':'Oiled (O)','OIL':'Oiled (O)','O':'Oiled (O)','LIGHTLY OILED':'Lightly Oiled (L)','LEICHT GEOELT':'Lightly Oiled (L)','L':'Lightly Oiled (L)',
    'DRY':'Dry','TROCKEN':'Dry','TR':'Dry','TROCK':'Dry','UNGEFETTET':'Dry','NICHT GEFETTET':'Dry','UNGEOELT.':'Dry','SEC':'Dry','SECCO':'Dry','UNGEOELT':'Dry','UNOILED':'Dry','NOT OILED':'Dry','DROOG':'Dry',
    'BLACK':'Black','SCHWARZ':'Black','NOIR':'Black','NERO':'Black','HR BLACK':'Black','UNPICKLED':'Black','UNGEBEIZT':'Black',
    'PASSIVATED':'Chemically passivated (C)','PASSIVIERT':'Chemically passivated (C)','CHROMATED':'Chemically passivated (C)','CHROMATIERT':'Chemically passivated (C)','C':'Chemically passivated (C)','CO':'Chemically passivated and oiled (CO)','PASSIVATED AND OILED':'Chemically passivated and oiled (CO)','PASSIVIERT UND GEOELT':'Chemically passivated and oiled (CO)',
    'PHOSPHATED':'Phosphated (P)','PHOSPHATIERT':'Phosphated (P)','P':'Phosphated (P)','PHOSPHATED AND OILED':'Phosphated and oiled (PO)',
    'AFP':'Anti-fingerprint (AFP)','ANTI FINGERPRINT':'Anti-fingerprint (AFP)','ANTIFINGERPRINT':'Anti-fingerprint (AFP)','SEALED':'Sealed (S)','S':'Sealed (S)','UNCOATED':'Uncoated','CHROMEFREE':'Passivated (Chromefree)','CHROME FREE':'Passivated (Chromefree)','CR FREE':'Passivated (Chromefree)','CR3':'Passivated (Chromefree)','CRIII':'Passivated (Chromefree)',
  },
  surfaceTypes: { 'MA':'Minimized spangle, conventional surface (MA)','MB':'Minimized spangle, improved surface (MB)','MC':'Minimized spangle, best surface (MC)','NA':'Normal spangle, conventional surface (NA)','RA':'Regular zinc-iron alloy coating, conventional surface (RA)','RB':'Regular zinc-iron alloy coating, improved surface (RB)','A':'Conventional surface (A)','B':'Improved surface (B)','C':'Best surface (C)','E':'Exposed (external parts) (E)','U':'Unexposed (intenal parts) (U)','MACE':'Minimized spangle, Conventional surface, Enhanced surface protection (MACE)','MBCE':'Minimized spangle, Improved surface, Enhanced surface protection (MBCE)','MINIMIZED SPANGLE':'Minimized spangle, conventional surface (MA)','NORMAL SPANGLE':'Normal spangle, conventional surface (NA)','MINIMIERTE BLUME':'Minimized spangle, conventional surface (MA)','NORMALE BLUME':'Normal spangle, conventional surface (NA)','EXPOSED':'Exposed (external parts) (E)','UNEXPOSED':'Unexposed (intenal parts) (U)','SICHTTEIL':'Exposed (external parts) (E)','AUSSENHAUT':'Exposed (external parts) (E)','INNENTEIL':'Unexposed (intenal parts) (U)' },
  forms: {
    'COIL':'Coils','COILS':'Coils','BUND':'Coils','BUNDE':'Coils','ROLLE':'Coils','ROLLEN':'Coils','BOBINE':'Coils','BOBINES':'Coils','ROTOLO':'Coils','ROTOLI':'Coils','NASTRO':'Coils','ROL':'Coils','ROLLEN':'Coils','KREGI':'Coils','KRAG':'Coils','CC':'Coils','HRC':'Coils','CRC':'Coils','WARMBAND':'Coils','KALTBAND':'Coils','BAND':'Coils','MASTER COIL':'Coils',
    'SLIT COIL':'Slit Coils','SLIT COILS':'Slit Coils','SPALTBAND':'Slit Coils','SPALTBAENDER':'Slit Coils','SLIT':'Slit Coils','REFENDU':'Slit Coils','NASTRINI':'Slit Coils','SPLITBAND':'Slit Coils','SLITTED':'Slit Coils',
    'STRIP':'Strips','STRIPS':'Strips','STREIFEN':'Strips','BANDSTAHL':'Strips','FEUILLARD':'Strips',
    'SHEET':'Sheets','SHEETS':'Sheets','TAFEL':'Sheets','TAFELN':'Sheets','BLECH':'Sheets','BLECHE':'Sheets','FEINBLECH':'Sheets','FEUILLE':'Sheets','FEUILLES':'Sheets','TOLE':'Sheets','TOLES':'Sheets','LAMIERA':'Sheets','LAMIERE':'Sheets','FOGLIO':'Sheets','PLAAT':'Sheets','PLATEN':'Sheets','ARKUSZ':'Sheets','ARKUSZE':'Sheets','BLANK':'Blanks','BLANKS':'Blanks','PLATINE':'Blanks','PLATINEN':'Blanks','ZUSCHNITT':'Blanks','ZUSCHNITTE':'Blanks','FLAN':'Blanks','FLANS':'Blanks',
    'PLATE':'Plates','PLATES':'Plates','GROBBLECH':'Heavy Plates','GROBBLECHE':'Heavy Plates','HEAVY PLATE':'Heavy Plates','HEAVY PLATES':'Heavy Plates','TOLE FORTE':'Heavy Plates','LAMIERA GROSSA':'Heavy Plates','QUARTO':'Heavy Plates','QUARTO PLATE':'Heavy Plates','CUT PLATE':'Cut Plates','CUT PLATES':'Cut Plates','OFFCUT':'Offcuts','OFFCUTS':'Offcuts','RESTE':'Offcuts','RESTPOSTEN':'Offcuts','ASSORTED':'Assorted Sheets','ASSORTED SHEETS':'Assorted Sheets',
    'ROUND BAR':'Round Bars','ROUND BARS':'Round Bars','RUNDSTAHL':'Round Bars','ROND':'Round Bars','TONDO':'Round Bars','FLAT BAR':'Flat Bars','FLAT BARS':'Flat Bars','FLACHSTAHL':'Flat Bars','PLAT':'Flat Bars','PIATTO':'Flat Bars','SQUARE BAR':'Square Bars','VIERKANT':'Square Bars','REBAR':'Rebars','REBARS':'Rebars','BETONSTAHL':'Rebars','WIRE ROD':'Wire Rods','WIRE RODS':'Wire Rods','WALZDRAHT':'Wire Rods','SLAB':'Slabs','SLABS':'Slabs','BRAMME':'Slabs','BRAMMEN':'Slabs','BILLET':'Square Billets','BILLETS':'Square Billets','KNUEPPEL':'Square Billets','BLOOM':'Blooms','BLOOMS':'Blooms','INGOT':'Ingots','INGOTS':'Ingots','SCRAP':'Scrap','SCHROTT':'Scrap','PROFILE':'Profiles','PROFILES':'Profiles','PROFIL':'Profiles','PROFILE':'Profiles','HEA':'H-Sections','HEB':'H-Sections','HEM':'H-Sections','IPE':'I-Sections','IPN':'I-Sections','UPN':'U-Sections','UPE':'U-Sections','L PROFILE':'L-Sections','ANGLE':'Equal Angles','WINKEL':'Equal Angles','TUBE':'Welded Round Tubes','TUBES':'Welded Round Tubes','ROHR':'Welded Round Tubes','ROHRE':'Welded Round Tubes','PIPE':'Welded Round Tubes','PIPES':'Welded Round Tubes','SEAMLESS':'Seamless Round Tubes','NAHTLOS':'Seamless Round Tubes','SQUARE TUBE':'Square Tubes','VIERKANTROHR':'Square Tubes','RHS':'Rectangular Hollow Section','SHS':'Square Hollow Section','CHS':'Welded Round Tubes','SHEET PILE':'Sheet Piles','SPUNDWAND':'Sheet Piles',
  },
  choices: {
    '1':'1st','1ST':'1st','I':'1st','1A':'1st','FIRST':'1st','FIRST CHOICE':'1st','1 WAHL':'1st','1.WAHL':'1st','1. WAHL':'1st','ERSTE WAHL':'1st','PRIME':'1st','PRIMA':'1st','1ER CHOIX':'1st','PRIMA SCELTA':'1st','1A SCELTA':'1st','EERSTE KEUZE':'1st','1 GATUNEK':'1st','I GATUNEK':'1st','PRIME QUALITY':'1st','1ST CHOICE':'1st','1. CHOICE':'1st','A':'1st',
    '2':'2nd','2ND':'2nd','II':'2nd','2A':'2nd','SECOND':'2nd','SECOND CHOICE':'2nd','2 WAHL':'2nd','2.WAHL':'2nd','2. WAHL':'2nd','ZWEITE WAHL':'2nd','SECONDARY':'2nd','SECONDS':'2nd','2EME CHOIX':'2nd','2E CHOIX':'2nd','SECONDA SCELTA':'2nd','2A SCELTA':'2nd','TWEEDE KEUZE':'2nd','2 GATUNEK':'2nd','II GATUNEK':'2nd','DECLASSE':'2nd','DECLASSED':'2nd','2ND CHOICE':'2nd','2. CHOICE':'2nd','B':'2nd','NON PRIME':'2nd','NON-PRIME':'2nd','EXCESS PRIME':'2nd',
    '3':'3rd','3RD':'3rd','III':'3rd','THIRD':'3rd','THIRD CHOICE':'3rd','3 WAHL':'3rd','3.WAHL':'3rd','3. WAHL':'3rd','DRITTE WAHL':'3rd','3EME CHOIX':'3rd','TERZA SCELTA':'3rd','3RD CHOICE':'3rd','C':'3rd',
    '4':'4th','4TH':'4th','IV':'4th','FOURTH':'4th','4 WAHL':'4th','4. WAHL':'4th','4TH CHOICE':'4th',
  },
  certs: { '3.1':'3.1','31':'3.1','EN 10204 3.1':'3.1','EN10204 3.1':'3.1','3.1 EN 10204':'3.1','APZ 3.1':'3.1','2.2':'2.2','22':'2.2','EN 10204 2.2':'2.2','2.2/3.1':'2.2 / 3.1','3.1/2.2':'2.2 / 3.1','NONE':'Not required','NO':'Not required','NOT REQUIRED':'Not required','WITHOUT':'Not required','OHNE':'Not required','OHNE ZEUGNIS':'Not required','NEIN':'Not required','SANS':'Not required','-':'Not required','NO CERT':'Not required','NO CERTIFICATE':'Not required' },
  coatings: { 'Z 100':'Z100' },
};
for (const list of Object.keys(VALUE_ALIASES)){ const o={}; for (const [k,v] of Object.entries(VALUE_ALIASES[list])){ o[normKey(k)]=v; o[normKey(norm(k))]=v; } VALUE_ALIASES[list]=o; }
const COATING_PREFIX_FINISH = { Z:'Hot-dip Galvanized (+Z/+GI)', GI:'Hot-dip Galvanized (+Z/+GI)', ZM:'Hot-dip zinc magnesium (+ZM)', ZA:'Galfan (+ZA)', ZE:'Electro-Galvanized (+ZE)', EG:'Electro-Galvanized (+ZE)', ZF:'Galvannealed (+ZF/+GA)', GA:'Galvannealed (+ZF/+GA)', AS:'Aluminized (+AS/+AL)', AZ:'Aluzinc (+AZ)', AZM:'Aluzinc (+AZ)', ZV:null };
const COATING_RE = /^(AZM|ZM|ZA|ZE|ZF|ZV|EG|GI|GA|AS|AZ|Z)\s?(\d{1,4}(?:[.,]\d)?(?:\/\d{1,4}(?:[.,]\d)?)?)\s*([A-Z\-]{0,6})$/;

/* matchCatalog(list, value, ctx) → {value, status:'exact'|'alias'|'inferred'|'unresolved', note, suggestion?} */
function matchCatalog(list, raw, ctx){
  if (isBlank(raw)) return { value:'', status:'empty' };
  const idx = ctx.catalogIndex[list]; const s = String(raw).trim().replace(/[.:;,]+$/,''); const k = normKey(s);
  const nk = normKey(norm(s));
  if (idx.map.has(k)) return { value: idx.map.get(k), status:'exact', note:'Exact catalog match' };
  if (idx.map.has(nk)) return { value: idx.map.get(nk), status:'exact', note:'Exact catalog match (normalized)' };
  // user/supplier approved aliases
  const ua = (ctx.valueAliases && ctx.valueAliases[list]) || {};
  if (ua[k]) return { value: ua[k].value||ua[k], status:'alias', note:`Approved alias "${s}" → "${ua[k].value||ua[k]}"${ua[k].supplier?' ('+ua[k].supplier+')':''}` };
  if (ua[nk]) return { value: ua[nk].value||ua[nk], status:'alias', note:`Approved alias "${s}"` };
  // catalog code in parentheses e.g. "(PO)" "+N"
  if (idx.codes.has(k.replace(/^\+/,''))) return { value: idx.codes.get(k.replace(/^\+/,'')), status:'alias', note:`Catalog code "${s}"` };
  // built-in aliases
  const ba = VALUE_ALIASES[list]||{};
  if (ba[k]) return { value: ba[k], status:'alias', note:`Built-in alias "${s}" → "${ba[k]}" — verify` };
  if (ba[nk]) return { value: ba[nk], status:'alias', note:`Built-in alias "${s}" → "${ba[nk]}" — verify` };
  // list-specific heuristics
  if (list==='grades'){
    const r = matchGradeTiered(k, idx); if (r) return r;
  }
  if (list==='coatings'){
    const m = k.match(COATING_RE);
    if (m){ const c = (m[1]+m[2]).replace(',','.'); if (idx.map.has(c)) return { value: idx.map.get(c), status: m[3]?'inferred':'exact', note: m[3]?`Coating "${c}" recognised; trailing "${m[3]}" not part of coating`:'Coating designation normalized', rest:m[3] }; }
    const z = k.replace(/^\+/,''); if (idx.map.has(z)) return { value: idx.map.get(z), status:'exact', note:'Leading "+" removed' };
    const zz = z.replace(/^Z0+(\d)/,'Z$1'); if (idx.map.has(zz)) return { value: idx.map.get(zz), status:'exact', note:'Leading zero removed' };
    if (m){ return { value:'', status:'unresolved', raw:s, note:`Coating "${s}" is structurally a ${m[1]} designation but not in the catalog`, coatingType:m[1], suggestions: coatingCandidates(m[1], m[2], idx) }; }
  }
  if (list==='choices'){ const m = k.match(/^(\d)(ST|ND|RD|TH)?\.?(CHOICE|WAHL|CHOIX|SCELTA|KEUZE|GATUNEK)?$/); if (m && ba[m[1]]) return { value: ba[m[1]], status:'alias', note:'Numeric choice' }; }
  if (list==='forms'){ const singular = k.replace(/S$/,''); for (const [a,v] of Object.entries(ba)) if (a===singular) return { value:v, status:'alias', note:`Built-in alias "${s}" → "${v}"` }; }
  // fuzzy: contained catalog name
  if (list!=='grades'){
    for (const [ck, cv] of idx.map){ if (ck.length>=4 && (k.includes(ck) || nk.includes(ck))) return { value: cv, status:'inferred', note:`"${s}" contains catalog value "${cv}" — verify` }; }
  }
  const sug = suggest(list, s, idx);
  return { value:'', status:'unresolved', note:`"${s}" is not in the ${list} catalog`, raw:s, suggestion: sug, suggestions: list==='grades' ? gradeSuggestions(s, idx) : (sug?[{ value:sug, matchType:'Similar catalog value — verify', note:'Name similarity' }]:[]) };
}

/* Grade matching tiers. Returns null when nothing in catalog relates. */
const KNOWN_SUFFIX_NOTES = { UC:'possibly "uncoated" (supplier convention) — verify', GI:'hot-dip galvanized — coating attribute, not a grade variant', EG:'electro-galvanized — coating attribute', ZE:'electro-galvanized — coating attribute', N:'normalized delivery condition (+N) — affects mechanical properties', M:'thermomechanically rolled (+M)', AR:'as rolled (+AR)', QT:'quenched & tempered (+QT) — affects properties', A:'soft annealed (+A)', C:'cold drawn (+C) — affects properties', LC:'cold drawn soft (+LC)', AT:'solution annealed (+AT)', U:'untreated (+U)', LCE:'low carbon equivalent variant — technically different grade', GA:'galvannealed — coating attribute', Z:'hot-dip zinc coating attribute', ZM:'zinc-magnesium coating attribute', AS:'aluminium-silicon coating attribute', AZ:'aluzinc coating attribute', H:'hollow section variant (EN 10210/10219) — product form, not a different steel', L:'low-temperature impact variant — technically different grade', W:'weathering steel variant — technically different grade', WP:'weathering steel variant — technically different grade' };
function matchGradeTiered(k, idx){
  const g0 = k.replace(/^EN\s?(10\d{3}\s?)?/,'').replace(/^(S|DD|DC|DX|HC|HX|HR|CR)\s+/,'$1');
  if (idx.map.has(g0)) return { value: idx.map.get(g0), status:'exact', note:'Exact match after removing standard prefix/spaces' };
  // progressively strip trailing segments separated by - + / or whitespace; keep the longest remainder that exists
  const parts = g0.split(/(?=[-+\/])/); // keeps separators at segment start
  for (let i=parts.length-1;i>=1;i--){
    const base = parts.slice(0,i).join(''); const suffix = parts.slice(i).join('').replace(/^[-+\/]/,'');
    if (idx.map.has(base)){
      const sufTokens = suffix.split(/[-+\/]/).filter(Boolean);
      const notes = sufTokens.map(t=>KNOWN_SUFFIX_NOTES[t] ? `${t}: ${KNOWN_SUFFIX_NOTES[t]}` : `${t}: unknown designation — verify whether it changes properties, delivery condition or coating`);
      const material = sufTokens.some(t=>/^(LCE|L|W|WP|N|QT|C|M)$/.test(t));
      return { value: idx.map.get(base), status:'base', note:`Base grade "${idx.map.get(base)}" recognised; additional designation "${suffix}" preserved (${notes.join('; ')})`, raw:k, suffix, suffixNotes:notes, materialRisk:material, matchType:'Base grade match with additional suffix' };
    }
  }
  // leading designation e.g. "DIN DX51D", "GRADE DX51D"
  const tail = g0.replace(/^(DIN|GRADE|QUALITY|EN|ASTM|JIS|SAE|AISI)\s*/,''); if (tail!==g0 && idx.map.has(tail)) return { value: idx.map.get(tail), status:'exact', note:'Standard prefix removed' };
  return null;
}
/* Closest same-type catalog coatings for an unknown designation (candidates only, never auto-applied) */
function coatingCandidates(type, massStr, idx){
  const nums = massStr.replace(',','.').split('/').map(Number); const total = nums.length===2 ? nums[0]+nums[1] : nums[0]; const sided = nums.length===2;
  const out=[];
  for (const [ck, cv] of idx.map){ const m = ck.match(COATING_RE); if (!m || m[1]!==type) continue; const n2 = m[2].split('/').map(Number); const t2 = n2.length===2 ? n2[0]+n2[1] : n2[0]; const s2 = n2.length===2;
    out.push({ value:cv, dist: Math.abs(t2-total) + (sided!==s2 ? 1000 : 0) + 0, sided:s2, total:t2 }); }
  out.sort((a,b)=>a.dist-b.dist);
  return out.slice(0,4).map(o=>({ value:o.value, matchType: o.sided===sided ? 'Closest same-type catalog designation — verify coating mass convention' : 'Same coating type, different mass convention (per-side vs total) — verify', note: sided ? `Supplier value is side-specific (${nums[0]}/${nums[1]} g/m² per side${nums[0]!==nums[1]?', asymmetric':''}); candidate ${o.value} is ${o.sided?`side-specific (${o.total} g/m² total)`:`${o.total} g/m² total`}` : `Supplier value ${total} g/m² total; candidate ${o.value} is ${o.sided?`side-specific (${o.total} g/m² total)`:`${o.total} g/m² total`}` }));
}
/* Similarity-based grade suggestions for the review panel (never auto-applied) */
function gradeSuggestions(raw, idx, n=4){
  const k = normKey(raw); const fam = k.match(/^([A-Z]+\d{2,4})/); const out=[];
  for (const [ck, cv] of idx.map){ if (!/^[A-Z0-9+\-\/. ]+$/.test(ck) || ck.length<3) continue; let sc = sim(k, ck); if (fam && ck.startsWith(fam[1])) sc += 0.15; if (sc>=0.6) out.push({ value:cv, score:Math.round(sc*100)/100 }); }
  return out.sort((a,b)=>b.score-a.score).slice(0,n).map(o=>({ value:o.value, matchType:'Similar catalog grade (string similarity only) — NOT a verified equivalent', note:`Name similarity ${o.score}` }));
}
function suggest(list, s, idx){
  const k = normKey(s); if (k.length<3) return null; let best=null, bs=0;
  for (const [ck, cv] of idx.map){ if (Math.abs(ck.length-k.length)>3) continue; const sc = sim(k,ck); if (sc>bs){ bs=sc; best=cv; } }
  return bs>=0.75 ? best : null;
}
function sim(a,b){ const la=a.length, lb=b.length; if(!la||!lb) return 0; const d=[]; for(let i=0;i<=la;i++){d[i]=[i];} for(let j=1;j<=lb;j++){d[0][j]=j;} for(let i=1;i<=la;i++)for(let j=1;j<=lb;j++){ d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); } return 1 - d[la][lb]/Math.max(la,lb); }

/* ---------- Combined material description parser ---------- */
function gradeFamilyFinish(grade){
  const g = normKey(grade);
  if (/^DX5\dD/.test(g) || /^HX\d{3}/.test(g) || /^S\d{3}GD/.test(g)) return { finish:'Metal Coated', note:'EN 10346 hot-dip coated family' };
  if (/^DC0\d/.test(g) || /^HC\d{3}/.test(g) || /^DC0\dE[KD]/.test(g)) return { finish:'Cold Rolled', note:'EN 10130/10268 cold rolled family' };
  if (/^DD1\d/.test(g) || /^S\d{3}MC/.test(g) || /^S\d{3}NC/.test(g) || /^HR\d{3}/.test(g)) return { finish:'Hot Rolled', note:'EN 10111/10149 hot rolled family' };
  return null;
}
/* Returns extracted fields with per-field provenance. Never invents values: unknown tokens → unresolved[] */
function parseDescription(text, ctx){
  const res = { fields:{}, prov:{}, unresolved:[], notes:[] };
  if (isBlank(text)) return res;
  let s = String(text).replace(/\u00d7/g,'x').replace(/[*×]/g,'x').replace(/\s+/g,' ').trim();
  const setF = (f, v, status, note) => { if (isBlank(v) || res.fields[f]!=null) return; res.fields[f]=v; res.prov[f]={ status, note }; };
  // supplier code rules that act on description tokens are applied by the rule engine; here: deterministic + catalog only
  // 1) dimensions: patterns like 0,5 x 1250 x 2500 / 3,0x1500 / 1250 x 0,5
  const dimRe = /(\d+(?:[.,]\d+)?)\s*(mm|m|cm)?\s*x\s*(\d+(?:[.,]\d+)?)\s*(mm|m|cm)?(?:\s*x\s*(\d+(?:[.,]\d+)?)\s*(mm|m|cm)?)?/i;
  const dm = s.match(dimRe);
  if (dm){
    const nums = [dm[1],dm[3],dm[5]].filter(Boolean).map((v,i)=>{ const u=[dm[2],dm[4],dm[6]][i]; let n=parseNum(v).value; if(u&&u.toLowerCase()==='m') n*=1000; if(u&&u.toLowerCase()==='cm') n*=10; return n; });
    const hint = ctx.dimOrder; // e.g. ['Width (mm)','Thickness (mm)'] from approved rule
    if (hint && hint.length===nums.length){ nums.forEach((n,i)=>setF(hint[i], n, 'inferred', `Dimension #${i+1} of "${dm[0]}" assigned by approved dimension-order rule`)); }
    else {
      // magnitude heuristic: smallest → thickness, next → width, largest → length
      const sorted = nums.map((n,i)=>({n,i})).sort((a,b)=>a.n-b.n);
      if (nums.length===1){ res.unresolved.push({ token:dm[0], hint:'single dimension — which field?' }); }
      else {
        setF(F.thk, sorted[0].n, 'inferred', `Smallest value in "${dm[0]}" treated as thickness (magnitude heuristic) — verify`);
        setF(F.width, sorted[1].n, 'inferred', `Second value in "${dm[0]}" treated as width (magnitude heuristic) — verify`);
        if (sorted[2]) setF(F.length, sorted[2].n, 'inferred', `Largest value in "${dm[0]}" treated as length (magnitude heuristic) — verify`);
      }
    }
    s = s.replace(dm[0], ' ').replace(/\s+/g,' ').trim();
  }
  // 2) tokens
  const rawTokens = s.split(/[\s,;|]+/).map(x=>x.replace(/^[.:()\[\]"'-]+|[.:()\[\]"'-]+$/g,'')).filter(Boolean);
  const tokens = [];
  for (let t of rawTokens){ // split "DX51D+Z100" → DX51D, +Z100 ; keep "+N" attached as suffix candidate
    const parts = t.split(/(?=\+)/); for (const p of parts) if (p) tokens.push(p);
  }
  const consumed = new Set();
  // grade: first token matching catalog (try joining 2 tokens for "St 37-2 G" style)
  for (let i=0;i<tokens.length;i++){
    if (consumed.has(i)) continue;
    const t = tokens[i].replace(/^\+/,'');
    let m = matchCatalog('grades', t, ctx);
    if (m.status==='unresolved' && tokens[i+1]) { const m2 = matchCatalog('grades', t+' '+tokens[i+1].replace(/^\+/,''), ctx); if (m2.status!=='unresolved'){ m=m2; consumed.add(i+1);} }
    if (m.status!=='unresolved' && m.status!=='empty'){ setF(F.grade, m.value, m.status, m.note+` (from token "${tokens[i]}")`); if (m.status==='base') Object.assign(res.prov[F.grade], { raw:t, suffix:m.suffix, suffixNotes:m.suffixNotes, materialRisk:m.materialRisk, matchType:m.matchType }); consumed.add(i); break; }
  }
  if (!res.fields[F.grade]){ // record the most grade-like unresolved token with suggestions (partial extraction, never a failure)
    const cand = tokens.map((t,i)=>({t:t.replace(/^\+/,''),i})).filter(x=>!consumed.has(x.i) && /^[A-Z]{1,3}\d{2,4}[A-Z0-9+\-\/]*$/i.test(x.t) && !normKey(x.t).match(COATING_RE))[0];
    if (cand){ const mm = matchCatalog('grades', cand.t, ctx); res.prov[F.grade] = { status:'unresolved', raw:cand.t, note:mm.note, suggestions:mm.suggestions }; consumed.add(cand.i); }
  }
  // coating / finish / protection / choice / form tokens
  for (let i=0;i<tokens.length;i++){
    if (consumed.has(i)) continue;
    const tok = tokens[i]; const t = tok.replace(/^\+/,'');
    // coating designation (possibly with trailing surface code letters e.g. Z100MAC)
    const cm = normKey(t).match(COATING_RE);
    if (cm){ const c = matchCatalog('coatings', cm[1]+cm[2], ctx); const fin = COATING_PREFIX_FINISH[cm[1]];
        if (c.status==='unresolved'){ res.fields[F.coating]=''; res.prov[F.coating]={ status:'unresolved', raw:cm[1]+cm[2], note:c.note, suggestions:c.suggestions, coatingType:cm[1] }; consumed.add(i); if (fin) setF(F.finish, fin, 'inferred', `Inferred from coating prefix "${cm[1]}" (catalog finish code)`); if (cm[3]) res.unresolved.push({ token:cm[3], hint:'Code after coating — add a supplier rule' }); continue; }
        setF(F.coating, c.value, c.status, `${c.note} — coating designation "${t}"`); consumed.add(i);
        if (fin) setF(F.finish, fin, 'inferred', `Inferred from coating prefix "${cm[1]}" (catalog finish code)`);
        if (cm[3]) { const sug = decomposeSurfaceCode(cm[3], ctx); res.unresolved.push({ token:cm[3], hint: sug ? `Possible: Surface Type "${sug.stype}" + Surface Protection "${sug.sprot}" (catalog codes) — confirm or add a supplier rule` : 'Unknown surface/quality code — add a supplier rule', suggestion: sug }); }
        continue; }
    // "+N" style finish suffix / finish aliases
    const fm = matchCatalog('finishes', t, ctx);
    if (fm.status==='exact' || fm.status==='alias'){ setF(F.finish, fm.value, fm.status, fm.note+` (token "${tok}")`); consumed.add(i);
      // HRPO-style tokens also carry protection
      const pm = matchCatalog('surfaceProtections', t, ctx); if (pm.status==='alias'||pm.status==='exact') setF(F.sprot, pm.value, pm.status, pm.note+` (token "${tok}")`);
      continue; }
    const pm = matchCatalog('surfaceProtections', t, ctx);
    if (pm.status==='exact' || pm.status==='alias'){ setF(F.sprot, pm.value, pm.status, pm.note+` (token "${tok}")`); consumed.add(i); continue; }
    const chm = matchCatalog('choices', t, ctx);
    if (chm.status==='exact' || chm.status==='alias'){ setF(F.choice, chm.value, chm.status, chm.note+` (token "${tok}")`); consumed.add(i); continue; }
    const fo = matchCatalog('forms', t, ctx);
    if (fo.status==='exact' || fo.status==='alias'){ setF(F.form, fo.value, fo.status, fo.note+` (token "${tok}")`); consumed.add(i); continue; }
    const st = matchCatalog('surfaceTypes', t, ctx);
    if ((st.status==='exact' || st.status==='alias') && t.length>1){ setF(F.stype, st.value, st.status, st.note+` (token "${tok}")`); consumed.add(i); continue; }
    // multi-word phrases: try joining with next token (e.g. "gebeizt und geölt", "2. Wahl", "first choice")
    if (tokens[i+1]){
      const two = t+' '+tokens[i+1], three = tokens[i+2] ? two+' '+tokens[i+2] : null;
      for (const phrase of [three,two].filter(Boolean)){
        const n = phrase.split(' ').length;
        for (const [list, field] of [['surfaceProtections',F.sprot],['finishes',F.finish],['choices',F.choice],['forms',F.form],['surfaceTypes',F.stype]]){
          const mm = matchCatalog(list, phrase, ctx); if (mm.status==='exact'||mm.status==='alias'){ setF(field, mm.value, mm.status, mm.note+` (phrase "${phrase}")`); for(let k=0;k<n;k++) consumed.add(i+k); break; }
        }
        if (consumed.has(i)) break;
      }
      if (consumed.has(i)) continue;
    }
    // thickness/width with explicit unit e.g. "0,5mm" "1250mm" "25t" "25 to"
    const um = t.match(/^(\d+(?:[.,]\d+)?)(mm|t|to|kg)$/i);
    if (um){ const n = parseNum(um[1]).value; const u=um[2].toLowerCase(); if (u==='mm'){ if (n<30 && res.fields[F.thk]==null) setF(F.thk,n,'inferred',`"${t}" small mm value treated as thickness — verify`); else if (res.fields[F.width]==null) setF(F.width,n,'inferred',`"${t}" mm value treated as width — verify`); consumed.add(i); continue; } if (u==='t'||u==='to'){ setF(F.weight, n*1000, 'inferred', `"${t}" tonnes → kg`); consumed.add(i); continue; } if (u==='kg'){ setF(F.weight, n, 'inferred', `"${t}" kg`); consumed.add(i); continue; } }
    const tm = t.match(/^(\d+(?:[.,]\d+)?)$/) && tokens[i+1] && /^(t|to|tons?|tonnen|kg|mm|pcs|stk|coils?)$/i.test(tokens[i+1]);
    if (tm){ const n=parseNum(t).value; const u=tokens[i+1].toLowerCase(); if(/^(t|to|tons?|tonnen)$/.test(u)) setF(F.weight,n*1000,'inferred',`"${t} ${u}" tonnes → kg`); else if(u==='kg') setF(F.weight,n,'inferred',`"${t} kg"`); else if(u==='mm'){ if(n<30) setF(F.thk,n,'inferred',`"${t} mm" treated as thickness — verify`); else setF(F.width,n,'inferred',`"${t} mm" treated as width — verify`);} else setF(F.qty,n,'inferred',`"${t} ${u}"`); consumed.add(i); consumed.add(i+1); continue; }
    if (/^(and|und|et|e|en|the|mm|x|-|–|of|in|with|mit|avec|con)$/i.test(t)) { consumed.add(i); continue; }
  }
  // grade-family finish fallback (only when nothing established finish)
  if (!ctx.noFamily && res.fields[F.grade] && !res.fields[F.finish]){ const gf = gradeFamilyFinish(res.fields[F.grade]); if (gf) setF(F.finish, gf.finish, 'inferred', `Inferred from grade family (${gf.note}) — verify`); }
  for (let i=0;i<tokens.length;i++) if (!consumed.has(i) && tokens[i].length>1 && !/^\d+$/.test(tokens[i])){ const tk=tokens[i].replace(/^\+/,''); const sug = /^[A-Z]{2,5}$/.test(tk) ? decomposeSurfaceCode(tk, ctx) : null; res.unresolved.push({ token: tk, hint: sug ? `Possible: Surface Type "${sug.stype}"${sug.sprot?` + Surface Protection "${sug.sprot}"`:''} (catalog codes) — confirm or add a supplier rule` : 'Unrecognised token — not in catalog or aliases', suggestion: sug }); }
  return res;
}
/* Try to decompose e.g. "MAC" into surface type code + protection code using catalog parentheses codes. Suggestion only. */
function decomposeSurfaceCode(code, ctx){
  const st = ctx.catalogIndex.surfaceTypes.codes, sp = ctx.catalogIndex.surfaceProtections.codes; const k = normKey(code);
  if (st.has(k)) return { stype: st.get(k), sprot: null };
  for (let i=k.length-1;i>=1;i--){ const a=k.slice(0,i), b=k.slice(i); if (st.has(a) && sp.has(b)) return { stype: st.get(a), sprot: sp.get(b) }; }
  return null;
}

/* ---------- Sheet analysis ---------- */
function analyzeSheet(aoa, opts={}){
  const rows = aoa.map(r => (r||[]).map(c => c instanceof Date ? c.toISOString().slice(0,10) : c));
  const notes=[]; const nonEmpty = r => r.filter(c=>!isBlank(c)).length;
  let headerRow = opts.headerRow;
  if (headerRow==null){
    let best=-1, bestScore=-1;
    for (let i=0;i<Math.min(rows.length,40);i++){
      const r=rows[i]; const ne=nonEmpty(r); if (ne<2) continue;
      const strs = r.filter(c=>typeof c==='string' && isNaN(parseFloat(c))).length;
      const aliasHits = r.filter(c=>!isBlank(c) && headerCandidates(c, opts.ctx).length).length;
      const below = rows[i+1] ? nonEmpty(rows[i+1]) : 0;
      const score = strs*1 + aliasHits*3 + (below>=2?2:0) - (ne>=2 && strs===0 ? 5 : 0);
      if (score>bestScore){ bestScore=score; best=i; }
    }
    headerRow = best<0 ? 0 : best;
  }
  if (headerRow>0) notes.push(`Table starts at row ${headerRow+1} (${headerRow} row(s) above it ignored)`);
  const hdr = rows[headerRow]||[];
  const maxCols = Math.max(hdr.length, ...rows.slice(headerRow, headerRow+50).map(r=>r.length));
  const headers = []; for (let c=0;c<maxCols;c++){ let h = hdr[c]; headers.push(isBlank(h) ? `Column ${colLetter(c)}` : String(h).trim()); }
  const data=[]; let empty=0, repeated=0, subtotal=0;
  const hdrKey = headers.join('|').toLowerCase();
  for (let i=headerRow+1;i<rows.length;i++){
    const r=rows[i]; const ne=nonEmpty(r);
    if (ne===0){ empty++; continue; }
    if (r.map(c=>isBlank(c)?'':String(c).trim()).join('|').toLowerCase()===hdrKey.replace(/column [a-z]+/g,'')) { repeated++; continue; }
    const first = String(r.find(c=>!isBlank(c))||'').toLowerCase();
    if (/^(total|summe|gesamt|sum|totale|subtotal|zwischensumme|gesamtgewicht|tot\.?)\b/.test(first) && ne<=3) { subtotal++; data.push({ srcRow:i+1, cells:r, excluded:'Summary/subtotal row' }); continue; }
    data.push({ srcRow:i+1, cells:r });
  }
  if (repeated) notes.push(`${repeated} repeated header row(s) skipped`);
  if (subtotal) notes.push(`${subtotal} summary/subtotal row(s) detected and excluded`);
  if (empty) notes.push(`${empty} empty row(s) skipped`);
  const columns = headers.map((h,c)=>{
    const vals = data.filter(d=>!d.excluded).map(d=>d.cells[c]).filter(v=>!isBlank(v));
    const samples = vals.slice(0,5);
    const nums = vals.filter(v=>parseNum(v).ok).length;
    const type = !vals.length ? 'empty' : nums/vals.length>0.8 ? 'number' : nums>0 ? 'mixed' : 'text';
    return { idx:c, header:h, samples, type, fill: data.length? vals.length/data.length : 0, locale: detectLocale(vals.map(String)), unit: detectUnitInHeader(h), count: vals.length };
  });
  const blankCols = columns.filter(c=>c.type==='empty').length; if (blankCols) notes.push(`${blankCols} empty column(s)`);
  // sheet-level locale: strong column evidence, else European header language, else supplier locale
  const strong = columns.map(c=>c.locale).filter(x=>x && !x.endsWith('?')); let sheetLocale = strong.filter(x=>x==='eu').length>strong.filter(x=>x==='us').length ? 'eu' : strong.length ? 'us' : null;
  if (!sheetLocale){ const euHdr = headers.some(h=>/breite|dicke|staerke|laenge|gewicht|guete|stueck|wahl|largeur|epaisseur|longueur|poids|larghezza|spessore|lunghezza|dikte|breedte|lengte|espesor|grubosc|szerokosc/.test(norm(h))); if (euHdr) sheetLocale='eu'; }
  if (opts.ctx && opts.ctx.forceLocale) { sheetLocale = opts.ctx.forceLocale; for (const c of columns) c.locale = sheetLocale; notes.push('Number format set manually'); }
  if (!sheetLocale && opts.ctx && opts.ctx.supplierLocale) sheetLocale = opts.ctx.supplierLocale;
  if (sheetLocale) { notes.push(`Number locale: ${sheetLocale==='eu'?'European (decimal comma)':'decimal point'}`); for (const c of columns) if (!c.locale || c.locale.endsWith('?')) c.locale = sheetLocale; }
  else for (const c of columns) if (c.locale && c.locale.endsWith('?')) c.locale = c.locale.slice(0,-1);
  return { headerRow, headers, data, columns, notes, sheetLocale, totalRows: rows.length, dataRows: data.filter(d=>!d.excluded).length, excludedRows: data.filter(d=>d.excluded).length };
}
function colLetter(c){ let s=''; c++; while(c>0){ const m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26);} return s; }


/* Article ID candidate analysis: explicit identifier headers first, then uniqueness; charge/heat numbers are batch ids (flagged) */
function articleCandidates(analysis){
  const n = analysis.data.filter(d=>!d.excluded).length; const out=[];
  for (const col of analysis.columns){
    const h = norm(col.header); if (col.type==='empty') continue;
    const explicit = /artikel|article|material ?n|material ?nr|materialnummer|item ?n|sku|position ?id|pos ?id|coil ?id|coil ?n|coil ?nr|coilnr|bund ?nr|bundnr|supplier ?material|reference|ref ?no|ident|id$/.test(h);
    const batch = /charge|heat|schmelze|lot|batch|colada|coulee/.test(h);
    const vals = analysis.data.filter(d=>!d.excluded).map(d=>d.cells[col.idx]).filter(v=>!isBlank(v)).map(String);
    if (!vals.length) continue; const uniq = new Set(vals).size; const uniqueness = uniq/vals.length; const fill = vals.length/n;
    const numericSmall = vals.every(v=>/^-?\d+([.,]\d+)?$/.test(v)) && vals.every(v=>parseFloat(v.replace(',','.'))<100000) && !explicit; // dims/weights/prices look like this
    const idLike = vals.filter(v=>/^[A-Z0-9][A-Z0-9\-_\/.]{3,}$/i.test(v)).length/vals.length;
    if (!explicit && !batch && (idLike<0.8 || numericSmall)) continue;
    let score = (explicit?3:0) + (batch?1:0) + uniqueness*2 + fill + (idLike>=0.8?0.5:0);
    const notes=[]; if (explicit) notes.push('explicit identifier header'); if (batch) notes.push('charge/heat/lot header — identifies a production batch, not necessarily one position'); if (uniqueness<1) notes.push(`${vals.length-uniq} repeated value(s)`); if (fill<1) notes.push(`${Math.round(100*fill)}% filled`);
    out.push({ colIdx:col.idx, header:col.header, score, uniqueness, fill, batch, explicit, note:notes.join('; ')||'unique alphanumeric values' });
  }
  return out.sort((a,b)=>b.score-a.score);
}

/* ---------- Mapping proposal ---------- */
function proposeMapping(analysis, ctx){
  const used = new Set();
  const arts = articleCandidates(analysis); const bestArt = arts[0];
  const maps = analysis.columns.map(col=>{
    const m = { colIdx: col.idx, header: col.header, target:'__ignore__', transform:'none', confidence:'Low', reason:'No match — review', unit: col.unit, locale: col.locale, samples: col.samples, type: col.type };
    if (col.type==='empty'){ m.reason='Empty column'; return m; }
    const cands = headerCandidates(col.header, ctx);
    let pick = cands.find(c=>!used.has(c.target)) || cands[0];
    // sample-content based detection when header unknown
    if (!pick && col.type==='text'){
      const hits = col.samples.filter(s=>{ const p=parseDescription(s, ctx); return p.fields[F.grade] && Object.keys(p.fields).length>=2; }).length;
      if (hits>=Math.ceil(col.samples.length/2)) pick = { target:'__split__', confidence:'Medium', reason:'Sample values look like combined material descriptions (grade + attributes)' };
      else { const g = col.samples.filter(s=>matchCatalog('grades', s, ctx).status==='exact').length; if (g>=Math.ceil(col.samples.length/2)) pick={ target:F.grade, confidence:'Medium', reason:'Sample values match catalog grades' }; }
      if (!pick){ const c = col.samples.filter(s=>matchCatalog('coatings', s, ctx).status!=='unresolved').length; if (c>=Math.ceil(col.samples.length/2)) pick={ target:F.coating, confidence:'Medium', reason:'Sample values match catalog coatings' }; }
      if (!pick){ const c = col.samples.filter(s=>matchCatalog('choices', s, ctx).status!=='unresolved').length; if (c>=Math.ceil(col.samples.length/2)) pick={ target:F.choice, confidence:'Medium', reason:'Sample values look like choice classes' }; }
    }
    if (!pick) return m;
    if (pick.target===F.article && used.has(F.article)) pick = cands.find(c=>!used.has(c.target)) || pick;
    used.add(pick.target);
    m.target = pick.target; m.confidence = pick.confidence; m.reason = pick.reason;
    if (pick.target===F.desc && col.type==='text'){ // description col might be a combined spec
      const hits = col.samples.filter(s=>{ const p=parseDescription(s, ctx); return p.fields[F.grade]!=null; }).length;
      if (hits>=Math.ceil(col.samples.length/2)) { m.target='__split__'; m.reason += '; sample values contain recognisable grades → split into fields'; }
    }
    const tdef = T[m.target];
    if (tdef && tdef.type==='num'){ const u = suggestUnitTransform(m.target, col.unit, col.samples, col.locale); m.transform=u.t; if (u.reason) m.reason += '; '+u.reason; if (u.conf==='Medium' && m.confidence==='High') m.confidence='Medium'; if (col.locale==='eu') m.reason+='; decimal comma → point'; }
    else if (tdef && tdef.type==='catalog'){ m.transform='catalog'; if (m.target===F.grade) m.transform='grade_split'; }
    else if (m.target==='__split__'){ m.transform='split_desc'; }
    else m.transform='text';
    return m;
  });
  // Article ID: prefer the best identifier candidate; demote others mapped to Article ID; never fabricate
  for (const m of maps){ if (m.target===F.article && bestArt && m.colIdx!==bestArt.colIdx) { const c = arts.find(a=>a.colIdx===m.colIdx); m.target = F.comments; m.transform='text'; m.confidence='Medium'; m.reason = c && c.batch ? 'Charge/heat number — batch identifier, kept in Comments not Article ID ('+c.note+')' : 'Secondary identifier — kept in Comments; "'+bestArt.header+'" is the Article ID candidate'; } }
  if (bestArt){ const m = maps.find(x=>x.colIdx===bestArt.colIdx); if (m && (m.target==='__ignore__' || m.target===F.article || m.target===F.comments || m.target===F.desc)) { if (m.target!==F.article) { m.target=F.article; m.transform='text'; } m.confidence = bestArt.explicit && bestArt.uniqueness===1 ? 'High' : 'Medium'; m.reason = `Best Article ID candidate: ${bestArt.note} (uniqueness ${Math.round(bestArt.uniqueness*100)}%)`; m.articleCandidates = arts.slice(0,4).map(a=>({header:a.header,note:a.note,uniqueness:a.uniqueness})); } }
  if (!bestArt) { const m = maps.find(x=>x.target===F.article); if (m) { m.confidence='Low'; m.reason+='; no strong identifier evidence — Article ID stays blank if rejected'; } }
  return maps;
}

/* ---------- Transformation ---------- */
function newRow(id, sheet, srcRow, raw){ return { id, sheet, srcRow, raw, fields: Object.fromEntries(FIELDS.map(f=>[f,''])), prov:{}, issues:[], unresolved:[], status:'review', excluded:null, edited:{}, dupKey:null, dupOf:[] }; }
function setField(row, f, v, prov){ row.fields[f] = v==null?'':v; row.prov[f] = prov; }

function transformSheet(analysis, mapping, ctx, sheetName, startId){
  const rows=[]; let id = startId||1;
  const defaults = ctx.defaults || {};
  for (const d of analysis.data){
    const raw = {}; analysis.headers.forEach((h,c)=>{ raw[h] = d.cells[c]; });
    const row = newRow(id++, sheetName, d.srcRow, raw);
    if (d.excluded){ row.excluded = { reason: d.excluded, auto:true }; rows.push(row); continue; }
    // direct mappings first
    const splits = [];
    for (const m of mapping){
      if (m.target==='__ignore__') continue;
      const v = d.cells[m.colIdx]; if (isBlank(v)) continue;
      if (m.target==='__split__'){ splits.push({ m, v }); continue; }
      const tdef = T[m.target]; const src = `column "${m.header}"`;
      if (tdef.type==='num'){
        const p = parseNum(v, m.locale); if (!p.ok){ setField(row, m.target, '', { status:'unresolved', src:m.header, raw:v, note:`Could not parse "${v}" as a number` }); continue; }
        const f = UNIT_FACTORS[m.transform]||1; const val = round(p.value*f);
        if (p.ambiguous) row.unresolved.push({ token:String(v), src:m.header, hint:`Ambiguous number format "${v}" — interpreted as ${val}; set the supplier number locale or correct the value` });
        setField(row, m.target, val, { status: p.ambiguous?'inferred':'source', src:m.header, raw:v, note:`${m.target.split(' (')[0]} = ${val} because ${src} contains "${v}"${m.transform!=='none'?` and the approved conversion is ${describeTransform(m.transform)}`:''}${p.note?` (${p.note})`:''}` });
      } else if (tdef.type==='catalog'){
        if (m.target===F.grade){
          // grade column may contain "DX51D+Z100" or "S235JR+N"
          const p = parseDescription(v, { ...ctx, noFamily:true });
          if (p.fields[F.grade]) setField(row, F.grade, p.fields[F.grade], { ...p.prov[F.grade], src:m.header, raw:v });
          else { const mm = matchCatalog('grades', v, ctx); setField(row, F.grade, mm.value, { status:mm.status, src:m.header, raw:v, note:mm.note, suggestion:mm.suggestion, suggestions: mm.suggestions || (p.prov[F.grade]&&p.prov[F.grade].suggestions) }); }
          if (p.prov[F.coating] && p.prov[F.coating].status==='unresolved' && isBlank(row.fields[F.coating])) row.prov[F.coating] = { ...p.prov[F.coating], src:m.header };
          for (const f of [F.coating, F.finish, F.sprot, F.stype, F.choice]) if (p.fields[f] && isBlank(row.fields[f]) && !mapping.some(x=>x.target===f && !isBlank(d.cells[x.colIdx]))) setField(row, f, p.fields[f], { status:p.prov[f].status, src:m.header, raw:v, note:p.prov[f].note+' (split from grade column)' });
          for (const u of p.unresolved) row.unresolved.push({ ...u, src:m.header });
        } else {
          let mm = matchCatalog(tdef.list, v, ctx); let target = m.target;
          if (mm.status==='unresolved' && [F.stype, F.sprot, F.finish].includes(m.target)){
            for (const [alt, altList] of [[F.sprot,'surfaceProtections'],[F.finish,'finishes'],[F.stype,'surfaceTypes']]){ if (alt===m.target || !isBlank(row.fields[alt])) continue; const m2 = matchCatalog(altList, v, ctx); if (m2.status==='exact'||m2.status==='alias'){ mm = { ...m2, note:`${m2.note} — value belongs to ${alt}, placed there from column "${m.header}"` }; target = alt; break; } }
          }
          if (target!==m.target) { setField(row, target, mm.value, { status:'alias', src:m.header, raw:v, note:mm.note }); continue; }
          setField(row, m.target, mm.value, { status:mm.status, src:m.header, raw:v, note:mm.note, suggestion:mm.suggestion });
          if (m.target===F.coating && mm.rest){ const sug = decomposeSurfaceCode(mm.rest, ctx); row.unresolved.push({ token:mm.rest, src:m.header, hint: sug?`Possible: Surface Type "${sug.stype}"${sug.sprot?` + Surface Protection "${sug.sprot}"`:''} (catalog codes) — confirm or add a supplier rule`:'Unknown code after coating — add a supplier rule', suggestion:sug }); }
          if (m.target===F.coating && mm.value && isBlank(row.fields[F.finish]) && !mapping.some(x=>x.target===F.finish)){ const pre = normKey(mm.value).match(/^(AZM|ZM|ZA|ZE|ZF|EG|GI|GA|AS|AZ|Z)/); const fin = pre && COATING_PREFIX_FINISH[pre[1]]; if (fin) setField(row, F.finish, fin, { status:'inferred', src:m.header, raw:v, note:`Inferred from coating prefix "${pre[1]}" (catalog finish code)` }); }
        }
      } else { setField(row, m.target, sanitizeText(v), { status:'source', src:m.header, raw:v, note:`Copied from ${src}` });
        if ((m.target===F.comments || m.target===F.desc) && /[a-zA-Z]{3,}/.test(String(v))){ const p = parseDescription(v, { ...ctx, noFamily:true }); for (const f of [F.sprot, F.finish, F.choice, F.stype, F.form, F.coating]) if (p.fields[f] && isBlank(row.fields[f]) && !mapping.some(x=>x.target===f && !isBlank(d.cells[x.colIdx]))) setField(row, f, p.fields[f], { status:'inferred', src:m.header, raw:v, note:`${p.prov[f].note} — found in ${src}, verify` }); } }
    }
    // combined description splits (fill only blank fields)
    for (const { m, v } of splits){
      const p = parseDescription(v, ctx);
      for (const [f, val] of Object.entries(p.fields)) if (isBlank(row.fields[f])) setField(row, f, val, { ...p.prov[f], src:m.header, raw:v });
      for (const f of [F.grade, F.coating]) if (p.prov[f] && p.prov[f].status==='unresolved' && isBlank(row.fields[f]) && !(row.prov[f] && row.prov[f].status!=='unresolved')) row.prov[f] = { ...p.prov[f], src:m.header };
      for (const u of p.unresolved) row.unresolved.push({ ...u, src:m.header });
      if (ctx.copyDescription!==false && isBlank(row.fields[F.desc])) setField(row, F.desc, sanitizeText(v), { status:'source', src:m.header, raw:v, note:'Raw description preserved for traceability' });
    }
    // defaults
    for (const [f, val] of Object.entries(defaults)) if (!isBlank(val) && isBlank(row.fields[f])) setField(row, f, val, { status:'default', note:`Default value set in Mapping Studio` });
    // form classification (refine generic coil/sheet or fill blank) — never overrides a specific mapped/default form
    { const hintRaw = mapping.filter(x=>x.target===F.form||x.target==='__split__'||x.target===F.desc).map(x=>d.cells[x.colIdx]).filter(v=>!isBlank(v)).join(' ');
      const cur = row.fields[F.form]; const curProv = row.prov[F.form]||{};
      const refinable = isBlank(cur) || (['Coils','Sheets','Plates'].includes(cur) && ['alias','inferred','default'].includes(curProv.status));
      if (refinable){ const cf = classifyForm(row.fields, hintRaw + ' ' + (cur||'')); if (cf && cf.form!==cur){ if (cf.status==='review' && !isBlank(cur)) { row.prov[F.form] = { ...curProv, formHint:cf }; row.unresolved.push({ token:'form', src:'dimensions', hint:cf.note+` (classifier suggests ${cf.form})`, formSuggestion:cf.form }); } else setField(row, F.form, cf.form, { status: cf.status==='review'?'inferred':cf.status, src:'dimensions', raw:cur||hintRaw||'', note:`Form classification rule: ${cf.note}${cur?` (source said "${cur}")`:''}`, rule:'form-classifier' }); if (cf.status==='review' && isBlank(cur)) row.unresolved.push({ token:'form', src:'dimensions', hint:cf.note }); } } }
    // grade-family finish if still blank
    if (row.fields[F.grade] && isBlank(row.fields[F.finish])){ const gf = gradeFamilyFinish(row.fields[F.grade]); if (gf) setField(row, F.finish, gf.finish, { status:'inferred', note:`Inferred from grade family (${gf.note}) — verify` }); }
    rows.push(row);
  }
  return rows;
}
function round(n){ return Math.round(n*10000)/10000; }
function describeTransform(t){ return { m_to_mm:'m × 1000', cm_to_mm:'cm × 10', inch_to_mm:'inch × 25.4', t_to_kg:'t × 1000', g_to_kg:'g ÷ 1000', none:'none' }[t]||t; }
function sanitizeText(v){ let s=String(v).trim(); if (/^[=+\-@\t\r]/.test(s)) s = "'"+s; return s; }

/* ---------- Rules ---------- */
/* rule = { id, text, scope:'upload'|'supplier'|'global', supplier, sheet, when:{ field, op:'equals'|'contains'|'empty'|'zero'|'any', value }, then:[{field,value}] | action:'exclude'|'dimorder', dims:[...], status:'active'|'disabled'|'pending', origin:'user'|'learned'|'ai', uses:0 } */
function ruleMatches(rule, row){
  const w = rule.when; if (!w || w.op==='any') return true;
  let v;
  if (w.field && w.field.startsWith('src:')) v = row.raw[w.field.slice(4)];
  else if (w.field==='src:*') v = Object.values(row.raw).join(' ');
  else if (w.field && w.field.startsWith('tgt:')) v = row.fields[w.field.slice(4)];
  else v = Object.values(row.raw).join(' ');
  const sv = isBlank(v)?'':String(v).trim();
  const val = String(w.value==null?'':w.value).trim();
  switch (w.op){
    case 'equals': return normKey(sv)===normKey(val);
    case 'contains': return normKey(sv).includes(normKey(val)) || new RegExp('(^|[^A-Z0-9])'+escRe(normKey(val))+'([^A-Z0-9]|$)').test(normKey(sv.replace(/\s+/g,' ')));
    case 'token': { const nv = normKey(val).replace(/[.:]+$/,''); const toks = sv.toUpperCase().replace(/[+/,;|x×*]/g,' ').split(/\s+/).map(x=>x.replace(/[.:]+$/,'').replace(/\s/g,'')); return toks.includes(nv) || toks.includes(normKey(val)); }
    case 'empty': return sv==='';
    case 'zero': { const n=parseNum(sv).value; return sv==='' || n===0; }
    case 'gt': return (parseNum(sv).value??-Infinity) > parseNum(val).value;
    case 'lt': return (parseNum(sv).value??Infinity) < parseNum(val).value;
    default: return false;
  }
}
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function applyRule(rule, rows, ctx, { preview=false }={}){
  const affected=[];
  for (const row of rows){
    if (row.excluded) continue;
    if (rule.sheet && row.sheet!==rule.sheet) continue;
    if (!ruleMatches(rule, row)) continue;
    affected.push(row.id);
    if (preview) continue;
    if (rule.action==='exclude'){ row.excluded = { reason:`Rule: ${rule.text||ruleToText(rule)}`, rule:rule.id }; continue; }
    for (const th of rule.then||[]){
      if (th.onlyIfEmpty && !isBlank(row.fields[th.field])) continue;
      const tdef = T[th.field]; let val = th.value, status='rule';
      if (tdef && tdef.type==='catalog'){ const mm = matchCatalog(tdef.list, th.value, ctx); if (mm.status!=='unresolved' && mm.status!=='empty') val = mm.value; else status='unresolved'; }
      if (tdef && tdef.type==='num'){ const p = parseNum(th.value); val = p.ok ? p.value : th.value; }
      setField(row, th.field, val, { status, note:`Set by rule: ${rule.text||ruleToText(rule)}`, rule:rule.id, raw: row.prov[th.field]?.raw, src: row.prov[th.field]?.src });
    }
  }
  return affected;
}
function ruleToText(rule){
  const w = rule.when; const cond = !w||w.op==='any' ? 'for all rows' : `where ${w.field?.replace(/^(src|tgt):/,'')||'any field'} ${({equals:'=',contains:'contains',token:'has code',empty:'is empty',zero:'is zero/empty',gt:'>',lt:'<'})[w.op]} ${w.value??''}`.trim();
  const act = rule.action==='exclude' ? 'exclude row' : rule.action==='dimorder' ? `dimensions are ${rule.dims?.join(' × ')}` : (rule.then||[]).map(t=>`${t.field.split(' (')[0]} = ${t.value}${t.onlyIfEmpty?' (if empty)':''}`).join(', ');
  return `${act} ${cond}${rule.sheet?` (sheet "${rule.sheet}")`:''}`;
}
/* Local pattern-based instruction parser. Deterministic. Returns {rule} or {error, partial}. */
function parseInstruction(text, ctx){
  const t = text.trim().replace(/\s+/g,' '); const lower = t.toLowerCase();
  const sheetM = lower.match(/(?:only (?:apply|for|on|to) (?:this |the )?(?:mapping |rule )?(?:to |on |for )?sheet ["']?([^"'.]+?)["']?)(?:\.|$)/) || lower.match(/sheet ["']?([^"',.]+?)["']?(?:\s+only)/);
  let sheet = null; let t2 = t; if (sheetM){ const want = sheetM[1].trim(); sheet = (ctx.sheetNames||[]).find(s=>s.toLowerCase()===want) || (ctx.sheetNames||[]).find(s=>s.toLowerCase().includes(want)) || want; const i = lower.indexOf(sheetM[0]); if (i>=0) t2 = (t.slice(0,i)+' '+t.slice(i+sheetM[0].length)).replace(/\s+/g,' ').replace(/[.\s]+$/,'').trim(); }
  const srcCol = (name) => { const n0 = norm(name).trim(); const hdrs = ctx.sourceHeaders||[];
    const cl = n0.match(/^(?:the\s+)?(?:column|col|spalte)?\s*([a-z]{1,2})$/); if (cl){ const i = cl[1].toUpperCase().split('').reduce((a,c)=>a*26+(c.charCodeAt(0)-64),0)-1; if (hdrs[i]) return 'src:'+hdrs[i]; }
    const n = n0.replace(/^(the|column|field|source column|source)\s+/,'').trim();
    if (/^(supplier|file|list|listing|text|it|they|row|rows|line|lines|position|positions|material description|description|anywhere|any field|any column|cell|cells|entry|entries|the supplier|data)$/.test(n)) return 'src:*';
    let h = hdrs.find(x=>norm(x)===n); if (h) return 'src:'+h;
    const nw = n.split(' '); let best=null, bs=0;
    for (const x of hdrs){ const hw = norm(x).split(' '); const a = hw.filter(w=>nw.includes(w)).length/hw.length; const b = nw.filter(w=>hw.includes(w)).length/nw.length; let sc = a+b; if (hw.includes(nw[nw.length-1])) sc+=1; if (norm(x).includes(n)||n.includes(norm(x))) sc+=0.5; if (sc>bs){bs=sc;best=x;} }
    if (best && bs>=1) return 'src:'+best;
    const tf = targetField(n); if (tf) return 'tgt:'+tf; if (/material code|code|description|text|anywhere|any/.test(n)) return 'src:*'; return null; };
  const thenPairs = (s) => { const out=[]; const re=/(?:the\s+)?([a-z][a-z _()0-9.,]*?)\s+(?:as|to|=|is|should be|becomes)\s+["']?([^"',;]+?)["']?\s*(?=,|;|\band\b|$)/gi; let m; while((m=re.exec(s))){ const f=targetField(m[1]); if (f) out.push({ field:f, value:m[2].trim() }); } return out; };
  // A) conditional mapping
  let m = t2.match(/(?:where|wherever|when|if|whenever)\s+(?:the\s+)?(.+?)\s+(?:is|=|equals|contains|mentions|says|includes|reads|has)\s+["']?([^"',]+?)["']?\s*,?\s*(?:then\s+)?(?:please\s+)?(?:map|set|put|use|mark|assign|make)\s+(.+?)\.?$/i);
  if (m){ const field = srcCol(m[1]); const op = /contains|mentions|says|includes|reads|has/i.test(m[0].slice(m[1].length, m[0].indexOf(m[2]))) ? 'token' : 'equals'; const then = thenPairs(m[3]);
    if (!field) return { error:`Couldn't identify source column "${m[1]}"`, partial:{ then } };
    if (!then.length) return { error:`Couldn't identify target fields in "${m[3]}"` };
    return { rule:{ when:{ field, op, value:m[2].trim() }, then, sheet } }; }
  // A2) "map X as Y where/when Z is W"
  m = t2.match(/(?:map|set|mark|assign)\s+(.+?)\s+(?:where|wherever|when|if|whenever)\s+(?:the\s+)?(.+?)\s+(?:is|=|equals|contains|mentions|says|includes|has)\s+["']?([^"',.]+?)["']?\.?$/i);
  if (m){ const then=thenPairs(m[1]); const field=srcCol(m[2]); const op=/contains|mentions|says|includes|has/i.test(t)?'token':'equals'; if (field&&then.length) return { rule:{ when:{ field, op, value:m[3].trim() }, then, sheet } }; }
  // A3) "positions with X are all Y, map <field> as <value>" / "rows with X → map ..."
  m = t2.match(/(?:positions?|rows?|materials?|items?|lines?)\s+(?:with|containing|marked|that say|that contain)\s+["']?(.+?)["']?\s+(?:are|is|=|mean|means)\s+(?:all\s+)?(.+?)[,;.]?\s+(?:map|set|put)\s+(?:the\s+)?(.+?)\s+(?:as|to|=)\s+["']?(.+?)["']?\.?$/i);
  if (m){ const f=targetField(m[3]); if (f) return { rule:{ when:{ field:'src:*', op:'token', value:m[1].trim() }, then:[{ field:f, value:m[4].trim() }], sheet } }; }
  // A4) "X means Y" / "X = Y" / "X stands for Y" — field inferred from which catalog contains Y
  m = t2.match(/^["']?([^"'=]+?)["']?\s+(?:means|stands for|is|=|->|→|equals)\s+["']?([^"']+?)["']?\.?$/i);
  if (m){ for (const [list, field] of [['surfaceProtections',F.sprot],['finishes',F.finish],['forms',F.form],['choices',F.choice],['surfaceTypes',F.stype],['coatings',F.coating],['certs',F.certs]]){ const mm = matchCatalog(list, m[2].trim(), ctx); if (mm.status==='exact'||mm.status==='alias') return { rule:{ when:{ field:'src:*', op:'token', value:m[1].trim() }, then:[{ field, value:mm.value }], sheet } }; } }
  // B) default choice / default values for all rows
  m = t2.match(/(?:all|every|each)\s+(?:materials?|rows?|positions?|items?|lines?)\s+(?:in this (?:file|list|listing|sheet)\s+)?(?:are|is|should be|=)\s+(.+?)(?:\s+unless\s+(?:otherwise|stated|mentioned|specified).*)?\.?$/i);
  if (m){ const pairs = thenPairs('choice as '+m[1]); const ch = matchCatalog('choices', m[1].replace(/choice/i,'').trim(), ctx);
    if (ch.status!=='unresolved' && ch.status!=='empty') return { rule:{ when:{ op:'any' }, then:[{ field:F.choice, value:ch.value, onlyIfEmpty:/unless/i.test(t) }], sheet } };
    const fo = matchCatalog('forms', m[1], ctx); if (fo.status!=='unresolved'&&fo.status!=='empty') return { rule:{ when:{ op:'any' }, then:[{ field:F.form, value:fo.value, onlyIfEmpty:/unless/i.test(t) }], sheet } };
    const fi = matchCatalog('finishes', m[1], ctx); if (fi.status!=='unresolved'&&fi.status!=='empty') return { rule:{ when:{ op:'any' }, then:[{ field:F.finish, value:fi.value, onlyIfEmpty:/unless/i.test(t) }], sheet } };
    if (pairs.length) return { rule:{ when:{ op:'any' }, then:pairs, sheet } }; }
  m = t2.match(/^(?:set|make|put)\s+(.+?)\s+(?:for|on|in)\s+(?:all|every)\s+(?:rows?|materials?|positions?|lines?)\.?$/i);
  if (m){ const then=thenPairs(m[1]); if (then.length) return { rule:{ when:{ op:'any' }, then, sheet } }; }
  // C) exclude rows
  m = t2.match(/(?:ignore|exclude|skip|remove|drop|delete)\s+(?:all\s+)?(?:the\s+)?(?:rows?|lines?|positions?|materials?|items?)\s+(?:where|whose|with|if|when)\s+(?:the\s+)?(.+?)\s+(?:is|=|equals|are)\s+(zero|0|empty|blank|missing|null|[^.]+?)\.?$/i);
  if (m){ const field=srcCol(m[1]); if (!field) return { error:`Couldn't identify column "${m[1]}"` }; const v=m[2].toLowerCase(); const op = /^(zero|0)$/.test(v)?'zero':/^(empty|blank|missing|null)$/.test(v)?'empty':'equals'; return { rule:{ when:{ field, op, value: op==='equals'?m[2].trim():'' }, action:'exclude', sheet } }; }
  m = t2.match(/(?:ignore|exclude|skip|remove)\s+(?:all\s+)?(?:rows?|lines?|positions?)\s+(?:where|with|if)\s+(?:the\s+)?(.+?)\s+(?:contains|mentions|includes|has)\s+["']?([^"'.]+?)["']?\.?$/i);
  if (m){ const field=srcCol(m[1]); if (field) return { rule:{ when:{ field, op:'token', value:m[2].trim() }, action:'exclude', sheet } }; }
  // D) dimension order
  m = t2.match(/(?:dimensions?|values?|numbers?|sizes?)\s+(?:in|of)\s+(?:the\s+)?(?:column\s+)?["']?(.+?)["']?\s+(?:are|is|=|mean|means|read)\s+(width|thickness|length|height|diameter)\s*(?:x|×|\*|by|and)\s*(width|thickness|length|height|diameter)(?:\s*(?:x|×|\*|by|and)\s*(width|thickness|length|height|diameter))?/i);
  if (m){ const field=srcCol(m[1]); const dmap={width:F.width,thickness:F.thk,length:F.length,height:F.height,diameter:F.dia}; const dims=[m[2],m[3],m[4]].filter(Boolean).map(x=>dmap[x.toLowerCase()]); return { rule:{ when:{ field: field||'src:*', op:'any' }, action:'dimorder', dims, sheet } }; }
  return { error:'Not understood by the local parser. Supported patterns: "where <column> is <value>, map <field> as <value> [and <field> as <value>]", "all materials are 2nd choice [unless mentioned]", "ignore rows where <column> is zero/empty", "dimensions in column <X> are width x thickness", "only apply to sheet <name>".' };
}
function targetField(name){
  const n = norm(name).replace(/^(the|a|an)\s+/,'').replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+/g,' ').trim();
  const map = { finish:F.finish, 'finish 1':F.finish, finish1:F.finish, 'surface protection':F.sprot, protection:F.sprot, 'surface type':F.stype, surface:F.stype, 'surface treatment':F.stype, coating:F.coating, 'coating mass':F.coating, grade:F.grade, 'steel grade':F.grade, form:F.form, 'product form':F.form, choice:F.choice, quality:F.choice, 'choice class':F.choice, certificate:F.certs, certificates:F.certs, cert:F.certs, quantity:F.qty, qty:F.qty, weight:F.weight, 'total weight':F.weight, price:F.price, 'minimum price':F.price, 'min price':F.price, thickness:F.thk, width:F.width, length:F.length, height:F.height, diameter:F.dia, 'outer diameter':F.dia, 'wall thickness':F.wall, comments:F.comments, comment:F.comments, description:F.desc, 'description per line item':F.desc, location:F.loc, 'product location':F.loc, 'article id':F.article, 'article id internal':F.article, 'tensile strength':F.rm, 'yield strength':F.reh };
  if (map[n]) return map[n]; for (const f of FIELDS) if (norm(f)===n) return f; for (const [k,v] of Object.entries(map)) if (n.endsWith(' '+k) || n===k+'s') return v; return null;
}


/* Deterministic form classification from dimensions + hints. Returns {form, status:'exact'|'inferred'|'review', note} or null */
function classifyForm(f, hint){
  const w=f[F.width], t=f[F.thk], l=f[F.length], h=f[F.height], d=f[F.dia], wall=f[F.wall]; const has = v => v!=='' && v!=null;
  const H = normKey(hint||'');
  const coilish = /COIL|BUND|BOBIN|ROTOL|NASTR|KREG|BAND|ROL/.test(H), sheetish = /SHEET|TAFEL|BLECH|FEUIL|TOLE|LAMIER|PLAAT|ARKUSZ/.test(H), plateish = /PLATE|GROBBLECH|HEAVY|QUARTO/.test(H), tubeish = /TUBE|ROHR|PIPE|HOLLOW|RHS|SHS|CHS/.test(H), barish = /BAR|STAB|STANGE|ROND|TONDO/.test(H);
  if (has(w) && has(h) && has(wall)) return w===h ? { form:'Square Hollow Section', status:'inferred', note:`Width = Height (${w}) with wall thickness → Square Hollow Section` } : { form:'Rectangular Hollow Section', status:'inferred', note:`Width ${w} ≠ Height ${h} with wall thickness → Rectangular Hollow Section` };
  if (has(d) && has(wall)) return { form:'Welded Round Tubes', status:'review', note:'Diameter + wall thickness → tube; welded vs seamless not determinable from dimensions — confirm' };
  if (has(d) && !has(wall)) return tubeish ? { form:'Welded Round Tubes', status:'review', note:'Described as tube but no wall thickness — wall thickness is mandatory for tubes' } : { form:'Round Bars', status: barish?'exact':'inferred', note:'Outer diameter without wall thickness → solid Round Bars' };
  if (has(w) && has(t)){
    if (has(l)){
      if (coilish && !sheetish && !plateish) return { form: w>600?'Coils':w<600?'Slit Coils':'Coils', status:'review', note:'Described as coil but a length is given — confirm whether this is a coil (length = strip length) or cut sheets' };
      if (t>15) return { form:'Heavy Plates', status:'inferred', note:`Thickness ${t} mm > 15 mm with length → Heavy Plates` };
      if (l>w) return { form:'Sheets', status:'inferred', note:`Thickness ${t} mm ≤ 15 mm and length ${l} > width ${w} → Sheets` };
      return { form:'Sheets', status:'review', note:`Length ${l} ≤ width ${w} — dimension order may be swapped; flagged instead of corrected` };
    }
    if (sheetish || plateish) return { form: plateish||t>15?'Heavy Plates':'Sheets', status:'review', note:'Described as sheet/plate but no length given — confirm length' };
    if (coilish || hint==null || hint==='' ) { if (w===600) return { form:'Coils', status:'review', note:'Width exactly 600 mm — Coils/Slit Coils boundary; needs an approved supplier rule or confirmation' }; return { form: w>600?'Coils':'Slit Coils', status: coilish?'inferred':'review', note: `${coilish?'Coil with ':'No form evidence; '}width ${w} mm ${w>600?'> 600 → Coils':'< 600 → Slit Coils'}${coilish?'':' — could also be a sheet without length; confirm'}` }; }
  }
  return null;
}

/* ---------- Validation ---------- */
const NUM_FIELDS = FIELDS.filter(f=>T[f].type==='num');
function validateRows(rows, ctx){
  // duplicates within listing
  const keyOf = r => [F.grade,F.coating,F.finish,F.choice,F.thk,F.width,F.length,F.weight].map(f=>normKey(r.fields[f])).join('|') + (r.prov[F.article] && r.prov[F.article].status==='source' ? '|'+normKey(r.fields[F.article]) : '');
  const groups = new Map();
  for (const r of rows){ if (r.excluded) continue; r.dupKey = keyOf(r); r.dupOf=[]; if (!groups.has(r.dupKey)) groups.set(r.dupKey, []); groups.get(r.dupKey).push(r.id); }
  const hist = ctx.historyKeys || new Map(); // key → listing name
  for (const r of rows){
    r.issues=[];
    if (r.excluded){ r.status='excluded'; continue; }
    const f = r.fields; const add=(field, level, msg)=>r.issues.push({ field, level, msg });
    for (const t of TEMPLATE){
      const v = f[t.key]; const p = r.prov[t.key]||{};
      if (t.req==='critical' && isBlank(v)) add(t.key,'critical', p.status==='unresolved' ? `Unrecognised ${t.key}: "${p.raw}"${p.suggestion?` — did you mean "${p.suggestion}"?`:''}` : `Missing mandatory field`);
      else if (t.req==='warn' && isBlank(v)) add(t.key,'warning','Mandatory in template — set a default or map a column');
      if (t.type==='catalog' && !isBlank(v) && !ctx.catalogIndex[t.list].map.has(normKey(v))) add(t.key,'critical',`"${v}" is not an accepted ${t.list} value`);
      if (p.status==='unresolved' && !isBlank(p.raw) && isBlank(v) && t.req!=='critical') add(t.key,'warning', t.key===F.coating ? `Unknown coating "${p.raw}"${(p.suggestions&&p.suggestions.length)?` — compatible candidates: ${p.suggestions.slice(0,2).map(x=>x.value).join(', ')} (verify mass convention)`:''}` : `Unrecognised value "${p.raw}"${p.suggestion?` — did you mean "${p.suggestion}"?`:''}`);
      if (p.status==='inferred') add(t.key,'info',`Inferred: ${p.note}`);
      if (p.status==='ai') add(t.key,'warning',`AI-inferred — approve: ${p.note}`);
    }
    const form = f[F.form];
    const coatedFinish = /Galvan|Aluzinc|Alumin|Galfan|zinc magnesium|Metal Coated|Prepainted|Galvannealed/i.test(f[F.finish]||'');
    if (coatedFinish && isBlank(f[F.coating])) add(F.coating,'warning',`Finish "${f[F.finish]}" requires a coating designation`);
    if (!coatedFinish && !isBlank(f[F.coating]) && /Hot Rolled|Cold Rolled|As Rolled|Normalized|Quenched|Thermomechanically/.test(f[F.finish]||'')) add(F.finish,'warning',`Coating "${f[F.coating]}" present but finish "${f[F.finish]}" is uncoated — conflicting attributes`);
    const need = FORM_DIMS[form]; if (need) for (const d of need) if (isBlank(f[d])) add(d,'warning',`Required for form "${form}"`);
    const thk=f[F.thk], w=f[F.width], l=f[F.length], kg=f[F.weight], q=f[F.qty];
    if (thk!=='' && (thk<0.1 || thk>400)) add(F.thk,'warning',`Suspicious thickness ${thk} mm — check units`);
    if (w!=='' && (w<5 || w>4000)) add(F.width,'warning',`Suspicious width ${w} mm — check units (metres?)`);
    if (l!=='' && (l<5 || l>30000)) add(F.length,'warning',`Suspicious length ${l} mm — check units`);
    if (thk!=='' && w!=='' && thk>w) add(F.thk,'warning','Thickness greater than width — dimensions may be swapped');
    if (kg!=='' && kg<=0) add(F.weight,'critical','Weight must be greater than zero');
    if (kg!=='' && kg>0 && kg<20) add(F.weight,'warning',`Weight ${kg} kg looks like tonnes — check unit conversion`);
    if (kg!=='' && kg>80000) add(F.weight,'warning',`Weight ${kg} kg is unusually high for one position`);
    if (q!=='' && q<=0) add(F.qty,'critical','Quantity must be greater than zero');
    if (f[F.rm]!=='' && f[F.reh]!=='' && f[F.rm]<f[F.reh]) add(F.rm,'warning','Tensile strength lower than yield strength');
    if (f[F.price]!=='' && f[F.price]<0) add(F.price,'critical','Negative price');
    for (const u of r.unresolved) add('_tokens','warning',`Unresolved token "${u.token}" in "${u.src||'description'}" — ${u.hint}`);
    const g = groups.get(r.dupKey)||[]; if (g.length>1){ r.dupOf = g.filter(x=>x!==r.id); add('_dup','warning',`Possible duplicate of row${r.dupOf.length>1?'s':''} #${r.dupOf.join(', #')} (same grade/coating/dimensions/weight)`); }
    if (hist.has(r.dupKey)) add('_dup','warning',`Possible duplicate of a position already processed in listing "${hist.get(r.dupKey)}"`);
    const crit = r.issues.some(i=>i.level==='critical'), warn = r.issues.some(i=>i.level==='warning');
    const missing = r.issues.some(i=>i.level==='critical' && /Missing mandatory/.test(i.msg));
    const edited = Object.keys(r.edited||{}).length>0;
    r.status = crit ? (missing ? 'missing' : 'invalid') : warn ? 'review' : edited ? 'corrected' : 'validated';
  }
  return rows;
}
function summary(rows, totalSource){
  const inc = rows.filter(r=>!r.excluded);
  const by = s => inc.filter(r=>r.status===s).length;
  const provs = inc.flatMap(r=>Object.values(r.prov)); const auto = provs.filter(p=>['source','exact','alias','rule','default'].includes(p.status)).length;
  return { total: totalSource ?? rows.length, extracted: inc.length, validated: by('validated')+by('corrected'), attention: by('review')+by('missing')+by('invalid'), invalid: by('invalid'), missing: by('missing'), review: by('review'), corrected: by('corrected'),
    excluded: rows.filter(r=>r.excluded).length, duplicates: inc.filter(r=>r.dupOf&&r.dupOf.length).length, manual: inc.reduce((a,r)=>a+Object.keys(r.edited||{}).length,0),
    confidence: provs.length ? Math.round(100*auto/provs.length) : 0, critical: inc.reduce((a,r)=>a+r.issues.filter(i=>i.level==='critical').length,0), warnings: inc.reduce((a,r)=>a+r.issues.filter(i=>i.level==='warning').length,0) };
}

/* ---------- Export ---------- */
function buildExportAOA(rows){
  const band = TEMPLATE.map(t=>t.band||null); const hdr = FIELDS.slice();
  const out=[band, hdr];
  for (const r of rows){ if (r.excluded) continue; out.push(FIELDS.map(f=>{ const v=r.fields[f]; if (isBlank(v)) return null; if (T[f].type==='num'){ const n = typeof v==='number'?v:parseNum(v).value; return n; } return typeof v==='string'? v.replace(/^'(?=[=+\-@])/,'') : v; })); }
  return out;
}
/* Plain-text / email offer extraction: one row per line or sentence that contains a grade */
function extractFromText(text, ctx){
  const chunks = String(text).split(/\r?\n|(?<=[.;])\s+(?=[A-Z0-9])/).map(s=>s.trim()).filter(s=>s.length>3);
  const rows=[]; let id=1;
  for (const c of chunks){ const p = parseDescription(c, ctx); if (!p.fields[F.grade] && !p.fields[F.coating]) continue; const r = newRow(id++, 'Email/text', rows.length+1, { 'Text': c });
    for (const [f,v] of Object.entries(p.fields)) setField(r, f, v, { status:p.prov[f].status, src:'Text', raw:c, note:p.prov[f].note });
    setField(r, F.desc, sanitizeText(c), { status:'source', src:'Text', raw:c, note:'Raw text preserved' });
    const av = c.match(/(?:available|verfuegbar|verfügbar|disponible|disponibile)[^,.]*/i); if (av && isBlank(r.fields[F.comments])) setField(r, F.comments, av[0], { status:'source', src:'Text', note:'Availability note from text' });
    r.unresolved = p.unresolved.map(u=>({ ...u, src:'Text' })); rows.push(r); }
  return rows;
}

return { classifyForm, articleCandidates, matchGradeTiered, coatingCandidates, gradeSuggestions, TEMPLATE, T, FIELDS, F, SPECIAL_TARGETS, FORM_DIMS, HEADER_ALIASES, VALUE_ALIASES, COATING_PREFIX_FINISH, norm, normKey, isBlank, parseNum, detectLocale, detectUnitInHeader, buildCatalogIndex, matchCatalog, parseDescription, decomposeSurfaceCode, analyzeSheet, proposeMapping, transformSheet, applyRule, ruleMatches, ruleToText, parseInstruction, targetField, validateRows, summary, buildExportAOA, extractFromText, headerCandidates, describeTransform, UNIT_FACTORS, colLetter, gradeFamilyFinish };
})();

