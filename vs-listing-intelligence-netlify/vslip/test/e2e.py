import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1400,'height':900})).new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/index.html'); await pg.wait_for_timeout(1500)
        print('status:', await pg.inner_text('#aiStatus'))
        await pg.click('[data-page="new"]'); await pg.set_input_files('#fileInput','/home/claude/build/Enh_test.xlsx'); await pg.wait_for_timeout(800)
        await pg.fill('#supplierInput','TestWerk'); await pg.dispatch_event('#supplierInput','change'); await pg.click('#btnToMapping'); await pg.wait_for_timeout(500)
        await pg.select_option('[data-def="Choice"]','1st'); await pg.click('#btnGenerate'); await pg.wait_for_timeout(3000)
        print(json.dumps(await pg.evaluate("J.rows.map(r=>[r.id,r.prov.Grade.raw,r.fields.Grade,r.prov.Grade.status,r.fields.Coating,r.prov.Coating&&r.prov.Coating.status,(r.prov.Coating&&r.prov.Coating.aiSuggestions||[]).map(s=>s.value+'|'+s.matchType),(r.prov.Grade.aiSuggestions||[]).map(s=>s.value+'|'+s.matchType),r.fields.Finish_1,r.prov.Finish_1&&r.prov.Finish_1.status,r.fields.Form,r.fields['Thickness (mm)'],r.fields['Width (mm)'],r.fields['Total Weight (KGs)'],r.status])")))
        await pg.click('#btnResolve'); await pg.wait_for_timeout(300); t=await pg.inner_text('#modal'); print('resolve:', t[:900].replace('\n',' | '))
        await pg.screenshot(path='/home/claude/vslip/test/resolve.png'); print('ERRORS', errs); await b.close()
asyncio.run(main())
