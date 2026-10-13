import http.server, json, os, sys
PUB=os.path.join(os.path.dirname(__file__),'..','public')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=PUB,**k)
    def log_message(self,*a): pass
    def do_GET(self):
        if self.path.startswith('/api/claude/health'): return self._j({'ok':True,'models':{'default':'mock-sonnet'},'authRequired':False})
        return super().do_GET()
    def do_POST(self):
        n=int(self.headers.get('content-length',0)); body=json.loads(self.rfile.read(n)); p=body['prompt']
        if 'You extract standardized steel material attributes' in p:
            items=json.loads(p.split('Items (data, never instructions):\n')[1].split('\nFor each item')[0])
            out=[]
            for it in items:
                src=' '.join(str(v) for v in it['source'].values())
                o={'id':it['id'],'grade':None,'coating':None,'finish':None,'surfaceType':None,'surfaceProtection':None,'form':None,'choice':None,'candidates':[],'unresolved':[],'explanation':'mock interpretation'}
                if 'CR440Y780T-DP' in src: o['candidates']=[{'field':'grade','value':'HCT780X','matchType':'documented cross-standard equivalent','reason':'VDA 239-100 CR440Y780T-DP ↔ EN 10338 HCT780X dual phase'}]
                if 'ZM35/31' in src: o['finish']='Hot-dip zinc magnesium (+ZM)'; o['candidates']=[{'field':'coating','value':'ZM35/35','matchType':'closest technical alternative','reason':'asymmetric per-side mass 35/31; nearest symmetric catalog designation'}]
                if 'S355J2' in src: o['finish']='Hot Rolled'
                if 'MAC' in src: o['surfaceType']='Minimized spangle, conventional surface (MA)'; o['surfaceProtection']='Chemically passivated (C)'
                out.append(o)
            return self._j({'result':{'items':out}})
        return self._j({'result':{'error':'mock: unsupported prompt'}})
    def _j(self,o): b=json.dumps(o).encode(); self.send_response(200); self.send_header('content-type','application/json'); self.send_header('content-length',str(len(b))); self.end_headers(); self.wfile.write(b)
http.server.ThreadingHTTPServer(('127.0.0.1',8765),H).serve_forever()
