// ── CLIENT REPORT GENERATOR V2 (standard slides, up to 5 campaigns per product) ──
// Run from the browser console for now:  generateClientReportV2()
function generateClientReportV2() {
  const par3      = document.getElementById('client-filter-parent')?.value||'';
  const acc       = document.getElementById('client-filter-account')?.value||'';
  const dev       = document.getElementById('client-filter-dev')?.value||'';
  const contract3 = document.getElementById('client-filter-contract')?.value||'';
  const matchRow  = r => (!par3||r.parent===par3)&&(!acc||r.account===acc)&&(!dev||r.dev===dev)&&(!contract3||r.contractNumber===contract3);

  if (!acc && !par3 && !dev) { alert('Please select at least a Parent Account, Account or Development before generating a report.'); return; }

  const clientName = acc || par3 || dev || 'Client';
  const fromEl = document.getElementById('date-from');
  const toEl   = document.getElementById('date-to');
  const dateRange = (fromEl&&toEl) ? (fmtMonth2(fromEl.value?.slice(0,7).split('-').reverse().join('/')) + ' \u2013 ' + fmtMonth2(toEl.value?.slice(0,7).split('-').reverse().join('/'))) : 'All time';

  // Campaigns that belong to a bundle are left out of the standard slides.
  // A CIN is in a bundle if it is on a bundle row, or shares a contract + account with one
  // (this catches In-Search CINs, which are not on the bundle rows).
  const bundleRows = D2.sf_raw.filter(r=>isBundleOpp(r.opportunity)&&validParent(r)&&matchRow(r));
  const bundleCins = new Set(bundleRows.filter(r=>r.cin).map(r=>r.cin));
  const bundleKeys = new Set(bundleRows.filter(r=>r.contractNumber).map(r=>r.contractNumber+'|'+(r.account||'')));
  Object.entries(D2.sf_cin_lookup||{}).forEach(([cin,m])=>{
    if (m.contractNumber && bundleKeys.has(m.contractNumber+'|'+(m.account||''))) bundleCins.add(cin);
  });

  const emailRows = D2.sf_raw.filter(r=>r.product==='Email Campaign'&&validParent(r)&&inRange2(r.month)&&matchRow(r)&&(r.opens>0||r.clicks>0)&&!bundleCins.has(r.cin));
  const hotwRows  = D2.sf_raw.filter(r=>r.product==='HOTW Boost'&&validParent(r)&&inRange2(r.month)&&matchRow(r)&&(r.opens>0||r.clicks>0)&&!bundleCins.has(r.cin));
  const mmRows    = D2.sf_raw.filter(r=>r.product==='Mobile Messaging'&&validParent(r)&&inRange2(r.month)&&matchRow(r)&&(r.sends>0||r.clicks>0)&&!bundleCins.has(r.cin));
  const fbRows    = D2.fb_raw.filter(r=>validParent(r)&&inRange2(r.month)&&matchRow(r)&&(r.impressions>0||r.clicks>0||r.leads>0)&&!bundleCins.has(r.cin));
  const isRows    = (D2.insearch_raw||[]).filter(r=>inRange2(r.date||r.month)&&matchRow(r)&&(r.impressions>0||r.clicks>0)&&!bundleCins.has(r.cin));

  const fmtP = n => n ? parseFloat(n).toFixed(2)+'%' : '0.00%';
  const fmtN = n => n == null ? '0' : Math.round(n).toLocaleString();
  const fmtB = n => { if(!n) return '0'; const r=Math.round(n); return r>=1e6?(r/1e6).toFixed(2)+'M':r>=1000?(r/1000).toFixed(0)+'K':String(r); };

  const lookup  = cin => (D2.sf_cin_lookup||{})[cin]||{};
  const rangeOf = (s,e) => (s&&e) ? fmtDDMMYYYY(s)+' - '+fmtDDMMYYYY(e) : (s ? fmtDDMMYYYY(s)+' - ongoing' : '');

  // Email-type rows: one line per CIN (rows can be per month)
  const aggSf = rows => {
    const m = {};
    rows.forEach(r => {
      const k = r.cin || r.dev;
      if (!m[k]) m[k] = {cin:r.cin||'', dev:r.dev, area:'', startDate:'', sends:0, opens:0, clicks:0};
      m[k].sends += r.sends||0; m[k].opens += r.opens||0; m[k].clicks += r.clicks||0;
      if (!m[k].startDate) m[k].startDate = r.startDate||'';
      if (!m[k].area) m[k].area = r.area||'';
    });
    return Object.values(m);
  };
  const emailLike = rows => {
    const list = aggSf(rows).map(c => ({...c, or: c.sends?c.opens/c.sends*100:0, ctor: c.opens?c.clicks/c.opens*100:0}));
    list.sort((a,b)=>b.or-a.or);
    const tot = list.reduce((t,c)=>({sends:t.sends+c.sends,opens:t.opens+c.opens,clicks:t.clicks+c.clicks}),{sends:0,opens:0,clicks:0});
    return {
      count: list.length,
      range: dateRange,
      summary: { or: fmtP(tot.sends?tot.opens/tot.sends*100:0), ctor: fmtP(tot.opens?tot.clicks/tot.opens*100:0), opens: fmtN(tot.opens), clicks: fmtN(tot.clicks), sent: fmtN(tot.sends) },
      campaigns: list.slice(0,5).map(c => ({
        cin: c.cin, dev: c.dev, postcode: c.area||'',
        dates: c.startDate ? fmtDDMMYYYY(c.startDate) : '',
        sent: fmtN(c.sends), opens: fmtN(c.opens), or: fmtP(c.or), ctor: fmtP(c.ctor), clicks: fmtN(c.clicks), bench: ''
      }))
    };
  };

  // AdReach: one line per CIN, best by conversion rate
  let FB = null;
  if (fbRows.length) {
    const m = {};
    fbRows.forEach(r => {
      if (!m[r.cin]) m[r.cin] = {cin:r.cin, dev:r.dev, area:r.area||'', imp:0, clicks:0, leads:0};
      m[r.cin].imp += r.impressions; m[r.cin].clicks += r.clicks; m[r.cin].leads += r.leads;
    });
    const list = Object.values(m).map(c => ({...c, cr: c.clicks>0?c.leads/c.clicks*100:0, ctr: c.imp>0?c.clicks/c.imp*100:0}));
    list.sort((a,b)=>b.cr-a.cr);
    const tot = fbRows.reduce((t,r)=>({imp:t.imp+r.impressions,clicks:t.clicks+r.clicks,leads:t.leads+r.leads}),{imp:0,clicks:0,leads:0});
    FB = {
      count: list.length, range: dateRange,
      summary: { cr: fmtP(tot.clicks?tot.leads/tot.clicks*100:0), ctr: fmtP(tot.imp?tot.clicks/tot.imp*100:0), leads: fmtN(tot.leads), imps: fmtB(tot.imp), clicks: fmtN(tot.clicks) },
      campaigns: list.slice(0,5).map(c => ({
        cin: c.cin, dev: c.dev, postcode: c.area || lookup(c.cin).area || '',
        dates: rangeOf(lookup(c.cin).startDate, lookup(c.cin).endDate),
        imps: fmtN(c.imp), clicks: fmtN(c.clicks), ctr: fmtP(c.ctr), leads: fmtN(c.leads), cr: fmtP(c.cr), bench: ''
      }))
    };
  }

  // In-Search: one line per CIN, best by CTR
  let IS = null;
  if (isRows.length) {
    const m = {};
    isRows.forEach(r => {
      if (!m[r.cin]) m[r.cin] = {cin:r.cin, dev:r.dev, area:r.area||'', imp:0, clicks:0};
      m[r.cin].imp += r.impressions; m[r.cin].clicks += r.clicks;
    });
    const list = Object.values(m).map(c => ({...c, ctr: c.imp>0?c.clicks/c.imp*100:0}));
    list.sort((a,b)=>b.ctr-a.ctr);
    const tot = isRows.reduce((t,r)=>({imp:t.imp+r.impressions,clicks:t.clicks+r.clicks}),{imp:0,clicks:0});
    const endOf = cin => { const x=(D2.insearch_raw||[]).filter(r=>r.cin===cin&&r.endDate); return lookup(cin).endDate || (x.length?x[0].endDate:''); };
    IS = {
      count: list.length, range: dateRange,
      summary: { ctr: fmtP(tot.imp?tot.clicks/tot.imp*100:0), ctr_max: fmtP(Math.max(...list.map(c=>c.ctr))), imps: fmtB(tot.imp), clicks: fmtN(tot.clicks) },
      campaigns: list.slice(0,5).map(c => ({
        cin: c.cin, dev: c.dev, postcode: c.area || lookup(c.cin).area || '',
        dates: rangeOf(lookup(c.cin).startDate, endOf(c.cin)),
        imps: fmtN(c.imp), clicks: fmtN(c.clicks), ctr: fmtP(c.ctr), bench: ''
      }))
    };
  }

  // Mobile Messaging: one line per CIN, best by CTR
  let MM = null;
  if (mmRows.length) {
    const list = aggSf(mmRows).map(c => ({...c, ctr: c.sends?c.clicks/c.sends*100:0}));
    list.sort((a,b)=>b.ctr-a.ctr);
    const tot = list.reduce((t,c)=>({sends:t.sends+c.sends,clicks:t.clicks+c.clicks}),{sends:0,clicks:0});
    MM = {
      count: list.length, range: dateRange,
      summary: { sends: fmtN(tot.sends), clicks: fmtN(tot.clicks), ctr: fmtP(tot.sends?tot.clicks/tot.sends*100:0) },
      campaigns: list.slice(0,5).map(c => ({
        cin: c.cin, dev: c.dev, postcode: c.area||'',
        dates: c.startDate ? fmtDDMMYYYY(c.startDate) : '',
        sends: fmtN(c.sends), clicks: fmtN(c.clicks), ctr: fmtP(c.ctr), bench: ''
      }))
    };
  }


  // ── Bundles: In-Life = Bundle 1 (B1), Event Promoter = Bundle 2 (B2) ──
  const aggImp = rows => {
    const m = {};
    rows.forEach(r => {
      if (!m[r.cin]) m[r.cin] = {cin:r.cin, dev:r.dev, area:r.area||'', imp:0, clicks:0};
      m[r.cin].imp += r.impressions||0; m[r.cin].clicks += r.clicks||0;
    });
    return Object.values(m);
  };
  const toImpComp = c => ({
    cin: c.cin, dev: c.dev, postcode: c.area||'',
    dates: rangeOf(lookup(c.cin).startDate, lookup(c.cin).endDate),
    imps: fmtN(c.imp), clicks: fmtN(c.clicks), ctr: fmtP(c.imp?c.clicks/c.imp*100:0), bench: ''
  });
  const toEmlComp = c => ({
    cin: c.cin, dev: c.dev, postcode: c.area||'',
    dates: c.startDate ? fmtDDMMYYYY(c.startDate) : '',
    sent: fmtN(c.sends), opens: fmtN(c.opens), clicks: fmtN(c.clicks),
    or: fmtP(c.sends?c.opens/c.sends*100:0), ctor: fmtP(c.opens?c.clicks/c.opens*100:0), bench: ''
  });
  const byDate = (a,b) => String(a.startDate).localeCompare(String(b.startDate));
  const first = (list, name) => { if (list.length > 1) console.warn('Bundle has ' + list.length + ' ' + name + ' campaigns. Using the first.'); return list[0] || null; };

  const bundleGroups = {};
  bundleRows.forEach(r => {
    const key = (r.contractNumber || ('no-contract-' + r.opportunity)) + '|' + (r.account||'');
    if (!bundleGroups[key]) bundleGroups[key] = {opp: r.opportunity, cins: new Set()};
    if (r.cin) bundleGroups[key].cins.add(r.cin);
  });
  Object.entries(D2.sf_cin_lookup||{}).forEach(([cin,m])=>{
    const key = (m.contractNumber||'') + '|' + (m.account||'');
    if (m.contractNumber && bundleGroups[key]) bundleGroups[key].cins.add(cin);
  });

  const insearchCins = new Set((D2.insearch_raw||[]).map(r=>r.cin));
  const bundles = {};
  Object.values(bundleGroups).forEach(g => {
    const type = gd2BundleType(g.opp);
    const slot = type === 'In-Life' ? 'B1' : (type === 'Event Promoter' ? 'B2' : null);
    if (!slot) { console.warn('Bundle type has no slides in the template. Skipped:', g.opp, type); return; }
    if (bundles[slot]) { console.warn('More than one ' + type + ' bundle is selected. Using the first. Skipped:', g.opp); return; }
    const S = g.cins;
    const sfIn  = p => D2.sf_raw.filter(r=>r.product===p&&S.has(r.cin)&&inRange2(r.month)&&(r.opens>0||r.clicks>0));
    const gamIn = p => (D2.gam_raw||[]).filter(r=>r.product===p&&S.has(r.cin)&&inRange2(r.month)&&(r.impressions>0||r.clicks>0));

    const hwList = aggSf(sfIn('HOTW Boost')).sort(byDate).map(toEmlComp);
    const emList = aggSf(sfIn('Email Campaign')).sort(byDate).map(toEmlComp);
    const isList = aggImp((D2.insearch_raw||[]).filter(r=>S.has(r.cin)&&inRange2(r.date||r.month)&&(r.impressions>0||r.clicks>0)))
      .concat(aggImp(gamIn('In-Search').filter(r=>!insearchCins.has(r.cin)))).map(toImpComp);
    const fbList = aggImp(D2.fb_raw.filter(r=>S.has(r.cin)&&inRange2(r.month)&&(r.impressions>0||r.clicks>0))).map(toImpComp);
    const asList = aggImp(gamIn('Area Sponsorship')).map(toImpComp);
    const psList = aggImp(gamIn('Property Sponsorship')).map(toImpComp);

    // Bundle totals: impressions + opens, clicks, active CINs (same rule as the dashboard)
    const act = new Set(); let impOpen = 0, clk = 0;
    sfIn('Email Campaign').concat(sfIn('HOTW Boost')).forEach(r=>{ impOpen+=r.opens||0; clk+=r.clicks||0; act.add(r.cin); });
    D2.fb_raw.filter(r=>S.has(r.cin)&&inRange2(r.month)&&(r.impressions>0||r.clicks>0)).forEach(r=>{ impOpen+=r.impressions||0; clk+=r.clicks||0; act.add(r.cin); });
    (D2.insearch_raw||[]).filter(r=>S.has(r.cin)&&inRange2(r.date||r.month)&&(r.impressions>0||r.clicks>0)).forEach(r=>{ impOpen+=r.impressions||0; clk+=r.clicks||0; act.add(r.cin); });
    (D2.gam_raw||[]).filter(r=>S.has(r.cin)&&(r.product!=='In-Search'||!insearchCins.has(r.cin))&&inRange2(r.month)&&(r.impressions>0||r.clicks>0)).forEach(r=>{ impOpen+=r.impressions||0; clk+=r.clicks||0; act.add(r.cin); });
    if (!act.size) return;

    if (hwList.length > 3) console.warn('Bundle has ' + hwList.length + ' HOTW Boost sends. The template shows 3.');
    bundles[slot] = {
      name: g.opp, campaigns: act.size, impressions: fmtB(impOpen), clicks: fmtN(clk),
      comps: {
        IS: first(isList, 'In-Search'), FB: first(fbList, 'AdReach'),
        HW1: hwList[0]||null, HW2: hwList[1]||null, HW3: hwList[2]||null,
        EM: first(emList, 'Email'), AS: first(asList, 'Area Sponsorship'), PS: first(psList, 'Property Sponsorship')
      }
    };
  });

  const payload = {
    v: 2, a: clientName, d: dateRange, clientName: clientName, dateRange: dateRange,
    products: {
      FB: FB,
      EM: emailRows.length ? emailLike(emailRows) : null,
      IS: IS,
      HW: hotwRows.length ? emailLike(hotwRows) : null,
      MM: MM
    },
    bundles: bundles
  };
  const callUrl = REPORT_GENERATOR_URL + '?data=' + encodeURIComponent(JSON.stringify(payload));
  console.log('Report V2 payload:', payload, '| URL length:', callUrl.length);
  window.open(callUrl, '_blank');
}
