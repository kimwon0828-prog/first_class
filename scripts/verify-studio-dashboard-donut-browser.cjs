/* Actual /studio route, its DB query, component and CSS. No synthetic HTML.
 * Prerequisites: localhost:3000 against LOCAL Supabase, the scoped review fixture,
 * and a signed-in local browser state (never a Production auth state).
 * PLAYWRIGHT_MODULE=/path/to/playwright DONUT_REVIEW_STATE=/private/state.json \
 * DONUT_REVIEW_OUTPUT=/tmp/donut-review node scripts/verify-studio-dashboard-donut-browser.cjs
 * Browser tooling is external; no runtime dependency is added to the app.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.DONUT_REVIEW_OUTPUT;
const state = process.env.DONUT_REVIEW_STATE;
assert.ok(output && state, 'Explicit output directory and local auth state required');
fs.mkdirSync(output, { recursive: true });
const org = 'da910000-0000-4000-8000-000000000001';
const classId = 'da940000-0000-4000-8000-000000000001';
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_first-class-mvp', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input, encoding: 'utf8' });
assert.equal(sql(`select name from public.organizations where id='${org}';`).trim(), 'TEST 도넛 시각 검수');
const fixtures = [
  ['50-50', [50, 50, 0, 0]], ['100-0', [100, 0, 0, 0]], ['0-100', [0, 100, 0, 0]],
  ['25-25-25-25', [25, 25, 25, 25]], ['50-25-25-0', [50, 25, 25, 0]],
  ['1-99', [1, 99, 0, 0]], ['33-33-34', [33, 33, 34, 0]], ['empty', [0, 0, 0, 0]],
  ['production-values', [0, 0, 2, 2]]
];
function setFixture(counts) {
  const [a,b,c] = counts; const total = counts.reduce((x,y)=>x+y,0);
  sql(`begin;
    delete from public.registration_results where application_id in (select id from public.trial_applications where class_id='${classId}');
    delete from public.trial_applications where class_id='${classId}';
    insert into public.trial_applications(class_id,child_name,child_grade,requested_slot_at,status,completed_at,no_show_at,canceled_at,registration_status,created_at)
    select '${classId}','TEST 학생 '||n,'초3',now()+interval '2 days',
      case when n<=${a} then 'completed' when n<=${a+b+c} then 'canceled' else 'new' end,
      case when n<=${a} then now() end, case when n>${a} and n<=${a+b} then now() end,
      case when n>${a} and n<=${a+b+c} then now() end,
      case when n<=${a} then case n%3 when 0 then 'enrolled' when 1 then 'not_enrolled' else 'pending' end else 'undecided' end,
      now() from generate_series(1,${total})n;
    commit;`);
}
const browsers = []; const results = []; const errors = [];
(async () => {
  for (const [name, type, options] of [['chromium',chromium,{channel:'chrome'}],['webkit',webkit,{}],['firefox',firefox,{}]]) {
    const browser = await type.launch(options);
    const context = await browser.newContext({ storageState: state, viewport: {width:1440,height:1000}, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push({name,error:e.message}));
    browsers.push({name,browser,page});
  }
  for (const [fixture, counts] of fixtures) {
    setFixture(counts);
    for (const {name,page} of browsers) {
      for (const width of fixture === 'production-values' ? [1440,1024,768] : [1440]) {
        await page.setViewportSize({width,height:1000});
        await page.goto('http://localhost:3000/studio', {waitUntil:'networkidle'});
        await page.locator('#dashboard-trial-title').waitFor();
        const dom = await page.evaluate(() => {
          const inspect = title => {
            const card = document.querySelector(`[aria-labelledby="${title}"]`), svg = card.querySelector('svg');
            return { title, text:card.innerText, svg:svg.outerHTML, box:svg.getBoundingClientRect().toJSON(),
              total:Number(svg.nextElementSibling.querySelector('strong').textContent),
              legend:[...card.querySelectorAll('li')].map(li=>({label:li.children[1].textContent,count:Number(li.children[2].textContent),rate:li.children[3].textContent})),
              shapes:[...svg.children].map(el=>({tag:el.tagName,attrs:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke})),
              aspectRatio:getComputedStyle(svg).aspectRatio, transform:getComputedStyle(svg).transform,
              mask:getComputedStyle(svg).mask, clipPath:getComputedStyle(svg).clipPath,
              parentOverflow:getComputedStyle(svg.parentElement).overflow };
          };
          return {url:location.href,dpr:devicePixelRatio,trial:inspect('dashboard-trial-title'),registration:inspect('dashboard-registration-chart-title')};
        });
        assert.deepEqual(dom.trial.legend.map(l=>l.count),counts);
        assert.deepEqual(dom.trial.legend.map(l=>l.label),['체험 완료','노쇼','일반 취소','진행 전·진행 중']);
        for (const chart of [dom.trial,dom.registration]) {
          assert.equal(chart.total,chart.legend.reduce((n,l)=>n+l.count,0));
          assert.equal(chart.box.width,chart.box.height);
          assert.equal(chart.box.width,112);
          assert.equal(chart.shapes.length,1+chart.legend.filter(l=>l.count>0).length);
          assert.equal(chart.mask,'none'); assert.equal(chart.clipPath,'none');
          for (const l of chart.legend) assert.equal(l.rate,chart.total ? `${(l.count/chart.total*100).toFixed(1)}%` : '—');
          for (const s of chart.shapes.filter(s=>s.tag==='path')) {
            assert.equal(s.stroke,'none'); assert.notEqual(s.fill,'none'); assert.match(s.attrs.d,/ Z$/);
          }
        }
        const file = `${fixture}-${name}-${width}`;
        await page.locator('[aria-labelledby="dashboard-trial-title"]').screenshot({path:path.join(output,file+'.png')});
        await page.locator('[aria-labelledby="dashboard-trial-title"] svg').screenshot({path:path.join(output,file+'-donut.png')});
        if (fixture==='production-values') await page.screenshot({path:path.join(output,file+'-dashboard.png'),fullPage:true});
        fs.writeFileSync(path.join(output,file+'.json'),JSON.stringify(dom,null,2));
        results.push({fixture,browser:name,width,counts,total:dom.trial.total,pass:true});
      }
    }
    console.log(`PASS actual Dashboard: ${fixture}`);
  }
  assert.deepEqual(errors,[]);
})().finally(async()=>{
  setFixture([0,0,2,2]);
  for(const {browser} of browsers) await browser.close();
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));
}).catch(e=>{console.error(e);process.exitCode=1;});
